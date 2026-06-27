# Push notifications setup

Code is done. To make pushes actually fire on a device, complete these one-time
steps (most require **you** — they involve Apple secrets and a real device).

## 1. Apple Developer portal
1. **Enable Push on the App ID**: [developer.apple.com](https://developer.apple.com/account) →
   Certificates, IDs & Profiles → Identifiers → `com.wsgpolar.disband` →
   check **Push Notifications** → Save.
2. **Create an APNs Auth Key**: Keys → **＋** → name it, check **Apple Push
   Notifications service (APNs)** → Continue → Register → **Download the `.p8`**
   (you can only download once). Note the **Key ID** and your **Team ID** (KR54WPJ24G).
3. **Regenerate the distribution profile** so it includes push: Profiles →
   `Disband App Store` → Edit → Save → **Download**, then in Xcode re-import it
   (Signing & Capabilities → Release → Provisioning Profile → Import). Otherwise
   the next archive fails, because the entitlement now requires push.

## 2. Supabase secrets + deploy
```bash
supabase functions deploy send-push --no-verify-jwt
supabase secrets set \
  APNS_KEY_ID=XXXXXXXXXX \
  APNS_TEAM_ID=KR54WPJ24G \
  APNS_BUNDLE_ID=com.wsgpolar.disband \
  APNS_HOST=api.push.apple.com \
  WEBHOOK_SECRET="<a long random string>" \
  APNS_PRIVATE_KEY="$(cat AuthKey_XXXXXXXXXX.p8)"
```
> `APNS_HOST`: use `api.push.apple.com` for TestFlight **and** App Store builds
> (both are "production" APNs). The entitlement is already set to `production`.

## 3. Wire the trigger secret (once, in the SQL editor)
The `0026_push_triggers.sql` migration reads the shared secret from a DB setting,
so it's never committed. Run, using the **same** value as `WEBHOOK_SECRET`:
```sql
alter database postgres set app.webhook_secret = '<same long random string>';
```
Then apply migrations `0025` and `0026`.

## 4. Test
- Build/archive **on a real device** (push doesn't work from the simulator).
- Install via **TestFlight**, open the app → accept the notification prompt.
- From another account, send the device's user a DM → a banner should arrive.
- Debug: Edge Function logs in the Supabase dashboard show `{ sent: N }`.

## Trigger scope (current behavior)
Pushes fire for: **DMs**, **group messages** (all members), **channel @mentions**,
and **friend requests**. Adjust in `0026_push_triggers.sql` if you want it
narrower/broader.
