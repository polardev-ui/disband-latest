# Product asset library — classic Disband UI

Source: `/Users/joshclark/Projects/disband-classic` (branch `feat/classic-ui`,
`d1dfa303`, 2026-10-22, app 2.32.95), its `/dev/classic` preview: the real
`DiscordApp` against the fictional sample data in `src/app/dev/classic/mock.ts`,
no sign-in. Captured at 1440×900, 3× (4320×2700) by `reconnect/capture.mjs`;
crops cut by `reconnect/extract.py`. Nothing in that repository was changed.

| Path | What it is |
|---|---|
| `captures/main.png` | Disband Demo HQ › #general: rail, channel column, chat (code block, reply, file, voice note, @everyone), role-grouped members, composer, user panel |
| `captures/hover-rail.png` | the rail with Night Owls hovered (squircle, pill, tooltip) |
| `captures/hover-channel.png` | the channel column with #random hovered |
| `captures/type/t000–t041.png` | the composer, one capture per character typed into the real textarea ("the old crew is back — game night friday?"); the preview does not send |
| `captures/dm.png` | a direct message with Mila Oduya and the profile rail |
| `layout.json` | rectangles measured from the live DOM: rail items (and which is active), rail separator, channel rows, message groups, member rows, composer, typing clip |
| `crops/rail-00…08.png` | each rail icon at 48 px (circle; the active space as a 16 px-radius squircle), alpha-masked |
| `crops/rail-hover-night-owls.png`, `crops/rail-separator-0.png` | hover state; the 32×2 rail divider |
| `crops/channel-header.png`, `channel-00…09.png`, `user-panel.png` | channel column parts |
| `crops/chat-header.png`, `message-00…08.png`, `composer.png` | chat parts, message bands cut at the authors' rows |
| `crops/member-00…07.png` | member rows |
| `brand/disband-mark.svg` | the official mark (vector), as used for the 3D mark and its outline |
| `brand/logo-white.png`, `brand/logo.png` | the mark as shipped in `disband-classic/public` |
| `manifest.json` | every crop with its rectangle and label |

Design tokens read from `src/app/globals.css` (classic dark): bg-primary
#313338, bg-secondary #2b2d31, bg-tertiary #1e1f22, bg-floating #111214,
composer #383a40, header-primary #f2f3f5, text-normal #dbdee1, text-muted
#949ba4, interactive-muted #4e5058, brand #5865f2, status-online #23a55a. UI
type is gg sans / Noto Sans; rail icons are 48 px circles that become 16 px
squircles when active, with an 8 px white pill (8 / 20 / 40 px tall).

Demo hygiene, in the capture browser only: the sample bot "Dyno" (a real
third-party bot's name) reads "Helper"; a real song in a listening status reads
as a made-up track; sample messages that can only render as error or loading
cards in the preview are hidden; What's New is dismissed.
