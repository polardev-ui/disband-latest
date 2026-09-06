# Disband Bot Library — Dev Handoff Guide

Everything you need to (1) publish the official bot libraries, (2) make sure the
server side is in place so bots work in production, and (3) hand end-users docs
so they can create, invite, and host their own bots.

Disband's bot model is **self-hosted**: Disband never runs your bot's code. You
create a bot identity in the app, an owner invites it to a server, and then *you*
run the bot anywhere (a VPS, Docker, a cloud function, your laptop). Disband
relays messages to and from over HTTPS.

---

## 1. Repository layout

Everything bot-related lives in this repo:

| Path | What it is |
|---|---|
| `packages/bot/` | Official **JavaScript** client, package `@disband/bot` (v0.1.0, Node ≥ 18, ESM, MIT, zero deps). |
| `packages/disband-bot-python/` | Official **Python** client, package `disband-bot` (v0.1.0, Py ≥ 3.9, stdlib only, MIT). |
| `supabase/migrations/0044_bots.sql` | The entire server-side bot platform: tables, RLS, and every SECURITY DEFINER function plus the event dispatcher. |
| `src/app/api/v1/` | The bot HTTP API (gateway + messages, channels, members, servers). |
| `src/app/api/bot/` | The user-facing bot management API (create, revoke, list, invites). |
| `src/lib/bot-auth.ts` | Token hashing + `authenticateBot()` used by every API route. |
| `src/app/docs/bots/page.tsx` | In-app docs page (`/docs/bots`) — already published and accurate. |
| `BOT_SETUP.md` | Quick-start for a single user hosting a bot. |

**Client libraries** call the **v1 HTTP API**, which talks to the **database**.
All three tiers ships from this repo.

---

## 2. Publish the JavaScript client (`@disband/bot`)

The package is already publish-ready: `main`, `types`, `exports`, and `files`
are set, it has zero runtime deps, and `npm pack` output is clean.

### Steps

```bash
# 1. From the package directory
cd packages/bot

# 2. Make sure the repo's test/build pass (package has no build step — src is shipped directly)
npm ci 2>/dev/null || true

# 3. Preview exactly what will be published
npm pack --dry-run

# 4. Log in with an npm account that owns the @disband scope
npm login

# 5. Publish
npm publish --access public
```

### Notes

- **`@disband` scope**: `npm publish` fails unless your npm account is a member
  of (or owns) the `@disband` npm organization. Create the org / add the account
  first — it's a one-time thing.
- **Versioning**: bump `version` in `packages/bot/package.json` before each
  release (`npm version patch` is fine). Keep it in lockstep with the README and
  the `/docs/bots` page.
- **Verify after publish**:
  ```bash
  mkdir -p /tmp/bot-test && cd /tmp/bot-test
  npm init -y >/dev/null
  npm install @disband/bot
  node -e "import('@disband/bot').then(m => console.log('ok', typeof m.Client))"
  ```

### Todo for the dev

- [ ] `npm pack --dry-run` shows `index.js`, `index.d.ts`, `src/` only.
- [ ] `@disband` scope owned; `npm login` succeeds.
- [ ] `npm publish --access public` pushes v0.1.x.
- [ ] Fresh `npm install @disband/bot` works from a clean dir.

---

## 3. Publish the Python client (`disband-bot`)

The package is a plain setuptools build with zero runtime deps (threading +
urllib). There is no compiled code.

### Steps

```bash
# 1. From the package directory
cd packages/disband-bot-python

# 2. Install the build tooling once
python3 -m pip install --upgrade build twine

# 3. Build sdist + wheel
rm -rf dist
python3 -m build

# 4. Verify the artifacts
twine check dist/*

# 5. Upload to PyPI (use a scoped token; it needs the `disband-bot` name)
twine upload dist/*
```

### Notes

- **PyPI name**: `pyproject.toml` declares `name = "disband-bot"` with the import
  package `disband_bot`. **Check availability first** — if `disband-bot` is
  already taken on PyPI, reserve the name / your org account and, if forced to
  rename, update `name` in `pyproject.toml` AND the README pip install lines AND
  the `/docs/bots` page together (imports stay `disband_bot`).
