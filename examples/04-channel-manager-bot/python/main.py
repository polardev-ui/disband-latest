# =====================================================================
# 04 — CHANNEL MANAGER BOT  (Disband bot template, Python)
# =====================================================================
# Same bot as the JavaScript version. Read the JS file's comments too.
#
# TUTORIAL
# --------
# 1. Create the bot: Disband → Settings → Bots → New bot.
#    Scopes: messages.read, messages.write, channels.read, channels.manage
#    The bot also needs a role with "Manage Channels".
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
#    !channel list
#    !channel list voice
#    !channel info general
#    !channel create meeting-room
#    !channel create voice-lounge --voice
#    !channel create secret --category 1234567890
#    !channel rename meeting-room standup
#    !channel delete standup          (prints a confirmation code)
#    !channel confirm a1b2c3          (actually deletes)
#    !channel bulk-create sprint 3
#
# WHY EACH PIECE EXISTS
# - Confirmation tokens: a typo or a malicious user must not delete a channel
#   with a single command. The code expires in 60 seconds.
# - Name-or-id resolution: humans type names; scripts type ids. Accept both.
# - Protected channels: never let the bot delete channels the owner marked
#   off-limits.
# - Audit log: every destructive action is recorded.
# - Defensive role check: surface 403s as readable messages, not crashes.
# =====================================================================

import json
import os
import random
import signal
import string
import threading
import time
from pathlib import Path

from disband_bot import Client

# ===================== BOT TOKEN (paste here) =====================
BOT_TOKEN = os.environ.get("DISBAND_BOT_TOKEN", "PASTE_YOUR_BOT_TOKEN_HERE")
# ================================================================

CONFIG = {
    "prefix": "!",
    "protected_channels": [c.strip() for c in os.environ.get("PROTECTED_CHANNELS", "").split(",") if c.strip()],
    "confirm_ttl_seconds": 60,
    "bulk_max": 10,
    "data_dir": os.environ.get("CHANNELBOT_DATA_DIR", ".data"),
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
STORE_PATH = DATA_DIR / "channelbot.json"
_store_lock = threading.Lock()


def ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def read_store():
    try:
        with STORE_PATH.open("r", encoding="utf-8") as fh:
            parsed = json.load(fh)
        if isinstance(parsed, dict):
            parsed.setdefault("pending", {})
            parsed.setdefault("audit", [])
            return parsed
        return {"pending": {}, "audit": []}
    except FileNotFoundError:
        return {"pending": {}, "audit": []}
    except (json.JSONDecodeError, OSError) as exc:
        log("warn", "could not read store:", exc)
        return {"pending": {}, "audit": []}


def write_store(store):
    ensure_data_dir()
    tmp = STORE_PATH.with_suffix(STORE_PATH.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(store, fh, indent=2, ensure_ascii=False)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, STORE_PATH)


def mutate_store(mutate):
    with _store_lock:
        store = read_store()
        result = mutate(store)
        write_store(store)
        return result


# ---------------------------------------------------------------- helpers

def generate_code():
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(6))


def resolve_channel(server_id, ref):
    channels = client.list_channels(server_id)
    trimmed = str(ref).strip()
    # Try id first (exact).
    for c in channels:
        if str(c.get("id")) == trimmed or str(c.get("display_id")) == trimmed:
            return c
    # Then name (case-insensitive).
    lower = trimmed.lower()
    for c in channels:
        if str(c.get("name") or "").lower() == lower:
            return c
    # Partial name match as a last resort.
    for c in channels:
        if lower in str(c.get("name") or "").lower():
            return c
    return None


def is_protected(channel):
    cid = str(channel.get("id"))
    name = str(channel.get("name") or "").lower()
    if cid in CONFIG["protected_channels"] or name in CONFIG["protected_channels"]:
        return True
    return name in ("general", "announcements", "rules")


