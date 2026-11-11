# 04 — Channel Manager Bot

Creates, lists, renames, and deletes channels from chat, with name-or-id
resolution, protected-channel safeguards, and expiring confirmation tokens for
destructive deletes.

## What you'll learn

- How to use `createChannel`, `listChannels`, `renameChannel`, `deleteChannel`
- How to resolve a channel by name or id
- How to gate destructive actions behind a confirmation code
- How to handle 403/404 errors gracefully
- How to keep an audit log of admin actions

## Scopes required

- `messages.read` — receive message events
- `messages.write` — post replies and confirmations
- `channels.read` — list and resolve channels
- `channels.manage` — create, rename, delete

The bot also needs a role with **Manage Channels** in the space.

## Step-by-step setup

### 1. Create the bot

Disband → Settings → Bots → New bot. Name it `Channel Manager Bot`. Tick the
four scopes above. Copy the token.

### 2. Invite it

Settings → Bots → Invite → pick a space → copy link → owner approves. Give the
bot a role with Manage Channels, positioned above the channels it manages.

### 3. Install the SDK

```bash
cd examples/04-channel-manager-bot/js && npm install
# or
cd examples/04-channel-manager-bot/python && pip install disband-bot
```

### 4. Paste your token

Replace `PASTE_YOUR_BOT_TOKEN_HERE` in `js/index.js` / `python/main.py`, or set
`DISBAND_BOT_TOKEN`. Set `PROTECTED_CHANNELS` to a comma-separated list of
channel ids or names that must never be touched.

### 5. Run

```bash
cd examples/04-channel-manager-bot/js && npm start
# or
cd examples/04-channel-manager-bot/python && python main.py
```

### 6. Try it

```
!channel list
!channel list voice
!channel info general
!channel create meeting-room
!channel create voice-lounge --voice
!channel create secret --category 1234567890
!channel rename meeting-room standup
!channel delete standup          (prints a confirmation code)
!channel confirm a1b2c3          (actually deletes)
!channel bulk-create sprint 3
```

## Command reference

| Command | Description |
|---|---|
| `!channel list [text\|voice]` | List channels, optional filter |
| `!channel info <name\|id>` | Show channel details |
| `!channel create <name> [--voice] [--category <id>]` | Create a channel |
| `!channel rename <name\|id> <new name>` | Rename a channel |
| `!channel delete <name\|id>` | Request deletion (prints code) |
| `!channel confirm <code>` | Confirm a pending deletion |
| `!channel bulk-create <prefix> <count>` | Create N channels |

## Code walkthrough

- **`resolveChannel`** — tries exact id match, then exact name, then partial
  name. Humans type names; scripts type ids. Both work.
- **`isProtected`** — refuses to touch `general`, `announcements`, `rules`, and
  anything in `PROTECTED_CHANNELS`. The owner configures the list.
- **`requestDelete` / `confirmDelete`** — deletion issues a 6-digit code that
  expires in 60 seconds. The code is consumed on first use, so it cannot be
  replayed. This prevents a typo or a malicious user from deleting a channel
  with one command.
- **`bulkCreate`** — caps at 10 channels per invocation to avoid rate-limit
  storms. Each creation is audited individually.
- **`audit`** — every create/rename/delete is appended to an audit log (capped
  at 200 entries) with timestamp, user, and detail.
- **Error handling** — 403 (missing role) and 404 (unknown channel) are caught
  and turned into readable replies instead of crashes.

## Customising

- Add `--private` to create channels with restricted permissions (requires
  `roles.manage` and channel permission overrides).
- Add a `!channel archive` command that renames to `archived-<name>`.
- Add per-channel rate limiting.
- Store the audit log in a database instead of JSON.

## Production deployment

Same as the Utility Bot. Persist `CHANNELBOT_DATA_DIR`. The audit log is the
only durable state; back it up.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Could not create channel: 403` | Bot lacks Manage Channels role | Give the bot a role with Manage Channels |
| `No channel matching X` | Typo or wrong space | Check spelling; channels are per-space |
| Delete code expired | Took longer than 60s | Run `!channel delete` again |
| Protected channel refused | Name in protected list | Remove from `PROTECTED_CHANNELS` if intended |
| Bulk create partial failure | Rate limit | Reduce count; the bot retries nothing |

## Security checklist

- [ ] Token in env var, not committed
- [ ] `channels.manage` is powerful — grant carefully
- [ ] Bot role is above the channels it manages
- [ ] Protected list covers `#general`, `#announcements`, `#rules`
- [ ] Audit log is reviewed periodically
- [ ] Confirmation codes are short-lived (60s)

## Advanced: slash commands and buttons

Channel creation is a great candidate for a `/channel` slash command with
subcommands and an option for `name`. Use buttons for the delete confirmation
instead of a code.

## Next steps

- Add category management
- Add channel permission overrides (with `roles.manage`)
- Add a web dashboard for bulk operations
- Add scheduled channel cleanup (archive inactive channels)