- The README is auto-attached to the PyPI page via `readme = "README.md"`.
- **Mark release/version**: bump `version` in `pyproject.toml`.

### Verify after publish

```bash
python3 -m venv /tmp/bot-py && . /tmp/bot-py/bin/activate
pip install disband-bot
python3 -c "from disband_bot import Client; print('ok', Client)"
```

### Todo for the dev

- [ ] `disband-bot` name reserved/owned on PyPI.
- [ ] `python3 -m build` produces `dist/disband_bot-0.1.0*` artifacts.
- [ ] `twine upload` pushes to PyPI.
- [ ] Fresh `pip install disband-bot` works in a clean venv.

---

## 4. Server side — what has to be in place for bots to work

Bots are *already wired into this repo's app*; the only things that must be true
in any production deployment are (a) the DB migration, (b) the routes deployed,
and (c) the host supporting the long-polling gateway route.

### 4a. Database

`supabase/migrations/0044_bots.sql` creates the whole platform. Apply it to any
environment where bots should work:

```bash
supabase link --project-ref <ref>   # if not already linked
supabase db push
```

What it sets up (all SECURITY DEFINER, `service_role`-only — bots never receive
DB credentials):

- **Tables**: `bots`, `bot_grants`, `bot_invites`, `bot_events`.
- **Invites**: `bot_create_invite`, `bot_approve_invite`, `bot_decline_invite`,
  `bot_invite_info` — invite codes are 32-hex, expire after **7 days**, only a
  server **owner** can approve, and joining is `on conflict do nothing` (bots can
  be re-invited safely).
- **Acting as a bot**: `bot_send_message`, `bot_list_messages`,
  `bot_list_channels`, `bot_list_members`, `bot_leave_server`, and channel
  management `bot_create_channel`, `bot_rename_channel`, `bot_delete_channel`.
  All of them enforce membership + the intersection of the bot's `scopes` and the
  server's `bot_grants`, plus the same rules humans are bound by
  (`@everyone` needs `mention_everyone` role permission, read-only channels, 4000
  char limit).
- **Event dispatch**: triggers on `messages` (insert/update/delete) call
  `bot_events_dispatch()`, which queues `messageCreate` / `messageUpdate` /
  `messageDelete` JSON rows into `bot_events` — but **only** for bots that are
  members of the server, not revoked, and granted `messages.read` there.

Also verify RLS and grants made it through (the migration ends with the grant
statements).

### 4b. The HTTP API (already in `src/app`)

Two route groups:

- **`/api/v1/*`** — called by the client libraries with `Authorization: Bot <token>`:
  `gateway`, `channels/[id]/messages`, `channels/[id]`, `servers/[id]/members`,
  `servers/[id]/channels`, `servers/[id]/leave`, `bots/[botId]/invites`.
- **`/api/bot/*`** — browser-authenticated app routes powering **Settings → Bots**:
  `register`, `me`, `revoke`, `list`, `invites` (create / `[code]` / approve /
  decline). The invite approval page is `src/app/bot-invite/[code]/page.tsx`.

### 4c. Hosting requirements (important)

The bot API is plain Next.js route handlers, but the **gateway route has
specific needs**. Don't make changes here silently:

- `src/app/api/v1/gateway/route.ts` **long-polls**: it holds a request for up to
  20s (`?timeout=` clamps 1–20s), polling `bot_events` every 1.5s, and marks rows
  `delivered_at` **at fetch time** (at-least-once delivery).
  - It sets `export const maxDuration = 30` and `dynamic = "force-dynamic"`.
  - It must run on a **Node.js runtime** (not Edge).
  - The hosting plan must allow requests to stay open ~30s. If you're on a
    platform that caps function duration (e.g. Vercel serverless free tier cuts
    at 10s with a smaller `maxDuration`), raise the limit or move the gateway to
    a long-running Node process (the 1.5s poll means even a 10s window still
    delivers events; it just uses more requests).
- HTTPS is required in production (tokens travel in headers).
- Everything else (messages, channels, members) is normal request/response.

A handy check that the API is alive from the server's point of view:

```bash
curl -s -i "https://<host>/api/v1/gateway?timeout=1" \
  -H "Authorization: Bot <a-test-token>" | head -20
```

