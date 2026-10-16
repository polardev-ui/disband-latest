# Listening presence (Spotify + SoundCloud)

While a connected user has Disband running, their profile shows a small
"Listening to …" card — artwork, track, artist(s) — live for everyone else.
The track name marquees when it doesn't fit the card.

It works with the app in the background: on desktop the tray keep-alive
(close = hide, quit = tray menu) means the 20-second poll only stops when the
user actually quits.

## How it flows

- The client polls every 20 s while a connection exists
  (`src/contexts/AppContext.tsx`, the music-presence effect) and publishes to
  two places on every *change*:
  - the realtime presence payload (`listening` on `PresencePayload`) — live
    for everyone online, disappears when they go offline;
  - `profiles.listening` (jsonb) — persisted so offline profile views still
    show it, with a 6-hour freshness window (`listeningFor` in
    `src/lib/presence.ts` ignores older rows).
- The UI renders from `listeningFor(profile, listeningMap)`: live presence
  first, persisted row as fallback. Card component:
  `src/components/ui/ListeningCard.tsx`.

## Spotify (direct OAuth)

1. Create an app at https://developer.spotify.com/dashboard.
2. Add the redirect URI **exactly**: `https://www.disband.dev/connect/spotify/callback`.
   Spotify rejects non-HTTPS redirect URIs (localhost included), so the app pins
   `NEXT_PUBLIC_SITE_URL=https://www.disband.dev` and every build — dev and
   desktop too — advertises the production callback.
   Scopes used are read-only: `user-read-currently-playing`,
   `user-read-playback-state`.
3. Environment variables — the web app deploys on **Vercel** (project
   `disband-latest`), so variables live there and in `.env.local`:
   - Build-time (baked into the bundle): `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` —
     set it in Vercel *before* deploying, `.env.local` for local dev.
   - Server-only: `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET`
     (`npx vercel env add SPOTIFY_CLIENT_SECRET production`) — used by
     `src/app/api/music/spotify/token/route.ts`.
   - `NEXT_PUBLIC_SITE_URL=https://www.disband.dev` pins the redirect base on
     every origin (dev, production, desktop).
4. Users: **Settings → Connections → Connect Spotify**. Tokens are held in
   `localStorage` (`disband:spotify-tokens`); Disconnect clears them and the
   profile card, and the poller stops on the next tick.

## SoundCloud (via Last.fm)

SoundCloud has no API that exposes what a user is playing, and the
DOM-scraping approach used by browser extensions (like PreMiD's SoundCloud
activity — whose title-parsing logic is credited and reused in
`parseSoundCloudTitle`, `src/lib/music-presence.ts`) is not available to a
standalone app.

The working transport is Last.fm: SoundCloud can scrobble to Last.fm

> SoundCloud → Settings → Connections → connect Last.fm

and Last.fm's public API reports the currently-playing track.

1. Get a free API key: https://www.last.fm/api/account/create — and set the
   API account's callback URL to `https://www.disband.dev/connect/lastfm/callback`.
   Last.fm allows exactly one callback per account, so local dev falls back to
   typing the username.
2. Environment:
   - `NEXT_PUBLIC_LASTFM_API_KEY` — public by design, ships in every Last.fm
     app's client bundle.
   - `LASTFM_API_SECRET` — server-only; add it on Vercel
     (`npx vercel env add LASTFM_API_SECRET production`). This powers the
     one-click connect.
3. Users: **Settings → Connections → SoundCloud → Connect Last.fm** — one
   click, approve on last.fm, done. Behind it: the client asks
   `POST /api/music/lastfm/token` for an approval URL, the popup returns an
   approved token to `/connect/lastfm/callback`, and
   `POST /api/music/lastfm/session` trades the token for the username. Only
   the username is kept (`disband:lastfm-user:<uid>` in localStorage) — the
   read path never needs the session key. Typing the username manually still
   works as a fallback. Request signatures use the app's own MD5
   (`src/lib/md5.ts`) because Web Crypto has none.

The track appears within a minute of starting playback. Titles arrive raw
("Artist - Title (feat. …)") and go through the same cleanup the browser
extension used, so the card shows the song name and artist(s) properly.

## Model + limits

- `profiles.listening`: `{ source: "spotify" | "lastfm", track, artists,
  artwork, track_url, started_at } | null`. Written only on change, and
  cleared on sign-out, on unmount, and by the poller when the connection is
  removed.
- Presence payload `listening` rides along with status re-tracks, so status
  changes don't drop the card for others.
- After a **full** quit there is no client to poll, so the persisted row goes
  stale and the 6-hour window eventually hides it. Displaying live state
  while Disband is fully closed needs a server-side worker holding refresh
  tokens — follow-up work, deliberately not in this version.
- Spotify tokens live in `localStorage` for now. Moving them to an
  encrypted server table is the same follow-up as the worker.
