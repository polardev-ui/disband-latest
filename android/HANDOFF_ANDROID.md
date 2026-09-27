# Disband Android — Handoff

**Mission:** bring the Android app (`android/`) to 1:1 parity with the redesigned iOS app
(`ios/DisbandiOS/`) and make it production-ready.

**Hard constraints:**
- **Do not modify anything under `ios/`.** iOS is the design reference and is already shipped.
- Every change bumps semver: `node scripts/set-version.mjs <x.y.z>` from the repo root
  (updates `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`). Android's own
  `versionCode`/`versionName` live in `android/app/build.gradle.kts`.
- The repo is **public**. Never commit secrets, `.env*`, or keystore material.

---

## 1. How to build, run and verify

```bash
cd android
./gradlew :app:compileDebugKotlin --console=plain -q    # fast error loop
./gradlew :app:assembleDebug --console=plain            # produces app/build/outputs/apk/debug/
```

Emulator (AVD `litenet_phone` exists on this machine):

```bash
export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
~/Library/Android/sdk/emulator/emulator -avd litenet_phone -no-snapshot-load -no-audio &
adb -s emulator-5556 install -r app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5556 shell monkey -p com.wsgpolar.disband -c android.intent.category.LAUNCHER 1
adb -s emulator-5556 exec-out screencap -p > /tmp/shot.png
```

**Compiling is not verification.** The previous session's work compiled in principle but had
non-clickable buttons, panels pushed off-screen and lists rendering the same text twice. Install
it, screenshot it, and compare against the iOS screenshots before claiming a screen is done.

