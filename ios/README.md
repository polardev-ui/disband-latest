# Disband for iOS (SwiftUI)

A native SwiftUI client for **Disband** that talks **directly to the same Supabase
backend** as the web/desktop apps — no separate server. Auth, data, and realtime
all go through the shared project (`mjqbrcabargylrimlafw.supabase.co`), gated by
the same Row Level Security policies. Designed for mobile readability: larger
type, generous spacing, message grouping, and a tab-based layout.

## Requirements

- Xcode 16+ (built/tested on Xcode 26.5)
- [XcodeGen](https://github.com/yonyz/XcodeGen) (`brew install xcodegen`) — the
  `.xcodeproj` is generated, not committed.

## Build & run

```bash
cd ios
xcodegen generate          # (re)generate DisbandiOS.xcodeproj from project.yml
open DisbandiOS.xcodeproj   # then ⌘R on an iOS Simulator
```

Or from the command line:

```bash
xcodebuild -project DisbandiOS.xcodeproj -scheme DisbandiOS \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath build build
```

> Run `xcodegen generate` again whenever you **add or remove** source files.
> Editing existing files needs no regeneration.

## Architecture

```
ios/
├── project.yml                 # XcodeGen spec (target, SPM deps, Info.plist)
└── DisbandiOS/
    ├── App/                    # @main entry + AppState (auth/session/profile)
    ├── Config/                 # AppConfig + shared SupabaseClient
    ├── Models/                 # Codable structs mirroring the Postgres schema
    ├── Services/               # DatabaseService, RealtimeService, ProfileService
    ├── Theme/                  # Palette, status colors, relative-time helpers
    └── Views/                  # SwiftUI screens (Auth, Main tabs, Chat, …)
```

- **State:** `@Observable` `AppState` injected via the SwiftUI environment.
  Sessions persist in the Keychain automatically (supabase-swift), so login
  survives relaunches.
- **Data:** `DatabaseService` wraps PostgREST queries, mirroring the web app's
  `AppContext` (e.g. `select("*, author:profiles(*)")` embeds).
- **Realtime:** `RealtimeService` subscribes to Postgres `INSERT`s (Supabase
  Realtime v2); the shared `ChatViewModel` drives channels, DMs, and groups from
  one code path via the `ChatSource` enum.
- **Dependency:** [`supabase-swift`](https://github.com/supabase/supabase-swift)
  via SPM (resolved at 2.48.0).

## Feature status (phased toward full parity)

**Working in this build**
- Email/password auth (login, signup, password reset) + session persistence
- TOTP MFA challenge gate (aal1 → aal2)
- Servers → channels (text/voice listing) → live channel chat
- DMs and group chats with realtime message delivery
- Friends: list, incoming/outgoing requests, accept/decline, add-by-username,
  start a DM
- Profile: avatar/status/bio, status switcher, edit, sign out
- Send + receive messages live; image/file attachment rendering

**Not yet ported (next phases)**
- WebRTC voice/video calls (large subsystem)
- Sending attachments (upload via the custom media API) — currently render-only
- Reactions / replies / mentions UI (service layer is stubbed in `DatabaseService`)
- MFA *enrollment*, server roles/permissions management, moderation & platform-ban
  screens, push notifications, themes beyond the default dark palette

## Notes

- The Supabase anon key in `AppConfig.swift` is the same public client key the
  web app ships (`src/lib/public-env.ts`) and is safe to embed — access is
  enforced server-side by RLS.
- Bundle id: `com.wsgpolar.disband`. Set your `DEVELOPMENT_TEAM` in `project.yml`
  (or Xcode signing) before running on a physical device.
