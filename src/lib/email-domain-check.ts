import "server-only";
import { promises as dns } from "node:dns";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Checks an email's domain by its mail servers, for sign-up.
 *
 * Temp-mail services rotate through new domain names faster than any list,
 * but deliver to the same few servers. A domain whose MX resolves to one of
 * those (blocked_mail_servers, migration 0258) is refused and added to
 * blocked_email_domains, so the database refuses it on every path after that.
 * A domain that doesn't exist, or has nowhere to deliver mail, is refused too.
 *
 * Fails open: a DNS timeout or server failure lets the sign-up continue (the
 * other checks still apply), so a slow resolver never locks real people out.
 */

const TIMEOUT_MS = 2000;
const SERVERS_TTL_MS = 10 * 60_000;

let servers: { at: number; ips: Set<string> } | null = null;

async function blockedServers(service: SupabaseClient): Promise<Set<string>> {
  if (servers && Date.now() - servers.at < SERVERS_TTL_MS) return servers.ips;
  const { data } = await service.from("blocked_mail_servers").select("ip").limit(5000);
  const ips = new Set(((data ?? []) as { ip: string }[]).map((r) => r.ip));
  servers = { at: Date.now(), ips };
  return ips;
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), TIMEOUT_MS)),
  ]);
}

/** "Doesn't exist" answers, as opposed to a resolver that couldn't answer. */
function isNoSuchDomain(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN";
}

export type DomainVerdict =
  | { ok: true }
  | { ok: false; reason: "disposable" | "no_mail"; error: string };

export async function checkEmailDomain(service: SupabaseClient, email: string): Promise<DomainVerdict> {
  const domain = email.split("@")[1]?.trim().toLowerCase() ?? "";
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return { ok: false, reason: "no_mail", error: "Enter a valid email address." };
  }

  let mx: { exchange: string }[];
  try {
    mx = await withTimeout(dns.resolveMx(domain));
  } catch (err) {
    if (!isNoSuchDomain(err)) return { ok: true };
    // No MX: mail falls back to the domain's own address, if it has one.
    try {
      await withTimeout(dns.resolve4(domain));
      mx = [{ exchange: domain }];
    } catch (err2) {
      if (!isNoSuchDomain(err2)) return { ok: true };
      return { ok: false, reason: "no_mail", error: "That email address can't receive mail. Check it for typos." };
    }
  }
  if (mx.length === 0 || mx.every((m) => !m.exchange || m.exchange === ".")) {
    return { ok: false, reason: "no_mail", error: "That email address can't receive mail. Check it for typos." };
  }

  const blocked = await blockedServers(service).catch(() => new Set<string>());
  if (blocked.size === 0) return { ok: true };

  const hosts = [...new Set(mx.map((m) => m.exchange.toLowerCase()))].slice(0, 5);
  const ips = (
    await Promise.all(hosts.map((h) => withTimeout(dns.resolve4(h)).catch(() => [] as string[])))
  ).flat();

  if (ips.some((ip) => blocked.has(ip))) {
    // Remember the domain, so the database refuses it on every path.
    await service
      .from("blocked_email_domains")
      .upsert({ domain, reason: "disposable" }, { onConflict: "domain", ignoreDuplicates: true })
      .then(() => undefined, () => undefined);
    return {
      ok: false,
      reason: "disposable",
      error: "Temporary and disposable email addresses cannot be used to create an account.",
    };
  }
  return { ok: true };
}
