# =====================================================================
# 02 — NOTES BOT  (Disband bot template, Python)
# =====================================================================
# Same bot as the JavaScript version. Read the JS file's comments too.
#
# TUTORIAL
# --------
# 1. Create the bot: Disband → Settings → Bots → New bot.
#    Scopes: messages.read, messages.write
#    Copy the token (shown once).
#
# 2. Invite it to a space (Settings → Bots → Invite → copy link → owner approves).
#
# 3. Install: pip install disband-bot
#
# 4. Paste the token below (or set DISBAND_BOT_TOKEN).
#
# 5. Run: python main.py
#
# 6. Try it:
#    !note add Meeting :: Discuss Q4 roadmap
#    !note add TODO :: Buy milk
#    !note list
#    !note show Meeting
#    !note search milk
#    !note delete TODO
#    !note export
#
# WHY EACH PIECE EXISTS
# - Per-space store: notes from space A must never leak into space B.
# - Atomic writes (temp file + os.replace): a crash mid-write cannot corrupt
#   the whole store.
# - Title normalisation: "Meeting" and "meeting" are the same note.
# - Lock around read-modify-write: the gateway thread can fire two events
#   close together; serialising prevents lost updates.
# - Pagination: a space with hundreds of notes must not flood the channel.
# =====================================================================

import json
import os
import signal
import threading
import time
from pathlib import Path

from disband_bot import Client

# ===================== BOT TOKEN (paste here) =====================
BOT_TOKEN = os.environ.get("DISBAND_BOT_TOKEN", "PASTE_YOUR_BOT_TOKEN_HERE")
# ================================================================

CONFIG = {
    "prefix": "!",
    "page_size": 5,
    "max_title_length": 60,
    "max_body_length": 1500,
    "max_notes_per_space": 200,
    "data_dir": os.environ.get("NOTES_DATA_DIR", ".data"),
    "log_level": os.environ.get("LOG_LEVEL", "info"),
}

_LEVELS = {"debug": 10, "info": 20, "warn": 30, "error": 40}


def log(level, *args):
    if _LEVELS[level] < _LEVELS[CONFIG["log_level"]]:
        return
    stamp = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    print(f"[{stamp}] [{level.upper()}]", *args, flush=True)


if not BOT_TOKEN or BOT_TOKEN == "PASTE_YOUR_BOT_TOKEN_HERE":
    log("error", "No bot token. Paste one into BOT_TOKEN or set DISBAND_BOT_TOKEN.")
    raise SystemExit(1)

client = Client(token=BOT_TOKEN)

# ---------------------------------------------------------------- storage

DATA_DIR = Path(CONFIG["data_dir"])
STORE_PATH = DATA_DIR / "notes.json"
# A lock serialises read-modify-write so two near-simultaneous events cannot
# clobber each other.
_store_lock = threading.Lock()


def ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def read_store():
    try:
        with STORE_PATH.open("r", encoding="utf-8") as fh:
            parsed = json.load(fh)
        return parsed if isinstance(parsed, dict) else {}
    except FileNotFoundError:
        return {}
    except (json.JSONDecodeError, OSError) as exc:
        log("warn", "could not read store:", exc)
        return {}


def write_store(store):
    ensure_data_dir()
    tmp = STORE_PATH.with_suffix(STORE_PATH.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(store, fh, indent=2, ensure_ascii=False)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, STORE_PATH)  # atomic on the same filesystem


def mutate_store(mutate):
    # mutate(store) may return a value; it is returned to the caller.
    with _store_lock:
        store = read_store()
        result = mutate(store)
        write_store(store)
        return result


def space_key(server_id):
    return server_id or "dm"


def normalise_title(title):
    return str(title).strip().lower()


# ---------------------------------------------------------------- commands

COMMANDS = {}


def command(name, description, usage):
    def register(fn):
        COMMANDS[name] = {
            "name": name,
            "description": description,
            "usage": usage,
            "run": fn,
        }
        return fn

    return register


@command("note", "Manage per-space notes.", "!note <add|list|show|search|delete|export> ...")
def cmd_note(message, args):
    sub = (args[0] if args else "").lower()
    rest = args[1:]
    if sub == "add":
        return add_note(message, rest)
    if sub == "list":
        return list_notes(message, rest)
    if sub == "show":
        return show_note(message, rest)
    if sub == "search":
        return search_notes(message, rest)
    if sub in ("delete", "rm"):
        return delete_note(message, rest)
    if sub == "export":
        return export_notes(message)
    message.reply(
        "Usage:\n"
        "`!note add <title> :: <body>`\n"
        "`!note list [page]`\n"
        "`!note show <title>`\n"
        "`!note search <query>`\n"
        "`!note delete <title>`\n"
        "`!note export`"
    )


