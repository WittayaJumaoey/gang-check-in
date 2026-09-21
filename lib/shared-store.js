import { getSupabaseClient } from "./supabase/client";

const STORAGE = "gang-checkin-reconstructed-v1";
const SHARED_FIELDS = ["gangs", "checks", "payments"];

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
  const local = readLocalStore();
  const merged = {
    ...local,
    gangs: data?.gangs || [],
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
