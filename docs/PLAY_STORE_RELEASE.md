# Disband Android — Google Play Store Release Guide

Everything needed to take the Android app in this repo from a local clone to a
live Google Play listing, in the order you actually do it. Repo-specific facts
(signing, versions, permissions, data safety answers) are filled in already —
for those you run the command and copy the answer.

Play Console's wording shifts every few months. Where a label has moved, the
left-nav **section** is still right, so look for the nearest match rather than
assuming the step is gone.

**Rough time budget:** 2–3 h of setup the first time, then ~20 min per update.
Review is 1–7 days for a new social/UGC app, hours for later updates.

---

## Table of contents

1. [What's already done](#0-whats-already-done-in-the-repo)
2. [Prerequisites](#1-prerequisites)
3. [One-time setup](#2-one-time-setup) — keystore, Play App Signing, Firebase
4. [Version bump](#3-bump-the-version)
5. [Build the artifact](#4-build-the-artifact)
6. [Test the exact bundle Play will ship](#5-test-the-exact-bundle-play-will-ship)
7. [Create the app in Play Console](#6-play-console--create-the-app)
8. [App content declarations](#7-app-content--every-declaration)
9. [Data safety form](#8-data-safety-form-answer-key)
10. [Permissions review](#9-permissions-review)
11. [Store listing + assets](#10-store-listing-and-graphic-assets)
12. [Tracks: internal → closed → production](#11-tracks-internal--closed--production)
13. [Submit, review, rejection](#12-submit-review-and-what-rejection-looks-like)
14. [After launch](#13-after-launch)
15. [Troubleshooting](#troubleshooting)
16. [Quick command recap](#quick-command-recap)

---

## 0. What's already done in the repo

| Item | Status | Where |
|---|---|---|
| Target/compile SDK 36 (Play 2026 compliant) | ✅ | `android/app/build.gradle.kts` |
| R8 minify + resource shrink for release | ✅ | `android/app/build.gradle.kts` |
| R8 keep rules (WebRTC, kotlinx.serialization) | ✅ | `android/app/proguard-rules.pro` |
| Upload keystore + release signing config | ✅ | `android/keystore/`, `android/keystore.properties` (git-ignored) |
| Backup / device-transfer rules (session excluded) | ✅ | `android/app/src/main/res/xml/*.xml` |
| 16 KB page alignment (arm64) verified | ✅ | WebRTC lib is 16 KB-aligned |
| Privacy Policy + Terms hosted | ✅ | `https://www.disband.dev/privacy`, `/terms` |
| Notification permission requested in-app | ✅ | You screen |
| Account deletion (Data-safety requirement) | ✅ | Supabase migration `0024_account_deletion.sql` |
| Launcher icon = real Disband mark (adaptive + legacy + monochrome) | ✅ | `android/app/src/main/res/mipmap-*`, regenerate with `android/tools/make_icons.swift` |
| Play Console 512×512 icon | ✅ | `android/play/ic_launcher-512.png` |
| Play feature graphic (1024×500) | ✅ | `android/play/feature-graphic-1024x500.png`, regenerate with `android/tools/make_feature_graphic.swift` |
| Signed release build runtime-tested | ✅ | Login → servers → chat verified on emulator |

> ### Back up the keystore today
> `android/keystore/upload-keystore.jks` and `android/keystore.properties` are
> git-ignored, so they exist **only on this machine**. Copy both into a password
> manager or private drive now. Google can reset a lost *upload* key, but it is
> a multi-day support process, and if you ever opt out of Play App Signing a
> lost key means you can never update the listing again.
>
> Record these alongside the files, because you will be asked for them later:
> `storeFile`, `storePassword`, `keyAlias`, `keyPassword`, and the SHA-256
> fingerprint from §2.2.

---

## 1. Prerequisites

1. **Play Console developer account** — $25 one-time, at
   <https://play.google.com/console>.
   - Choose **Personal** or **Organization** at signup. Organization needs a
     D-U-N-S number and takes days-to-weeks to verify; personal needs a
     government ID and usually clears in 48 h. Pick personal unless you have a
     registered company, because you cannot easily switch later.
   - Personal accounts created after 2023 must also complete **closed testing
     with 12 testers for 14 continuous days** before production is unlocked.
     This is the single biggest schedule item — see §11. Check
     **Dashboard → "Complete these steps to launch"** to see whether your
     account is subject to it.
   - Your **developer name** is public on the listing. Set it under
     **Settings → Developer account → Developer details**.
   - Play also publishes a support email and, for personal accounts, may show a
     verified address. Use an address you are happy to have public.
2. **JDK 17** — required by the build (`compileOptions` + `jvmTarget` are both 17).
   ```bash
   java -version   # want 17.x
   ```
   If it reports something else, point Gradle at 17 explicitly in
   `android/gradle.properties`:
   ```properties
   org.gradle.java.home=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home
   ```
3. **Android SDK** — `android/local.properties` needs `sdk.dir`. Installing
   Android Studio once is the simplest way to get the SDK, build-tools and an
   emulator image.
4. **`adb` on PATH** (for smoke tests and screenshots):
   ```bash
   export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"
   ```
5. **Optional: Firebase project** for push — §2.3.

---

## 2. One-time setup

### 2.1 Keystore (already generated)

```
android/
  keystore.properties        ← storeFile / storePassword / keyAlias / keyPassword
  keystore/upload-keystore.jks
```

`android/app/build.gradle.kts` loads `keystore.properties` from the `android/`
directory automatically and wires it into the `release` signing config. If the
file is absent (fresh clone, CI without secrets) the release build still
*compiles* but comes out **unsigned** and Play will reject it — so on a new
machine, restore both files into `android/` and nothing else needs configuring.

To generate your own key instead:

```bash
cd /Users/joshclark/Projects/disband-latest
mkdir -p android/keystore
keytool -genkeypair -v \
  -keystore android/keystore/upload-keystore.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Disband, OU=Mobile, O=Disband, L=San Francisco, ST=California, C=US"
```

`-validity 10000` (~27 years) matters: Play requires the key to stay valid
until at least 2033. Then write `android/keystore.properties`:

```properties
storeFile=keystore/upload-keystore.jks
storePassword=<the store password you just typed>
keyAlias=upload
keyPassword=<the key password you just typed>
```

`storeFile` is resolved relative to `android/`, so keep it as a relative path.

### 2.2 Play App Signing

For any app created today Google **enrols you in Play App Signing
automatically**. The split is:

- **Upload key** = your `upload-keystore.jks`. It signs the artifacts you upload
  and proves to Google that the upload is from you.
- **App signing key** = generated and held by Google. It signs what users
  actually install, and it never leaves Google.

So the only key you can lose is the replaceable one. Nothing to configure.

You will need the upload certificate's fingerprint for Firebase, Google sign-in
and App Links:

```bash
cd /Users/joshclark/Projects/disband-latest/android
keytool -list -v -keystore keystore/upload-keystore.jks -alias upload | grep -A1 SHA
```

After the first upload, Play also shows the **app signing** certificate under
**Release → Setup → App signing** (that is the one Google signs with, and the
one third parties usually want).

### 2.3 Push notifications (Firebase / FCM)

The app reads Firebase config from `BuildConfig` fields that
`android/app/build.gradle.kts` populates from `android/local.properties`. When
they are blank, push registration degrades to "no FCM" and the app otherwise
runs normally — so this is not a launch blocker, but messages and call rings
will not arrive in the background without it.

1. Create a project at <https://console.firebase.google.com>, or reuse the
   existing Disband one.
2. **Add app → Android**, package name `com.wsgpolar.disband`. Paste the
   SHA-256 from §2.2 (and after your first upload, the Play app-signing SHA-256
   as a second fingerprint — otherwise push breaks only for Play installs,
   which is a miserable bug to chase).
3. Download `google-services.json` and copy four values into
   `android/local.properties` (git-ignored):

   | `local.properties` key | Field in `google-services.json` | Shape |
   |---|---|---|
   | `FIREBASE_API_KEY` | `client[0].api_key[0].current_key` | `AIza...` |
   | `FIREBASE_APP_ID` | `client[0].client_info.mobilesdk_app_id` | `1:123...:android:abc123` |
   | `FIREBASE_PROJECT_ID` | `project_info.project_id` | `disband-xxxx` |
   | `FIREBASE_GCM_SENDER_ID` | `project_info.project_number` | digits only |

   ```properties
   FIREBASE_API_KEY=...
   FIREBASE_APP_ID=...
   FIREBASE_PROJECT_ID=...
   FIREBASE_GCM_SENDER_ID=...
   ```

   Or extract them:
   ```bash
   jq -r '"FIREBASE_API_KEY=\(.client[0].api_key[0].current_key)
   FIREBASE_APP_ID=\(.client[0].client_info.mobilesdk_app_id)
   FIREBASE_PROJECT_ID=\(.project_info.project_id)
   FIREBASE_GCM_SENDER_ID=\(.project_info.project_number)"' google-services.json \
     >> android/local.properties
   ```

4. Backend side, so notifications actually get sent:
   ```bash
   cd supabase
   supabase functions deploy send-push send-call-push
   supabase secrets set \
     FCM_PROJECT_ID=... \
     FCM_CLIENT_EMAIL=... \
     FCM_PRIVATE_KEY="$(jq -r .private_key service-account.json)"
   ```
   `service-account.json` comes from Firebase Console → **Project settings →
   Service accounts → Generate new private key**.
5. Verify end to end: install the build, sign in, then confirm a row appeared:
   ```sql
   select platform, created_at from push_device_tokens
   where user_id = '<your uuid>' order by created_at desc limit 5;
   ```
   No row means the client never registered — check the four
   `local.properties` keys first, they are the usual cause.

---

## 3. Bump the version

In `android/app/build.gradle.kts` → `defaultConfig`:

```kotlin
versionCode = 3        // MUST strictly increase on every upload, forever
versionName = "1.2.2"  // user-visible string; "X.Y.Z" by convention
```

Rules worth internalising:

- **`versionCode` is permanent.** Play remembers every value you have ever
  uploaded, including for builds that were rejected, discarded, or uploaded to
  a testing track and never released. If a build is rejected you bump again —
  you cannot re-upload the same code.
- `versionName` is cosmetic and can repeat, but don't: matching a crash report
  to a build is only possible if the pair is unique.
- Per repo convention, **every change bumps semver**, so this happens on every
  release without being asked.
- Keep the Android bump in the same commit as the change, so `git log`
  `versionCode` is a reliable index of what shipped.

---

## 4. Build the artifact

Play accepts **Android App Bundles** (`.aab`) only for new apps. Google
generates per-device APKs from it.

```bash
cd /Users/joshclark/Projects/disband-latest/android
./gradlew :app:bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

First run downloads the Gradle distribution and dependencies — several minutes
is normal. Afterwards it's ~1–2 min.

Confirm the bundle is signed with *your* key, not unsigned:

```bash
BT=$(ls -d ~/Library/Android/sdk/build-tools/* | sort -V | tail -1)
"$BT/apksigner" verify --print-certs \
  app/build/outputs/bundle/release/app-release.aab
```

You want a certificate whose SHA-256 matches §2.2. `jar is not signed` means
`keystore.properties` wasn't found — revisit §2.1.

Also sanity-check what you're about to upload:

```bash
# Size, versionCode, minSdk, permissions actually baked in
unzip -p app/build/outputs/bundle/release/app-release.aab BUNDLE-METADATA/\* >/dev/null 2>&1
"$BT/aapt2" dump badging \
  <(unzip -p app/build/outputs/bundle/release/app-release.aab base/manifest/AndroidManifest.xml) 2>/dev/null \
  || echo "use bundletool (§5) for a readable manifest dump"
ls -lh app/build/outputs/bundle/release/app-release.aab
```

A release APK is still useful for quick sideloading, and is the fastest way to
smoke-test R8 output:

```bash
./gradlew :app:assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

---

## 5. Test the exact bundle Play will ship

A debug build passing proves very little: `release` turns on R8 minification
and resource shrinking, which is where Compose/serialization/WebRTC apps break.
Two levels of confidence:

**Fast — install the release APK:**

```bash
cd /Users/joshclark/Projects/disband-latest/android
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.wsgpolar.disband/.MainActivity
adb logcat -c && adb logcat | grep -iE "disband|AndroidRuntime|FATAL"
```

**Thorough — generate real APKs from the AAB with `bundletool`,** which is what
Play does. This catches missing-split and resource-shrink problems that the
monolithic APK hides:

```bash
brew install bundletool   # or download the jar from github.com/google/bundletool

cd /Users/joshclark/Projects/disband-latest/android
bundletool build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=/tmp/disband.apks \
  --ks=keystore/upload-keystore.jks \
  --ks-key-alias=upload          # prompts for passwords

bundletool install-apks --apks=/tmp/disband.apks   # installs the right split set
bundletool get-size total --apks=/tmp/disband.apks # what users see as download size
```

### Smoke-test checklist

Run this on a real device if you have one, an emulator otherwise. Everything
here has broken at least once under R8:

- [ ] Cold launch, no crash, no blank first frame
- [ ] Sign up **and** sign in (serialization of auth models)
- [ ] Servers list loads → open a server → open a channel
- [ ] Send a text message; it appears for you and on web
- [ ] Send an image attachment (upload path + CDN URL)
- [ ] Realtime: message from web arrives without a refresh
- [ ] Join a voice channel — mic permission prompt, then audio both ways
- [ ] 1:1 call: ring, answer, hang up
- [ ] Notification permission prompt appears on the You screen
- [ ] Background push arrives (only if §2.3 is done)
- [ ] Deep link: `adb shell am start -a android.intent.action.VIEW -d "https://www.disband.dev/invite/xxxx"`
- [ ] Rotate the device on chat and on a call screen
- [ ] Dark **and** light system theme
- [ ] Sign out returns to the auth screen with no stale data
- [ ] Launcher icon is the Disband mark, on the home screen, the app drawer,
      recents, and Settings → Apps (and with themed icons on, it tints)

If chat breaks specifically after adding new `@Serializable` models, that's R8
stripping them — add keep rules to `android/app/proguard-rules.pro`.

---

## 6. Play Console — create the app

<https://play.google.com/console> → **All apps → Create app**.

| Field | Value |
|---|---|
| App name | `Disband` (30 char max; this is the store title) |
| Default language | English (United States) |
| App or game | **App** |
| Free or paid | **Free** — see the note below |
| Declarations | Developer Program Policies: yes. US export laws: yes. |

**"Free" is a one-way door.** You can never switch a free app to paid. Free
apps *can* sell subscriptions and in-app products, which is how Disband Aero
works, so **Free** is correct.

After creating it you land on the **Dashboard**, which lists two things:
"Set up your app" (the declarations in §7–§10) and "Release your app"
(the tracks in §11). The rest of this guide is those lists, in order.

---

## 7. App content — every declaration

**Left nav → Policy and programs → App content.** Every row must be green
before you can submit. Answers for Disband:

### 7.1 Privacy policy
`https://www.disband.dev/privacy` — must be reachable, not behind a login, and
must actually describe the data in §8. Reviewers do open it.

### 7.2 App access
Reviewers must be able to reach every part of the app. Disband requires an
account, so choose **"All or some functionality is restricted"** and add an
instruction set:

- Name: `Demo account`
- Login required: yes
- Username / Email: `disband@apple.com`
- Password: copy the current value from the restricted release secret manager
- Other instructions: "Sign in with the credentials above. The account is
  already a member of demo servers with seeded conversations, so no invite code
  is needed. Voice and video need a device with a mic/camera; on an emulator,
  audio is silent but the call UI works."

Keep that account alive and rotate the password after each review window. If it stops working mid-review
you get rejected for something unrelated to your code.

### 7.3 Ads
**No, my app does not contain ads.** If that ever changes you must update this
*and* §8, before shipping the ads.

### 7.4 Content rating
A questionnaire (**App content → Content rating → Start questionnaire**). It is
not scored against you — inaccuracy is what gets apps pulled. Answer for a
social chat app:

| Question | Answer |
|---|---|
| Email address | your support address (Google emails the certificate here) |
| Category | **Social networking / Communication** |
| Violence, sexual content, profanity, drugs, gambling (as *app content*) | No — Disband ships none itself |
| Does the app let users interact or exchange content? | **Yes** |
| Can users communicate with strangers? | **Yes** |
| Can users share their current location? | **No** |
| Can users share personal information / photos? | **Yes** |
| Does the app contain user-generated content? | **Yes**, and describe your moderation: in-app report and block, moderator tooling, platform bans |
| Digital purchases | **Yes** (Aero subscription) |

Expect something in the PEGI 12 / ESRB Teen band. Answering "no" to the
stranger-communication or UGC questions to get a lower rating is the fastest
route to an enforcement strike.

### 7.5 Target audience and content
- **Target age group: 18 and over only.** Including 13–17 puts you under
  Families policy and the stricter UGC rules, which means more review scrutiny
  and more requirements. Pick 18+ unless you deliberately want teens.
- "Could your app appeal to children?" → **No** (keep the branding and
  screenshots consistent with that).
- News app → No. COVID-19 contact tracing → No.

### 7.6 Data safety
§8 — the long one.

### 7.7 Government apps, financial features, health
No to all three. Subscriptions are **not** a "financial feature" in Play's
sense (that means lending, banking, crypto, investing).

### 7.8 Advertising ID
The app does not use the advertising ID. Declare **no** — and note the manifest
declares no `AD_SERVICES_CONFIG` or `com.google.android.gms.permission.AD_ID`,
so this is consistent with the bundle.

### 7.9 Data deletion
Play requires an in-app path and a web path to delete an account. In-app exists
(Settings → account deletion, backed by `0024_account_deletion.sql`). Give the
web URL as well if you have a hosted deletion page; otherwise point at the
privacy policy section that explains the in-app route.

---

## 8. Data safety form (answer key)

**App content → Data safety → Start.** Answer **"Yes, my app collects or
shares required user data types."** The backend is Supabase (Postgres + Auth)
plus FCM for notifications.

Global answers:

| Question | Answer |
|---|---|
| Is all of the user data encrypted in transit? | **Yes** (HTTPS/WSS everywhere) |
| Do you provide a way for users to request data deletion? | **Yes** — in-app account deletion |
| Has your app been independently reviewed against a security standard? | No |

Then declare each data type. For every row below: collected = yes,
shared = no unless noted, **not** ephemeral (it's stored server-side), and
required (not optional) unless noted.

| Data type (Play's category) | Purpose | Linked to identity | Notes |
|---|---|---|---|
| Personal info → **Email address** | Account management | Yes | Required for sign-up |
| Personal info → **User IDs** | Account management, App functionality | Yes | Supabase user UUID, username |
| Personal info → **Name** | App functionality | Yes | Display name — optional for the user |
| Photos and videos → **Photos** | App functionality | Yes | Avatars and attachments — optional |
| Photos and videos → **Videos** | App functionality | Yes | Attachments — optional |
| Audio → **Voice or sound recordings** | App functionality | Yes | Live call audio. Declare it even though calls aren't recorded — the mic stream is collected in Play's sense |
| Messages → **Other in-app messages** | App functionality | Yes | Chat content |
| App activity → **App interactions** | App functionality, Analytics | Yes | Presence, read state |
| Device or other IDs → **Device or other IDs** | App functionality (notifications) | Yes | FCM registration token — **shared with Google (FCM)** |

Two rows people get wrong:

- **Voice or sound recordings.** "We don't record calls" is not the question.
  The app collects mic audio and transmits it, so it is collected. Omitting it
  while the manifest asks for `RECORD_AUDIO` is an obvious contradiction.
- **Device IDs → shared.** The FCM token and notification payload go to Google's
  servers, which is third-party sharing. Declare it.

**Not** collected, so declare nothing for: precise or approximate location,
financial info (Google Play handles payments — Play explicitly excludes its own
billing from your declaration), health and fitness, contacts, calendar,
web browsing history, installed apps, SMS or call logs, files and docs beyond
the media above.

Say **no** to "is data sold or shared for advertising".

Whenever you add an SDK — analytics, crash reporting, ads — come back and
update this form in the *same* release. Stale data safety declarations are one
of the few things Play removes apps for without warning.

---

## 9. Permissions review

Every permission in `android/app/src/main/AndroidManifest.xml` must be
defensible. Current set:

| Permission | Justification |
|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | Core networking (Supabase, CDN) |
| `POST_NOTIFICATIONS` | Message and call notifications; requested at runtime on the You screen |
| `RECORD_AUDIO` | Voice channels and 1:1 calls |
| `CAMERA` | Video calls |
| `MODIFY_AUDIO_SETTINGS` | Speaker / Bluetooth routing during calls |
| `BLUETOOTH_CONNECT` (+ legacy `BLUETOOTH` with `maxSdkVersion="30"`) | Bluetooth headset audio in calls |

None of these are in Play's restricted set, so **no permissions declaration
form is required** — that only applies to things like `QUERY_ALL_PACKAGES`,
`MANAGE_EXTERNAL_STORAGE`, SMS/call-log, and accessibility APIs. Adding any of
those later means a written justification and a demo video.

`uses-feature` for camera and microphone are both `required="false"`, so
devices lacking them can still install. That is correct for a chat app — the
alternative silently excludes a lot of tablets.

---

## 10. Store listing and graphic assets

**Left nav → Grow → Store presence → Main store listing**, plus **Store
settings** for the category.

### 10.1 Store settings
- App category: **Communication** (alternative: Social — Communication is the
  better fit for a chat client and competes with fewer lifestyle apps)
- Tags: Chat, Messaging, Community, Voice
- Contact details: support email (required), website `https://www.disband.dev`,
  phone optional. All of it is public.

### 10.2 Text

| Field | Limit | Suggested |
|---|---|---|
| App name | 30 | `Disband` |
| Short description | 80 | `Hang out with your friends — servers, group chat, voice and video calls.` |
| Full description | 4000 | Lead with what it is in one line, then a feature list, then who it's for. Mention that it's free. Do **not** stuff keywords, name competitors, or claim rankings ("#1 chat app") — all three are listing violations. |

### 10.3 Graphics

| Asset | Exact spec | How to produce it |
|---|---|---|
| App icon | 512×512, 32-bit PNG, **no transparency**, under 1 MB | Already built: `android/play/ic_launcher-512.png` |
| Feature graphic | 1024×500, PNG or JPG, no transparency | Already built: `android/play/feature-graphic-1024x500.png` |
| Phone screenshots | 2–8 images, 16:9 or 9:16, each side 320–3840 px | §10.4 |
| 7" tablet | Optional, 2–8 | Skip unless you actively support tablets |
| 10" tablet | Optional, 2–8 | Skip |

The launcher icons and the Play icon all come from one source of truth,
`android/tools/logo.png` (the Disband mark). To regenerate everything after a
brand change:

```bash
cd /Users/joshclark/Projects/disband-latest
swift android/tools/make_icons.swift \
  android/tools/logo.png \
  android/app/src/main/res \
  android/play/ic_launcher-512.png
```

The feature graphic comes from the same mark:

```bash
swift android/tools/make_feature_graphic.swift \
  android/tools/logo.png \
  android/play/feature-graphic-1024x500.png
```

It composes the mark, the `Disband` wordmark and the tagline as a single
horizontal cluster, centred and held inside a 764 px safe box so Play's
cropping can't clip it, over the `#1E1F22` background with a `--brand`
(`#5865F2`) glow. One caveat: if you ever attach a **promo video**, Play
overlays a play button across the centre of this graphic, which would land on
the wordmark — re-run with a wider gutter, or drop the video.

`make_icons.swift` writes adaptive foregrounds at all five densities (108 dp canvas, mark
inside the 66 dp safe zone), legacy square and round launcher bitmaps, and the
512×512 Play icon on the `#1E1F22` brand background. The adaptive icon itself
is `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`, which layers
`@color/ic_launcher_background` under the mark and reuses the mark as the
`monochrome` layer for Android 13+ themed icons.

### 10.4 Capturing screenshots

```bash
cd /tmp
shoot() { adb exec-out screencap -p > "shot-$1.png"; echo "shot-$1.png"; }
# navigate the app on the device, then run shoot after each screen:
shoot 1-servers
shoot 2-chat
shoot 3-voice
shoot 4-call
shoot 5-profile
```

Good set, in order, because the first two are all most people see:

1. A channel with a real conversation — this is the money shot
2. Server list with several servers
3. A voice channel with participants connected
4. A video call
5. A profile with badges

Practical notes:

- Use a phone-sized emulator (e.g. Pixel 7, 1080×2400) so aspect and density
  are uniform, rather than mixing devices.
- Log in as an account with real-looking content. Empty states sell nothing.
- No personal data, no other people's real usernames or avatars, no test
  strings, no notification shade clutter — hide the shade before capturing.
- Never show a device frame, another OS's UI, or "coming soon" features.
  Screenshots that show functionality the app doesn't have is a rejection
  reason, and the most common one for indie listings.

---

## 11. Tracks: internal → closed → production

Play has four tracks. The path depends on whether your account carries the
14-day closed-testing requirement (§1).

### 11.1 Internal testing — always start here
**Release → Testing → Internal testing → Create new release.**

- Up to 100 testers by email, available within minutes, no review.
- Upload `app-release.aab`. First upload takes a few minutes to process; Play
  then shows the download size, supported devices, and any warnings.
- Add testers: **Testers** tab → create an email list → save → copy the
  **opt-in URL** and open it as each tester. Testers must accept the invite
  before Play will serve them the app.
- Release notes go in `<en-US>` tags. "First internal build." is fine.
- This is your real gate: it's the same artifact, signed by the same keys, that
  production users get.

### 11.2 Pre-launch report
Play runs your build on a set of physical devices automatically after any
track upload. **Release → Testing → Pre-launch report** gives you:

- **Stability** — crashes and ANRs per device, with stack traces. Fix every
  crash here; it maps directly to the vitals thresholds in §13.
- **Performance** — startup time, frame rendering.
- **Accessibility** — usually low contrast and small touch targets. Warnings,
  not blockers, but cheap to fix.
- **Screenshots** — the robot's crawl of your app. Useful for spotting screens
  that render broken on unusual densities.
- **Security** — flagged SDK vulnerabilities.

The crawler cannot log in, so expect it to sit on the auth screen. You can give
it the demo credentials under the report's settings to get a deeper crawl.

### 11.3 Closed testing — required for new personal accounts
**Release → Testing → Closed testing → Create track.**

If your account shows the requirement, you need **12 testers who stay opted in
for 14 continuous days**. Rules people trip on:

- It's 12 *simultaneous* testers, continuously. Someone opting out resets your
  progress, so recruit 15–20.
- Each tester needs a Google account that has accepted the opt-in link and
  installed the app.
- The 14 days run from when you have 12 testers, not from when you created the
  track. Start this early — it is the long pole in your launch.
- Afterwards you apply for production access via a short form about who tested
  and what you learned. Review of that application takes a few days.

If your account is exempt, closed testing is still a good idea but you may go
straight from internal to production.

### 11.4 Open testing — optional
A public beta, listed on the store with a "Early access" label. Useful if you
want volume before launch; skip it if you want a clean launch day.

### 11.5 Production
**Release → Production → Create new release.**

- Upload the same `.aab` (or promote the build from a testing track, which
  guarantees identical bytes — prefer this).
- Release notes: keep them factual and user-facing.
- **Countries/regions**: choose the full list, or restrict for a soft launch.
- **Staged rollout: start at 10%.** Ship to 10%, watch vitals for 24–48 h, then
  20% → 50% → 100%. A staged rollout can be halted, which is the only way to
  stop a bad release from reaching everyone. A 100% rollout cannot be recalled;
  the only fix is a new version.
- Hit **Save**, then **Review release**, then **Start rollout to Production**.

---

## 12. Submit, review, and what rejection looks like

Timelines: a brand-new app is typically 1–7 days (social and UGC apps are at
the slow end, and first submissions get the most scrutiny). Later updates are
usually hours to a day.

While in review the release shows **"In review"** under the track and you
cannot upload a new build to the same track. Everything you can do is in
**Publishing overview**, which lists the changes bundled into this submission —
worth reading before you submit, because it shows listing edits you may have
forgotten about.

If rejected, the email and **Policy status** name the specific policy. For a
chat app, in order of likelihood:

- **User-generated content.** They want to see a working report flow, a block
  flow, moderation capability, and published community guidelines. Disband has
  the report/block/mod tooling and platform bans — make sure the guidelines are
  linked in the full description *and* reachable in-app, and say so in the
  appeal.
- **Data safety mismatch.** Something in §8 contradicts the manifest or the
  privacy policy. Usually the missing `RECORD_AUDIO` declaration.
- **Broken functionality on review devices.** Almost always the demo account in
  §7.2 failing, or a crash the pre-launch report already showed you.
- **Metadata.** A screenshot showing a feature that doesn't exist, or
  promotional text in the app name.

To respond: fix the cause, bump `versionCode`, upload a new build, and use the
**Appeal** link in the rejection only if you believe the decision is wrong. In
the appeal, name the exact policy section and point to the concrete thing that
satisfies it (screen name, URL, commit). Vague appeals get template replies.
Repeated resubmissions without fixing anything risks account-level enforcement.

---

## 13. After launch

- **Android vitals** (Quality → Android vitals). The bad-behaviour thresholds
  are ~1.09% user-perceived crash rate and ~0.47% user-perceived ANR rate. Cross
  them and Play demotes your discoverability and can block rollouts.
- Set up **email alerts** for crash-rate spikes under vitals settings, so a bad
  release doesn't sit unnoticed.
- Answer reviews. Ratings are shown recency-weighted, so early reviews matter
  disproportionately.
- For every update: bump `versionCode` (§3) → build (§4) → smoke-test (§5) →
  internal track → promote to production with a staged rollout.
- Update **Data safety** in the same release as any change to what you collect.
- Google raises the required `targetSdk` annually (typically late August). When
  the deadline email arrives, bump `compileSdk`/`targetSdk`, retest, and ship —
  otherwise the listing stops being served to new devices.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `:app:bundleRelease` fails mentioning "keystore" | `android/keystore.properties` missing or its paths are wrong (it's git-ignored). Restore from backup or recreate — §2.1. |
| `apksigner verify` says "jar is not signed" | Same cause: the build silently produced an unsigned artifact because `keystore.properties` wasn't found. |
| Play: "You uploaded an APK that is not signed with the upload certificate" | You rebuilt with a *different* keystore. Use the original, or request an upload-key reset under Release → Setup → App signing. |
| Play: "Version code N has already been used" | Bump `versionCode`, rebuild, re-upload. Codes are never reusable, including for rejected builds. |
| Play: "must target API level ≥ X" | Raise `targetSdk` and `compileSdk` in `android/app/build.gradle.kts` to the level named, then retest — behaviour changes ship with each level. |
| Play: "App Bundle contains native code without 16 KB page alignment" | A native dependency regressed. The bundled WebRTC lib is aligned; check any newly added `.so`. |
| Release build crashes at startup, debug is fine | R8 stripped something. Read the release logcat for the class name and add a keep rule in `android/app/proguard-rules.pro` (kotlinx-serialization and WebRTC rules are already there). |
| Pre-launch report flags cleartext traffic | Shouldn't happen — all endpoints are HTTPS/WSS. If you add one, restrict it in a `networkSecurityConfig`. |
| Push not arriving | §2.3: check the four `local.properties` keys, that `send-push`/`send-call-push` are deployed, that the FCM secrets are set, and that a `push_device_tokens` row exists for the account. |
| Push works on a sideloaded build but not a Play install | The Play **app signing** SHA-256 isn't registered in Firebase. Add it as a second fingerprint — §2.2. |
| Deep links open the browser instead of the app | `autoVerify="false"` on the `https` intent filter, so App Links aren't verified. Host `/.well-known/assetlinks.json` with the app-signing SHA-256 and flip it to `true`. |
| Launcher icon looks cropped or off-centre | Regenerate with `android/tools/make_icons.swift` — it fits the mark inside the adaptive 66 dp safe zone. Launchers cache icons aggressively, so reinstall rather than trusting the home screen. |
| Icon is right in the drawer but wrong in Settings | Stale cache. `adb uninstall com.wsgpolar.disband` then reinstall. |

---

## Quick command recap

```bash
cd /Users/joshclark/Projects/disband-latest/android

# 1. bump versionCode + versionName in app/build.gradle.kts

# 2. build the bundle Play wants
./gradlew :app:bundleRelease

# 3. confirm it's signed with the upload key
BT=$(ls -d ~/Library/Android/sdk/build-tools/* | sort -V | tail -1)
"$BT/apksigner" verify --print-certs app/build/outputs/bundle/release/app-release.aab

# 4. smoke-test the release artifact (never trust a debug build)
./gradlew :app:assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.wsgpolar.disband/.MainActivity

# 5. regenerate icons only if the brand mark changed
cd .. && swift android/tools/make_icons.swift \
  android/tools/logo.png android/app/src/main/res android/play/ic_launcher-512.png

# 6. Play Console: Internal testing → upload AAB → test
#    then Production → promote that build → staged rollout at 10%
```
