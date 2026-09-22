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
  const local = readLocalStore();
  const merged = {
    ...local,
    gangs: applySafeItems(data?.gangs || [], safeItems),
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
