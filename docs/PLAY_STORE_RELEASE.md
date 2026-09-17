# Disband Android — Google Play Store Release Guide

A step-by-step walkthrough for taking the Android app from this repo to a
published Google Play listing. Everything repo-specific (signing, versions,
permissions, data safety) is documented here — you mostly just run the
commands and click through Play Console.

---

## 0. What's already done in the repo

| Item | Status | Where |
|---|---|---|
| Target/compile SDK 36 (Play 2026 compliant) | ✅ | `android/app/build.gradle.kts` |
| R8 minify + resource shrink for release | ✅ | `android/app/build.gradle.kts` |
| R8 keep rules (WebRTC, kotlinx.serialization) | ✅ | `android/app/proguard-rules.pro` |
| Upload keystore + release signing config | ✅ | `android/keystore/`, `android/keystore.properties` (git-ignored) |
| Backup / device-transfer rules (session excluded) | ✅ | `app/src/main/res/xml/*.xml` |
| 16 KB page alignment (arm64) verified | ✅ | WebRTC lib is 16 KB-aligned |
| Privacy Policy + Terms hosted | ✅ | `https://www.disband.dev/privacy`, `/terms` |
| Notification permission requested in-app | ✅ | You screen |
| Account deletion (Data-safety requirement) | ✅ | Supabase migration `0024_account_deletion.sql` |
| Signed release build runtime-tested | ✅ | Login → servers → chat verified on emulator |

> **Do not lose the keystore.** `android/keystore/upload-keystore.jks` +
> `android/keystore.properties` are git-ignored. Back both up to a password
> manager / private drive **today**. Play can reset a lost *upload* key, but
> having a backup avoids a multi-day review process.

---

## 1. Prerequisites

1. **Play Console account** — $25 one-time signup at
   <https://play.google.com/console>. Identity verification required.
2. **JDK 17** — already configured in `android/gradle.properties`.
3. **Android SDK** — `android/local.properties` already has `sdk.dir`.
4. **(Optional, for push) Firebase project** — see step 2.3.

---

## 2. One-time setup

### 2.1 Keystore (already generated)

```
android/
  keystore.properties      ← storeFile/storePassword/keyAlias/keyPassword
  keystore/upload-keystore.jks
```

`app/build.gradle.kts` loads `keystore.properties` automatically and signs
release builds. If you ever move machines, copy both files into `android/`
and the build picks them up — nothing else to configure.

If you prefer to generate your own key instead:

```bash
keytool -genkeypair -v \
  -keystore android/keystore/upload-keystore.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Disband, OU=Mobile, O=Disband, L=San Francisco, ST=California, C=US"
```

Then update the values in `android/keystore.properties` to match.

### 2.2 Play App Signing

When you create the app entry in Play Console (step 4), Google **enrolls the
app in Play App Signing automatically** for new apps. Your upload key (the
keystore above) signs every artifact you upload; Google re-signs with the
app-signing key it stores. Nothing to do — just keep the upload keystore safe.

### 2.3 Push notifications (Firebase / FCM) — optional but recommended

The app reads Firebase config from `BuildConfig` at build time. Without it,
the app runs fine but push notifications (messages, call rings) no-op.

1. Create a Firebase project at <https://console.firebase.google.com>
   (or reuse the existing one).
2. Add an **Android app** with package name `com.wsgpolar.disband`.
3. Download `google-services.json` and copy these four fields into
   `android/local.properties` (git-ignored):

   ```properties
   FIREBASE_API_KEY=<current_key>
   FIREBASE_APP_ID=<mobilesdk_app_id>       # 1:123...:android:abc123
   FIREBASE_PROJECT_ID=<project_id>
   FIREBASE_GCM_SENDER_ID=<project_number>  # digits only
   ```

