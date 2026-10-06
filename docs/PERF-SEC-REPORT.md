# Disband Performance / Security / Privacy Engineering Report

Date: 2026-10-06. Living document — updated per batch.
Related: `docs/E2EE-DESIGN.md` (encryption blueprint).

## 1. Executive summary

No infrastructure was replaced. All work is measured, incremental, and
shipped behind the normal release chain (push → Prepare Release bot →
tag → Release Desktop auto-dispatch). Headline results:

- Message bundle largest chunk **523 KB → 438 KB** (prism split out).
- 1:1 call signaling no longer uses predictable channel names; sender
  attestation added on all three call transports (1:1, group, voice).
- Next.js **16.3.4 → 16.3.8**: fixes a CRITICAL RCE (ImageResponse, a
  route this app serves) plus 2 HIGH advisories. `pnpm audit`: **0 vulns**.
- Realtime fan-out cut: duplicate own-profile subscription removed,
  per-group sockets consolidated, catalyst firehose scoped.
- Scrollback state capped (200 rows) with refetch-safe `hasMore`.
- RLS boundaries now proven by adversarial PGlite tests (messages, DMs,
  voice presence).
- Android auth sessions moved to Keystore-backed encrypted storage.
- Desktop auto-update repaired end-to-end (minisign keypair, CI chain,
  snooze-not-skip, Silicon-first picker, update chime).
- Honest negative results: messages are plaintext at rest (no E2EE yet —
  blueprint in E2EE-DESIGN.md, not code); in-memory rate limits are
  per-isolate (auth gates additionally have DB-backed limits);
  push-notification bodies carry message text by design.

## 2. Architecture (as found)

Next.js 16 + React 19 App Router. `/app` client shell (`DisbandRoot` →
`DiscordApp`), most state in one large `AppContext`. Messaging over
Supabase Realtime `postgres_changes` with self-healing resubscribe;
~50 API routes for the rest. Postgres with heavy RLS + security-definer
RPCs for sensitive ops. Full-mesh WebRTC over Supabase broadcast
signaling; Cloudflare TURN with short-lived credentials (2 h TTL,
server only serves >1 h of life remaining). Deno already runs the jobs
it suits (Supabase Edge Functions: send-push, send-call-push,
content-sentinel, appstore). Media via Cloudflare Worker → R2
(auth-gated uploads, sandboxed immutable serving, dangerous types forced
to download). No client cryptography anywhere; no tracking SDKs.

## 3. Bottlenecks found (measured)

| # | Finding | Evidence | Fix | Status |
|---|---|---|---|---|
| 1 | Every chat message ran grapheme segmentation + recursive cloneElement, even plain text | `Twemoji.tsx:renderEmojiString` unconditional walk | Superset-regex gate (`mayContainEmoji`), pinned by tests | Shipped |
| 2 | prism (~85 KB) in the message bundle for all messages | Build chunks: 523 KB max | `React.lazy` CodeBlock + identical-box Suspense fallback | Shipped, 438 KB max |
| 3 | Row objects rebuilt per render (`mapChatMessage` inline) → `enriched` recompute + full list re-render on any app state change | `DiscordApp.tsx:1211` | `useMemo` on mapped rows | Shipped |
| 4 | Reaction lookup O(rows × reactions) per render | `ChatCanvas` filter per row | Grouped `Map` + shared empty ref | Shipped |
| 5 | Scrollback state unbounded (`loadMore` prepend, no cap) | `[...older, ...prev]` × 3 | `capHistoryRows` (200) + monotonic `hasMore` | Shipped + tested |
| 6 | Merge of 500-row burst | New test | 1.2 ms measured, no loss/dupes | Tested |
| 7 | Unfiltered `server_catalysts` subscription + world-readable table = global firehose per client | `catalysts:${userId}` no filter; read policy `using (true)` | Per-server + own-grant bindings | Shipped |
| 8 | Duplicate own-profile subscriptions (refetch + patch per event) | `profiles:` + `profile:` channels | Single patch + cache write | Shipped |
| 9 | 2 sockets per group chat (`gcm:`, `gcp-badge:`) | N groups → 2N channels | 2 channels total, N bindings each | Shipped |

