# Getting iOS Push Notifications Working (Step-by-Step)

Disband's push code is **already written and complete**. What is missing is the
**one-time external configuration** that only you can do — it needs your Apple
Developer account (a real `.p8` APNs auth key) and a few Supabase commands.

When this is done, the flow is fully automated:

```
Friend sends you a DM
        │
        ▼
db trigger (trg_dm_message_push)  ← migration 0026
        │  INSERT on dm_messages
        ▼
notify_push() → pg_net.http_post
        │  posts to https://…supabase.co/functions/v1/send-push
        ▼
send-push edge function
        │  verifies x-webhook-secret, signs a JWT with your APNs key
        ▼
APNs (Apple Push Notification service)
        │  works even when the app is fully killed
        ▼
iOS banner / sound appears on the device
```

Everything below is one-time (do it once, then push works for all users).

---

## Prerequisites

- An **Apple Developer Program** account (paid) with **Admin** role.
- The `.p8` **APNs Auth Key** created in the portal (only downloadable once — keep a copy).
- The Supabase CLI installed:
  ```bash
  supabase --version   # 2.107.0 is fine
  ```
- A **physical iPhone** for testing (push does NOT work in the simulator).
- Access to the project on Supabase (project ref `mjqbrcabargylimlafw`).

---

## Part 1 — Apple Developer Portal

Open [developer.apple.com/account](https://developer.apple.com/account) and sign in.

### 1.1 Enable the Push Notifications capability on the App ID

1. Go to **Certificates, Identifiers & Profiles**.
2. Click **Identifiers** (left sidebar), then find **Disband**
   (`com.wsgpolar.disband`). Click it.
3. Scroll to **Push Notifications** and **check the box** (tick) it.
4. Click **Save** at the top of the page.
5. If Apple asks you to confirm / regenerate certificates here, just confirm.

> **Why:** The app binary already has the `aps-environment` entitlement, but
> Apple refuses to issue a provisioning profile with push until the App ID has
> the capability turned on.

### 1.2 Create an APNs Auth Key (this is the `.p8` file)

1. In **Certificates, Identifiers & Profiles**, click **Keys** (left sidebar).
2. Click the **＋** (Create a key) button.
3. Give it a name, e.g. `Disband Push`.
4. Check the box **Apple Push Notifications service (APNs)**.
5. Click **Continue**, then **Register**.
6. **Download the `.p8` file** — it looks like `AuthKey_XXXXXXXXXX.p8`
   (`XXXXXXXXXX` is your **Key ID**). **You can only download this once.** Save
   it somewhere safe (e.g. a password manager or a `~/secrets` folder). Keep it
   out of the git repo.
7. Note the **Key ID** (the `XXXXXXXXXX` part).

You also need your **Team ID**. Find it:
- Top-right of the developer portal next to your name, **or**
- `Account → Membership Details → Team ID` → **`KR54WPJ24G`** (yours).

### 1.3 Regenerate the distribution provisioning profile

Because you just turned on Push for the App ID, the existing
`Disband App Store` provisioning profile is now out of date (it doesn't include
push). You must regenerate it, otherwise the next archive will fail.

1. In **Certificates, Identifiers & Profiles**, click **Profiles**.
2. Find **Disband App Store** (the manual distribution profile).
3. Click **Edit** → scroll to the bottom → **Save**. (Saving regenerates it to
   pick up the now-enabled Push capability.)
4. Click **Download** to save the `.mobileprovision` file.
5. In Xcode on your Mac:
   - **Alternatively, simplest:** double-click the downloaded `.mobileprovision`
     to install it into Xcode. Xcode will pick it up automatically.
   - Or via Xcode: **File → Open** the project, then select the target →
     **Signing & Capabilities** → for the **Release** configuration, under
     **Provisioning Profile** choose **Import Profile…** and select the
     downloaded file.

> **Gotcha:** If the profile shows **Push** but your archive still complains,
> make sure the selected **Distribution Certificate** in the profile matches the
> one you're signing with, and that the bundle id is exactly
> `com.wsgpolar.disband`.

---

## Part 2 — Connect Supabase (deploy the edge function + secrets)

### 2.1 Make sure you're linked to the right Supabase project

From the repo root (`/Users/joshclark/Projects/disband-latest`):

```bash
supabase login                                 # once — opens a browser
supabase link --project-ref mjqbrcabargylimlafw
```

### 2.2 Deploy the `send-push` edge function

```bash
supabase functions deploy send-push --no-verify-jwt
```

`--no-verify-jwt` is important: the function is called by the database trigger
(a `pg_net` HTTP call), not by a logged-in user, so it must not require a
Supabase JWT. It instead authenticates via the shared `x-webhook-secret` header.

### 2.3 Set the function secrets

Replace the placeholder values with your real ones. **`WEBHOOK_SECRET` is a
random string *you* invent** — write it down, you'll reuse it in step 3.

```bash
supabase secrets set \
  APNS_KEY_ID="XXXXXXXXXX" \
  APNS_TEAM_ID="KR54WPJ24G" \
  APNS_BUNDLE_ID="com.wsgpolar.disband" \
  APNS_HOST="api.push.apple.com" \
  WEBHOOK_SECRET="$(openssl rand -hex 24)" \
  APNS_PRIVATE_KEY="$(cat /path/to/AuthKey_XXXXXXXXXX.p8)"
```

- Set `APNS_KEY_ID` to the Key ID from step 1.2.
- Set `APNS_TEAM_ID` to your Team ID (`KR54WPJ24G`).
- `WEBHOOK_SECRET="$(openssl rand -hex 24)"` generates a fresh random secret.
  **Run the same command** in step 3 to see what it generated (or set it to a
  fixed string you choose, so you can reuse it in the SQL step).

> **APNS_HOST:** leave `api.push.apple.com` for **both** TestFlight and App
> Store builds. (The entitlement is already `aps-environment: production`, so
> TestFlight and released builds are both "production" APNs.)

### 2.4 Confirm the secrets are set

```bash
supabase secrets list
```
You should see all of: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`,
`APNS_HOST`, `WEBHOOK_SECRET`, `APNS_PRIVATE_KEY` (Supabase adds
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` automatically).