def add_note(message, args):
    joined = " ".join(args)
    sep = " :: "
    idx = joined.find(sep)
    if idx == -1:
        message.reply("Format: `!note add <title> :: <body>`")
        return
    title = joined[:idx].strip()
    body = joined[idx + len(sep):].strip()
    if not title or not body:
        message.reply("Both title and body are required.")
        return
    if len(title) > CONFIG["max_title_length"]:
        message.reply(f"Title is too long (max {CONFIG['max_title_length']} chars).")
        return
    if len(body) > CONFIG["max_body_length"]:
        message.reply(f"Body is too long (max {CONFIG['max_body_length']} chars).")
        return

    key = normalise_title(title)
    author = (message.author or {}).get("username") or (message.author or {}).get("name") or "unknown"

    def mutate(store):
        space = store.setdefault(space_key(message.server_id), {})
        if len(space) >= CONFIG["max_notes_per_space"]:
            return {"ok": False, "reason": f"This space already has {CONFIG['max_notes_per_space']} notes. Delete some first."}
        existing = space.get(key)
        space[key] = {
            "title": title,
            "body": body,
            "author": author,
            "createdAt": (existing or {}).get("createdAt") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        return {"ok": True, "updated": bool(existing)}

    result = mutate_store(mutate)
    if not result["ok"]:
        message.reply(result["reason"])
        return
    verb = "Updated" if result["updated"] else "Saved"
    message.reply(f"{verb} note **{title}**.")


def list_notes(message, args):
    try:
        page = max(1, int(args[0])) if args else 1
    except (ValueError, TypeError):
        page = 1
    store = read_store()
    space = store.get(space_key(message.server_id), {})
    entries = sorted(space.values(), key=lambda n: n.get("title", ""))
    if not entries:
        message.reply("No notes yet. Add one with `!note add <title> :: <body>`.")
        return
    total_pages = (len(entries) + CONFIG["page_size"] - 1) // CONFIG["page_size"]
    page = min(page, total_pages)
    start = (page - 1) * CONFIG["page_size"]
    slice_ = entries[start:start + CONFIG["page_size"]]
    lines = []
    for i, n in enumerate(slice_):
        body = n.get("body", "")
        preview = body if len(body) <= 60 else body[:57] + "…"
        lines.append(f"{start + i + 1}. **{n.get('title')}** — {preview}")
    extra = f"\n\nNext: `!note list {page + 1}`" if page < total_pages else ""
    message.reply(
        f"**Notes ({len(entries)}) — page {page}/{total_pages}**\n" + "\n".join(lines) + extra
    )


def show_note(message, args):
    title = " ".join(args).strip()
    if not title:
        message.reply("Usage: `!note show <title>`")
        return
    store = read_store()
    space = store.get(space_key(message.server_id), {})
    note = space.get(normalise_title(title))
    if not note:
        message.reply(f"No note titled **{title}**. Try `!note search {title}`.")
        return
    message.reply(
        "\n".join(
            [
                f"**{note.get('title')}**",
                f"by {note.get('author', 'unknown')} · updated {note.get('updatedAt', '?')}",
                "",
                note.get("body", ""),
            ]
        )
    )


def search_notes(message, args):
    query = " ".join(args).strip().lower()
    if not query:
        message.reply("Usage: `!note search <query>`")
        return
    store = read_store()
    space = store.get(space_key(message.server_id), {})
    hits = [
        n for n in space.values()
        if query in (n.get("title", "").lower()) or query in (n.get("body", "").lower())
    ]
    if not hits:
        message.reply(f"No notes matching **{query}**.")
        return
    lines = []
    for n in hits:
        body = n.get("body", "")
        preview = body if len(body) <= 60 else body[:57] + "…"
        lines.append(f"• **{n.get('title')}** — {preview}")
    message.reply(f"**{len(hits)} match(es) for \"{query}\"**\n" + "\n".join(lines))


def delete_note(message, args):
    title = " ".join(args).strip()
    if not title:
        message.reply("Usage: `!note delete <title>`")
        return
    key = normalise_title(title)

    def mutate(store):
        space = store.get(space_key(message.server_id))
        if not space or key not in space:
            return False
        del space[key]
        return True

    removed = mutate_store(mutate)
    message.reply(f"Deleted note **{title}**." if removed else f"No note titled **{title}**.")


def export_notes(message, args=None):
    store = read_store()
    space = store.get(space_key(message.server_id), {})
    entries = list(space.values())
    if not entries:
        message.reply("No notes to export.")
        return
    lines = [f"## {n.get('title')}\n{n.get('body', '')}\n" for n in entries]
    message.reply(f"**Export ({len(entries)} notes)**\n```\n" + "\n".join(lines) + "\n```")


# ---------------------------------------------------------------- events


@client.on("ready")
def on_ready(me):
    log("info", f"Connected as {me['name']} ({me['id']})")
    scopes = ", ".join(me.get("scopes") or []) or "(none)"
    log("info", f"Granted scopes: {scopes}")


@client.on("messageCreate")
def on_message(message):
    try:
        if message.author_is_bot:
            return
        content = message.content or ""
        if not content.startswith(CONFIG["prefix"]):
            return
        without_prefix = content[len(CONFIG["prefix"]):].strip()
        if not without_prefix:
            return
        parts = without_prefix.split()
        name, args = parts[0].lower(), parts[1:]
        if name != "note":
            return
        log("info", f"{display_name(message.author or {})} ran !note in {message.channel_id}")
        COMMANDS["note"]["run"](message, args)
    except Exception as exc:  # noqa: BLE001 - keep the gateway alive
        log("error", f"messageCreate handler failed: {exc}")
        try:
            message.reply("Something went wrong. Check the bot logs.")
        except Exception as reply_exc:  # noqa: BLE001
            log("error", f"could not send error reply: {reply_exc}")


@client.on("error")
def on_error(error):
    log("error", f"gateway error: {error}")


# ---------------------------------------------------------------- lifecycle


def shutdown(signum, _frame):
    log("info", f"received signal {signum}; closing gateway…")
    client.close()


signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)

if __name__ == "__main__":
    ensure_data_dir()
    client.run()
    log("info", "Notes bot stopped.")
