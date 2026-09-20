# WebUI Revamp — Bug Catalog (Phase 0)

Scope: `src/` web UI only. No backend / mobile / Tauri-shell / CDN changes.
Priority: bugs → rework → animations (strictly after).
Ship: incremental patches, version bump each, real-account web verification.

## P0 — Overlay system (full restyle target)

No central z-scale; ~12 colliding levels:
- `Tooltip z-[200]` renders above `ImageLightbox z-[150]`, `EmojiPicker z-[120]`.
- `ContextMenu z-[100]` not portalled, opens under lightbox/emoji/fullscreen video; ties with `DangerousDownloadModal`, `CallUI`, `MobileAppPromo`.
- Modal tier flat/inverted: `UserProfile z-[55]` < `ChannelSettings z-[60]` = `AvatarCrop z-[60]` < `ServerSettings z-[70]`; `Settings/Timeout/Subscription z-50` tie with `Forward` sheet `z-50`; `Forward` overlay `z-40` sits under sibling dialogs.
- `RolePicker z-50` clipped inside `overflow-y-auto` modals; `ChatInput` picker `z-20`.
- Mobile: `ServerSettingsModal` nav `hidden.md:flex` wraps a `md:hidden` select that never shows — no section switching on mobile. `ChannelSettingsModal min-w-[520px]` forces h-scroll at 320–360px.

Focus/a11y:
- No focus trap anywhere. Only lightbox has `role=dialog aria-modal`.
- Escape missing in ChannelSettings, UserProfile, Forward, AvatarCrop, Timeout, DangerousDownload. Nested Escape closes both layers.
- ContextMenu: mousedown-close exempts only `[data-context-menu]` (opener instantly closes), no menu roles / arrow keys / focus return.
- Scroll-lock only in lightbox; all other fullscreen modals leave background scrollable.

Theming: `ContextMenu`/`Tooltip bg-[#111214]`, `Lightbox bg-[#2b2d31]`, `ReviewPanel bg-[#1e1f22]` stay dark under light/parchment/porcelain. Mixed hardcoded status colors vs `status-*` tokens.

Animation: `modal-pop`/`overlay-fade` defined but only `ReviewPanel` consumes them — everything else mounts instantly. No reduced-motion guard for modal/tooltip/call-enter keyframes.

## P0 — Chat shell

Scroll/perf:
- `ChatCanvas` per-message reaction filter + full-list `buildReplyPreviews` + non-memoized rows → append-one re-renders all, jank grows with history.
- Scroll handler unthrottled near top (`scrollTop<96`); paginate restore not re-anchored when images resolve; `ResizeObserver` + per-embed `onLoad→scrollToBottom` yanks near-bottom readers.
- `message-pagination` single `.in()` unchunked; `trimToLatestWindow(25)` drops reply/pin targets; `LinkPreviewCard` fetches duplicate URLs N× (no cache).

Send reliability:
- `ChatInput` clears text/reply/attachments before `await onSend`; rollback only restores first message text — failed send loses reply + files. Multi-file loop sends N messages sequentially (partial 1-of-3 lands).
- GIF/Poll bypass edit mode → creates new message while "Editing" stays open.
- Failed own send clears "New" divider for others pre-ack.
- No size/type validation at picker; typing interval recreated per keystroke.

Rendering:
- Double upload progress UI; stuck at 100% never swaps to attachment.
- Compact vs grouped-full layout mismatch (`pl-[72px]`, hover-only timestamps — dead on touch/keyboard).
- Groups across days/edited/mention boundaries; reply quote vanishes on paginated/deleted parent (no fallback).
- `jumpToMessage` uses global `getElementById + scrollIntoView`, misses nested scroll container.
- `MessageActionBar -top-4 opacity-0 group-hover` clipped on first row, invisible touch/keyboard; attachment skeleton aspect ≠ final → layout shift; fixed `h-[104px]` link preview + unguarded `onLoad` → shift + spurious autoscroll; welcome banner renders mid-history when paginating; unpin hover-only.

Live indicators:
- `TypingIndicator` early-returns on empty → exit animation never plays, composer jumps (no reserved space). Timer coalescing missing → flicker. Self-echo hack in self-DMs.
- Reaction hover card snapshots `getBoundingClientRect`, detaches on scroll; picker `z-50` under hover `z-200`/drag `z-150`, no Esc/scroll-lock.
- "New" divider locks once, goes stale. `avatar-pop` lacks reduced-motion guard.

## P0 — Themes/skins (keep all 16 + 9)

- `bg-brand + text-white` hardcoded at ~8+ call sites unreadable on pastel-brand themes (graphite/forest/cobalt/ember/orchid/copper, contrast <2:1). Only `.bg-brand.text-white` gets `brand-foreground`.
- Hardcoded dark shells (`ReviewPanel`, marketing, `ProductFrame`, gates) stay near-black under light skins.
- `bg-white/*` invisible on light; `bg-black/*` muddy on light; scrim opacity has no light token.
- Skin breakage: minecraft pixelates all img/video + bevel overflow; cod uppercase + `z-9999` grain above modals; terminal lowercase + scanline kills contrast; brutalist borders shift flex + `--divider:#000` kills separation; frutiger/vaporwave fullscreen blend + per-button blur is GPU-heavy.
- Reduced-motion missing for tooltip/marketing/call/modal/pop/pulse/scale; reduced-transparency only handled for one frutiger button.
- Custom CSS injection unsandboxed (allows fixed/z-inf/infinite anim), applied globally — one user theme can break all viewers.

