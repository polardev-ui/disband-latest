# =====================================================================
# 03 — AUTO-MOD BOT  (Disband bot template, Python)
# =====================================================================
# Same bot as the JavaScript version. Read the JS file's comments too.
#
# TUTORIAL
# --------
# 1. Create the bot: Disband → Settings → Bots → New bot.
#    Scopes: messages.read, messages.write, messages.delete, members.read
#    The bot also needs a role with "Manage Messages" to delete other
#    people's messages (its own messages can always be deleted).
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
# 6. Configure in the space:
#    !automod status
#    !automod addword scam
#    !automod addregex \bfree\s+nitro\b
#    !automod whitelist #general
#    !automod immune @Moderator
#    !automod log #mod-log
#    !automod dryrun on
#    !warnings @someone
#
# WHY EACH PIECE EXISTS
# - Dry-run first: tune a ban list on real traffic without deleting.
# - Never auto-ban from text: text alone is never enough to suspend an account.
# - Immune roles: moderators and the bot itself must not be filtered.
# - Cached member lookup: listMembers on every message would hammer the API.
# - Normalisation: zero-width chars and casing tricks evade naive matching.
# =====================================================================

import json
import os
import re
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
    "data_dir": os.environ.get("AUTOMOD_DATA_DIR", ".data"),
    "member_cache_ttl_seconds": 60,
    "max_warnings": 5,
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
STORE_PATH = DATA_DIR / "automod.json"
_store_lock = threading.Lock()
_write_lock = threading.Lock()


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
    os.replace(tmp, STORE_PATH)


def mutate_store(mutate):
    with _store_lock:
        store = read_store()
        result = mutate(store)
        write_store(store)
        return result


def space_config(store, server_id):
    key = server_id or "dm"
    if key not in store or not isinstance(store[key], dict):
        store[key] = {
            "bannedWords": [],
            "bannedRegex": [],
            "whitelist": [],
            "immuneRoles": [],
            "modLogChannel": None,
            "dryRun": False,
            "warnings": {},
        }
    cfg = store[key]
    # Backfill any missing keys (forward compat).
    for k, v in {
        "bannedWords": [], "bannedRegex": [], "whitelist": [], "immuneRoles": [],
        "modLogChannel": None, "dryRun": False, "warnings": {},
    }.items():
        cfg.setdefault(k, v)
    return cfg


# ---------------------------------------------------------------- matching

