# =====================================================================
# 01 — UTILITY BOT  (Disband bot template, Python)
# =====================================================================
# Same bot as the JavaScript version, written against the zero-dependency
# disband-bot SDK (threading + urllib). Read the JS file's comments too —
# the design is identical; only the language differs.
#
# TUTORIAL
# --------
# 1. Create the bot
#    Disband → Settings → Bots → New bot.
#    Scopes: messages.read, messages.write, members.read, channels.read
#    Copy the token — Disband only shows it once.
#
# 2. Invite it
#    Settings → Bots → Invite → choose a space → copy the link.
#    The space owner approves it.
#
# 3. Install
#    pip install disband-bot
#    (or, from this repo: pip install ./packages/disband-bot-python)
#
# 4. Paste the token
#    Replace PASTE_YOUR_BOT_TOKEN_HERE below, or set DISBAND_BOT_TOKEN.
#
# 5. Run
#    python main.py
#
# 6. Try it
#    !help  !ping  !serverinfo  !members  !channels  !echo hi  !whoami  !uptime
#
# WHY EACH PIECE EXISTS
# - author_is_bot guard: prevents reply loops between bots.
# - COMMANDS registry: one place defines dispatch and help.
# - cooldowns: protects the bot's rate limit from command spam.
# - chunk_text: keeps long responses inside Disband's message limit.
# - signal handlers: stop the gateway thread cleanly.
# - defensive dict access: API payloads evolve; .get() avoids crashes.
# =====================================================================

import os
import signal
import threading
import time

from disband_bot import Client

# ===================== BOT TOKEN (paste here) =====================
# Paste your bot token between the quotes, OR leave the placeholder and set
# the DISBAND_BOT_TOKEN environment variable instead (recommended for prod).
BOT_TOKEN = os.environ.get("DISBAND_BOT_TOKEN", "PASTE_YOUR_BOT_TOKEN_HERE")
# ================================================================

CONFIG = {
    "prefix": "!",
    "cooldown_seconds": 1.5,
    "max_message_length": 1900,
    "log_level": os.environ.get("LOG_LEVEL", "info"),
}

_LEVELS = {"debug": 10, "info": 20, "warn": 30, "error": 40}
_started_at = time.time()


def log(level, *args):
    # Honour LOG_LEVEL so production stays quiet but debugging is one env var away.
    if _LEVELS[level] < _LEVELS[CONFIG["log_level"]]:
        return
    stamp = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    print(f"[{stamp}] [{level.upper()}]", *args, flush=True)


if not BOT_TOKEN or BOT_TOKEN == "PASTE_YOUR_BOT_TOKEN_HERE":
    log("error", "No bot token. Paste one into BOT_TOKEN or set DISBAND_BOT_TOKEN.")
    raise SystemExit(1)

client = Client(token=BOT_TOKEN)

# ---------------------------------------------------------------- helpers


def format_duration(seconds):
    total = int(seconds)
    days, rem = divmod(total, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, secs = divmod(rem, 60)
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes}m")
    parts.append(f"{secs}s")
    return " ".join(parts)


def chunk_text(text, size):
    # Prefer cutting at newlines, then spaces, then hard-cut as a last resort.
    chunks = []
    rest = str(text)
    while len(rest) > size:
        cut = rest.rfind("\n", 0, size)
        if cut < size // 2:
            cut = rest.rfind(" ", 0, size)
        if cut < size // 2:
            cut = size
        chunks.append(rest[:cut])
        rest = rest[cut:].lstrip()
    if rest:
        chunks.append(rest)
    return chunks


def send_long(channel_id, text):
    for chunk in chunk_text(text, CONFIG["max_message_length"]):
        client.send_message(channel_id, chunk)


def display_name(person):
    if not person:
        return "unknown"
    return (
        person.get("display_name")
        or person.get("username")
        or person.get("name")
        or "unknown"
    )


# Per-user per-command cooldowns, guarded by a lock because the gateway runs
# in its own thread.
_cooldowns = {}
_cooldown_lock = threading.Lock()


def check_cooldown(user_id, command_name):
    key = f"{user_id}:{command_name}"
    now = time.monotonic()
    with _cooldown_lock:
        until = _cooldowns.get(key, 0.0)
        if now < until:
            return int(until - now) + 1
        _cooldowns[key] = now + CONFIG["cooldown_seconds"]
    return 0


# ---------------------------------------------------------------- commands
# COMMANDS is both the dispatch table and the source of !help output, so they
# can never drift apart.

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


@command("help", "List every command this bot knows.", "!help")
def cmd_help(message, args):
    lines = [
        f"{item['usage']:<34} {item['description']}"
        for item in sorted(COMMANDS.values(), key=lambda c: c["name"])
    ]
    send_long(
        message.channel_id,
        "**Utility Bot commands**\n```\n" + "\n".join(lines) + "\n```",
    )


