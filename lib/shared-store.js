import { getSupabaseClient } from "./supabase/client";

const STORAGE = "gang-checkin-reconstructed-v1";
const SHARED_FIELDS = ["gangs", "checks", "payments"];

function applySafeItems(gangs, safeItems) {
  if (!safeItems?.length) return gangs;
  const itemsByGang = safeItems.reduce((groups, item) => {
    const list = groups.get(item.gang_id) || [];
    list.push({
      id: item.item_id,
      name: item.name,
      qty: item.qty,
      ...(item.image ? { image: item.image } : {}),
    });
    groups.set(item.gang_id, list);
    return groups;
  }, new Map());
  return gangs.map((gang) =>
    itemsByGang.has(gang.id)
      ? { ...gang, safeItems: itemsByGang.get(gang.id) }
      : gang,
  );
}

function applySafeLogs(gangs, safeLogs) {
  if (!safeLogs?.length) return gangs;
  const logsByGang = safeLogs.reduce((groups, log) => {
    const list = groups.get(log.gang_id) || [];
    list.push({
      id: log.log_id,
      date: log.date,
      type: log.type,
      itemId: log.item_id,
      itemName: log.item_name,
      quantity: log.quantity,
      memberId: log.member_id || "",
      note: log.note || "",
      user: log.user_name || "",
      createdAt: log.created_at,
    });
    groups.set(log.gang_id, list);
    return groups;
  }, new Map());
  return gangs.map((gang) =>
    logsByGang.has(gang.id)
      ? { ...gang, safeLogs: logsByGang.get(gang.id) }
      : gang,
  );
}

export function readLocalStore() {
  if (typeof window === "undefined")
    return { users: [], gangs: [], checks: [], payments: [] };
  try {
    return {
      users: [],
      gangs: [],
      checks: [],
      payments: [],
      ...JSON.parse(window.localStorage.getItem(STORAGE) || "{}"),
    };
  } catch {
    return { users: [], gangs: [], checks: [], payments: [] };
  }
}

export function writeLocalStore(data) {
  window.localStorage.setItem(STORAGE, JSON.stringify(data));
}

export async function loadSharedStore() {
  const supabase = getSupabaseClient();
  if (!supabase) return readLocalStore();
  const { data, error } = await supabase
    .from("gang_state")
    .select("gangs, checks, payments")
    .eq("id", "shared")
    .maybeSingle();
  if (error) throw error;
  const { data: safeItems, error: safeItemsError } = await supabase
    .from("safe_items")
    .select("gang_id, item_id, name, qty, image")
    .eq("scope", "shared");
  if (safeItemsError && safeItemsError.code !== "42P01") throw safeItemsError;
  const { data: safeLogs, error: safeLogsError } = await supabase
    .from("safe_logs")
    .select("gang_id, log_id, date, type, item_id, item_name, quantity, member_id, note, user_name, created_at")
    .eq("scope", "shared")
    .order("created_at", { ascending: false });
  if (safeLogsError && safeLogsError.code !== "42P01") throw safeLogsError;
  const local = readLocalStore();
  const merged = {
    ...local,
    gangs: applySafeLogs(applySafeItems(data?.gangs || [], safeItems), safeLogs),
    checks: data?.checks || [],
    payments: data?.payments || [],
  };
  writeLocalStore(merged);
  return merged;
}

export async function saveSharedStore(data) {
  writeLocalStore(data);
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const shared = Object.fromEntries(
    SHARED_FIELDS.map((field) => [field, data[field] || []]),
  );
  const { error } = await supabase
    .from("gang_state")
    .upsert({ id: "shared", ...shared, updated_at: new Date().toISOString() });
  if (error) throw error;

  const safeRows = (data.gangs || []).flatMap((gang) =>
    (gang.safeItems || []).map((item) => ({
      scope: "shared",
      gang_id: gang.id,
      item_id: item.id,
      name: item.name,
      qty: Number(item.qty) || 0,
      image: item.image || null,
      updated_at: new Date().toISOString(),
    })),
  );
  const { error: deleteError } = await supabase
    .from("safe_items")
    .delete()
    .eq("scope", "shared");
  if (deleteError && deleteError.code !== "42P01") throw deleteError;
  if (safeRows.length) {
    const { error: safeItemsError } = await supabase
      .from("safe_items")
      .insert(safeRows);
    if (safeItemsError) throw safeItemsError;
  }

  const safeLogRows = (data.gangs || []).flatMap((gang) =>
    (gang.safeLogs || []).map((log) => ({
      scope: "shared",
      gang_id: gang.id,
      log_id: log.id,
      date: log.date || null,
      type: log.type,
      item_id: log.itemId,
      item_name: log.itemName,
      quantity: Number(log.quantity) || 0,
      member_id: log.memberId || null,
      note: log.note || null,
      user_name: log.user || null,
      created_at: log.createdAt || new Date().toISOString(),
    })),
  );
  const { error: deleteLogsError } = await supabase
    .from("safe_logs")
    .delete()
    .eq("scope", "shared");
  if (deleteLogsError && deleteLogsError.code !== "42P01") throw deleteLogsError;
  if (safeLogRows.length) {
    const { error: safeLogsError } = await supabase
      .from("safe_logs")
      .insert(safeLogRows);
    if (safeLogsError) throw safeLogsError;
  }
}

export function subscribeToSharedStore(onChange) {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};
  const channel = supabase
    .channel("shared-gang-state")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "gang_state",
        filter: "id=eq.shared",
      },
      async () => {
        try {
          onChange(await loadSharedStore());
        } catch {
          /* Keep the current UI if realtime is unavailable. */
        }
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
