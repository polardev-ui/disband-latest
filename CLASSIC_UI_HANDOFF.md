# Classic Discord UI rebuild — handoff

This file is the brief for whoever (human or AI) continues the "classic Discord UI" rebuild of Disband's **web and desktop** app. Read all of it before writing code.

## Where the work lives

- **Branch:** `feat/classic-ui`, checked out as a git worktree at `/Users/joshclark/Projects/disband-classic`. The main checkout (`/Users/joshclark/Projects/disband-latest`) is shared with other sessions that push to `main` constantly. **Do not work there and do not push this branch.** The owner reviews it on localhost first.
- **Dev server:** `.claude/launch.json` in the main checkout has a `disband-classic` config that runs this worktree on **http://localhost:3017**. Port 3007 is another project (SAM); don't kill it.
- **Preview without signing in:** http://localhost:3017/dev/classic renders the real `DiscordApp` with sample data (`src/app/dev/classic/mock.ts`). `?big=1` fakes a 4,996-member space for the member list. http://localhost:3017/dev/badges shows all badge art. `src/app/dev/` and the `AppContextForPreview` export in `src/contexts/AppContext.tsx` are **dev-only and deliberately uncommitted**; keep them out of commits.
- **Commit locally** as you go (`git add <files>` — never `-A` blindly; never commit `src/app/dev`, `next-env.d.ts`, or the AppContext export line). End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verify with `npx tsc --noEmit -p .` (that is the project's lint) after every change, and look at the result in the preview.

## Target look

Discord's **2023 – early 2025 desktop UI** (before the 2025 refresh): server rail on the far left, 240px channel column with the user panel at its bottom, chat in the middle, 240px member list on the right. References the owner supplied: three screenshots (2019, ~2023, April 2025) and the Figma "Discord UI Kit (Community)" (rendered PNGs at `/private/tmp/claude-501/-Users-joshclark-Projects-disband-latest/b270376b-05d5-4f68-9725-7197c30fd4a2/scratchpad/uikit/*.png`). Use the 2023 greys, not the 2021 ones.

Owner's standing preferences: **flat and matte, no glows**, nothing that "looks AI-made"; UK spelling in UI copy ("colour"); changes are for web/desktop only — never touch `ios/` or `android/` styling.

## Design tokens (already in `src/app/globals.css`)

Use Tailwind classes backed by these, not hex values, wherever possible:

| Token / class | Value | Use |
|---|---|---|
| `bg-bg-primary` | #313338 | chat, modals |
| `bg-bg-secondary` | #2b2d31 | channel list, member list, settings sidebar, cards |
| `bg-bg-secondary-alt` | #232428 | user panel, Voice Connected card, profile popout |
| `bg-bg-tertiary` | #1e1f22 | server rail, inputs, search boxes |
| `bg-bg-floating` | #111214 | context menus, tooltips, popout inner cards |
| `bg-bg-composer` | #383a40 | message box |
| `bg-bg-message-hover` | #2e3035 | message row hover |
| `bg-interactive-hover` / `-selected` | #35373c / #404249 | list rows |
| `text-header-primary` / `-secondary` | #f2f3f5 / #b5bac1 | titles / labels |
| `text-interactive-normal` / `-active` | #b5bac1 / #fff | icons |
| `text-channels-default` | #80848e | channel names, category headers |
| `text-text-normal` / `text-text-muted` | #dbdee1 / #949ba4 | body / meta |
| `bg-button-secondary`, `bg-button-green`, `bg-button-danger` (+`-hover`) | #4e5058, #248046, #da373c | buttons |
| `shadow-[var(--elevation-low)]` / `--elevation-high` | — | header shadow / floating shadow |

Font: Noto Sans via `--font-noto` (Discord's own fallback for gg sans).

## Shared building blocks (reuse these)

- `src/components/ui/SettingsLayer.tsx` — full-screen settings layer + `SettingsNavHeader/Item/Separator`. Adds `body.layer-open`, which scales `.app-base-layer` (DiscordApp root) to 0.93 while the layer zooms in from 1.1.
- `src/components/discord/settings/SettingsPrimitives.tsx` — `SettingsSection` (uppercase 12px title + flat #2b2d31 card), `SettingRow`, `Toggle` (classic green/grey switch with ✓/✕), `settingsInputClass`.
- `src/components/modals/server-settings/ui.tsx` — `btn.primary/secondary/danger/ghost` (38px, 3px radius), `iconBtn`, `ConfirmDialog` (classic modal: body #313338, footer #2b2d31), `SearchField`, `DropZone`, `SlotMeter`, `LevelLock`, `EmptyState`.
- `src/components/ui/StatusDot.tsx` — status glyphs from the UI kit (crescent idle, bar DND, ring offline) with a cut-out ring; `StatusIndicator` uses them too.
- `src/components/ui/BadgeArt.tsx` — 25 full-colour badges; `BadgeGlyph` prefers it.
- `src/components/icons/CartIcon.tsx` — the Shop icon.
- CSS in `globals.css`: `.rail-pill` / `.rail-icon` (rail), `.menu-pop` (menus), `.classic-modal` and `.modal-pop` (modal entrance: scale 0.9→1 with slight overshoot), `.profile-popout`, `.settings-layer`, `.tooltip-content`, scrollbars (`.channel-scroll`, `.member-scroll`, `.chat-scroll`).

Patterns: popouts and menus use `bg-bg-floating`, `rounded-[4px]`, `shadow-[var(--elevation-high)]`, items `rounded-[2px] px-2 py-1.5 text-[14px] font-medium text-interactive-normal hover:bg-brand-hover hover:text-white`. Section headings are `text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary`. Inputs: `rounded-[3px] bg-bg-tertiary border border-transparent focus:border-[#00a8fc]`. Modals: `bg-bg-primary rounded-lg`, title `text-[20px] font-semibold text-header-primary`, footer `bg-bg-secondary p-4` with a ghost "Cancel" left of the primary button.

## Done (committed)

1. Tokens, font, light theme values.
2. Server rail (`ServerList.tsx`): pill, circle→squircle morph, green Add/Explore, folders with 2×2 previews, red count badges, DM unread avatars.
3. Layout (`DiscordApp.tsx`): rail full height; 240px column = panel + `CallIndicator` (Voice Connected card) + `UserPanel`.
4. `ChannelList.tsx` (rows, categories, hover gear, voice users, header dropdown via `onOpenServerMenu`, boost row), `UserPanel.tsx`, `CallIndicator.tsx`.
5. Chat: `ChatCanvas.tsx` header/intro/day dividers/NEW line; `ChatMessage.tsx` (72px indent, reply spine, hover timestamps); `MessageActionBar`, `MessageReactions`, `markdown.tsx`, `CodeBlock.tsx`; `ChatInput.tsx` composer (+ menu, reply bar, gift/GIF/emoji order, emoji face button).
6. `HeaderToolbar.tsx` (bell, pins, members, search, inbox, help), `MemberList.tsx`, `HomePanel.tsx` (DM sidebar, cart Shop), `FriendsPanel.tsx`, new `QuickSwitcher.tsx` (Ctrl/⌘+K).
7. `UserProfilePopout.tsx` — opens beside the clicked element (anchor captured in DiscordApp `lastPointer`), "View Full Profile" → `UserProfileModal`.
8. User Settings and Space Settings converted to `SettingsLayer`; settings sections swept to classic controls.
9. Context menu, tooltips (incl. `side="bottom"`), Shop modal, modal entrance + corner/input sweep across ~18 modals.
10. **Member list windowing** (`useMemberWindow.ts`, migration `0134_member_list_window.sql` — already applied to the live DB): exact counts, online from live presence, offline paged alphabetically 100 at a time, far pages evicted.
11. Calls: `CallUI.tsx` (56px controls, incoming-call card, group ring card), `CallTile.tsx`, `VoicePanel.tsx`, `GroupCallStage.tsx`.
12. Badge artwork.

- `CreateServerModal`: classic Create Your Space / Join a Space flow.
- `ChannelSettingsModal`: full-screen `SettingsLayer` (Overview / Permissions / Delete Channel) with the sticky unsaved-changes bar and `ConfirmDialog` for deletes.
- Badges: tooltips sit above every overlay (`OVERLAY_Z.tooltip = 110`). Profile cards (`UserProfilePopout`, `DmProfileRail`) use `useBadgeCount`: up to `HEADER_BADGE_LIMIT` (8) badges go in the classic box beside the avatar, more wrap in a row under the name inside the card.

- Composer slash commands (`/ban`, `/kick`, `/timeout`): `src/lib/slash-commands.ts` (definitions, duration parsing, member ranking), `SlashCommandComposer.tsx` (chips, option bar, member/duration pickers). Reasons are DMed from @disband via `send_moderation_notice` (migration 0135, applied to the live DB; it only fires for the caller's own audit-logged action from the last 5 minutes, once).
- Mentions: `useMemberSearch` merges loaded members with a server-side roster search. Picked members are atomic `MentionSpan`s (`composer-tokens.ts`): shown as @Display Name, sent as @username via `resolveMentionSpans`.

- Settings › My Account (old-Discord account card, Password and Authentication, 2FA, Devices, Account Removal) in `settings/MyAccountPanel.tsx`; `ClassicModal` (`ui/ClassicModal.tsx`) for account modals; sidebar groups User / Billing / App Settings.
- Modals: Select Friends (group DM), Forward To, What's New (release notes), Create a Poll, Timeout, and a sweep of gift / Catalyst / subscription.
- Discover as 2021 Server Discovery; classic search results pane; Inbox popout (`NotificationBell`); login card on blurple (`AuthScreen`).
- Phone widths: chat views carry the menu button in their header (`headerLeading` on `ChatCanvas`), the drawer ends with the call card and user panel, the composer re-fits on width changes.
- Whole-app classic sweep: 13.5/12.5px body text, xl/2xl corners, soft shadows, blurred sticky bars and pill controls replaced across settings, server settings, notices, support, bug report, referrals, auth-adjacent pages and staff tools. Intentional exceptions are the 16px space-folder squircle and functional scroll/legibility gradients over media.
- Gifting: compact `GiftModal`, `GiftCard`, claim celebration and Stripe checkout; UK dates and "Cancelled"; settings plan/gift history cards standardised.
- Role assignment: searchable admin-only `RolePicker`, removable role chips in `UserProfileModal`, cleaner `RoleManager`. The client and database both require `manage_roles && manage_server` (owners/admins bypass; migration `0141`, applied).
- Webhooks and embeds: Discord-compatible execute/manage endpoints, per-webhook author and message grouping, embed renderer, Integrations settings, audit-log entries and the `manage_webhooks` permission (migration `0136`, applied).
- Status: grouped monitors, 90-day bars, incidents/maintenance/announcements, detail pages and RSS, owner-only `/status/admin` (migration `0137`, applied; `status-probe` Edge Function and `pg_cron` job live). Public RPCs omit monitor URLs, headers, probe errors and incident author ids (migration `0140`).
- Spotify: tokens moved from localStorage to server-side `spotify_connections`, so a connection follows the account across web and desktop (migration `0138`, applied). The browser only receives the current track.
- Favourite GIFs: deterministic 52-bit `gif_id` generated from the canonical URL (migration `0139`, applied), used as the cross-platform identity and conflict key.

- Anonymous accounts: `requireTurnstile` (src/lib/turnstile.ts) fails closed on all four anon routes with per-step actions; per-network cap on creation; the panel never submits without a token. Production MUST have TURNSTILE_SECRET_KEY set or anonymous sign-up returns 503.
- Web has no title bar (desktop only); rail tooltip online count is live (`useLiveOnlineCount`); profile popout fetches missing membership rows (`useProfileMember`) so roles can be assigned in big spaces.
- Docs live in `/Users/joshclark/Documents/disband-docs`: `developers/webhooks.md`, `developers/embeds.md`, `developers/status.md`, and the bot API reference now documents bot embeds. Rebuild with `npm run build`.

## Remaining

1. Visual QA pass signed in (real data): reason DMs from /ban etc., member search on the 5k space, 2FA enrolment in the new panel.
2. Webhook end-to-end test while signed in: execute, `?wait=true`, 429, PATCH and DELETE in a real space.
3. Status admin test as the platform owner: create/edit/delete a monitor, post an update, delete the test incident.
4. Spotify reconnect test on web and desktop, including a track change and Disconnect.
5. Turnstile production secret and hostnames, plus Supabase Auth CAPTCHA, need dashboard/owner action.
6. Owner self-role changes: decide whether the owner may change their own roles.
7. Porting the member-list fix to `main` needs an owner decision (see below).
8. Optional polish: GIF picker category tiles (Discord showed image tiles), a "Disable Account" option if the backend ever gets one.
9. Before merging: the uncommitted edits listed below need an owner.

## Notes and gotchas

- This worktree has uncommitted edits that did not come from the classic-UI commits: legal/privacy/terms/status pages, sitemap, favicon, MarketingLayout, and pieces of ChatCanvas (read-cursor fixes), DiscordApp (manage_server check), EmojiPicker, FriendsPanel, PinnedMessagesPanel, ServerList, BotsPanel, ThemesPanel, DangerSection, AppContext. Commits here staged only their own changes on top of HEAD so those stayed untouched.

- Dev-only, never commit: `setBadgesForPreview` in `src/lib/badge-store.ts` (seeds 25 badges for u1 and 4 for u2 in `/dev/classic`), along with `src/app/dev/` and `AppContextForPreview`.
- Screenshots from the browser pane can show a stale frame while it is hidden; confirm state with `javascript_tool` before "fixing" a ghost.

- The browser pane throttles hidden tabs; screenshots can be one step stale — re-take them, and prefer `javascript_tool` to check DOM state.
- `/status/admin` is gated by `show_owner_badge` (the platform owner), not a space role. Unauthenticated callers get `401`; other signed-in accounts get `403`.
- `app.members` still loads the first 500 members (used for mentions and author colours); the member *list* uses `useMemberWindow`.
- The member-list fix is wanted in production soon. It is on this branch; shipping it alone means porting `useMemberWindow.ts` + the `MemberList` changes onto `main` (that file was restyled here, so cherry-pick will conflict). Ask the owner before pushing anything.
- Don't commit secrets; the repo is public.
