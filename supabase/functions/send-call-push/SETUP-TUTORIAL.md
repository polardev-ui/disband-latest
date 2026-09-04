# Getting iOS calls to ring & vibrate like a real phone (Step-by-Step)

The call-ring code (haptics, PushKit VoIP pushes, CallKit swipe-to-answer) is
**already written and wired in**. The good news: unlike push notifications, this
needs **almost nothing** on the Apple side — there is (deliberately) no "Voice
over IP" capability to enable in the portal, because Voice over IP is an Xcode
**background mode**, which the build already sets for you.

When this is done, the flow is:

```
You call a friend from Disband (iOS or web)
        │  CallManager fires a VoIP push (best-effort)
        ▼
send-call-push edge function
        │  verifies your session, signs a JWT with the existing APNs `.p8` key
        │  posts to APNs with topic  com.wsgpolar.disband.voip
        ▼
APNs → PushKit (voip push-type) on the friend's iPhone
        │  wakes the app even if it was killed / backgrounded
        ▼
CallKit shows the system call screen (lock screen ring, swipe-to-answer);
foregrounded apps get the in-app overlay + vibration instead
        ▼
Answer → the normal Disband call UI (identical to a foreground call)
```

Everything below is one-time.

---

## Prerequisites

- An **Apple Developer Program** account with **Admin** role.
- Push already working (you completed `send-push/SETUP-TUTORIAL.md`): App ID has
  **Push Notifications** enabled, and you have the `.p8` **APNs Auth Key**.
- Supabase CLI, a physical iPhone, and access to project
  `mjqbrcabargylimlafw`.

---

## Part 1 — Apple Developer Portal (very short)

Open [developer.apple.com/account](https://developer.apple.com/account).

### 1.1 Confirm Push Notifications is enabled on the App ID

1. **Certificates, Identifiers & Profiles** → **Identifiers** → **Disband**
   (`com.wsgpolar.disband`).
2. **Push Notifications** shows as **enabled**. (You set this when you set up
   alert pushes — if it happens to be off, click **Enable** and **Save**.)
3. The "**Certificates (0)**" note next to it is irrelevant here — that's for
   APNs *SSL certificates*, and you authenticate with a `.p8` Auth Key instead.

### 1.2 There is no "Voice over IP" capability — and that's expected

VoIP is a **background mode in the build**, not an App ID capability, so there
is no toggle for it (that's why you don't see it). Your project already ships
it: `ios/project.yml` and `ios/DisbandiOS/Resources/Info.plist` set
`UIBackgroundModes` to `voip`, `audio`, and `remote-notification`. **No portal
step exists or is needed.**

### 1.3 (Optional, recommended) Create a VoIP Services Certificate

Apple's VoIP docs list a per-app **VoIP Services Certificate**. If you're asked
about it at App Review, having one avoids friction:

1. **Certificates** → **＋ (Create)** → under **Services**, look for
   **VoIP Services Certificate**.
2. Select the Disband App ID → **Continue** → follow the CSR flow (same CSR
   process you used for the push/distribution certs).
3. **Download** the `.cer` and double-click to install into the keychain.

If the portal no longer offers it, don't chase it: pushes are signed with your
`.p8` auth key, which Apple honors for the `com.wsgpolar.disband.voip` topic,
and the certificate only matters for legacy provider setups.

### 1.4 No provisioning profile changes

Background modes and certificates don't change entitlements, so the existing
**Disband App Store** profile (already regenerated with **Push Notifications**
during the push setup) is unchanged and still valid. Rebuild the app so the new
Info.plist (voip/audio background modes) is baked in.

---

## Part 2 — Deploy the edge function

From the repo root:

```bash
supabase functions deploy send-call-push --no-verify-jwt
```

`--no-verify-jwt`: the function checks the caller's session token itself (only a
signed-in user may push), so the gateway must not reject requests that carry an
app session token.

No new secrets: `send-call-push` reuses the exact `APNS_*` secrets from the
`send-push` tutorial (`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`,
`APNS_PRIVATE_KEY`, `APNS_HOST`). It sends to the APNs topic
**`com.wsgpolar.disband.voip`** (derived from `APNS_BUNDLE_ID` + `.voip`).

---

## Part 3 — Code verification (already done, nothing to change)

The repo already contains the pieces; confirm them so a future build doesn't
silently regress:

1. `ios/DisbandiOS/DisbandiOS.entitlements` keeps just the push entitlement:
   ```xml
   <key>aps-environment</key><string>production</string>
   ```
2. `ios/project.yml` + `ios/DisbandiOS/Resources/Info.plist`
   `UIBackgroundModes`: `voip`, `audio`, and `remote-notification`. (All three
   are ordinary Info.plist keys — no entitlement, no App ID capability.)
3. `VoipPushService` registers the `.voIP` push type and stores the token under
   platform `ios-voip` via the existing `register_device_token` RPC.
4. `CallKitProvider` reports incoming calls (audio only, `hasVideo = false`);
   `CallManager` starts haptics on the ring.

---

## Part 4 — Build & test on a real device

PushKit VoIP pushes don't work in the simulator either. Use a physical iPhone.

1. **Archive** the app (the existing `Disband App Store` profile), distribute
   via TestFlight or install locally.
2. While signed in, the app registers its **VoIP** token. Confirm it exists:
   ```sql
   select user_id, platform, updated_at
   from public.device_tokens
   where platform = 'ios-voip'
   order by updated_at desc;
   ```
3. Call the phone's user from **another account** (web or a second device) and
   **background / lock the phone** first.
   - The phone should ring like a real call: full-screen incoming call UI,
     vibration, swipe-to-answer. This works even if Disband was killed.
   - With the app **foregrounded**, the in-app overlay rings instead (plus
     haptics), matching the old behavior.

---

## App Store review notes (read before submitting)

Apple scrutinizes VoIP apps. When you submit, be ready to answer:

- **What the app uses Voice over IP / PushKit for:** 1:1 voice (and video) calls
  between Disband users, so calls can ring like a real phone.
- The app only rings for **real, caller-initiated calls**; it never uses VoIP
  pushes for ads/notifications.

---

## Debugging if it still doesn't ring

| Symptom | Check |
|---|---|
| No VoIP token in `device_tokens` (platform `ios-voip`) | Build wasn't reinstalled after the Info.plist gained the `voip` background mode; or the provisioning profile lacks `aps-environment` (re-run the push setup). |
| Edge function logs show `{ sent: 0 }` | No `ios-voip` token for that user yet; or the token was registered under the wrong platform. |
| Pushes "sent" but phone doesn't ring | Wrong `APNS_HOST`/topic — confirm topic is exactly `com.wsgpolar.disband.voip` (derived from `APNS_BUNDLE_ID`). |
| CallKit UI never appears (but in-app ring works) | App missing the `voip` background mode in its Info.plist, or the `.entitlements` file lists an entitlement the profile doesn't contain (codesign fails / push silently ignored). |
| VoIP pushes stop arriving after a few | The app failed to report a call to CallKit once (on iOS 13+ the system suspends VoIP pushes if an incoming push never becomes a CallKit call). Reinstall to reset. |

Edge function logs: Supabase Dashboard → **Edge Functions** → `send-call-push`
→ **Logs** — each call prints `{ "sent": N }`.