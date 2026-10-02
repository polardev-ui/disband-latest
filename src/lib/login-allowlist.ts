/**
 * Addresses `/api/auth/login-check` must never stand in front of.
 *
 * Apple's App Review signs in with one shared mailbox that can never receive
 * our confirmation mail, from Apple's own egress (a shared NAT that the VPN
 * detectors can read as a proxy), with several testers using the same account
 * at once. Those are exactly the conditions the gate's burst cap, persistent
 * rate limits and VPN/proxy block were built to reject, and each one of them
 * locks a reviewer out through no fault of theirs — so for these addresses the
 * gate steps aside. Platform bans still apply, and every attempt is still
 * logged (`login_allowed` in `auth_guard_events`), so this is friction removed
 * rather than visibility.
 *
 * `LOGIN_ALLOWLIST_EMAILS` (comma separated) *adds* addresses per environment
 * without a deploy. It deliberately cannot remove the built-in entries: losing
 * the review account to a typo in an env var would reproduce the exact outage
 * this exists to prevent, so removal is a code change on purpose.
 */

const BUILT_IN = ["disband@apple.com"] as const;

function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.includes("@"));
}

export function isLoginAllowlisted(
  email: string,
  env: string | undefined = process.env.LOGIN_ALLOWLIST_EMAILS,
): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  if (BUILT_IN.includes(normalized as (typeof BUILT_IN)[number])) return true;
  return parseList(env).includes(normalized);
}
