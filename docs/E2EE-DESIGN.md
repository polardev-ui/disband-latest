# Disband E2EE Architecture (design — NOT yet implemented)

Status: blueprint. No ciphertext code ships with this document. Do not
claim E2EE anywhere in product copy until the acceptance criteria in §9
are met and audited.

## 1. Current state (measured, 2026-10-06)

- All message content (`messages.content`, `dm_messages.content`,
  `group_messages.content`) is **plaintext at the server**. Supabase —
  and anyone with database access — can read everything.
- No client cryptography exists: no SubtleCrypto, no libsignal, no
  encrypted attachments. (The removed `/api/encrypt/method/*` proxies
  were unauthenticated dead code pointing at `encrypt.disband.dev`.)
- Calls are full-mesh WebRTC: DTLS-SRTP gives **transport** encryption
  peer-to-peer with no media server in the path. That is not
  application-level E2EE (a compromised endpoint aside, there is no
  intermediary to protect against — but there is also no authentication
  of the peer beyond the signaling channel, see §7).
- Server-side plaintext consumers that E2EE would break: Tether AI
  (`/api/tether/ask` reads message rows), Sentinel/content-safety scans,
  mention fanout, full-text search, link-preview fetching, push
  notification bodies.

## 2. Scope decision

- **Phase A (this design): 1:1 DMs only.** Two parties, bounded device
  sets, no moderation obligation between consenting adults beyond
  user-initiated reports.
- **Explicitly NOT in Phase A:** server channels and group DMs. Reasons:
  (a) moderation and safety scanning are product requirements in shared
  spaces; (b) member join/leave with history needs MLS-style group
  ratcheting, a separate protocol project; (c) search over server
  history must keep working. Claiming DM encryption covers groups would
  be dishonest — see limitation log §8.

## 3. Protocol choice: Signal, not custom crypto

Use the official Signal client libraries (audited, maintained):

- Web/desktop: `@signalapp/libsignal-client` (WASM).
- iOS: `libsignal-client` Swift bindings.
- Android: `libsignal-client` Kotlin bindings.

Primitives used, never invented: X25519 (identity + ephemeral keys),
AES-256-GCM (message AEAD via the Double Ratchet), HMAC-SHA256 (chain
keys), XEdDSA (identity signatures inside the library).

Session establishment: X3DH with signed prekeys + one-time prekeys,
exactly as the Signal libraries implement it. Forward secrecy and
post-compromise security come from the Double Ratchet, not from anything
we design.

## 4. Key management

- **Identity keys:** per device, generated on device, non-extractable
  storage (Web: IndexedDB via the library's store interface; iOS:
  Keychain + Secure Enclave where available; Android: Keystore).
- **Server stores ONLY:** identity public keys, signed prekeys, one-time
  prekey bundles. New tables required: `signal_devices`,
  `signal_prekeys`. Private keys must never leave the device.
- **Multi-device:** each device is an independent Signal endpoint. A DM
  message fans out one envelope per recipient device (sender-client
  fanout, like Signal). Device list changes are announced so senders
  stop encrypting to removed devices.
- **Verification:** safety-number screen (compare out-of-band) before
  trusting a new device key; key-change warnings.
- **Recovery:** NO server key escrow (that would defeat the purpose).
  Recovery = re-register (new identity key, contacts see a key-change
  notice) plus an optional encrypted local backup the user exports.
  Lost device + no backup = history on that device is unrecoverable.
  Say this in the UI, plainly.

## 5. Message flow (1:1 DMs)

1. Sender resolves recipient device list (public keys from server).
2. For each device: Double-Ratchet encrypt → envelope
   `{ deviceId, type(prekey|whisper), ciphertext, counter }`.
3. Sender POSTs envelopes to a new `dm_envelopes` endpoint (service
   validates authorship + thread participation only — it cannot read).
4. Storage row keeps: thread_id, sender_device, envelopes[], timestamp.
   NO plaintext column populated for E2EE threads.
5. Recipient devices fetch, decrypt locally, advance ratchets. Replay
   and out-of-order handling come from the library.
6. Attachments: per-file AES-256-GCM data key, random 96-bit nonce,
   encrypted blob to storage; the data key travels inside the message
   envelope. Never reuse a nonce with a key.

## 6. Calls (Phase B, after messaging)

Full-mesh has no SFU to hide media from, so the remaining gap is peer
authentication + key confirmation, not transport. Phase B: SFrame
(insertable streams / encoded transforms) with media keys exchanged
inside the DM Signal session, rotated on membership change and
reconnect. Do NOT label current DTLS-SRTP calls "E2EE" in product copy.

## 7. What E2EE does NOT fix (still required)

- **Signaling authentication** (shipped 2026-10-06: random 1:1 call IDs,
  sender checks on `call:` channels, presence-gated group signals).
  E2EE envelopes still need the transport checks.
- **Endpoint compromise, backups, push-notification bodies** (bodies must
  become "New message" for E2EE threads — notification payloads
  currently may carry content; audit before launch).
- **Metadata**: who talks to whom, when, how much — remains visible by
  design. State this in the privacy policy.

## 8. Functionality tradeoffs (explicit)

| Feature | E2EE 1:1 DM impact |
|---|---|
| Tether AI in DMs | Cannot read ciphertext. Tether-in-DM becomes unavailable for E2EE threads, or user opts a thread out (explicit, reversible). |
| Server-side abuse scanning | Blind. Replaced by: client-side classifiers, in-app reporting with explicit plaintext disclosure (report bundle = cited message + envelope proof, sent only when the reporter taps Report), metadata rate limits, device reputation. |
| Full-text search | Local-device index only. |
| Link previews | Generated client-side or not at all for E2EE threads. |
| Message history on new device | Not backfilled (no keys). Starts at registration. |

## 9. Acceptance criteria (all required before any "E2EE" claim)

1. Protocol review against this doc by a second engineer.
2. Adversarial tests: replayed envelope rejected; forged envelope
   rejected; removed-device ciphertext unreadable by newcomer (needs
   group/MLS phase — 1:1: re-register rotates); malformed ciphertext
   never crashes the client (fuzz the decrypt path).
3. Database assertion test: `content` column NULL for all E2EE thread
   rows; server test-account cannot decrypt another user's envelope.
4. iOS + Android + web interop matrix (each pair, both directions,
   plus multi-device fanout).
5. Notification-payload audit proving no ciphertext-adjacent plaintext.
6. Updated privacy policy + in-app explainer (recovery limits).

## 10. Migration

Opt-in per thread ("Enable encryption" — both clients must support the
protocol version; mixed clients fall back to transport-only with a
visible indicator, never silent). Existing plaintext history stays
plaintext and is labeled as such. No silent server-side "decryption"
of anything, ever.

## 11. Rejected alternatives

- Custom AES-wrapper protocol: violates "never invent crypto"; loses
  forward secrecy and PCS review.
- PGP-style static keys: no forward secrecy, terrible multi-device UX.
- Server-held "encryption" (e.g., encrypting DB columns with a server
  key): not E2EE by definition; rejected outright.
- MLS for 1:1 first: heavier than needed; revisit for groups (Phase C).