4. Backend side (needed for notifications to actually arrive):
   ```bash
   cd supabase
   supabase functions deploy send-push send-call-push
   supabase secrets set \
     FCM_PROJECT_ID=... FCM_CLIENT_EMAIL=... \
     FCM_PRIVATE_KEY="$(cat service-account.json | jq -r .private_key)"
   ```
   (`service-account.json` = Firebase Console → Project Settings → Service
   accounts → Generate new private key.)

You can ship to Play without this and wire it in a later release; the app
degrades gracefully.

---

## 3. Bump the version

In `android/app/build.gradle.kts` → `defaultConfig`:

```kotlin
versionCode = 2      // MUST increase by ≥1 for every Play upload, forever
versionName = "1.2.1" // user-visible; any format, "X.Y.Z" recommended
```

- First Play upload can keep `versionCode = 2` — just make sure every later
  build increments it (e.g. `versionCode = versionCode + 1` mentally, or tie
  it to CI).
- Never reuse a versionCode, even for a rejected build (bump again instead).

---

## 4. Build the artifact

Play requires an **Android App Bundle (.aab)**:

```bash
cd android
./gradlew :app:bundleRelease
# → app/build/outputs/bundle/release/app-release.aab  (signed)
```

Optional sanity checks:

```bash
# APK instead of AAB (for direct sideloading / emulator install)
./gradlew :app:assembleRelease
# → app/build/outputs/apk/release/app-release.apk

# Verify the signature
$(ls -d ~/Library/Android/sdk/build-tools/* | sort -V | tail -1)/apksigner \
  verify --print-certs app/build/outputs/apk/release/app-release.apk
```

**Install & smoke-test the release APK on an emulator before uploading**
(release code is R8-minified; a debug build passing proves nothing):

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.wsgpolar.disband/.MainActivity
```

Log in, open Servers → a server → a channel, send a message. (This exact
flow was verified with the R8 build; if you add new `@Serializable` models
later and chat breaks, check the keep rules in `proguard-rules.pro`.)

---

## 5. Play Console — create the app

1. <https://play.google.com/console> → **Create app**.
   - Name: `Disband`
   - Default language: English (US)
   - App or game: **App**; Free or paid: **Free**
   - Declarations: not a news app, not an app that targets children.
2. You now land on the **Dashboard** with a required-tasks list. Everything
   below clears those tasks.

## 6. App content (Policy → App content)

Walk the **App content** page top to bottom:

| Section | What to enter |
|---|---|
| **Privacy policy** | `https://www.disband.dev/privacy` |
| **Ads** | No ads |
| **Content rating** | Questionnaire → answer honestly: social/chat app with UGC, users share photos, text chat with strangers. Typical result: **PEGI 12 / ESRB Teen**-adjacent. Rating appears on your listing. |
| **Target audience** | 18+ (or 13+ if you want teens; note UGC policy is stricter then). Choose **18+** to keep the review simple. |
| **Data safety** | See section 7. |
| **Government apps** / financial / health | No |
| **App access** | The app is usable immediately after sign-up — provide the demo account if your QA flow needs it: `disband@apple.com` / `REMOVED_REVIEW_PASSWORD` plus a note that seeded data is read-only demo content. |
| **Ads / in-app purchases** | No (until you add subscriptions — see `0027_subscriptions.sql`). |

## 7. Data safety form (the tedious one)

The app's backend is Supabase (Postgres + Auth). Answer **"Yes, we collect
data"**, then declare:

| Data type | Collected? | Purpose | Linked to identity? | Transmitted encrypted? | Deletable by user? |
|---|---|---|---|---|---|
| Email (account) | Yes | Account creation/auth | Yes | Yes | Yes (account deletion) |
| User IDs / profile (username, avatar, bio, status) | Yes | App functionality | Yes | Yes | Yes |
| User content: messages, photos, voice/audio in calls | Yes | App functionality | Yes | Yes | Yes |
| Device / other identifiers (FCM registration token) | Yes | Notifications | Yes | Yes | Yes |
| App interactions (unread states, presence) | Yes | App functionality | Yes | Yes | No (non-identifying) |

