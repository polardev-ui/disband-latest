import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import net from "node:net";

/** Reject non-public destinations, including mapped IPv6 and transition ranges. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113);
  }
  if (net.isIPv6(ip)) {
    const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    const [first, second] = canonical.split(":").map(s => parseInt(s || "0", 16));
    // Only globally routed unicast; deny mapped, NAT64, ULA, link-local,
    // multicast, Teredo, 6to4 and documentation prefixes as well.
    return (first & 0xe000) !== 0x2000 || first === 0x2002 || first === 0x3fff ||
      (first === 0x2001 && (second < 0x200 || second === 0xdb8));
  }
  return true;
}

async function resolveSafeUrl(rawUrl: string) {
  if (rawUrl.length > 4096) throw new Error("URL too long");
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (url.port && !["80", "443"].includes(url.port))) throw new Error("Disallowed URL");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || /\.(local|internal|localhost)$/.test(host)) throw new Error("Blocked host");
  const records = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await lookup(host, { all: true });
  if (!records.length || records.some(r => isPrivateAddress(r.address))) throw new Error("Blocked address");
  return { url, address: records[0].address, family: records[0].family };
}

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  return (await resolveSafeUrl(rawUrl)).url;
}

/** Pin the validated DNS address to the connection; never resolve it again or follow redirects. */
export async function fetchSafeHtml(rawUrl: string, maxBytes = 512 * 1024): Promise<string | null> {
  const { url, address, family } = await resolveSafeUrl(rawUrl);
  return new Promise((resolve, reject) => {
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = request(url, {
      agent: false,
      family,
      lookup: (_host, _options, callback) => callback(null, address, family),
      headers: { "User-Agent": "DisbandLinkPreview/1.0 (+https://www.disband.dev)", Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "identity" },
      signal: AbortSignal.timeout(8000),
    }, res => {
      if ((res.statusCode ?? 500) < 200 || (res.statusCode ?? 500) >= 300 ||
        !res.headers["content-type"]?.includes("html") ||
        (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")) {
        res.destroy(); resolve(null); return;
      }
      let bytes = 0;
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) { res.destroy(); reject(new Error("Preview exceeds size limit")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
      res.on("aborted", () => reject(new Error("Preview interrupted")));
    });
    req.on("error", reject); req.end();
  });
}