A 200 with `{"events":[]}` (or events) means the whole chain works. A 401 means
auth/token; a 500 means the migration isn't applied or the platform can't hold
the request.

### Todo for the dev

- [ ] `0044_bots.sql` applied to prod (`supabase db push`).
- [ ] Next.js app deployed on a **Node runtime** host that allows ~30s requests.
- [ ] `curl` test above returns 200 on prod.
- [ ] The in-app flow (Settings → Bots → create → invite → approve) works on prod.

---

## 5. End-user docs — "people can host and create their own bots"

This is the content to hand your users (it's already mostly written in
`BOT_SETUP.md` and the `/docs/bots` page — keep all three in sync when you
publish new versions).

### 5.1 Create a bot

1. Log in to Disband → **Settings → Bots** → **New bot**.
2. Name it (max 25 chars) and pick scopes.
3. Copy the token **now** — it looks like `db_bot_...` and is **shown exactly
   once**. Store it as a secret (env var / secret manager). Treat it like a
   password; it is hashed (SHA-256) at rest and can never be recovered.

### 5.2 Invite it to a server

1. **Settings → Bots** → **Invite** next to your bot.
2. Choose the server + the scopes to grant there, generate the invite link.
3. Only that server's **owner** can approve. They open the link and hit
   **Add to server**.
4. Once approved the bot is a regular member; its reach = the scopes you
   created it with **intersected** with the scopes the owner approved.

### 5.3 Install a client

JavaScript:

```bash
npm install @disband/bot
```

Python:

```bash
pip install disband-bot
```

### 5.4 Minimal bot

JavaScript (`bot.mjs`):

```js
import { Client } from "@disband/bot";

const client = new Client({ token: process.env.DISBAND_BOT_TOKEN });

client.on("ready", (me) => console.log(`Logged in as ${me.name}`));

client.on("messageCreate", async (message) => {
  if (message.author?.is_bot) return;          // ignore other bots
  if (message.content === "!ping") await message.reply("pong");
});

await client.connect();
```

```bash
DISBAND_BOT_TOKEN=db_bot_... node bot.mjs
```

Python (`bot.py`):

```python
from disband_bot import Client

client = Client(token=DISBAND_BOT_TOKEN)

@client.on("ready")
def on_ready(me):
    print(f"Logged in as {me['name']}")

@client.on("messageCreate")
def on_message(message):
    if message.author_is_bot:
        return
    if message.content == "!ping":
        message.reply("pong")

client.run()  # connects and blocks forever
```

### 5.5 What the client does under the hood (so YOUR users trust it)

- On connect it reads `GET /api/bot/me` to resolve the bot's id/profile, then
  fires `ready`.
- It loops on `GET /api/v1/gateway?timeout=20`, a long-poll that blocks until an
  event arrives or 20s elapses. Delivery is **at-least-once**; the client
  auto-retries on errors.
- `Message` gives you `id`, `channelId`, `serverId`, `author`, `content`,
  `replyToId`, `mentions`, `attachment`, `createdAt`, `displayId` (+ `is_bot` on
  the author) and a `reply()` helper.

Client methods (both libraries mirror each other):

```js
await client.sendMessage(channelId, "Deploy finished");
await message.reply("pong");
const msgs = await client.listMessages(channelId, { limit: 25 });
const channels = await client.listChannels(serverId);
const members = await client.listMembers(serverId);
const id = await client.createChannel(serverId, "deploys");
await client.renameChannel(id, "deploys-2");
await client.deleteChannel(id);
await client.leaveServer(serverId);
const { invite_url } = await client.createInvite(serverId, ["messages.read", "messages.write"]);
```

### 5.6 Keep it running

The gateway poll must keep running, so a plain `node bot.mjs` only works while
the terminal is open. Suggested hosts:

- **systemd** (Linux VPS) — simplest, auto-restarts, logs to journald.
- **pm2** (`pm2 start bot.mjs --name mybot && pm2 save`) — quick on Node.
- **Docker** — `FROM node:20-alpine` copy `bot.mjs` + run.
- **Cloud functions** (Google Cloud Run / Fly.io / a small droplet) — anything
  that keeps one Node or Python process alive. Free plans that cold-sleep won't
  deliver events while asleep; the client's retry loop catches up on wake.

