# =====================================================================
# 05 — SERVER INFO BOT  (Disband bot template, Python)
# =====================================================================
# Same bot as the JavaScript version. Read the JS file's comments too.
#
# TUTORIAL
# --------
# 1. Create the bot: Disband → Settings → Bots → New bot.
#    Scopes: messages.read, messages.write, members.read, channels.read
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
#    !info  !members  !members 2  !member kai  !channels  !roles  !bots  !top  !refresh
#
# WHY EACH PIECE EXISTS
# - Caching (60s): listMembers/listChannels on every command would burn the
#   rate limit. A short TTL keeps data fresh enough for an info bot.
# - Pagination: a 500-member space must not dump 500 lines into one message.
# - Role breakdown from members: the SDK has no list-roles endpoint, so we
#   aggregate role ids from member records.
# - Defensive access: member/channel shapes vary; .get() avoids crashes.
# - Chunking: any of these commands can exceed the message limit.
# =====================================================================

import os
import signal
import threading
import time
from collections import defaultdict

from disband_bot import Client

# ===================== BOT TOKEN (paste here) =====================
BOT_TOKEN = os.environ.get("DISBAND_BOT_TOKEN", "PASTE_YOUR_BOT_TOKEN_HERE")
# ================================================================

CONFIG = {
    "prefix": "!",
    "cache_ttl_seconds": 60,
    "page_size": 20,
    "max_message_length": 1900,
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

# ---------------------------------------------------------------- cache

_cache = {}  # (server_id, kind) -> (timestamp, value)
_cache_lock = threading.Lock()


def cached(server_id, kind, fetcher):
    key = (server_id, kind)
    now = time.monotonic()
    with _cache_lock:
        entry = _cache.get(key)
        if entry and (now - entry[0]) < CONFIG["cache_ttl_seconds"]:
            return entry[1]
    value = fetcher()
    with _cache_lock:
        _cache[key] = (now, value)
    return value


def invalidate(server_id):
    with _cache_lock:
        for key in list(_cache.keys()):
            if key[0] == server_id:
                del _cache[key]


# ---------------------------------------------------------------- helpers


def display_name(person):
    if not person:
        return "unknown"
    return (
        person.get("display_name")
        or person.get("username")
        or person.get("name")
        or "unknown"
    )


def chunk_text(text, size):
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


# ---------------------------------------------------------------- data loaders


def load_members(server_id):
    def fetch():
        try:
            return client.list_members(server_id)
        except Exception as exc:  # noqa: BLE001
            log("warn", "listMembers failed:", exc)
            return []

    return cached(server_id, "members", fetch)


def load_channels(server_id):
    def fetch():
        try:
            return client.list_channels(server_id)
        except Exception as exc:  # noqa: BLE001
            log("warn", "listChannels failed:", exc)
            return []

    return cached(server_id, "channels", fetch)


# ---------------------------------------------------------------- commands

COMMANDS = {}


def command(name, description, usage):
    def register(fn):
        COMMANDS[name] = {"name": name, "description": description, "usage": usage, "run": fn}
        return fn

    return register


@command("info", "Summary card for this space.", "!info")
def cmd_info(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    members = load_members(message.server_id)
    channels = load_channels(message.server_id)
    bots = [m for m in members if m.get("is_bot")]
    humans = len(members) - len(bots)
    text_channels = [c for c in channels if (c.get("type") or "text") == "text"]
    voice_channels = [c for c in channels if c.get("type") == "voice"]
    categories = [c for c in channels if c.get("type") == "category"]
    me = client.user or {}
    message.reply(
        "\n".join(
            [
                "**Space overview**",
                f"Members: **{len(members)}** ({humans} humans, {len(bots)} bots)",
                f"Channels: **{len(channels)}** ({len(text_channels)} text, {len(voice_channels)} voice, {len(categories)} categories)",
                f"Server ID: `{message.server_id}`",
                f"Bot: {me.get('name', 'this bot')} (`{me.get('id', '?')}`)",
            ]
        )
    )


@command("members", "Paginated member directory.", "!members [page]")
def cmd_members(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    try:
        page = max(1, int(args[0])) if args else 1
    except (ValueError, TypeError):
        page = 1
    members = load_members(message.server_id)
    if not members:
        message.reply("No members visible (check members.read scope).")
        return
    sorted_members = sorted(members, key=display_name)
    total_pages = (len(sorted_members) + CONFIG["page_size"] - 1) // CONFIG["page_size"]
    page = min(page, total_pages)
    start = (page - 1) * CONFIG["page_size"]
    slice_ = sorted_members[start:start + CONFIG["page_size"]]
    lines = []
    for i, m in enumerate(slice_):
        idx = start + i + 1
        badge = " 🤖" if m.get("is_bot") else ""
        lines.append(f"{idx}. {display_name(m)}{badge} — `{m.get('id') or m.get('user_id') or '?'}`")
    extra = f"\n\nNext: `!members {page + 1}`" if page < total_pages else ""
    send_long(
        message.channel_id,
        f"**Members ({len(sorted_members)}) — page {page}/{total_pages}**\n" + "\n".join(lines) + extra,
    )


@command("member", "Look up a member by name or id.", "!member <name|id>")
def cmd_member(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    query = " ".join(args).strip().lower()
    if not query:
        message.reply("Usage: `!member <name|id>`")
        return
    members = load_members(message.server_id)
    hits = []
    for m in members:
        mid = str(m.get("id") or m.get("user_id") or "")
        name = display_name(m).lower()
        if mid == query or name == query or query in name:
            hits.append(m)
    if not hits:
        message.reply(f"No member matching **{query}**.")
        return
    blocks = []
    for m in hits[:10]:
        roles = m.get("roles")
        roles_str = ", ".join(roles) if isinstance(roles, list) and roles else "(none)"
        blocks.append(
            "\n".join(
                [
                    f"**{display_name(m)}**{' 🤖' if m.get('is_bot') else ''}",
                    f"ID: `{m.get('id') or m.get('user_id') or '?'}`",
                    f"Roles: {roles_str}",
                    f"Joined: {m.get('joined_at') or '?'}",
                ]
            )
        )
    send_long(message.channel_id, "\n\n".join(blocks))


@command("channels", "Channel table grouped by type.", "!channels")
def cmd_channels(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    channels = load_channels(message.server_id)
    if not channels:
        message.reply("No channels visible (check channels.read scope).")
        return
    groups = defaultdict(list)
    for c in channels:
        groups[c.get("type") or "text"].append(c)
    sections = []
    for kind in sorted(groups.keys()):
        items = sorted(groups[kind], key=lambda c: str(c.get("name") or ""))
        body = "\n".join(f"  • {c.get('name') or c.get('id')} (`{c.get('id')}`)" for c in items)
        sections.append(f"**{kind} ({len(items)})**\n{body}")
    send_long(message.channel_id, "\n\n".join(sections))


@command("roles", "Role breakdown derived from member records.", "!roles")
def cmd_roles(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    members = load_members(message.server_id)
    counts = defaultdict(int)
    unassigned = 0
    for m in members:
        roles = m.get("roles")
        if not isinstance(roles, list) or not roles:
            unassigned += 1
            continue
        for r in roles:
            counts[r] += 1
    lines = [f"• `{r}` — {n} member{'s' if n != 1 else ''}" for r, n in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)]
    if unassigned:
        lines.append(f"• *(no roles)* — {unassigned} member{'s' if unassigned != 1 else ''}")
    message.reply(
        f"**Role breakdown** ({len(counts)} distinct roles)\n"
        + ("\n".join(lines) if lines else "No data.")
        + "\n\n_Note: role names are not exposed by the bot API; IDs are shown. "
        "Map them in space settings._"
    )


@command("bots", "List bot accounts in this space.", "!bots")
def cmd_bots(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    members = load_members(message.server_id)
    bots = sorted([m for m in members if m.get("is_bot")], key=display_name)
    if not bots:
        message.reply("No bots in this space.")
        return
    lines = [f"• {display_name(m)} — `{m.get('id') or m.get('user_id') or '?'}`" for m in bots]
    message.reply(f"**Bots ({len(bots)})**\n" + "\n".join(lines))


@command("top", "Top members by role count.", "!top")
def cmd_top(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    members = load_members(message.server_id)
    ranked = sorted(
        (m for m in members if isinstance(m.get("roles"), list) and m.get("roles")),
        key=lambda m: len(m.get("roles", [])),
        reverse=True,
    )[:10]
    if not ranked:
        message.reply("No role data available.")
        return
    lines = [f"{i + 1}. {display_name(m)} — {len(m.get('roles', []))} role(s)" for i, m in enumerate(ranked)]
    message.reply("**Top members by role count**\n" + "\n".join(lines))


@command("refresh", "Invalidate the cache and reload data.", "!refresh")
def cmd_refresh(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    invalidate(message.server_id)
    message.reply("Cache cleared. Next command will fetch fresh data.")


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
            return
        log("info", f"{display_name(message.author or {})} ran !{name} in {message.channel_id}")
        entry["run"](message, args)
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
    client.run()
    log("info", "Server info bot stopped.")