@command("ping", "Check that the bot is alive.", "!ping")
def cmd_ping(message, args):
    sent_at = time.monotonic()
    reply = message.reply("Pong!")
    log("debug", f"ping round-trip {(time.monotonic() - sent_at) * 1000:.0f}ms ({reply.id})")


@command("uptime", "How long this bot process has been running.", "!uptime")
def cmd_uptime(message, args):
    message.reply(f"I have been running for **{format_duration(time.time() - _started_at)}**.")


@command("whoami", "Show the sender and the bot identity.", "!whoami")
def cmd_whoami(message, args):
    me = client.user or {}
    author = message.author or {}
    message.reply(
        "\n".join(
            [
                f"You are **{display_name(author)}** (`{author.get('id', 'unknown')}`).",
                f"I am **{me.get('name', 'this bot')}** (`{me.get('id', 'unknown')}`).",
                f"Server: `{message.server_id or 'DM'}`, channel: `{message.channel_id}`.",
            ]
        )
    )


@command("serverinfo", "Member and channel counts for this space.", "!serverinfo")
def cmd_serverinfo(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel, not a DM.")
        return
    # Fetch both in parallel-ish (sequential here, but errors are isolated so one
    # missing scope cannot take down the whole command).
    try:
        members = client.list_members(message.server_id)
    except Exception as exc:  # noqa: BLE001 - one failed scope should not kill the command
        log("warn", "list_members failed:", exc)
        members = []
    try:
        channels = client.list_channels(message.server_id)
    except Exception as exc:  # noqa: BLE001
        log("warn", "list_channels failed:", exc)
        channels = []
    text_channels = [c for c in channels if (c.get("type") or "text") == "text"]
    message.reply(
        "\n".join(
            [
                "**Server overview**",
                f"Members: **{len(members)}**",
                f"Channels: **{len(channels)}** ({len(text_channels)} text)",
                f"Server ID: `{message.server_id}`",
            ]
        )
    )


@command("members", "List up to 25 members.", "!members")
def cmd_members(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    members = client.list_members(message.server_id)
    if not members:
        message.reply("No members visible (check the members.read scope).")
        return
    lines = []
    for index, member in enumerate(members[:25], start=1):
        suffix = " [bot]" if member.get("is_bot") else ""
        lines.append(f"{index}. {display_name(member)}{suffix}")
    extra = f"\n…and {len(members) - 25} more." if len(members) > 25 else ""
    send_long(
        message.channel_id,
        f"**Members ({len(members)})**\n" + "\n".join(lines) + extra,
    )


@command("channels", "List channels, optionally filtered by type.", "!channels [text|voice]")
def cmd_channels(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    wanted = args[0].lower() if args else None
    channels = client.list_channels(message.server_id)
    shown = (
        [c for c in channels if (c.get("type") or "text") == wanted]
        if wanted
        else channels
    )
    if not shown:
        message.reply(f"No {wanted or ''} channels found.")
        return
    lines = []
    for channel in shown:
        kind = channel.get("type") or "text"
        suffix = f" ({kind})" if kind != "text" else ""
        lines.append(
            f"• **{channel.get('name') or channel.get('id')}** — "
            f"`{channel.get('id')}`{suffix}"
        )
    send_long(message.channel_id, f"**Channels ({len(shown)})**\n" + "\n".join(lines))


@command("echo", "Repeat text back. Useful for testing formatting.", "!echo <text>")
def cmd_echo(message, args):
    text = " ".join(args).strip()
    if not text:
        message.reply("Usage: `!echo <text>`")
        return
    message.reply(text[: CONFIG["max_message_length"]])


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
        entry = COMMANDS.get(name)
        if not entry:
            return  # unknown command: stay silent (no spam)

        author = message.author or {}
        remaining = check_cooldown(author.get("id", "unknown"), name)
        if remaining > 0:
            log("debug", f"cooldown hit on {name}")
            return

        log("info", f"{display_name(author)} ran !{name} in {message.channel_id}")
        entry["run"](message, args)
    except Exception as exc:  # noqa: BLE001 - keep the gateway alive
        log("error", f"messageCreate handler failed: {exc}")
        try:
            message.reply("Something went wrong running that command. Check the bot logs.")
        except Exception as reply_exc:  # noqa: BLE001
            log("error", f"could not send error reply: {reply_exc}")


@client.on("messageUpdate")
def on_message_update(message):
    log("debug", f"message {message.id} edited in {message.channel_id}")


@client.on("messageDelete")
def on_message_delete(message):
    log("debug", f"message {message.id} deleted from {message.channel_id}")


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
    client.run()
    log("info", "Bot stopped.")