---

## Part 3 — Wire the database trigger secret

The trigger reads a shared secret from a **database setting** so the secret is
never committed to git. It must exactly match `WEBHOOK_SECRET` from step 2.3 —
if they differ, the edge function rejects the trigger's call (silently) and no
push goes out.

### 3.1 Run this SQL once (in the Supabase Dashboard → SQL Editor)

```sql
alter database postgres set app.webhook_secret = '<same value as WEBHOOK_SECRET>';
```

Use the **exact same string** as `WEBHOOK_SECRET`. If you used
`openssl rand -hex 24`, run that command again to see the value and paste it in.

### 3.2 Apply the two push migrations (if not already applied)

In the **Supabase Dashboard → SQL Editor**, open and run each file:

1. `supabase/migrations/0025_push_device_tokens.sql` — creates the
   `device_tokens` table + `register_device_token` function.
2. `supabase/migrations/0026_push_triggers.sql` — creates the `notify_push`
   helper and the triggers (`trg_dm_message_push`, `trg_group_message_push`,
   `trg_channel_mention_push`, `trg_friend_request_push`).

Both are idempotent-ish and safe to re-run.

> **Why manual and not `supabase db push`?** `db push` can work, but running
> these two in the SQL editor guarantees the `app.webhook_secret` setting is
> present before the triggers fire.

---

## Part 4 — iOS side (verify it's already set up)

The iOS app is already wired for push — **no code changes needed.** Confirm just
two things are in place (they already are in the repo):

1. `ios/DisbandiOS/DisbandiOS.entitlements` contains:
   ```xml
   <key>aps-environment</key><string>production</string>
   ```
2. `ios/project.yml` includes the `remote-notification` background mode and the
   entitlements file is attached (it is).

The app requests permission and registers for APNs automatically after sign-in
(`PushManager.registerIfAuthorized()` in `AppState`).

---

## Part 5 — Build & test on a real device

Push cannot be tested on the iOS Simulator. Use a physical iPhone.

### 5.1 Archive, export, and install on your phone

**Option A — TestFlight (recommended)**

1. In Xcode: **Product → Archive** (a real device build).
2. In the Organizer, select the archive → **Distribute App → App Store Connect**
   → use **Upload** (or Export for local install) → choose your team.
3. Open App Store Connect → your app → **TestFlight** → **External / Internal
   testing**, add the build, and install it on your iPhone with the
   **TestFlight** app.

**Option B — local device install**

1. Connect your iPhone, set it as the run destination.
2. **Product → Archive**, then **Distribute App → Development**, then **Install
   on this device** (or drag the `.ipa` into Finder → your phone). You'll need
   your device registered in the developer portal.

### 5.2 Open the app, accept the prompt

- Open Disband on the phone the first time → the system **notification
  permission prompt** appears → tap **Allow**.
- Make sure you're signed in on the phone.

### 5.3 Send a DM and confirm the push

- On **another account** (web or a second device), send a **DM** to the phone's
  user.
- A banner + sound should appear on the phone — **even if Disband is fully
  closed / backgrounded** (that's what APNs guarantees).

---

## Debugging if it still doesn't work

Check each link in the chain, in order:

| Symptom | Check |
|---|---|
| Edge function returns `Forbidden` | `WEBHOOK_SECRET` mismatch between step 2.3 and step 3.1, or `send-push` was deployed with JWT verification. |
| Supabase logs show `{ sent: 0 }` | `device_tokens` has no row for that user/device, or tokens exist for a different user. |
| `notify_push` silently does nothing | `app.webhook_secret` DB setting not set (step 3.1), or `pg_net` didn't deliver. |
| No push on TestFlight but logs say `{ sent: N }` | Wrong `APNS_HOST`, or device token is from a previous dev build (APNs may reject it). |
| Archive fails "Push capability" | Step 1.1 / 1.3 not completed: profile doesn't include push. |

**Where to see logs:** Supabase Dashboard → **Edge Functions** → `send-push` →
**Logs**. Each call prints `{ "sent": N }` — a real, unambiguous signal for
how far the request got.

### Quick global check for your own device

```sql
-- Confirm a token actually exists for a user's device:
select user_id, platform, updated_at
from public.device_tokens
order by updated_at desc
limit 10;
```

If it's empty, the iOS app hasn't registered its APNs token (device token comes
back only on a real device with push enabled in the profile and permission
granted).

---

## What pushes fire today (scope)

From `0026_push_triggers.sql`: **DMs**, **group messages** (all members),
**channel @mentions**, and **friend requests**. If you later want to narrow or
widen this, edit that migration.
