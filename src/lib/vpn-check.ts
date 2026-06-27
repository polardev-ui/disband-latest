/** Returns true when the IP appears to be VPN, proxy, Tor, or datacenter hosting. */
export async function isVpnOrProxy(ip: string): Promise<boolean> {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return false;
  }

  const apiKey = process.env.IPQUALITYSCORE_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(
        `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=false&fast=true`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as { vpn?: boolean; proxy?: boolean; tor?: boolean; active_vpn?: boolean };
        return !!(data.vpn || data.proxy || data.tor || data.active_vpn);
      }
    } catch {
      // fall through to backup provider
    }
  }

  try {
    const res = await fetch(
      `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
      { cache: "no-store" },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string; proxy?: boolean; hosting?: boolean };
    if (data.status !== "success") return false;
    return !!(data.proxy || data.hosting);
  } catch {
    return false;
  }
}