- **Data shared with third parties:** FCM sends notification payloads
  (Google). Declare "Device identifiers → Notifications → shared".
- **Security practices:** all data transmitted over HTTPS/WSS ✅; data at
  rest encrypted (Supabase/Postgres) ✅; users can request deletion (in-app
  account deletion exists) ✅; data is **not** sold, **not** shared for ads.

## 8. Permissions review

Already declared in `AndroidManifest.xml` — each must be justifiable:

| Permission | Justification |
|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | Core networking (Supabase, CDN) |
| `RECORD_AUDIO` | Voice channels & 1:1 calls |
| `CAMERA` | Video calls |
| `POST_NOTIFICATIONS` | Message & call notifications (requested at runtime) |
| `MODIFY_AUDIO_SETTINGS` | Speaker/bluetooth routing for calls |
| `BLUETOOTH_CONNECT` (+legacy `BLUETOOTH` ≤ API 30) | Bluetooth headset audio in calls |

`uses-feature camera/microphone` are `required="false"` so devices without
them can still install — correct for a chat app.

## 9. Store listing

**Main listing → Store settings:** app name `Disband`, category
*Communication* or *Social*, tags (e.g. Chat, Community).

**Main listing:**

| Asset | Spec | Notes |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | Export your launcher foreground on the `#1E1F22` background |
| Feature graphic | 1024×500 JPG/PNG | No text near edges; shown on store |
| Phone screenshots | 16:9 or 9:16, min 2, up to 8 | Capture: server list, channel chat, voice channel, call screen, profile |
| 7" tablet screenshots | Optional | |
| Short description | ≤80 chars | e.g. "Hang out with your friends — servers, chat, calls." |
| Full description | ≤4000 chars | Lead with features; mention free |

## 10. Release to production

1. **Testing → Internal testing**: create a track, upload the AAB, add
   tester emails, install from the opt-in link. This is your final gate —
   the exact artifact reviewers/users get.
2. Fix anything from the **pre-launch report** (Play auto-runs it).
3. **Production → Create new release**:
   - Upload the same AAB.
   - Release notes: "First release" etc.
   - **Staged rollout: 10%** → raise gradually (20/50/100) over the first
     days while watching vitals.
4. Submit for review. Social/UGC apps typically review within 1–7 days.
   If rejected, the email names the exact policy (most common for chat
   apps: UGC moderation — Disband already has report/block/mod tooling,
   moderation dashboards and platform bans; link your community guidelines
   in the listing description or in-app).

## 11. After launch

- **Android vitals** (Dashboard): watch ANR rate & crashes. Play blocks
  promotion of releases with bad vitals.
- Update `versionCode` + rerun section 4 for every update.
- If you add analytics/FCM later, update the Data safety form — stale
  declarations get apps pulled.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Execution failed for task :app:bundleRelease` "keystore" | `android/keystore.properties` missing or wrong paths (it's git-ignored). Restore from backup or recreate (§2.1). |
| Upload rejected: "versionCode already used" | Bump `versionCode`, rebuild, re-upload. |
| Upload rejected: "must target API level ≥ X" | Bump `targetSdk`/`compileSdk` in `build.gradle.kts` to the level Google names, rebuild, test. |
| Release build crashes on startup but debug works | R8 stripping something — add keep rules to `app/proguard-rules.pro` (kotlinx-serialization rules already there; check the release logcat for the stripped class). |
| Play pre-launch report flags cleartext | Shouldn't happen — all endpoints are HTTPS. If you add one, block it in `networkSecurityConfig`. |
| Push not arriving | §2.3 — check local.properties keys, deployed functions, and that the device token row exists (`push_device_tokens`). |

---

## Quick command recap

```bash
cd android
# 1. bump versionCode in app/build.gradle.kts
./gradlew :app:bundleRelease                      # 2. build AAB
adb install -r app/build/outputs/apk/release/app-release.apk   # 3. smoke test
# 4. upload AAB in Play Console → Internal → then Production (staged)
```