Security checklist to give users:

- Set `DISBAND_BOT_TOKEN` from a secret store, never commit it.
- Scopes are the *minimum required*; you can't add scopes later without a new
  invite approval.
- Revoke a leaked token instantly from **Settings → Bots** (kills it
  everywhere).
- Bots can never touch the database directly — every action is a scoped API
  call.

### 5.7 Verify

- `ready` fires → token + auth OK.
- `messageCreate` fires for new messages in a server the bot joined → invite
  approval OK.
- Send `!ping` in a channel the bot can see → it replies `pong`.

---

## 6. API reference (for the docs)

All endpoints: `Authorization: Bot <token>`. Errors return JSON with an `error`
field and a 4xx/5xx status.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/gateway?timeout=20` | Long-poll for events; `timeout` clamped 1–20. Returns `{ events: [...] }`. |
| POST | `/api/v1/channels/:id/messages` | Send. Body `{ content, reply_to_id? }`. Returns the created message. |
| GET | `/api/v1/channels/:id/messages` | Read. Query `limit` (≤100), `before` (message id). |
| GET | `/api/v1/servers/:id/channels` | List channels. |
| GET | `/api/v1/servers/:id/members` | List members. |
| POST | `/api/v1/servers/:id/channels` | Create. Body `{ name, type?, category_id? }`. |
| PATCH | `/api/v1/channels/:id` | Rename. Body `{ name }` (lowercased). |
| DELETE | `/api/v1/channels/:id` | Delete channel. |
| POST | `/api/v1/servers/:id/leave` | Bot leaves the server (removes grants too). |
| POST | `/api/v1/bots/:botId/invites` | Generate invite. Body `{ server_id, scopes }`. Returns invite link. |

Message payload shape (documented in `/docs/bots`): `id`, `channel_id`,
`server_id`, `author { id, username, display_name, avatar_url, is_bot }`,
`content`, `reply_to_id`, `mentions`, `attachment_url`, `attachment_type`,
`created_at`, `edited_at`, `display_id`.

Scope reference (labels used in Settings → Bots):

| Scope | Label | Gives |
|---|---|---|
| `messages.read` | Read messages | Message events + read messages/channels. |
| `messages.write` | Post messages | Send and reply. |
| `members.read` | Read members | List server members. |
| `channels.manage` | Manage channels | Create/rename/delete channels (also needs `manage_channels` role in server). |

---

## 7. Limits & safety (already enforced server-side — keep documented)

- Up to **5 bots per account**; bots can be revoked at any time (kills the token).
- Messages up to **4,000 chars**; `@everyone` needs the `mention_everyone` role
  permission.
- Only a server **owner** approves invites; invites expire after **7 days**.
- Bot tokens are **SHA-256 hashed at rest**; raw token never stored or retrievable.
- Bots **never get database credentials** — all actions flow through the scoped
  HTTP API and SECURITY DEFINER functions. `bot_has_server_permission` and
  `is_bot_platform_banned` gate privileged actions (banned owners/bots can't
  post).

---

## 8. Release checklist (one-time + per release)

**One-time:**
- Create/claim the **`@disband`** npm org and the **`disband-bot`** PyPI name.
- `npm login` for the release account; configure a PyPI token (`twine upload`).

**Per release (keep JS & Python in lockstep, same version):**
- [ ] Bump version in `packages/bot/package.json` and `packages/disband-bot-python/pyproject.toml`.
- [ ] `npm pack --dry-run` + `npm publish --access public`.
- [ ] `python3 -m build` + `twine check` + `twine upload`.
- [ ] Verify fresh installs (`npm install @disband/bot`, `pip install disband-bot`).
- [ ] Update `BOT_SETUP.md`, `/docs/bots` page, and both package READMEs if API/behavior changed.

**Canary test on prod after release:**
- [ ] Create a throwaway bot in Settings → Bots (token saved).
- [ ] Invite to a test server, approve as owner.
- [ ] Run the `!ping` bot from the *published* package (not from the repo).
- [ ] Send a message in the test server → confirm `pong` + `messageCreate` fires.
- [ ] Confirm a wrong token → 401, and revoke kills the bot's events.