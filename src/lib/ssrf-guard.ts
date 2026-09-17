const IPV4_PART = /^(0[xX][0-9a-fA-F]+|0[0-7]*|[1-9][0-9]*|[0-9]+)$/;

function parsePart(part: string): number | null {
  const m = IPV4_PART.exec(part);
  if (!m) return null;
  const raw = m[1];
  let n: number;
  if (/^0[xX]/.test(raw)) n = parseInt(raw, 16);
  else if (/^0/.test(raw) && raw.length > 1) {
    if (!/^[0-7]+$/.test(raw)) return null;
    n = parseInt(raw, 8);
  } else n = parseInt(raw, 10);
  return Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff ? n : null;
}

function parseIPv4(host: string): [number, number, number, number] | null {
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  }
  if (/^0[xX][0-9a-fA-F]+$/.test(host)) {
    const n = parseInt(host, 16);
    if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  }
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    const n = parsePart(part);
    if (n === null || n > 255) return null;
    bytes.push(n);
  }
  return bytes as [number, number, number, number];
}

function expandIPv6(host: string): number[] | null {
  if (!/^[0-9a-fA-F:.]+$/.test(host) || !host.includes(":")) return null;
  const halves = host.split("::");
  if (halves.length > 2) return null;
  const parseGroup = (s: string): number[] | null => {
    if (s === "") return [];
    const out: number[] = [];
    for (const g of s.split(":")) {
      if (g.includes(".")) {
        const v4 = parseIPv4(g);
        if (!v4) return null;
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
        out.push(parseInt(g, 16));
      }
    }
    return out;
  };
  if (halves.length === 1) {
    const groups = parseGroup(host);
    return groups && groups.length === 8 ? groups : null;
  }
  const head = parseGroup(halves[0]);
  const tail = parseGroup(halves[1]);
  if (!head || !tail) return null;
  const fill = 8 - head.length - tail.length;
  if (fill < 1) return null;
  return [...head, ...new Array(fill).fill(0), ...tail];
}

export function isPrivateAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) {
    const [a, b, c] = v4;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113);
  }
  const v6 = expandIPv6(ip);
  if (v6) {
    const [first, second] = v6;
    return (first & 0xe000) !== 0x2000 || first === 0x2002 || first === 0x3fff ||
      (first === 0x2001 && (second < 0x200 || second === 0xdb8));
  }
  return true;
}

function validateUrl(rawUrl: string): URL {
  if (rawUrl.length > 4096) throw new Error("URL too long");
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (url.port && !["80", "443"].includes(url.port))) throw new Error("Disallowed URL");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || /\.(local|internal|localhost)$/.test(host)) {
    throw new Error("Blocked host");
  }
  const v4 = parseIPv4(host);
  if (v4) {
    if (isPrivateAddress(host)) throw new Error("Blocked address");
    return url;
  }
  if (host.includes(":")) {
    if (isPrivateAddress(host)) throw new Error("Blocked address");
    return url;
  }
  if (/[^a-z0-9.-]/i.test(host)) throw new Error("Blocked host");
  return url;
}

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  return validateUrl(rawUrl);
}

export async function fetchSafeHtml(rawUrl: string, maxBytes = 512 * 1024): Promise<string | null> {
  let url = validateUrl(rawUrl);
  for (let hop = 0; hop <= 3; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "DisbandLinkPreview/1.0 (+https://www.disband.dev)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Encoding": "identity",
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = validateUrl(new URL(res.headers.get("location")!, url).toString());
      await res.arrayBuffer().catch(() => null);
      continue;
    }
    if (res.status < 200 || res.status >= 300 ||
        !res.headers.get("content-type")?.includes("html") ||
        (res.headers.get("content-encoding") && res.headers.get("content-encoding") !== "identity")) {
      await res.arrayBuffer().catch(() => null);
      return null;
    }
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => null);
        throw new Error("Preview exceeds size limit");
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(merged);
  }
  throw new Error("Too many redirects");
}
