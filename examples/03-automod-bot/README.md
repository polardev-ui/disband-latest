# 03 — Auto-mod Bot

Deletes messages that match a configurable ban list (words + regex), posts a
mod-log entry, tracks per-user warning counts, and supports a dry-run mode so
you can tune rules without deleting anything.

## What you'll learn

- How to delete messages with `message.delete()` and the `messages.delete` scope
- How to read member roles and cache lookups
- How to normalise text to defeat evasion tricks
- Why dry-run and false-positive handling matter
- How to keep moderation actions in an audit trail

## Scopes required

- `messages.read` — receive message events
- `messages.write` — post notices and mod-log entries
- `messages.delete` — delete offending messages
- `members.read` — resolve immune roles

The bot also needs a role with **Manage Messages** in the space to delete other
people's messages (its own messages can always be deleted).

## Step-by-step setup

### 1. Create the bot

Disband → Settings → Bots → New bot. Name it `Auto-mod Bot`. Tick the four
scopes above. Copy the token.

### 2. Invite it

Settings → Bots → Invite → pick a space → copy link → owner approves. Make sure
the bot's role has Manage Messages.

### 3. Install the SDK

```bash
cd examples/03-automod-bot/js && npm install
# or
cd examples/03-automod-bot/python && pip install disband-bot
```

### 4. Paste your token

Replace `PASTE_YOUR_BOT_TOKEN_HERE` in `js/index.js` / `python/main.py`, or set
`DISBAND_BOT_TOKEN`. Set `AUTOMOD_DATA_DIR` to change where config is stored.

### 5. Run

```bash
cd examples/03-automod-bot/js && npm start
# or
cd examples/03-automod-bot/python && python main.py
```

### 6. Configure (in the space)

```
!automod status
!automod addword scam
!automod addregex \bfree\s+nitro\b
!automod whitelist #general
!automod immune @Moderator
!automod log #mod-log
!automod dryrun on        # test without deleting
!warnings @someone
```

## Command reference

| Command | Description |
|---|---|
| `!automod status` | Show current config |
| `!automod addword <word>` | Add a banned word |
| `!automod removeword <word>` | Remove a banned word |
| `!automod addregex <pattern>` | Add a banned regex |
| `!automod removeregex <pattern>` | Remove a banned regex |
| `!automod list` | List all rules |
| `!automod whitelist #channel` | Exempt a channel |
| `!automod unwhitelist #channel` | Remove exemption |
| `!automod immune <roleId>` | Exempt a role |
| `!automod unimmune <roleId>` | Remove exemption |
| `!automod log #mod-log` | Set the mod-log channel |
| `!automod dryrun on\|off` | Toggle dry-run |
| `!warnings [@user]` | Show warning counts |
| `!clearwarnings [@user]` | Reset warnings |

## Code walkthrough

- **`normalise`** — lowercases, strips zero-width characters (`\u200B` etc.),
  and collapses whitespace. Evaders use these tricks; normalise defeats them.
- **`matches`** — checks banned words (substring) and banned regex (full
  pattern). Invalid regex is logged, not crashed on.
- **`getMembers` + cache** — `listMembers` is cached for 60s per space. Calling
  it on every message would burn the rate limit.
- **`isImmune`** — resolves the sender's roles and checks against
  `immuneRoles`. Fails **open** (does not delete) if the lookup fails, so a
  transient API error cannot mass-delete.
- **`moderate`** — the core flow: whitelist check → immunity check → match →
  (dry-run log | delete + warn + notice).
- **Dry run** — logs what *would* be deleted to the mod-log without deleting.
  Tune rules on real traffic first.
- **Warning counts** — persisted per user, incremented atomically. At
  `maxWarnings` (default 5) a human-review escalation is logged. **The bot never
  bans or kicks** — that decision belongs to a human.
- **Mod-log** — every action is posted to the configured channel for review.

## The false-positive lesson

In production, five real users were nearly banned for *discussing* abuse ("they
have a child porn channel", "sites on the dark web often advertise child
pornography", etc.). Consequences baked into this template:

- Text never triggers a ban or kick — only message deletion.
- Dry-run mode exists so you can measure false positives before going live.
- Always read the mod-log sample before enabling deletion.

## Customising

- Add a `!automod test <text>` command that runs `matches` without deleting.
- Add per-channel rule overrides.
- Add a "warn only" mode (no deletion) for new rules.
- Replace the JSON store with a database for multi-instance deployments.

## Production deployment

Same as the Utility Bot. Persist `AUTOMOD_DATA_DIR`. Back up config and
warning counts. Review the mod-log weekly.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Messages not deleted | Bot lacks Manage Messages role | Give the bot a role with Manage Messages |
| `403` on delete | Missing `messages.delete` scope | Add scope, re-invite |
| False positives | Rules too broad | Use `dryrun on`, review mod-log, refine regex |
| Immune users still filtered | Role id wrong | Use the numeric role id from space settings |
| Cache stale after role change | 60s TTL | Wait or restart the bot |

## Security checklist

- [ ] Token in env var, not committed
- [ ] `messages.delete` is a powerful scope — grant carefully
- [ ] Bot role is above the roles it should not filter
- [ ] Mod-log channel is private to moderators
- [ ] Review rules before enabling (not just dry-run)
- [ ] Never auto-ban from text alone

## Advanced: slash commands and buttons

See the Utility Bot README. Auto-mod config is a good candidate for a `/automod`
slash command with subcommands and a button to confirm bulk actions.

## Next steps

- Add a web dashboard for rule management
- Add per-user exemptions beyond roles
- Integrate with a profanity filter library
- Add scheduled rule expiry
