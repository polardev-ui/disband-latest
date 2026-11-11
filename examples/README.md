# Disband Bot Examples

A collection of **5 ready-to-use bot templates** for [Disband](https://www.disband.dev).
Each example ships in **both JavaScript and Python**, with a detailed tutorial,
developer comments explaining every decision, and a clearly marked place to paste
your bot token.

Bots on Disband are **self-hosted**: you run the code yourself, a server owner
invites the bot, and the bot connects with its token. Disband never hosts or
executes your bot.

## Examples

| # | Name | What it teaches | Scopes needed |
|---|------|-----------------|---------------|
| 01 | [Utility Bot](./01-utility-bot) | Client lifecycle, command registry, cooldowns, chunking, graceful shutdown | messages.read, messages.write, members.read, channels.read |
| 02 | [Notes Bot](./02-notes-bot) | JSON persistence, atomic writes, CRUD, pagination, argument parsing | messages.read, messages.write |
| 03 | [Auto-mod Bot](./03-automod-bot) | Moderation, deletion, logging, caching, dry-run, false positives | messages.read, messages.write, messages.delete, members.read |
| 04 | [Channel Manager Bot](./04-channel-manager-bot) | Channel CRUD, confirmations, name resolution, safeguards | messages.read, messages.write, channels.read, channels.manage |
| 05 | [Server Info Bot](./05-server-info-bot) | Aggregation, caching, pagination, formatting, role breakdown | messages.read, messages.write, members.read, channels.read |

## Quick start (any example)

1. **Create a bot** — Disband → Settings → Bots → **New bot**. Pick a name and the
   scopes from the table above, then **copy the token** (it is shown once).
2. **Invite the bot to a space** — in Settings → Bots click **Invite** on your bot,
   pick a space, copy the invite link, and have the space owner approve it.
3. **Put in your token** — open the example's `js/index.js` or `python/main.py`
   and replace `PASTE_YOUR_BOT_TOKEN_HERE` (or set the `DISBAND_BOT_TOKEN` env var).
4. **Install the SDK** and run:

   JavaScript:
   ```bash
   cd examples/01-utility-bot/js
   npm install
   npm start
   ```

   Python:
   ```bash
   cd examples/01-utility-bot/python
   pip install disband-bot   # or: pip install -e ../../../packages/disband-bot-python
   python main.py
   ```

## SDKs

- JavaScript / TypeScript: `npm install @disband/bot` — see `packages/bot/README.md`
- Python (zero dependencies): `pip install disband-bot` — see `packages/disband-bot-python/README.md`

## Documentation

Full API, scopes, slash commands, interactions and buttons:
<https://docs.disband.dev/docs/bots/>

## A note on interactions (slash commands and buttons)

The two SDKs above focus on message events. Slash commands and buttons use the raw
HTTP gateway (`GET /gateway`, `POST /interactions/{id}/callback`) and are
documented in the docs page. The "Advanced" appendix in each README points you there.
