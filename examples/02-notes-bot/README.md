# 02 — Notes Bot

A per-space notes bot: add, list, show, search, delete, and export notes.
Teaches JSON persistence, atomic writes, CRUD, argument parsing, pagination,
and defending against concurrent gateway events.

## What you'll learn

- How to persist state across restarts with a JSON file
- How to write atomically (temp file + rename) so a crash cannot corrupt data
- How to serialise read-modify-write with a lock
- How to parse commands with a ` :: ` separator so titles can contain spaces
- How to paginate large result sets

## Scopes required

- `messages.read` — receive message events
- `messages.write` — post replies

No other scopes are needed; this bot only talks to channels it can see.

## Step-by-step setup

### 1. Create the bot

Disband → **Settings → Bots** → **New bot**. Name it `Notes Bot`. Tick
`messages.read` and `messages.write`. Copy the token (shown once).

### 2. Invite it

Settings → Bots → Invite → pick a space → copy link → owner approves.

### 3. Install the SDK

```bash
cd examples/02-notes-bot/js && npm install
# or
cd examples/02-notes-bot/python && pip install disband-bot
```

### 4. Paste your token

Replace `PASTE_YOUR_BOT_TOKEN_HERE` in `js/index.js` / `python/main.py`, or set
`DISBAND_BOT_TOKEN`. Set `NOTES_DATA_DIR` to change where notes are stored.

### 5. Run

```bash
cd examples/02-notes-bot/js && npm start
# or
cd examples/02-notes-bot/python && python main.py
```

### 6. Try it

```
!note add Meeting :: Discuss Q4 roadmap
!note add TODO :: Buy milk
!note list
!note show Meeting
!note search milk
!note delete TODO
!note export
```

## Command reference

| Command | Description |
|---|---|
| `!note add <title> :: <body>` | Create or update a note |
| `!note list [page]` | List notes (5 per page) |
| `!note show <title>` | Show a note's full body |
| `!note search <query>` | Search titles and bodies |
| `!note delete <title>` | Delete a note |
| `!note export` | Dump every note in this space |

## Code walkthrough

- **`readStore` / `writeStore`** — load/save the JSON file. `writeStore` writes
  to a `.tmp` file in the same directory, then `rename()`s it into place.
  `rename()` is atomic on the same filesystem, so a crash mid-write cannot
  corrupt `notes.json`.
- **`mutateStore`** — read-modify-write under a lock (JS promise chain /
  Python `threading.Lock`). Two `!note add` events arriving 10ms apart can no
  longer clobber each other.
- **`spaceKey`** — notes are namespaced by space id (or `"dm"`). Space A can
  never read space B's notes.
- **`normaliseTitle`** — titles are matched case-insensitively but display keeps
  the original casing, so `Meeting` and `meeting` are the same note.
- **`addNote`** — splits on ` :: ` so titles can contain spaces. Validates
  lengths and enforces a per-space cap (`maxNotesPerSpace`).
- **`listNotes`** — sorts by title, paginates, prints a "Next:" hint.
- **`searchNotes`** — case-insensitive substring match on title and body.
- **Atomic writes + fsync** (Python) — flushes to disk before renaming, so a
  power loss after `rename` has the complete file.

## Customising

- Change page size: `CONFIG.pageSize` / `CONFIG["page_size"]`.
- Store notes in SQLite: replace `readStore`/`writeStore`/`mutateStore` with
  SQL queries; the command handlers do not change.
- Add tags or attachments: extend the note object; old notes still load because
  handlers use `.get()` with defaults.
- Add a `!note edit` command that re-opens the body in a follow-up message.

## Production deployment

Same as the Utility Bot: PM2 / systemd / Docker. Mount a persistent volume for
`NOTES_DATA_DIR` so notes survive container restarts. Back up `notes.json`
regularly — it is the entire database.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Notes lost after restart | Data dir not persisted | Set `NOTES_DATA_DIR` to a mounted volume |
| `No note titled X` | Whitespace/casing mismatch | `normaliseTitle` trims and lowercases; check the title |
| Duplicate note on rapid adds | (Fixed) lock serialises writes | Keep `mutateStore` in place |
| Corrupt `notes.json` | Edited by hand | Restore from backup; validate JSON |
| Empty export | No notes in this space | Notes are per-space; check the space |

## Security checklist

- [ ] Notes may contain sensitive data — protect `notes.json` (chmod 600)
- [ ] Back up the data directory
- [ ] Do not log note bodies at `info` level
- [ ] Cap per-space note count to prevent abuse

## Advanced: slash commands and buttons

See the Utility Bot README's "Advanced" section. A notes bot is a great
candidate for a `/note` slash command with a `title` option.

## Next steps

- Migrate to SQLite/Postgres for concurrent writers
- Add full-text search
- Add per-note permissions (only author can edit)
- Add attachments via `message.attachment`
