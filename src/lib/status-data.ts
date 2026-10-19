import "server-only";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_ENV } from "@/lib/public-env";
import type { StatusIncident, StatusSnapshot } from "@/lib/status";

const EMPTY: StatusSnapshot = { generated_at: new Date().toISOString(), monitors: [], incidents: [] };

function client() {
  return createClient(PUBLIC_ENV.supabaseUrl, PUBLIC_ENV.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getStatusSnapshot(): Promise<StatusSnapshot> {
  try {
    const { data, error } = await client().rpc("status_public_snapshot");
    if (error || !data || typeof data !== "object") return EMPTY;
    return data as StatusSnapshot;
  } catch {
    return EMPTY;
  }
}

export async function getStatusIncident(id: string): Promise<StatusIncident | null> {
  try {
    const { data, error } = await client().rpc("status_public_incident", { p_id: id });
    if (error || !data || typeof data !== "object") return null;
    return data as StatusIncident;
  } catch {
    return null;
  }
}
