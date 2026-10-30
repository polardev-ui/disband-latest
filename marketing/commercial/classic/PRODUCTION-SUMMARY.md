# "A Familiar Feeling. A New Home." — production summary (internal)

Phase 1 for the 9:16 TikTok spot showcasing the classic Disband UI. Inspected
2026-10-19 in `/Users/joshclark/Projects/disband-classic` (git worktree of the
Disband repo on `feat/classic-ui`, app version 2.32.95). Nothing in that
repository was changed.

## 1. Repository structure and UI components

- Next.js 16 + Tauri + Supabase app; web/desktop UI in `src/components/discord/*`,
  design tokens in `src/app/globals.css`, brief for the rebuild in
  `CLASSIC_UI_HANDOFF.md`.
- Layout `DiscordApp.tsx`: full-height server rail (`ServerList.tsx`: pill,
  circle→squircle, unread badges, folders, green Add/Explore), 240 px channel
  column (`ChannelList.tsx` with categories, voice users, boost row) ending in
  the call card and `UserPanel.tsx`, chat (`ChatCanvas.tsx`, `ChatMessage.tsx`
  with 72 px indent, reply spine, hover actions; `CodeBlock.tsx`, `markdown.tsx`,
  `MessageAttachment.tsx`, `MessageReactions.tsx`), composer (`ChatInput.tsx`:
  + menu, gift / GIF / emoji, slash commands, mentions), header toolbar
  (`HeaderToolbar.tsx`), 240 px member list grouped by role (`MemberList.tsx`,
  windowed for big spaces).
- Also implemented: `UserProfilePopout.tsx` / `UserProfileModal.tsx`,
  `HomePanel.tsx` + `FriendsPanel.tsx` (Friends with Active Now) and DMs with
  `DmProfileRail.tsx`, `QuickSwitcher.tsx` (Ctrl/⌘+K), settings as a full-screen
  `SettingsLayer`, Discover, calls (`CallUI.tsx`, `GroupCallStage.tsx`), polls,
  GIF/emoji pickers, webhooks/embeds, status pages.
- Run: a `next dev` server for this worktree was already running on
  http://localhost:3000 (the configured port 3017 refused to start beside it),
  so captures used that server. `/dev/classic` renders the real `DiscordApp`
  against sample data (`src/app/dev/classic/mock.ts`) with no sign-in; it is
  dev-only and uncommitted by design.

## 2. Screens selected (all captured from the running app, 1440×900 at 3×)

| File | Screen | Used for |
|---|---|---|
| `main.png` | Disband Demo HQ › #general: rail, channels, chat (code block, reply, file, voice note, @everyone highlight), role-grouped members, user panel | hero, montage F, nostalgia scene, end-card thumbnail, opening panels |
| `rail-hover.png` | rail with the "Night Owls" pill and tooltip | montage A |
| `channel-hover.png` | channel column with the hover state on #random | montage B |
| `compose-0…4.png` | typing "anyone up for a game night on friday?" into the composer | montage C |
| `profile.png` | Mila Oduya's profile card from the member list (banner, badges, About Me, Member Since, Mod role) | montage D |
| `dm.png` | DM with Mila Oduya and the profile rail | montage E |

## 3. Strongest visual characteristics

2023-era Discord greys, flat and matte: #1e1f22 rail, #2b2d31 channel and
member columns, #313338 chat, #383a40 composer, #5865f2 blurple selection and
mention highlights, role colours (green Mod, pink Designer, blurple Bots),
Noto Sans at compact 14–16 px, 4 px radii, circle-to-squircle server icons with
the white selection pill, uppercase 12 px category headers, red unread badges,
profile cards with a colour banner and badge box.

## 4. Not demonstrable / limitations

- **Sending:** the preview's actions are no-ops, so a message cannot be shown
  being sent. The spot shows real typing in the composer only.
- **Sample video message:** its relative path is rejected by the app's URL
  check, so in the preview it can only render as an error tile; it is hidden at
  capture time.
- **Calls, voice, Spotify, Discover data, signed-in settings:** need real
  sessions, WebRTC or network data; not used.
- No real accounts, credentials or private messages were used.

## 5. Accuracy measures

- Every UI frame is a pixel capture of the running app (no redraws), composited
  onto flat window planes in 3D; close-ups crop regions of the 3× captures, so
  text stays sharp and proportions are untouched.
- Demo hygiene in the capture browser only: the sample bot "Dyno" (a real
  third-party bot's name) reads "Helper"; Nova's listening status uses a
  made-up track ("Night Drive", "Mono Tide") instead of a real song; the What's
  New notes are dismissed; the Next.js dev badge is hidden.
- No Discord name, logo or asset appears; the copy speaks of a familiar feeling
  and does not claim affiliation. Official Disband mark
  (`assets/logo/disband-mark.svg`) and slogan used exactly.
- Copy makes no claims about encryption, security, numbers or users.
