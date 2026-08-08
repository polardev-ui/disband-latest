<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo.png">
    <img alt="Disband" src="public/logo-app.png" width="128" height="128">
  </picture>
</div>

<h1 align="center">Disband</h1>

<p align="center"><strong>Your space to talk, hang out, and belong.</strong></p>

<p align="center">
  A modern, cross-platform communication platform for friends and communities — with text chat, voice, video,
  and end-to-end encrypted messaging built in from the ground up. Runs natively on <strong>macOS, Windows, and
  Linux</strong>, and in any modern browser.
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.22-6b5bd2?style=flat-square">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js%2016-000000?style=flat-square&logo=nextdotjs&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React%2019-61DAFB?style=flat-square&logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri%20v2-FFC131?style=flat-square&logo=tauri&logoColor=black">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white">
</p>

---

## Features

| | |
|---|---|
| **Servers & Channels** — Organize communities into servers with text and voice channels, custom categories, 7-character invite codes, and role-based permissions. | **Direct Messages & Group Chats** — Private 1-on-1 conversations and group chats with emoji reactions, GIFs, images, videos, files, replies, message editing, and a full emoji picker. |
| **Voice & Video Calls** — Peer-to-peer voice and video calls over WebRTC with mesh group calls — no third-party services required. Mute, deafen, and camera controls built in. | **End-to-End Encrypted Messaging** — Conversations and media stay protected so only the people in a conversation can read them. |
| **Friends & Presence** — Friend requests, a rich presence system (Online, Idle, Do Not Disturb, Offline), and profiles with avatars, banners, bios, and accent colors. | **Rich Media** — Drag-and-drop images, videos, and animated GIFs (via GIPHY) with inline previews and a lightbox viewer. |
| **Themes** — Four handcrafted themes — Dark, Light, Midnight (AMOLED-optimized), and Sunset — that restyle the entire app instantly. | **Security & Moderation** — MFA (TOTP + WebAuthn), Cloudflare Turnstile bot protection, VPN detection, rate limiting, server moderation tools, and platform-level bans. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | [Next.js 16](https://nextjs.org) (App Router, React 19, TypeScript) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) with CSS-variable theming |
| Backend & Auth | [Supabase](https://supabase.com) (PostgreSQL, Realtime, Auth, Edge Functions) |
| Desktop | [Tauri v2](https://v2.tauri.app) (Rust) — native macOS, Windows, Linux |
| Mobile | Native SwiftUI (iOS) |
| Voice / Video | WebRTC (peer-to-peer, mesh group calls) |
| Media Uploads | Custom media API |
| Push Notifications | APNs via Supabase Edge Functions |
| Icons | [Lucide](https://lucide.dev) + custom SVGs |

---

## Desktop Apps

Disband ships native installers for every platform via **GitHub Releases**:

- **macOS** — Apple Silicon & Intel (DMG)
- **Windows** — x64 (EXE/MSI)
- **Linux** — x64 (DEB/AppImage)

Check the [Releases page](https://github.com/polardev-ui/disband-latest/releases) for the latest version.

---

## Project Links

- **Web App:** [www.disband.dev](https://www.disband.dev)
- **Source Code:** [github.com/polardev-ui/disband-latest](https://github.com/polardev-ui/disband-latest)
- **Desktop Releases:** [github.com/polardev-ui/disband-latest/releases](https://github.com/polardev-ui/disband-latest/releases)

---

<p align="center">
  <sub>Built with ❤️ by <a href="https://github.com/polardev-ui">Josh Clark</a></sub>
</p>
