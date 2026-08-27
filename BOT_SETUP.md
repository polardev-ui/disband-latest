# Setting up `@disband/bot`

**Goal:** run a self-hosted Disband bot. Disband hosts nothing — you run the bot code yourself, and Disband relays messages to and from it over HTTPS.

**Prerequisites:** Node.js 18+ (or Deno/Bun), network access to `www.disband.dev`, and a Disband account.

## Step 1 — Create the bot in Disband

1. Log into Disband (web or desktop).
2. Open **Settings → Bots** (bottom-left, gear icon).
3. Click **New bot**, give it a name, and pick its scopes:
   - `Read messages` — receives message events + can read channels
   - `Post messages` — sends and replies
   - `Read members` — reads the member list
   - `Manage channels` — create/rename/delete channels
4. Click **Create**. A token is shown **once** — copy it immediately. It looks like `db_bot_...`. Treat it like a password.

## Step 2 — Invite the bot to a server

1. In **Settings → Bots**, click **Invite** next to the bot.
2. Pick the target server and the scopes to grant, then **Generate invite link**.
3. Copy the link and send it to the server's **owner**. Only the owner can approve.
4. The owner opens the link and clicks **Add to server**. The bot now appears in the member list.

## Step 3 — Install the package

The package lives in the repo, not on npm yet:

```bash
npm install /path/to/disband-latest/packages/bot
```

(Or copy `packages/bot/` into your environment and install it from there.)

## Step 4 — Configure the token

Set an environment variable (`.env`, CI secrets, or the host's service manager):

```bash
export DISBAND_BOT_TOKEN="db_bot_<the token from step 1>"
```

## Step 5 — Minimal bot

`bot.mjs`:

```js
import { Client } from "@disband/bot";

const client = new Client({ token: process.env.DISBAND_BOT_TOKEN });

client.on("ready", (me) => {
  console.log(`Logged in as ${me.name}`);
});

client.on("messageCreate", async (message) => {
  if (message.author?.is_bot) return;   // ignore other bots
  if (message.content === "!ping") await message.reply("pong");
});

await client.connect();
```

Run it:

```bash
node bot.mjs
```

## Verify it works

- `ready` fires and prints the bot name → token + auth OK.
- `messageCreate` fires for every new message in a server the bot joined → invite/approval OK.
- Post `!ping` in any channel the bot can see → it should reply `pong`.

## Notes / troubleshooting

- **Token rejected (401):** token was mistyped, the bot was revoked, or it was never created.
- **No messages arriving:** the bot must be a member of the server **and** the server owner must have approved `messages.read`.
- **Gateway:** the client long-polls `GET /api/v1/gateway?timeout=20` and auto-retries on errors; it reconnects on its own.
- **Python alternative:** if you prefer Python, there's an equivalent stdlib-only client at `packages/disband-bot-python` (`pip install ./packages/disband-bot-python`).
- Full API reference: `packages/bot/README.md`, or the in-app docs page at `/docs/bots`.
