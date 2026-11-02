export interface RoleBody {
  name?: string;
  color?: string;
  permissions?: Record<string, boolean>;
  self_assignable?: boolean;
  position?: number;
}

/** Type-checks a role create or edit body; the database checks the values. */
export function readRoleBody(raw: unknown): RoleBody | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Send a JSON object." };
  const b = raw as Record<string, unknown>;
  const out: RoleBody = {};
  if (b.name !== undefined) {
    if (typeof b.name !== "string") return { error: "name must be a string." };
    out.name = b.name;
  }
  if (b.color !== undefined && b.color !== null) {
    if (typeof b.color !== "string") return { error: "color must be a hex colour like #5865f2." };
    out.color = b.color;
  }
  if (b.permissions !== undefined && b.permissions !== null) {
    const p = b.permissions;
    if (typeof p !== "object" || Array.isArray(p) || !Object.values(p).every((v) => typeof v === "boolean")) {
      return { error: "permissions must be an object of permission names to true or false." };
    }
    out.permissions = p as Record<string, boolean>;
  }
  if (b.self_assignable !== undefined && b.self_assignable !== null) {
    if (typeof b.self_assignable !== "boolean") return { error: "self_assignable must be true or false." };
    out.self_assignable = b.self_assignable;
  }
  if (b.position !== undefined && b.position !== null) {
    if (!Number.isInteger(b.position) || (b.position as number) < 1) return { error: "position must be a whole number from 1." };
    out.position = b.position as number;
  }
  return out;
}