Smoke matrix: rows dark/light/midnight/parchment/porcelain/copper(+graphite/forest/cobalt/ember/orchid spot) × skins none/minecraft/terminal/brutalist/y2k/frutiger/paper. Cols: modal readability, brand contrast ≥4.5:1, chat/call legibility, reduced-motion, reduced-transparency+contrast-more, 320px, malicious custom-CSS containment.

## P1 — Voice/call UI (UI only, no protocol)

- Dead `speaking` state (prop exists, never passed); remote mute dropped (only self icon); `CallTile` always `<button>` with no action → keyboard/SR confusion.
- Narrow breakage: `MIN_TILE_WIDTH=128` + y-only scroll clips at 320px; fixed `h-20 w-20` avatars dominate; `GroupRingOverlay w-80` overflows <340px.
- `useLayoutEffect` no-deps re-subscribes observers every render; tile order inconsistent (screens-first vs interleaved); empty presence returns null (no ended/empty state); ringing conflated with speaking ring, no per-tile label; screen badge sniffs `track.label` regex.
- Double "Leave" in VoicePanel; split camera/screen into secondary buttons; mic-muted vs deafen same red style; no mute-before-join / no deafen in group stage; async join with no joining/disabled state; device denial silently flips boolean (buttons look dead); duplicate `<audio>` render (context + stage) re-sets `srcObject` per render; incoming overlay full-screen no timeout/backdrop; no minimize/lobby/preview/mic-test; timer formats inconsistent (`h:mm:ss` vs `mm:ss`, resets on remount).

## P1 — Social / nav

- `HomePanel`: duplicate `DmUnreadBadge`, fixed `w-60` no collapse, no group-chat empty state, presence dot hidden when unread, pending badge uncapped.
- `FriendsPanel`: stray `{}`; header crowds mobile; search missing on pending/blocked; `@username` hover-only; "More" anchored to `activeElement` rect; `ActiveNowPanel hidden xl:flex` no fallback.
- `DiscoverPanel`: text-only loading, raw RPC error no retry, global `joinError` scrolls away from failed card.
- `ChannelList`: dead "Search" div; add-channel `+` hover-only; fixed `w-60`; drag eats clicks (500ms suppress); drag ghost clips viewport.
- `ServerList`: nested tooltips fight; folder color assumes hex; rail tooltip vs aria-label unread mismatch; tiny low-contrast empty-folder hint.
- `MemberList`: blank aside when empty; offline lumped, brittle sort hack; offline-dot inconsistency vs Friends.
- `UserPanel`: `onOpenProfile` never called; mic/deafen visible outside voice; long note truncated no tooltip.

## P2 — Auth / invite / gift / subscription / marketing

- `AuthScreen`: post-success lock (must find Back link); Turnstile-blocked = permanently dead form; username silently stripped (`Nova-Reyes`→`novareyes`); forget-account hover-only; no password show/hide.
- MFA: `"..."` loading, shared flag disables TOTP+passkeys together, no aria-live; factor fetch no error path; Remove one-click no confirm, allowed on last factor (lockout risk); manual key no copy button.
- `NewPasswordForm` stuck after success; `PlatformBanScreen` dead end (no appeal/expiry/support; VPN copy with no appeal path).
- Gift: no `/gift` index; plan hardcoded `aero`; code stored pre-payment (close mid-checkout = unpaid code, no resume); invalid code renders blank; pending no spinner/retry; no Escape.
- Subscription: UA-regex mobile block no alternative; `z-50` vs `GiftModal z-[95]` ordering; plan hardcoded; spinner unlabeled.
- Marketing: hardcoded dark bypassing tokens; hero overflows 320px; `grid-cols-2 divide-x` misaligned mobile; nav `hidden sm:flex` with no hamburger = zero mobile nav links.

## Proposed patch order (incremental, one surface each)

1. Overlay z-scale + portal ContextMenu + missing Escape/focus-return/scroll-lock (no visual change, unblocks restyle).
2. Overlay theming tokens (kill `bg-[#111214]`/`#1e1f22` hardcodes, scrim token, status tokens).
3. `modal-pop`/`overlay-fade` wired everywhere + reduced-motion guards.
4. ServerSettings mobile nav + ChannelSettings min-width (quick responsive wins).
5. Chat send rollback + edit-mode guards + picker validation.
6. Chat scroll: throttle, top-anchor restore, divider + typing-space fixes.
7. Message rendering: grouping rules, reply fallback, action-bar focus-within, skeleton aspect, preview cache.
8. Live indicators: typing exit + coalesce, reaction card positioning/z.
9. Voice UI states: speaking/remote-mute wiring (display only), joining/loading/error/empty, tile narrow fix, leave-dupe + timer unify.
10. Social/nav hover-only reveals + empty states + badge caps.
11. Auth papercuts (password toggle, username notice, Turnstile dead-form, MFA confirm/copy).
12. Gift/subscription/marketing contrast + mobile nav + invalid-code states.
13. Theme/skin contrast sweep (`brand-foreground`, white/black alphas) per smoke matrix.
14. **Animation pass (after all above):** micro-interactions → layout transitions → chat playfulness; polished intensity; reduced-motion + settings toggle.
