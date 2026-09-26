# cdn.disband.dev

Everything the app used to fetch from `api.wsgpolar.me`: image and attachment
storage on Cloudflare R2, plus link previews and GIF search.

The Worker keeps the old service's shape on purpose — uploads go to
`POST /v1/images` and return `{ url, key }`, objects are served from
`GET /v1/images/<key>`. An old URL and its new one differ only by hostname, so
migrating the database is a hostname swap and rolling back is the same swap
reversed.

## Endpoints

| Route | What it does |
| --- | --- |
| `POST /v1/images` | Upload. Requires a signed-in user's bearer token. |
| `POST /v1/images/import` | Import by URL (`{ "url": "https://…" }`). Fetches a remote image — a catbox.moe link, a direct PNG — with a browser-style user agent, SSRF-checked on every redirect hop, sniff-verified as the image type it claims, and stored under the same auth, rate-limit, quota, and hash-ban contract as an upload. |
| `GET /v1/images/<key>` | Serve a stored object, with range support for video. |
| `GET /v1/link/preview?url=` | Scrapes Open Graph tags, cached an hour at the edge. |
| `GET /v1/giphy/search?q=&limit=` | GIF search via Klipy, cached six hours. |
| `GET /health` | Liveness. |

Link previews and GIF search moved here so the app talks to one origin it
controls. The old host answered slowly and sometimes 502'd, and every link
posted in chat waited on it.

## Pointing GIF search at Klipy

GIF search runs on [Klipy](https://klipy.com) (a Tenor-style API: app key in
the path, every rendition fully stated). The endpoint path is unchanged, so
turning it on is a secret plus a redeploy, with no client change:

```bash
npx wrangler secret put KLIPY_APP_KEY
```

Get the app key from the Klipy dashboard/onboarding. Until one is set, the
Worker keeps the previous behaviour as a fallback: a Giphy key
(`wrangler secret put GIPHY_API_KEY`) if that exists, otherwise a proxy to the
old host's `/v1/giphy/search`.

One thing to note: Klipy's terms ask for attribution in the UI — the picker's
search placeholder should read "Search KLIPY" and the grid or footer should
carry a small "Powered by KLIPY" mark. That is a client change, not a Worker
one. Once `KLIPY_APP_KEY` is set and nothing is left pointing at `api.wsgpolar.me`,
the old host can be retired.

## Setting it up

### 1. Create the bucket

Cloudflare dashboard → **R2** → **Create bucket**.

- Name: `disband-media`
- Location: Automatic
- Leave **Public access** OFF. The Worker is the only way in, which is what
  lets uploads be authenticated and stops the bucket being listed.

### 2. Point the hostname at the Worker

DNS → add a record for `cdn` on `disband.dev`. Any proxied (orange cloud)
record will do; the Worker route takes precedence. If `disband.dev` is not on
Cloudflare yet, move its nameservers there first.

### 3. Deploy

```bash
cd cloudflare/cdn-worker
npx wrangler login
npx wrangler deploy
```

Then Workers & Pages → `disband-cdn` → **Settings → Domains & Routes** → **Add
custom domain** → `cdn.disband.dev`.

### 4. Set the secrets

```bash
npx wrangler secret put SUPABASE_JWT_SECRET
npx wrangler secret put MIGRATION_SECRET
```

`SUPABASE_JWT_SECRET` is in the Supabase dashboard under **Project Settings →
API → JWT Settings → JWT Secret**. It is what proves an uploader is a real
signed-in user.

`MIGRATION_SECRET` is any long random string you invent — it guards the
one-time ingest endpoint. Generate one with:

```bash
openssl rand -hex 32
```

### 5. Check it answers

```bash
curl https://cdn.disband.dev/health
```

Expect `{"ok":true}`.

## Moving the existing images

1,089 URLs across nine columns point at the old host. The script copies the
objects first and only rewrites the database once you have confirmed they are
all there, so the app is never pointing at files that have not arrived.

Put `MIGRATION_SECRET` in `.env.local` (the same value you gave the Worker),
then:

```bash
node scripts/migrate-media-to-cdn.mjs --copy
node scripts/migrate-media-to-cdn.mjs --verify
node scripts/migrate-media-to-cdn.mjs --rewrite
```

`--copy` changes nothing in the database and can be re-run as often as you
like; objects already in R2 are skipped. `--verify` fetches every new URL and
tells you what is missing. Only `--rewrite` touches the database.

If something looks wrong afterwards:

```bash
node scripts/migrate-media-to-cdn.mjs --rewrite --undo
```

Leave the old host serving for a while after the switch. Anything cached,
embedded, or in an old app build still points at it, and the copy does not
delete anything.

## Limits worth knowing

- **100 MB per upload.** That is the Workers request-body ceiling, not a choice.
  Super's 500 MB allowance cannot go through this path — that needs presigned
  URLs straight to R2, which is a separate piece of work.
- **No image resizing.** The old service may have been doing some; this Worker
  stores what it is given. Cloudflare Images or a `/cdn-cgi/image/` transform
  in front of the bucket would add it back.
- **No rate limiting.** Uploads require a signed-in user, which is the main
  protection. A per-user cap belongs here eventually.
