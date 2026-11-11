# 05 — Server Info Bot

Reports rich information about a space: member directory, role breakdown,
channel table, bot list, and a summary card. Teaches aggregation, caching,
pagination, sorting, and formatting for large spaces.

## What you'll learn

- How to aggregate data from `listMembers` and `listChannels`
- How to cache API responses with a TTL to protect rate limits
- How to paginate large result sets
- How to derive role breakdowns from member records
- How to format tables in chat messages

## Scopes required

- `messages.read` — receive message events
- `messages.write` — post replies
- `members.read` — member directory and role breakdown
- `channels.read` — channel table

## Step-by-step setup

### 1. Create the bot

Disband → Settings → Bots → New bot. Name it `Server Info Bot`. Tick the four
scopes above. Copy the token.

### 2. Invite it

Settings → Bots → Invite → pick a space → copy link → owner approves.

### 3. Install the SDK

```bash
cd examples/05-server-info-bot/js && npm install
# or
cd examples/05-server-info-bot/python && pip install disband-bot
```

### 4. Paste your token

Replace `PASTE_YOUR_BOT_TOKEN_HERE` in `js/index.js` / `python/main.py`, or set
`DISBAND_BOT_TOKEN`.

### 5. Run

```bash
cd examples/05-server-info-bot/js && npm start
# or
cd examples/05-server-info-bot/python && python main.py
```

### 6. Try it

```
!info
!members
!members 2
!member kai
!channels
!roles
!bots
!top
!refresh
```

## Command reference

| Command | Description |
|---|---|
| `!info` | Summary card (members, channels, bots) |
| `!members [page]` | Paginated member directory (20/page) |
| `!member <name\|id>` | Look up a member |
| `!channels` | Channel table grouped by type |
| `!roles` | Role breakdown (from member records) |
| `!bots` | List bot accounts |
| `!top` | Top members by role count |
| `!refresh` | Clear cache, reload fresh data |

## Code walkthrough

- **Cache** — `cached(serverId, kind, fetcher)` stores results for 60 seconds.
  `listMembers`/`listChannels` are expensive; caching keeps the bot under rate
  limits. `!refresh` invalidates the cache manually.
- **`loadMembers` / `loadChannels`** — thin wrappers that cache and swallow
  errors, returning `[]` on failure so a missing scope degrades gracefully.
- **`!info`** — aggregates counts: humans vs bots, text vs voice vs categories.
- **`!members`** — sorts by display name, paginates 20 per page, prints a
  "Next:" hint.
- **`!member`** — searches by id or name (exact then partial), shows roles
  and join date.
- **`!channels`** — groups by type, sorts within each group.
- **`!roles`** — counts how many members hold each role id. Note: the bot API
  does not expose role names, so ids are shown; map them in space settings.
- **`!bots`** — filters members where `is_bot` is true.
- **`!top`** — ranks members by number of roles held.
- **Chunking** — every command uses `sendLong` so large spaces never hit the
  message limit.

## Customising

- Change cache TTL: `CONFIG.cacheTtlMs` / `CONFIG["cache_ttl_seconds"]`.
- Change page size: `CONFIG.pageSize` / `CONFIG["page_size"]`.
- Add a `!search <query>` command across members and channels.
- Add a `!stats` command with daily deltas (requires storing snapshots).
- Add CSV export of the member directory.

## Production deployment

Same as the Utility Bot. The cache is in-memory, so multiple instances do not
share state — fine for an info bot. Persist nothing.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Empty member list | Missing `members.read` scope | Add scope, re-invite |
| Empty channel list | Missing `channels.read` scope | Add scope, re-invite |
| Stale data | 60s cache TTL | Run `!refresh` |
| Role ids, not names | API limitation | Map ids in space settings |
| Slow first command | Cold cache fetch | Expected; subsequent calls are cached |

## Security checklist

- [ ] Token in env var, not committed
- [ ] Member directory may be sensitive — restrict the bot to trusted spaces
- [ ] Do not expose member data in public channels
- [ ] Cache does not store tokens or secrets

## Advanced: slash commands and buttons

See the Utility Bot README. `!members` is a great candidate for a paginated
interaction with "Next"/"Prev" buttons that update the same message.

## Next steps

- Add a web dashboard pulling the same data
- Add scheduled reports (daily member growth)
- Add integration with a database for historical stats
- Add export to CSV/JSON