def audit(action, message, detail):
    def mutate(store):
        store.setdefault("audit", [])
        store["audit"].insert(0, {
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "action": action,
            "user": (message.author or {}).get("username") or (message.author or {}).get("id") or "unknown",
            "channel": message.channel_id,
            "server": message.server_id,
            "detail": detail,
        })
        store["audit"] = store["audit"][:200]

    mutate_store(mutate)


# ---------------------------------------------------------------- commands

COMMANDS = {}


def command(name, description, usage):
    def register(fn):
        COMMANDS[name] = {"name": name, "description": description, "usage": usage, "run": fn}
        return fn

    return register


@command("channel", "Manage channels.", "!channel <list|info|create|rename|delete|confirm|bulk-create> ...")
def cmd_channel(message, args):
    sub = (args[0] if args else "").lower()
    rest = args[1:]
    if sub in ("list", "ls"):
        return list_channels(message, rest)
    if sub == "info":
        return channel_info(message, rest)
    if sub in ("create", "new"):
        return create_channel(message, rest)
    if sub == "rename":
        return rename_channel(message, rest)
    if sub in ("delete", "rm"):
        return request_delete(message, rest)
    if sub == "confirm":
        return confirm_delete(message, rest)
    if sub in ("bulk-create", "bulk"):
        return bulk_create(message, rest)
    message.reply(
        "Usage:\n"
        "`!channel list [text|voice]`\n"
        "`!channel info <name|id>`\n"
        "`!channel create <name> [--voice] [--category <id>]`\n"
        "`!channel rename <name|id> <new name>`\n"
        "`!channel delete <name|id>` (prints a confirmation code)\n"
        "`!channel confirm <code>`\n"
        "`!channel bulk-create <prefix> <count>`"
    )