## 4. Vulnerabilities found

| # | Severity | Finding | Fix | Status |
|---|---|---|---|---|
| V1 | CRITICAL | Next.js RCE (ImageResponse; `opengraph-image`, `twitter-image` serve it), installed 16.3.4 < patched 16.3.6 | Upgrade to 16.3.8 (+ sharp, source-map-js); audit clean | Shipped |
| V2 | HIGH | 1:1 call channel `min:max(userIds)` — computable by anyone holding the public anon key → eavesdrop SDP/ICE (IP leak via srflx), inject offers/answers/leave | Per-call `crypto.randomUUID()`; `directCallId` retired | Shipped |
| V3 | HIGH | Signal `from` fields trusted on all call transports (forged leave = remote hangup; forged offer = IP harvest) | Sender gates: 1:1 peer check; group + voice presence-membership check (presence insert is RLS membership-proofed) | Shipped + presence RLS tested |
| V4 | MEDIUM | Android refresh/access tokens in plaintext SharedPreferences XML | Keystore-backed EncryptedSharedPreferences + one-time migration | Shipped, APK verified |
| V5 | MEDIUM | 6 dead `/api/encrypt/method/*` proxies: unauthenticated, forwarded arbitrary bodies with a bearer key | Deleted | Shipped |
| V6 | MEDIUM | Push bodies carry message plaintext through APNs/FCM (by design today) | Must become generic for E2EE threads; documented | Open (design) |
| V7 | MEDIUM | In-memory `rateLimit` is per-isolate (bypassable across serverless instances) | Auth gates already have DB-backed persistent limits; non-auth routes are low-value targets | Open, low priority |
| V8 | LOW | Session `console.warn` logged full SDK error objects (token-capable) | Name + message only | Shipped |
| V9 | LOW | Dead `greet` Tauri command exposed on IPC | Removed (least-privilege caps already clean) | Shipped |

## 5. Encryption status

- Transport: TLS everywhere; calls full-mesh DTLS-SRTP (no media server
  exists to decrypt — but do NOT market this as app-level E2EE).
- Message/app-level E2EE: **does not exist**. See `docs/E2EE-DESIGN.md`
  for the Signal-protocol blueprint (1:1 DMs first, explicit group
  exclusion, moderation/search tradeoffs, acceptance criteria). No
  half-crypto shipped, per policy.

## 6. Tests

`pnpm test:security`: **181/181 pass** (22 new this program:
twemoji-fastpath, message-history-cap, message-merge incl. 500-row
burst, message-dm-boundaries, voice-presence-boundary,
github-releases). Typecheck clean, production build clean, Android
`assembleDebug` clean, `pnpm audit` clean.

## 7. Remaining risks / next steps

1. **E2EE implementation** (design complete): libsignal integration
   across web/iOS/Android, device-key tables, envelope delivery,
   notification-body redaction for E2EE threads, recovery UX. Largest
   remaining program; needs dedicated cross-client execution, not a
   drive-by commit.
2. **Server-wide channels stay transport-only** (moderation requirement);
   say so publicly rather than implying otherwise.
3. **In-memory rate limits** on non-auth routes: acceptable residual;
   promote to DB-backed if abuse appears.
4. **Push content**: fine for transport-only threads; must gate before
   any E2EE launch.
5. **Load testing**: correctness-under-burst is tested; sustained
   multi-client soak (reconnect storms, 100+ presence) still wants a
   staging harness.

## 8. Deployment / rollback

All changes ride the standard chain (push → tag → Vercel + desktop
builds). No migrations shipped in this program (RLS/tests only), so
rollback is `git revert` + redeploy. The Android storage migration is
forward-compatible (plaintext fallback retained in code path if the
Keystore is unusable).
