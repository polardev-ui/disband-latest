<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/logo.png">
  <img alt="Disband" src="public/logo-app.png" width="96" height="96">
</picture>

# Disband

**Your space to talk, hang out, and belong.**

Disband is a modern, open-source communication platform for friends and communities — with text chat, voice, video, and encryption built in from the ground up. It runs natively on **macOS, Windows, and Linux**, and is also available directly in your browser.

Created by **Josh Clark** · Started 2023 · Current version **0.4.4**

---

## Features

### Servers & Channels
Organize your communities with **servers**, **text channels**, and **voice channels**. Create custom categories, invite members via 7-character invite codes, and manage everything with role-based permissions.

### Direct Messages & Group Chats
Private 1-on-1 conversations and **group chats** with the people who matter. Share emoji reactions, GIFs, images, videos, and files. Reply to specific messages, edit your messages, and express yourself with a full emoji picker.

### Voice & Video Calls
Make **peer-to-peer voice and video calls** with WebRTC — no third-party services required. Group calls are supported too, with mute, deafen, and camera toggle controls.

### End-to-End Encrypted Messaging
Your conversations stay between you and the people you trust. Messages and media are protected so that only participants in a conversation can read them.

### Cross-Platform
One account, everywhere you are. Download the **native desktop app** for macOS (Apple Silicon & Intel), Windows, or Linux, or open Disband in any modern browser.

### Rich Media Support
Share images, videos, and **animated GIFs** via integrated GIPHY support. Drag and drop media into conversations, with previews and lightbox viewing.

### Themes
Choose from **four handcrafted themes** — Dark, Light, Midnight (AMOLED-optimized), and Sunset — that instantly restyle the entire app.

### Friends & Presence
Build your network with friend requests, see who's online (Online, Idle, Do Not Disturb, Offline), and view rich user profiles with avatars, banners, bios, and accent colors.

### Security & Moderation
MFA (TOTP + WebAuthn), Cloudflare Turnstile bot protection, VPN detection, rate limiting, server moderation tools (kick, ban, role management), and platform-level banning.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | [Next.js](https://nextjs.org) (App Router, React 19, TypeScript) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) with CSS variable theming |
| Backend & Auth | [Supabase](https://supabase.com) (PostgreSQL, Realtime, Auth, Edge Functions) |
| Desktop | [Tauri v2](https://v2.tauri.app) (Rust) — native macOS, Windows, Linux |
| Mobile | Native SwiftUI (iOS) |
| Voice / Video | WebRTC (peer-to-peer, mesh group calls) |
| Media Uploads | Custom media API |
| Push Notifications | APNs via Supabase Edge Functions |
| Icons | [Lucide](https://lucide.dev) + custom SVGs |

---

## Desktop Downloads

Disband publishes native installers for every platform via **GitHub Releases**:

- **macOS** — Apple Silicon & Intel (DMG)
- **Windows** — x64 (EXE/MSI)
- **Linux** — x64 (DEB/AppImage)

Check the [Releases page](https://github.com/anomalyco/disband/releases) for the latest version.

---

## Building from Source

### Prerequisites
- **Node.js** 18.18+ and **pnpm**
- For desktop builds: **Rust toolchain** (`rustup`) and [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
pnpm install
cp .env.example .env.local   # fill in your Supabase values
```

### Run in browser

```bash
pnpm dev          # http://localhost:3000
pnpm build        # static export -> ./out
```

### Run as native desktop app

```bash
pnpm desktop:dev      # launches a native window connected to the dev server
pnpm desktop:build    # produces installers in src-tauri/target/release/bundle
```

---

## Architecture

```
disband/
├── src/                      # Shared web application (runs in browser + desktop)
│   ├── app/                  # Next.js App Router pages & API routes
│   ├── components/           # UI components (discord, auth, marketing, modals, theme, etc.)
│   ├── contexts/             # AppContext — app-wide state management
│   ├── hooks/                # React hooks (WebRTC calls, media upload, typing, etc.)
│   └── lib/                  # Utilities (Supabase, WebRTC, notifications, themes, etc.)
├── src-tauri/                # Native desktop shell (Rust + Tauri v2)
├── supabase/                 # Database migrations, Edge Functions, auth templates
├── ios/                      # Native iOS SwiftUI client
├── public/                   # Static assets (logo, favicon)
└── scripts/                  # Build, release & automation scripts
```

The web UI knows nothing about the desktop shell, and the native Rust bridge is fully isolated. Components adapt at runtime by detecting whether they're running in a browser or a Tauri window.

---

## Project Links

- **Web App:** [disband.chat](https://disband.chat)
- **Source Code:** [github.com/anomalyco/disband](https://github.com/anomalyco/disband)
- **Desktop Releases:** [github.com/anomalyco/disband/releases](https://github.com/anomalyco/disband/releases)

---

<p align="center">
  <sub>Built with ❤️ by <a href="https://github.com/anomalyco">Josh Clark</a></sub>
</p>
