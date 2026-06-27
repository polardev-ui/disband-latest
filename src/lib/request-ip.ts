import { createHash } from "crypto";
import type { NextRequest } from "next/server";

export function getClientIp(request: Request | NextRequest): string {
  // Prefer platform-set headers that clients cannot easily spoof on Vercel.
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp) return vercelIp.split(",")[0]?.trim() || "";
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // The platform appends the real client IP last; take the last hop.
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    return parts[parts.length - 1] || "";
  }
  return "";
}

export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || "disband-ip-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