def normalise(text):
    # Strip zero-width chars, collapse whitespace, lowercase.
    text = str(text).lower()
    text = re.sub(r"[\u200b-\u200d\ufeff]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def matches(cfg, content):
    haystack = normalise(content)
    reasons = []
    for word in cfg.get("bannedWords", []):
        if word and normalise(word) in haystack:
            reasons.append(f'word "{word}"')
    for pattern in cfg.get("bannedRegex", []):
        try:
            if re.search(pattern, content, re.IGNORECASE):
                reasons.append(f"regex /{pattern}/")
        except re.error as exc:
            log("warn", "bad regex in config:", pattern, exc)
    return reasons


# ---------------------------------------------------------------- member cache

_member_cache = {}  # server_id -> (timestamp, members)
_member_cache_lock = threading.Lock()


def get_members(server_id):
    now = time.monotonic()
    with _member_cache_lock:
        cached = _member_cache.get(server_id)
        if cached and (now - cached[0]) < CONFIG["member_cache_ttl_seconds"]:
            return cached[1]
    members = client.list_members(server_id)
    with _member_cache_lock:
        _member_cache[server_id] = (now, members)
    return members


def member_roles(member):
    roles = (member or {}).get("roles")
    return roles if isinstance(roles, list) else []


def is_immune(message, cfg):
    if not message.server_id:
        return False
    if message.author and client.user and message.author.get("id") == client.user.get("id"):
        return True
    try:
        members = get_members(message.server_id)
        me = None
        author_id = (message.author or {}).get("id") or (message.author or {}).get("user_id")
        for m in members:
            if m.get("id") == author_id or m.get("user_id") == author_id:
                me = m
                break
        if not me:
            return False
        roles = member_roles(me)
        return any(r in roles for r in cfg.get("immuneRoles", []))
    except Exception as exc:  # noqa: BLE001 - fail open
        log("warn", "member lookup failed:", exc)
        return False


# ---------------------------------------------------------------- mod log

def post_mod_log(cfg, text):
    channel = cfg.get("modLogChannel")
    if not channel:
        return
    try:
        client.send_message(channel, text)
    except Exception as exc:  # noqa: BLE001
        log("warn", "could not post to mod-log:", exc)


# ---------------------------------------------------------------- commands

COMMANDS = {}


def command(name, description, usage):
    def register(fn):
        COMMANDS[name] = {"name": name, "description": description, "usage": usage, "run": fn}
        return fn

    return register


def load_cfg(server_id):
    store = read_store()
    return space_config(store, server_id)


@command("automod", "Configure auto-moderation for this space.", "!automod <subcommand>")
def cmd_automod(message, args):
    sub = (args[0] if args else "").lower()
    rest = args[1:]
    if sub == "status":
        return automod_status(message)
    if sub == "addword":
        return add_word(message, rest)
    if sub == "removeword":
        return remove_word(message, rest)
    if sub == "addregex":
        return add_regex(message, rest)
    if sub == "removeregex":
        return remove_regex(message, rest)
    if sub == "list":
        return list_rules(message)
    if sub == "whitelist":
        return set_whitelist(message, rest, True)
    if sub == "unwhitelist":
        return set_whitelist(message, rest, False)
    if sub == "immune":
        return set_immune(message, rest, True)
    if sub == "unimmune":
        return set_immune(message, rest, False)
    if sub == "log":
        return set_log(message, rest)
    if sub == "dryrun":
        return set_dryrun(message, rest)
    message.reply(
        "Usage:\n"
        "`!automod status`\n"
        "`!automod addword <word>` / `removeword <word>`\n"
        "`!automod addregex <pattern>` / `removeregex <pattern>`\n"
        "`!automod list`\n"
        "`!automod whitelist #channel` / `unwhitelist #channel`\n"
        "`!automod immune @role` / `unimmune @role`\n"
        "`!automod log #mod-log`\n"
        "`!automod dryrun on|off`"
    )


def automod_status(message):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    cfg = load_cfg(message.server_id)
    message.reply(
        "\n".join(
            [
                "**Auto-mod status**",
                f"Dry run: **{'on (nothing is deleted)' if cfg.get('dryRun') else 'off'}**",
                f"Banned words: {len(cfg.get('bannedWords', []))}",
                f"Banned regex: {len(cfg.get('bannedRegex', []))}",
                f"Whitelisted channels: {len(cfg.get('whitelist', []))}",
                f"Immune roles: {len(cfg.get('immuneRoles', []))}",
                f"Mod-log channel: {cfg.get('modLogChannel') or '(none)'}",
                f"Tracked users: {len(cfg.get('warnings', {}))}",
            ]
        )
    )


def add_word(message, args):
    word = " ".join(args).strip().lower()
    if not word:
        message.reply("Usage: `!automod addword <word>`")
        return

    def mutate(store):
        cfg = space_config(store, message.server_id)
        if word not in cfg["bannedWords"]:
            cfg["bannedWords"].append(word)

    mutate_store(mutate)
    message.reply(f"Added banned word: `{word}`.")


def remove_word(message, args):
    word = " ".join(args).strip().lower()

    def mutate(store):
        cfg = space_config(store, message.server_id)
        cfg["bannedWords"] = [w for w in cfg["bannedWords"] if w != word]

    mutate_store(mutate)
    message.reply(f"Removed banned word: `{word}`.")


def add_regex(message, args):
    pattern = " ".join(args).strip()
    if not pattern:
        message.reply("Usage: `!automod addregex <pattern>`")
        return
    try:
        re.compile(pattern)
    except re.error as exc:
        message.reply(f"Invalid regex: {exc}")
        return

    def mutate(store):
        cfg = space_config(store, message.server_id)
        if pattern not in cfg["bannedRegex"]:
            cfg["bannedRegex"].append(pattern)

    mutate_store(mutate)
    message.reply(f"Added banned regex: `/{pattern}/`.")


def remove_regex(message, args):
    pattern = " ".join(args).strip()

    def mutate(store):
        cfg = space_config(store, message.server_id)
        cfg["bannedRegex"] = [p for p in cfg["bannedRegex"] if p != pattern]

    mutate_store(mutate)
    message.reply(f"Removed banned regex: `/{pattern}/`.")


def list_rules(message):
    cfg = load_cfg(message.server_id)
    words = ", ".join(f"`{w}`" for w in cfg.get("bannedWords", [])) or "(none)"
    regexes = ", ".join(f"`/{p}/`" for p in cfg.get("bannedRegex", [])) or "(none)"
    message.reply(f"**Banned words:** {words}\n**Banned regex:** {regexes}")


def set_whitelist(message, args, add):
    raw = " ".join(args).strip()
    channel_id = "".join(ch for ch in raw if ch.isdigit())
    if not channel_id:
        message.reply("Usage: `!automod whitelist #channel`")
        return

    def mutate(store):
        cfg = space_config(store, message.server_id)
        if add:
            if channel_id not in cfg["whitelist"]:
                cfg["whitelist"].append(channel_id)
        else:
            cfg["whitelist"] = [c for c in cfg["whitelist"] if c != channel_id]

    mutate_store(mutate)
    verb = "Whitelisted" if add else "Removed whitelist for"
    message.reply(f"{verb} channel `{channel_id}`.")


def set_immune(message, args, add):
    raw = " ".join(args).strip()
    role_id = "".join(ch for ch in raw if ch.isdigit())
    if not role_id:
        message.reply("Usage: `!automod immune <roleId>`")
        return

    def mutate(store):
        cfg = space_config(store, message.server_id)
        if add:
            if role_id not in cfg["immuneRoles"]:
                cfg["immuneRoles"].append(role_id)
        else:
            cfg["immuneRoles"] = [r for r in cfg["immuneRoles"] if r != role_id]

    mutate_store(mutate)
    verb = "Added" if add else "Removed"
    message.reply(f"{verb} immune role `{role_id}`.")


def set_log(message, args):
    raw = " ".join(args).strip()
    channel_id = "".join(ch for ch in raw if ch.isdigit())
    if not channel_id:
        message.reply("Usage: `!automod log #mod-log`")
        return

    def mutate(store):
        cfg = space_config(store, message.server_id)
        cfg["modLogChannel"] = channel_id

    mutate_store(mutate)
    message.reply(f"Mod-log channel set to `{channel_id}`.")


def set_dryrun(message, args):
    value = (args[0] if args else "").lower()
    if value not in ("on", "off", "true", "false"):
        message.reply("Usage: `!automod dryrun on|off`")
        return
    on = value in ("on", "true")

    def mutate(store):
        cfg = space_config(store, message.server_id)
        cfg["dryRun"] = on

    mutate_store(mutate)
    state = "enabled (nothing will be deleted)" if on else "disabled"
    message.reply(f"Dry run {state}.")


@command("warnings", "Show warning counts.", "!warnings [@user]")
def cmd_warnings(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    cfg = load_cfg(message.server_id)
    target = " ".join(args).strip()
    if target:
        n = (cfg.get("warnings") or {}).get(target, 0)
        message.reply(f"Warnings for `{target}`: **{n}**.")
        return
    entries = list((cfg.get("warnings") or {}).items())
    if not entries:
        message.reply("No warnings recorded.")
        return
    entries.sort(key=lambda kv: kv[1], reverse=True)
    lines = [f"• `{u}` — {n}" for u, n in entries]
    message.reply("**Warning counts**\n" + "\n".join(lines))


@command("clearwarnings", "Reset warning counts.", "!clearwarnings [@user]")
def cmd_clearwarnings(message, args):
    if not message.server_id:
        message.reply("Run this in a space channel.")
        return
    target = " ".join(args).strip()

    def mutate(store):
        cfg = space_config(store, message.server_id)
        if target:
            cfg["warnings"].pop(target, None)
        else:
            cfg["warnings"] = {}

    mutate_store(mutate)
    message.reply(f"Cleared warnings for `{target}`." if target else "Cleared all warnings.")


# ---------------------------------------------------------------- moderation


def moderate(message):
    if message.author_is_bot:
        return
    if not message.server_id:
        return
    if not message.content:
        return

    cfg = load_cfg(message.server_id)

    # Whitelisted channels are never filtered.
    if message.channel_id in (cfg.get("whitelist") or []):
        return

    # Immune roles bypass filtering.
    if is_immune(message, cfg):
        return

    reasons = matches(cfg, message.content)
    if not reasons:
        return

    author = message.author or {}
    author_id = author.get("id") or author.get("user_id") or "unknown"
    dry_run = bool(cfg.get("dryRun"))

    if dry_run:
        log("info", f"[dry-run] would delete {message.id}: {', '.join(reasons)}")
        post_mod_log(
            cfg,
            f"🧪 [dry-run] {author.get('username', 'user')} in <#{message.channel_id}>: "
            f"{', '.join(reasons)}\n> {str(message.content)[:200]}",
        )
        return

    # Delete the offending message.
    try:
        message.delete()
    except Exception as exc:  # noqa: BLE001
        log("warn", "could not delete message:", exc)
        post_mod_log(cfg, f"⚠️ Failed to delete {message.id}: {exc}")
        return

    # Track warnings (atomic).
    def mutate(store):
        c = space_config(store, message.server_id)
        c["warnings"][author_id] = c["warnings"].get(author_id, 0) + 1
        return c["warnings"][author_id]

    warnings = mutate_store(mutate)

    post_mod_log(
        cfg,
        f"🗑️ Deleted message from {author.get('username', 'user')} in <#{message.channel_id}>.\n"
        f"Reasons: {', '.join(reasons)}\n"
        f"Warnings: {warnings}/{CONFIG['max_warnings']}\n"
        f"> {str(message.content)[:200]}",
    )

    if warnings >= CONFIG["max_warnings"]:
        post_mod_log(
            cfg,
            f"🚨 {author.get('username', 'user')} has reached {warnings} warnings. Human review recommended.",
        )

    # Tell the user in-channel.
    try:
        client.send_message(
            message.channel_id,
            f"{author.get('username', 'User')}, your message was removed "
            f"({', '.join(reasons)}). Warning {warnings}/{CONFIG['max_warnings']}.",
        )
    except Exception as exc:  # noqa: BLE001
        log("warn", "could not send notice:", exc)


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

        # Commands first.
        if content.startswith(CONFIG["prefix"]):
            without_prefix = content[len(CONFIG["prefix"]):].strip()
            if without_prefix:
                parts = without_prefix.split()
                name = parts[0].lower()
                args = parts[1:]
                if name in ("automod", "warnings", "clearwarnings"):
                    if name == "automod":
                        COMMANDS["automod"]["run"](message, args)
                    elif name == "warnings":
                        COMMANDS["warnings"]["run"](message, args)
                    else:
                        COMMANDS["clearwarnings"]["run"](message, args)
                    return

        # Then moderation.
        moderate(message)
    except Exception as exc:  # noqa: BLE001 - keep the gateway alive
        log("error", f"messageCreate handler failed: {exc}")


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
    log("info", "Auto-mod bot stopped.")
