# Disband

**One codebase. macOS, Windows, Linux & the Web.**

Disband is a cross-platform application built from a single
[Next.js](https://nextjs.org) (App Router + TypeScript) codebase. The same UI
runs as a hosted web app and as a native desktop binary via
[Tauri v2](https://v2.tauri.app), with data & auth powered by
[Supabase](https://supabase.com) and a fully themeable
[Tailwind CSS v4](https://tailwindcss.com) design system.

---

## Architecture

```
disband/
├── src/                      # Shared web application (web + desktop)
│   ├── app/                  # Next.js App Router (layout, dashboard page, globals.css)
│   ├── components/
│   │   ├── theme/            # ThemeProvider, ThemeSwitcher, ThemeToggleButton
│   │   └── dashboard/        # Sidebar, Topbar, StatCard, MediaUploader, ActivityFeed
│   ├── hooks/
│   │   └── useMediaUpload.ts # React hook around the custom media API
│   └── lib/
│       ├── media/            # uploadMedia() — custom media API client
│       ├── supabase/         # Browser client + DB types
│       ├── theme/            # Theme registry
│       └── platform.ts       # Desktop vs Web runtime detection
│
├── src-tauri/                # Native desktop bridge (Rust) — kept separate from web views
│   ├── src/                  # main.rs / lib.rs (Tauri commands live here)
│   ├── capabilities/         # Window permission grants
│   ├── icons/                # Generated app icons (all platforms)
│   ├── Cargo.toml
│   └── tauri.conf.json       # Points frontendDist -> ../out, devUrl -> :3000
│
├── supabase/
│   └── migrations/0001_init.sql   # profiles (+ theme) & media_posts tables w/ RLS
│
├── next.config.ts            # output: "export" for static, path-safe desktop builds
└── package.json
```

The web views in `src/` know nothing about the desktop shell, and the native
bridge in `src-tauri/` is fully isolated. Components adapt at runtime via
`isTauri()` in `src/lib/platform.ts` rather than through separate codepaths.

---

## Prerequisites

- **Node.js** 18.18+ and **pnpm**
- For desktop builds: the **Rust toolchain** (`rustup`) and the platform
  [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/)

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in your Supabase + (optional) media API values
```

## Run — Web

```bash
pnpm dev          # http://localhost:3000
pnpm build        # static export -> ./out  (deploy this folder to any host)
```

Because `next.config.ts` uses `output: "export"`, `pnpm build` produces a fully
static `out/` directory that works on any static host **and** is what the
desktop app loads — so paths never break between targets.

## Run — Desktop

```bash
pnpm desktop:dev      # launches a native window pointed at the dev server
pnpm desktop:build    # produces installers/binaries in src-tauri/target/release/bundle
```

`tauri dev` runs `pnpm dev` and loads `http://localhost:3000`; `tauri build`
runs `pnpm build` and packages the static `out/` directory.

---

## Database (Supabase)

Apply the schema in `supabase/migrations/0001_init.sql`:

```bash
pnpm dlx supabase db push        # against a linked project
# — or — paste the SQL into Supabase Dashboard > SQL Editor
```

It creates:

- **`profiles`** — one row per auth user, including a `theme` preference column.
  A trigger auto-creates a profile on sign-up. RLS lets users edit only their own.
- **`media_posts`** — stores `asset_url` / `asset_key` returned by the custom
  media API, linked to the owning user. RLS scopes rows to their owner.

---

## Custom media API

All image/video uploads bypass Supabase Storage and go to a custom endpoint:

- `POST https://api.wsgpolar.me/v1/images` with `FormData { file }`
- Response: `{ "success": true, "url": "...", "key": "..." }`

Use the hook anywhere in the app:

```tsx
import { useMediaUpload } from "@/hooks/useMediaUpload";

const { upload, isUploading, error, result } = useMediaUpload();
const res = await upload(file);          // handles loading + error state
if (res) await saveToSupabase(res.url, res.key);
```

The low-level client (`src/lib/media/uploadMedia.ts`) supports cancellation via
`AbortSignal` and throws a typed `MediaUploadError`. The dashboard's
**Quick upload** card demonstrates the full pipeline end to end.

---

## Theming

The theme engine is pure CSS variables scoped to `[data-theme="..."]` on
`<html>`, mapped into Tailwind tokens (`bg-background`, `text-foreground`,
`bg-primary`, …). Switching themes updates one attribute and instantly restyles
both the web UI and the desktop window — no flash on load (handled by an inline
script in `app/layout.tsx`).

Ships with **Light**, **Dark**, **Midnight**, and **Sunset**. Add a new theme by:

1. Adding a `[data-theme="yourtheme"] { ... }` block in `src/app/globals.css`.
2. Registering it in `src/lib/theme/themes.ts`.
3. (Optional) Persisting the chosen id to `profiles.theme` for signed-in users.