def list_channels(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    wanted = args[0].lower() if args else None
    channels = client.list_channels(message.server_id)
    shown = [c for c in channels if (c.get("type") or "text") == wanted] if wanted else channels
    if not shown:
        message.reply(f"No {wanted or ''} channels found.")
        return
    shown.sort(key=lambda c: str(c.get("name") or ""))
    lines = []
    for c in shown:
        kind = f" ({c.get('type')})" if c.get("type") and c.get("type") != "text" else ""
        lines.append(f"• **{c.get('name') or c.get('id')}** — `{c.get('id')}`{kind}")
    message.reply(f"**Channels ({len(shown)})**\n" + "\n".join(lines))


def channel_info(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    ref = " ".join(args).strip()
    if not ref:
        message.reply("Usage: `!channel info <name|id>`")
        return
    channel = resolve_channel(message.server_id, ref)
    if not channel:
        message.reply(f"No channel matching **{ref}**.")
        return
    message.reply(
        "\n".join(
            [
                f"**{channel.get('name') or channel.get('id')}**",
                f"ID: `{channel.get('id')}`",
                f"Type: {channel.get('type') or 'text'}",
                f"Category: {channel.get('category_id') or '(none)'}",
                f"Protected: {'yes' if is_protected(channel) else 'no'}",
            ]
        )
    )


def create_channel(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    positional = []
    ctype = "text"
    category_id = None
    i = 0
    while i < len(args):
        if args[i] == "--voice":
            ctype = "voice"
            i += 1
        elif args[i] == "--category" and i + 1 < len(args):
            category_id = args[i + 1]
            i += 2
        else:
            positional.append(args[i])
            i += 1
    name = "-".join(positional).strip()
    if not name:
        message.reply("Usage: `!channel create <name> [--voice] [--category <id>`]")
        return
    try:
        channel_id = client.create_channel(message.server_id, name, type=ctype, category_id=category_id)
        audit("create", message, f"{name} ({ctype}) -> {channel_id}")
        message.reply(f"Created channel **{name}** (`{channel_id}`).")
    except Exception as exc:  # noqa: BLE001
        log("warn", "createChannel failed:", exc)
        message.reply(f"Could not create channel: {exc}")


def rename_channel(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    if len(args) < 2:
        message.reply("Usage: `!channel rename <name|id> <new name>`")
        return
    ref = args[0]
    new_name = " ".join(args[1:]).strip()
    channel = resolve_channel(message.server_id, ref)
    if not channel:
        message.reply(f"No channel matching **{ref}**.")
        return
    if is_protected(channel):
        message.reply(f"**{channel.get('name')}** is protected and cannot be renamed.")
        return
    try:
        client.rename_channel(channel.get("id"), new_name)
        audit("rename", message, f"{channel.get('name')} -> {new_name}")
        message.reply(f"Renamed **{channel.get('name')}** to **{new_name}**.")
    except Exception as exc:  # noqa: BLE001
        log("warn", "renameChannel failed:", exc)
        message.reply(f"Could not rename channel: {exc}")


def request_delete(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    ref = " ".join(args).strip()
    if not ref:
        message.reply("Usage: `!channel delete <name|id>`")
        return
    channel = resolve_channel(message.server_id, ref)
    if not channel:
        message.reply(f"No channel matching **{ref}**.")
        return
    if is_protected(channel):
        message.reply(f"**{channel.get('name')}** is protected and cannot be deleted.")
        return

    code = generate_code()

    def mutate(store):
        store.setdefault("pending", {})
        store["pending"][code] = {
            "channelId": channel.get("id"),
            "channelName": channel.get("name"),
            "serverId": message.server_id,
            "requester": (message.author or {}).get("id") or (message.author or {}).get("user_id"),
            "expiresAt": time.time() + CONFIG["confirm_ttl_seconds"],
        }

    mutate_store(mutate)
    message.reply(
        f"⚠️ About to delete **{channel.get('name')}** (`{channel.get('id')}`).\n"
        f"This cannot be undone. Confirm within 60s with:\n"
        f"`!channel confirm {code}`"
    )


def confirm_delete(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    code = (args[0] if args else "").strip().lower()
    if not code:
        message.reply("Usage: `!channel confirm <code>`")
        return

    def mutate(store):
        store.setdefault("pending", {})
        entry = store["pending"].get(code)
        if not entry:
            return None
        if entry.get("serverId") != message.server_id:
            return None
        if time.time() > entry.get("expiresAt", 0):
            del store["pending"][code]
            return {"expired": True}
        del store["pending"][code]
        return entry

    pending = mutate_store(mutate)
    if not pending:
        message.reply("Unknown or already-used confirmation code.")
        return
    if pending.get("expired"):
        message.reply("That confirmation code has expired. Run delete again.")
        return

    try:
        client.delete_channel(pending["channelId"])
        audit("delete", message, f"{pending.get('channelName')} ({pending.get('channelId')})")
        message.reply(f"Deleted channel **{pending.get('channelName')}**.")
    except Exception as exc:  # noqa: BLE001
        log("warn", "deleteChannel failed:", exc)
        message.reply(f"Could not delete channel: {exc}")


def bulk_create(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    prefix = args[0] if args else None
    try:
        count = int(args[1]) if len(args) > 1 else 0
    except (ValueError, TypeError):
        count = 0
    if not prefix or count < 1:
        message.reply("Usage: `!channel bulk-create <prefix> <count>`")
        return
    if count > CONFIG["bulk_max"]:
        message.reply(f"Refusing to create more than {CONFIG['bulk_max']} channels at once.")
        return

    created = []
    for i in range(1, count + 1):
        name = f"{prefix}-{i}"
        try:
            cid = client.create_channel(message.server_id, name)
            created.append(f"{name} (`{cid}`)")
            audit("create", message, f"{name} -> {cid}")
        except Exception as exc:  # noqa: BLE001
            log("warn", "bulk create failed on", name, exc)
            created.append(f"{name} — FAILED: {exc}")
    message.reply(f"**Bulk create ({len(created)})**\n" + "\n".join(created))


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
        if name != "channel":
            return
        log("info", f"{(message.author or {}).get('username', 'someone')} ran !channel in {message.channel_id}")
        COMMANDS["channel"]["run"](message, args)
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
    log("info", "Channel manager bot stopped.")
