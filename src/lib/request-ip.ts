import { createHash } from "crypto";
import type { NextRequest } from "next/server";

export function getClientIp(request: Request | NextRequest): string {
  // Cloudflare is authoritative when behind Workers/OpenNext — must come
  // first, otherwise the rate-limit key collapses to a proxy IP.
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const trueClient = request.headers.get("true-client-ip");
  if (trueClient) return trueClient.trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp) return vercelIp.split(",")[0]?.trim() || "";
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Left-most entry is the original client; right-most is the last proxy.
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    return parts[0] || "";
  }
  return "";
}

export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || "disband-ip-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function hashValue(value: string, scope: string): string {
  const salt = process.env.IP_HASH_SALT || "disband-ip-salt";
  return createHash("sha256").update(`${salt}:${scope}:${value.toLowerCase().trim()}`).digest("hex");
}
