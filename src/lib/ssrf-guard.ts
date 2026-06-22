import { lookup } from "node:dns/promises";
import net from "node:net";

/** Hostnames that must never be fetched server-side. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true; // loopback
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.split(":").pop() ?? "";
    if (v4.includes(".")) return isPrivateIpv4(v4);
  }
  return false;
}

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  if (net.isIPv6(ip)) return isPrivateIpv6(ip);
  return true;
}

/**
 * Validates that a URL is safe to fetch server-side (blocks SSRF to internal
 * hosts, cloud metadata endpoints, and non-http(s) schemes). Resolves DNS and
 * rejects private/reserved IP targets.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Blocked host");
  }

  // If the host is a literal IP, check directly; otherwise resolve all records.
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Blocked address");
    return url;
  }

  const records = await lookup(host, { all: true });
  if (records.length === 0) throw new Error("Host did not resolve");
  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new Error("Blocked address");
    }
  }

  return url;
}