If install fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, a release-signed build is present;
`adb uninstall com.wsgpolar.disband` first (this wipes that device's local session only).

---

## 2. Current state

`main` @ `9f9feedb` "feat(android): make the new shell compile, run and work" (v2.29.19).

**Working and verified on device:** server rail (scrollable, clickable, selection pill), floating
dock navigation between Home/Friends/Notes/You, inbox list, friends list with accept/decline and
exact-username search, channel list with collapsible categories, opening DMs and channels.

**Uncommitted work in progress** (compiles; partially verified):
- `ui/main/InboxPanel.kt` — rewritten to match iOS (All/Unread/Groups, unread dot, timestamps,
  presence, recency ordering).
- `ui/main/ChannelPanel.kt` — banner header, Invite/Members pills, collapsible sections,
  megaphone/hash/speaker icons.
- `ui/main/NotesScreen.kt` — **new file**, Notes rebuilt to match iOS (day sections, note cards,
  pin/copy/delete menu, composer). Old `NotesScreen` deleted from `OtherScreens.kt`.
- `data/Models.kt` — added `Server.verified`, `Channel.readOnly` (both nullable, safe).
- `ui/main/SpacesView.kt`, `ui/main/MainScreen.kt` — wiring for the above.

> Another agent appears to be editing `ServerRail.kt` and `InboxPanel.kt` in parallel (they now
> reference `core.Radii` and `core.ShellMetrics`). **Read files before editing them**, and rebase
> rather than overwrite.

---

## 3. PART A — Calls and notifications (highest priority, newest reports)

These came from the user testing a real call between desktop web and Android.

### A1. No notifications at all on Android — ROOT CAUSE FOUND

`google-services.json` is at **`android/google-services.json`**. It must be at
**`android/app/google-services.json`** (module level), and the Google Services Gradle plugin is
**not applied anywhere** — `grep google-services android/build.gradle.kts android/app/build.gradle.kts`
returns nothing.

Consequently `FirebaseApp.getApps(context)` is empty, so `PushRegistrar.registerIfAuthorized`
(`data/PushRegistrar.kt:52`) returns on its first line, no FCM token is ever fetched, and no row is
written to `device_tokens`. Confirmed against production: **7 android tokens vs 1176 ios**.

Fix:
1. Move the file to `android/app/google-services.json`.
2. Add the plugin: `com.google.gms.google-services` (classpath in the root `build.gradle.kts`,
   `apply` in `app/build.gradle.kts`).
3. Rebuild, sign in, and confirm a row appears:
   `select * from device_tokens where platform='android' order by created_at desc limit 5;`
4. Then verify the server side actually sends: the `send-push` edge function needs
   `FCM_SERVICE_ACCOUNT` (or `FCM_PROJECT_ID`/`FCM_CLIENT_EMAIL`/`FCM_PRIVATE_KEY`) set as a
   Supabase secret. It already sends a `badge` value — see `supabase/functions/send-push/index.ts`.

Note `POST_NOTIFICATIONS` is requested on Android 13+; that permission being granted is necessary
but not sufficient — without Firebase init there is nothing to deliver.

### A2. No ongoing-call notification when the app is backgrounded

There is **no foreground service anywhere** — `grep -rn "startForeground"` returns nothing — even
though `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MICROPHONE` are declared in the manifest and
the only `<service>` registered is `.data.MessagingService` (FCM).

Build a `CallForegroundService`:
- `android:foregroundServiceType="microphone"` (add `camera` if video is in scope).
- Start it when `CallManager` enters `CallPhase.Outgoing`/`Incoming`/`Active`; stop it on `Idle`.
- Use `Notification.CallStyle` (`forOngoingCall` / `forIncomingCall`) with a full-screen intent for
  incoming, so it behaves like a system call. `USE_FULL_SCREEN_INTENT` is already declared.
- A notification channel already exists for calls: `CALL_CHANNEL_ID` in
  `data/MessagingService.kt:120` and another in `call/CallManager.kt:508` — reuse, don't add a third.

This is also what keeps the process alive mid-call; without it Android may freeze the app and drop
the call when the user leaves the screen.

### A3. Desktop ↔ Android call connects one way

Symptom: Android shows "Ringing…" then a running timer, but the PC never leaves
"Calling… waiting for answer". So Android answered locally without the web peer completing ICE/SDP.

Where to look:
- `call/WebRTCEngine.kt` and `call/CallSignal.kt` (signalling is a Supabase Realtime broadcast on
  event `"call"`; `directCallId(a, b)` derives the room).
- Compare against the iOS implementation, which is known to interoperate with web:
  `ios/DisbandiOS/Services/Call/` and `ios/DisbandiOS/Services/Voice/`.
- The cross-platform contract that matters (documented from the web/iOS work):
  - fixed transceiver **lanes**: audio = 0, camera = 1, screen = 2, in that order on both sides;
  - `RTCRtpSender.streamIds` **must** be set, or the web client's `ontrack` fires with no stream and
    the call looks connected on one side only — this is the single most likely cause here;
  - polite/impolite glare resolution, with a `client` marker in the payload for tie-breaks.
- Reproduce with `adb logcat -s WebRTC:* CallManager:*` on Android and the browser console open,
  and compare the SDP/ICE exchange against an iOS↔web call.

### A4. Call tones are harsh

`call/CallTones.kt` **has already been rewritten** for this — its header now reads "intentionally
muffled and calm: single low sine (400Hz), ~3.5% gain, slow attack/release, 44.1kHz". Before
changing anything, confirm which build the user heard; they may have been on the older APK. If it
is still harsh: lower gain further, add a slow tremolo (trill) rather than a hard on/off loop, and
low-pass the envelope. Keep `AudioAttributes` usage `USAGE_VOICE_COMMUNICATION_SIGNALLING` so it
respects the call stream.

---

## 4. PART B — UI parity gaps, per screen

The user supplied Android/iOS screenshot pairs. Remaining differences, worst first.

### B1. Profile / "You" — biggest gap, NOT started
Android is avatar + name + bio + "Enable notifications" + "Sign out". iOS
(`ios/DisbandiOS/Views/Profile/ProfileTab.swift`) has:
- `ScreenHeader("You")` with a pencil edit button;
- hero card: banner (tap to change), avatar overlapping the banner by -46dp with an accent ring and
  a camera pip, name, `@handle · pronouns`, **badges grid**, status bubble, bio;
- subscription card ("Disband Aero — Active · renews …");
- `SectionCaption` groups: **Account** (Edit profile / Status / Referrals), **App**
  (Appearance / Notifications & chat), **About** (Version / disband.dev), then Sign out.

Blockers to resolve first:
- `data/Models.kt` `Profile` is missing `pronouns`, `status_note`, `status_expires_at` (iOS has
  them — see `ios/DisbandiOS/Models/Models.swift`). Add as nullable fields.
- Android has **no badges service** and **no subscription service**. iOS has
  `Services/BadgeService.swift` (reads `badges` + `user_badges`) and `SubscriptionService`.
  Both need Android equivalents, or those cards must be omitted deliberately rather than faked.

### B2. DM / channel chat
iOS (`ios/DisbandiOS/Views/Chat/`): centred title with a circular back chevron and a **green**
circular call button; messages as flat author-grouped rows (avatar + name + timestamp, then the
text), **not** chat bubbles; attachments render as a video thumbnail with a play overlay or an
inline image; composer is a rounded pill with a `+` button.

Android currently: left-aligned name + `@handle`, blue phone icon, bubble-style messages, and
attachments shown as a filename and byte count. Rework `ui/chat/ChatComponents.kt`,
`ui/chat/DmChatScreen.kt`, `ui/chat/GroupAndChannelChat.kt`.

### B3. Friends
Close, but iOS has: a **sort** control (name / recently added / oldest — `FriendSort` was removed
from Android as dead code, re-add it wired up), an "Add" **pill** button rather than a bare icon, a
magnifier glyph inside the search field, rows grouped in a rounded card, and an
`ONLINE — N` section caption. Android's "Active now" strip is not in the iOS screenshot for this
tab; check `ios/DisbandiOS/Views/Friends/FriendsTab.swift:144` for when iOS shows it and match.

### B4. Inbox and channel panel
Rewritten this session but **only partially verified on device**. Confirm against iOS: relative
timestamps, unread dot and count, presence rings, banner header rendering (uses Coil `AsyncImage`
directly — `AvatarImage` force-clips to a circle and must not be used for banners).

### B5. Shell chrome
iOS's dock shows a **label beside the selected icon** ("Home", "Friends", "Notes", "You") in an
accent pill; Android's dock is icon-only. See `ios/DisbandiOS/Views/Shell/FloatingDock.swift`.

---

## 5. PART C — Landmines

The previous session invented APIs that do not exist. All were found only by compiling:
`CapsuleShape` (SwiftUI, use `CircleShape`), `Brand.accent` (use `palette.accent`),
`Icons.Filled.PhoneDown` / `Waveform` (use `CallEnd` / `GraphicEq`), `CallManager.CallPhase`
(`CallPhase` is top level in `call/CallManager.kt:35`), `CallPhase.Connecting` (values are
`Idle, Outgoing, Incoming, Active`). **Verify every symbol against the file that declares it.**

Verified facts worth not re-deriving:
- Navigation is `ShellChromeState` (`ui/main/ShellChrome.kt`), not a nav library.
  `navigateTo(destination, serverId, channelId)` clears the other two.
- Opening a DM: `Database.getOrCreateDmThread(friendId)` returns the thread id; the thread must be
  present in `MainScreen`'s `dmThreads` before `selectedChannelId` is set, or the overlay lookup
  finds nothing. `MainScreen.openDmThread` already handles this.
- `PresenceService.status(forUserId, fallback)` — the method is `status(...)`, not `statusFor(...)`.
- `AvatarImage(url, name, size, modifier, presence: Color?)` — `presence` is a `Color`, not a status.
- `Profile.name` and `Profile.handle` are computed; there is no `Profile.pronouns` yet.
- `Modifier.hidesDock(state)` is an extension **taking the state**, declared in `ui/main/ShellChrome.kt:41`.
- Status-bar insets are applied **once** in `MainScreen`, not per screen. Don't add
  `statusBarsPadding()` inside panels — it double-pads.
- The floating dock overlays the bottom of every list; lists need ~96–110dp bottom content padding.
- Loading is parallel now (`MainScreen` fires DMs, groups and all servers' channels concurrently).
  Don't reintroduce a sequential loop — it was the cause of the multi-second startup.

---

## 6. Definition of done

1. `./gradlew :app:assembleDebug` clean, no warnings in new files.
2. Installed and **screenshotted** on the emulator; each screen visually matched against its iOS
   counterpart.
3. Android registers an FCM token and receives a push with the app backgrounded.
4. A call between Android and desktop web connects **both ways**, shows an ongoing-call
   notification, and survives leaving the app.
5. Version bumped, committed, pushed to `main`.
