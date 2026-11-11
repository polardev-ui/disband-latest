# 01 — Utility Bot

A complete starter bot that teaches the patterns every real bot needs: command
routing, cooldowns, permissions, logging, long-message chunking, graceful
shutdown, and defensive access to API objects.

## What you'll learn

- How a Disband bot connects (token → `GET /api/bot/me` → gateway poll loop)
- How to route commands with a registry so `!help` never drifts from dispatch
- How to guard against bot loops, spam, and missing scopes
- How to chunk long output and shut down cleanly

## Scopes required

- `messages.read` — receive message events
- `messages.write` — post replies
- `members.read` — `!members`, `!serverinfo`
- `channels.read` — `!channels`, `!serverinfo`

## Step-by-step setup

### 1. Create the bot

1. Open Disband → **Settings → Bots** → click **New bot**.
2. Name it `Utility Bot`.
3. Tick the scopes above.
4. Click **Create**. **Copy the token now** — Disband shows it only once.

### 2. Invite it to a space

1. In **Settings → Bots**, click **Invite** on your bot.
2. Pick the space you want to test in.
3. Copy the invite link and send it to the space owner (or open it yourself if
   you own the space). The owner approves the scopes.

### 3. Install the SDK

JavaScript:

```bash
cd examples/01-utility-bot/js
npm install
```

Python:

```bash
cd examples/01-utility-bot/python
pip install disband-bot
# or, from this repo:
pip install -e ../../../packages/disband-bot-python
```

### 4. Paste your token

Open `js/index.js` or `python/main.py` and replace `PASTE_YOUR_BOT_TOKEN_HERE`
in the marked block, **or** (recommended) set the environment variable:

```bash
export DISBAND_BOT_TOKEN="your-token-here"
```

A `.env.example` file is included; copy it to `.env` if you use a loader.

### 5. Run

```bash
# JavaScript
npm start

# Python
python main.py
```

You should see `Connected as Utility Bot (...)`. Type `!help` in the space.

## Command reference

| Command | Description |
|---|---|
| `!help` | List every command |
| `!ping` | Latency check (round-trip time) |
| `!uptime` | How long the process has been running |
| `!whoami` | Show sender + bot identity + IDs |
| `!serverinfo` | Member/channel counts |
| `!members` | List up to 25 members |
| `!channels [text\|voice]` | List channels, optional filter |
| `!echo <text>` | Repeat text back |

## Code walkthrough

- **Config block** — prefix, cooldown, max message length, log level. Change
  `prefix` to make the bot respond to `?` or `/` instead.
- **Logger** — levelled (`debug/info/warn/error`), honours `LOG_LEVEL`. Use
  `debug` while developing.
- **`formatDuration` / `chunkText` / `sendLong`** — helpers reused by every
  other template. `chunkText` prefers cutting at newlines, then spaces, then
  hard-cuts, so output stays readable.
- **`checkCooldown`** — per-user per-command timer. Prevents one person from
  burning the bot's rate limit. Keyed by `${userId}:${commandName}`.
- **`defineCommand`** — stores both the handler and the metadata (`description`,
  `usage`). `!help` sorts and prints them, so adding a command automatically
  updates help.
- **`messageCreate` handler** — guards `author.is_bot`, checks the prefix,
  parses args, looks up the command, applies cooldown, runs it. The whole thing
  is wrapped in try/catch so one bad command never kills the gateway loop.
- **Graceful shutdown** — `SIGINT`/`SIGTERM` set `_stopped`, the gateway loop
  exits, and the process exits. No half-open polls.

## Customising

- Add a command: call `defineCommand({ name, description, usage, run })`. It
  appears in `!help` automatically.
- Change the prefix: edit `CONFIG.prefix`.
- Add permission checks: inside a command, inspect `client.user.scopes` or the
  member's roles from `client.listMembers`.

## Production deployment

```bash
# PM2
npm install -g pm2
pm2 start index.js --name disband-utility
pm2 save && pm2 startup

# systemd (Linux)
# Create /etc/systemd/system/disband-utility.service with ExecStart=/usr/bin/node /path/to/index.js
# then: systemctl enable --now disband-utility

# Docker
# FROM node:20-alpine
# WORKDIR /app
# COPY . .
# RUN npm ci --omit=dev
# CMD ["node", "index.js"]
```

Always set `DISBAND_BOT_TOKEN` via the host's secret manager, never commit it.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `No bot token` on start | Token block not filled | Paste token or set env var |
| `401` / "Invalid bot token" | Token revoked or wrong | Reset token in Settings → Bots |
| Commands do nothing | Bot lacks `messages.read` scope | Add scope, re-invite |
| `403` on `!members` | Missing `members.read` scope | Add scope, re-invite |
| Bot replies to itself | Missing `author.is_bot` guard | Keep the guard in place |
| Messages truncated | Over the 2000-char limit | `sendLong` chunks automatically |

## Security checklist

- [ ] Token is in an env var, not committed
- [ ] `.env` is in `.gitignore`
- [ ] Scopes are the minimum needed
- [ ] Bot role is below moderator roles
- [ ] Logs do not print tokens

## Advanced: slash commands and buttons

The SDK covers message events. Slash commands (`/ping`) and buttons use the raw
gateway. Register commands once with `PUT /commands`, then handle
`interactionCreate` events and answer with `POST /interactions/{id}/callback`.
See the docs page and the "Slash Commands, Interactions and Buttons" section.

## Next steps

- Add a database (SQLite/Postgres) instead of in-memory state
- Add per-guild config with a JSON file (see the Notes bot template)
- Port a command to slash commands for a better UX
