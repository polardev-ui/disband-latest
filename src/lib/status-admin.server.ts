import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserFromRequest, requirePlatformOwner } from "@/lib/server-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export function adminError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function authorizeStatusAdmin(
  request: NextRequest,
): Promise<{ ok: true; userId: string; service: SupabaseClient } | { ok: false; response: NextResponse }> {
  const user = await getUserFromRequest(request);
  if (!user) return { ok: false, response: adminError("Sign in as the platform owner.", 401) };
  if (!(await requirePlatformOwner(user.id))) {
    return { ok: false, response: adminError("Only the platform owner can manage the status page.", 403) };
  }
  const service = getServiceSupabase();
  if (!service) return { ok: false, response: adminError("The database is unavailable right now.", 503) };
  return { ok: true, userId: user.id, service };
}

const MONITOR_FIELDS = new Set([
  "name",
  "url",
  "method",
  "expected_status",
  "keyword",
  "timeout_ms",
  "headers",
  "group_name",
  "position",
  "enabled",
  "public",
]);

export function monitorPatch(body: Record<string, unknown>, requireName = false): { patch: Record<string, unknown>; error?: string } {
  const patch: Record<string, unknown> = {};

  if (body.name !== undefined || requireName) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    if (!name) return { patch, error: "Give the monitor a name." };
    patch.name = name;
  }

  if (body.url !== undefined || requireName) {
    const raw = typeof body.url === "string" ? body.url.trim() : "";
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
      if (url.username || url.password) throw new Error("credentials");
      patch.url = url.toString();
    } catch {
      return { patch, error: "Enter a valid http or https URL." };
    }
  }

  if (body.method !== undefined) {
    const method = typeof body.method === "string" ? body.method.toUpperCase() : "";
    if (method !== "GET" && method !== "HEAD") return { patch, error: "Method must be GET or HEAD." };
    patch.method = method;
  }

  if (body.expected_status !== undefined) {
    const status = Number(body.expected_status);
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      return { patch, error: "Expected status must be between 100 and 599." };
    }
    patch.expected_status = status;
  }

  if (body.timeout_ms !== undefined) {
    const timeout = Number(body.timeout_ms);
    if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 30000) {
      return { patch, error: "Timeout must be between 1000 and 30000 ms." };
    }
    patch.timeout_ms = timeout;
  }

  if (body.keyword !== undefined) {
    if (body.keyword === null || body.keyword === "") patch.keyword = null;
    else if (typeof body.keyword === "string") patch.keyword = body.keyword.trim().slice(0, 200);
    else return { patch, error: "Keyword must be text." };
  }

  if (body.headers !== undefined) {
    if (body.headers === null) patch.headers = {};
    else if (body.headers && typeof body.headers === "object" && !Array.isArray(body.headers)) {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(body.headers as Record<string, unknown>)) {
        if (typeof value !== "string") return { patch, error: "Header values must be text." };
        if (key.length > 100 || value.length > 1000) return { patch, error: "A header is too long." };
        headers[key.slice(0, 100)] = value.slice(0, 1000);
      }
      patch.headers = headers;
    } else {
      return { patch, error: "Headers must be an object." };
    }
  }

  if (body.group_name !== undefined) {
    const group = typeof body.group_name === "string" ? body.group_name.trim().slice(0, 60) : "";
    if (!group) return { patch, error: "Give the group a name." };
    patch.group_name = group;
  }

  if (body.position !== undefined) {
    const position = Number(body.position);
    if (!Number.isFinite(position)) return { patch, error: "Position must be a number." };
    patch.position = Math.trunc(position);
  }

  if (body.enabled !== undefined) patch.enabled = body.enabled === true;
  if (body.public !== undefined) patch.public = body.public === true;

  if (Object.keys(patch).length === 0) return { patch, error: "Nothing to change." };
  patch.updated_at = new Date().toISOString();
  return { patch };
}

const KINDS = new Set(["incident", "maintenance", "announcement"]);
const IMPACTS = new Set(["none", "minor", "major", "critical"]);
const STATUSES = new Set([
  "investigating",
  "identified",
  "monitoring",
  "resolved",
  "scheduled",
  "in_progress",
  "completed",
  "published",
]);

export function incidentPatch(body: Record<string, unknown>, requireTitle = false): { patch: Record<string, unknown>; error?: string } {
  const patch: Record<string, unknown> = {};

  if (body.title !== undefined || requireTitle) {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    if (!title) return { patch, error: "Give the incident a title." };
    patch.title = title;
  }

  if (body.kind !== undefined) {
    const kind = typeof body.kind === "string" ? body.kind : "";
    if (!KINDS.has(kind)) return { patch, error: "Unknown incident kind." };
    patch.kind = kind;
  }

  if (body.impact !== undefined) {
    const impact = typeof body.impact === "string" ? body.impact : "";
    if (!IMPACTS.has(impact)) return { patch, error: "Unknown impact." };
    patch.impact = impact;
  }

  if (body.status !== undefined) {
    const status = typeof body.status === "string" ? body.status : "";
    if (!STATUSES.has(status)) return { patch, error: "Unknown incident status." };
    patch.status = status;
    if (status === "resolved" || status === "completed") patch.resolved_at = new Date().toISOString();
    else patch.resolved_at = null;
  }

  if (body.monitor_ids !== undefined) {
    if (!Array.isArray(body.monitor_ids)) return { patch, error: "Affected services must be a list." };
    const ids = body.monitor_ids.filter(
      (value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value),
    );
    patch.monitor_ids = [...new Set(ids)];
  }

  if (body.scheduled_for !== undefined) {
    if (body.scheduled_for === null || body.scheduled_for === "") patch.scheduled_for = null;
    else {
      const date = new Date(String(body.scheduled_for));
      if (Number.isNaN(date.getTime())) return { patch, error: "Invalid start time." };
      patch.scheduled_for = date.toISOString();
    }
  }

  if (body.scheduled_until !== undefined) {
    if (body.scheduled_until === null || body.scheduled_until === "") patch.scheduled_until = null;
    else {
      const date = new Date(String(body.scheduled_until));
      if (Number.isNaN(date.getTime())) return { patch, error: "Invalid end time." };
      patch.scheduled_until = date.toISOString();
    }
  }

  if (Object.keys(patch).length === 0) return { patch, error: "Nothing to change." };
  return { patch };
}

export { MONITOR_FIELDS, KINDS, IMPACTS, STATUSES };
