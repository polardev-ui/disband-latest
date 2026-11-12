"""Disband bot client (gateway + REST helpers)."""

import asyncio
import inspect
import threading
import time
import traceback
from urllib.parse import quote, urlencode, urlsplit

from .errors import AuthError
from .message import Message
from .rest import REST

EVENT_NAMES = {
    "ready",
    "messageCreate",
    "messageUpdate",
    "messageDelete",
    "reactionAdd",
    "reactionRemove",
    "memberJoin",
    "memberLeave",
    "memberUpdate",
    "channelCreate",
    "channelUpdate",
    "channelDelete",
    "roleCreate",
    "roleUpdate",
    "roleDelete",
    "serverUpdate",
    "serverJoin",
    "serverLeave",
    "scopesUpdate",
    "interactionCreate",
    "error",
}


def _query(**params):
    pairs = [(k, str(v)) for k, v in params.items() if v is not None and v != ""]
    return ("?" + urlencode(pairs)) if pairs else ""


def _path_segment(value):
    return quote(str(value), safe="")


async def _await_handler(result):
    return await result


class Client:
    """The Disband bot client.

    Bots are self-hosted: run this client wherever you like, and it talks to
    the Disband API with a bot token created in Settings -> Bots.
    """

    def __init__(self, token, base_url="https://www.disband.dev", gateway_timeout=20,
                 allow_insecure_localhost=False, retry_rate_limits=True, max_retries=3):
        if not token:
            raise ValueError("A bot token is required (Client(token=...))")
        parsed = urlsplit(base_url)
        loopback = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
        if parsed.username or parsed.password or parsed.fragment:
            raise ValueError("Bot API URLs cannot contain credentials or fragments")
        if parsed.scheme != "https" and not (parsed.scheme == "http" and allow_insecure_localhost and loopback):
            raise ValueError("Bot API URLs must use HTTPS (or explicitly enabled loopback HTTP)")
        self.token = token
        self.base_url = base_url.rstrip("/")
        self.gateway_timeout = gateway_timeout
        # A 429 is retried after its Retry-After, up to max_retries times,
        # before it surfaces as a RateLimitError.
        self.retry_rate_limits = retry_rate_limits
        self.max_retries = max_retries
        self._rest = REST(self)
        self._listeners = {name: [] for name in EVENT_NAMES}
        self._lock = threading.Lock()
        self._stopped = threading.Event()
        self._thread = None
        self.user = None
        self.connected = False

    # ------------------------------------------------------------ events

    def on(self, event, handler=None):
        """Register a handler, usable as a decorator or directly."""

        def register(fn):
            if event not in EVENT_NAMES:
                raise ValueError("Unknown event %r" % event)
            with self._lock:
                self._listeners[event].append(fn)
            return fn

        if handler is not None:
            return register(handler)
        return register

    def once(self, event, handler=None):
        def register(fn):
            def wrapped(*args):
                with self._lock:
                    try:
                        self._listeners[event].remove(wrapped)
                    except ValueError:
                        pass
                return fn(*args)

            self.on(event, wrapped)
            return fn

        if handler is not None:
            return register(handler)
        return register

    def _report_handler_error(self, event, error):
        with self._lock:
            has_error_handler = bool(self._listeners["error"])
        if event == "error" or not has_error_handler:
            traceback.print_exception(type(error), error, error.__traceback__)
        else:
            self._emit("error", error)

    def _emit(self, event, *args):
        with self._lock:
            handlers = list(self._listeners.get(event, ()))
        for handler in handlers:
            try:
                result = handler(*args)
                if inspect.isawaitable(result):
                    try:
                        loop = asyncio.get_running_loop()
                    except RuntimeError:
                        asyncio.run(_await_handler(result))
                    else:
                        task = loop.create_task(_await_handler(result))
                        task.add_done_callback(lambda done, name=event: self._on_handler_done(name, done))
            except Exception as error:
                self._report_handler_error(event, error)

    def _on_handler_done(self, event, task):
        if task.cancelled():
            return
        error = task.exception()
        if error is not None:
            self._report_handler_error(event, error)

    # ------------------------------------------------------------ lifecycle

    def connect(self):
        """Resolves the bot identity, fires ``ready``, starts the gateway."""
        me = self._rest.get("/api/bot/me")
        self.user = {
            "id": me["bot"]["id"],
            "user_id": me["bot"].get("user_id"),
            "name": me["bot"].get("name"),
            "username": me["bot"].get("username"),
            "avatar_url": me["bot"].get("avatar_url"),
            "scopes": me["bot"].get("scopes", []),
        }
        self.connected = True
        self._emit("ready", self.user)
        if not self._thread or not self._thread.is_alive():
            self._stopped.clear()
            self._thread = threading.Thread(target=self._gateway_loop, daemon=True)
            self._thread.start()
        return self

    def run(self):
        """Connects and blocks until the client is stopped."""
        self.connect()
        while not self._stopped.is_set():
            time.sleep(0.1)

    def close(self):
        """Stops the gateway loop."""
        self._stopped.set()
        self.connected = False

    def _gateway_loop(self):
        while not self._stopped.is_set():
            try:
                payload = self._rest.get("/api/v1/gateway?timeout=%d" % self.gateway_timeout)
                for event in payload.get("events", []):
                    if self._stopped.is_set():
                        break
                    name = event.get("type")
                    payload_data = event.get("payload", {})
                    if name in ("messageCreate", "messageUpdate", "messageDelete"):
                        self._emit(name, Message(payload_data.get("message", payload_data), self))
                    elif name in self._listeners:
                        self._emit(name, payload_data)
            except AuthError:
                self._emit("error", RuntimeError("Invalid bot token - check your DISBAND_BOT_TOKEN."))
                break
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                self._emit("error", exc)
                self._stopped.wait(3)

    # ------------------------------------------------------------ REST helpers

    def send_message(self, channel_id, content=None, reply_to_id=None, embeds=None, components=None):
        body = {}
        if content is not None:
            body["content"] = content
        if reply_to_id is not None:
            body["reply_to_id"] = reply_to_id
        if embeds is not None:
            body["embeds"] = embeds
        if components is not None:
            body["components"] = components
        data = self._rest.post("/api/v1/channels/%s/messages" % _path_segment(channel_id), body)
        return Message(data["message"], self)

    def edit_message(self, channel_id, message_id, content=None, embeds=None, components=None, **patch):
        body = {}
        if isinstance(content, dict) and embeds is None and components is None and not patch:
            body.update(content)
        else:
            if content is not None:
                body["content"] = content
            if embeds is not None:
                body["embeds"] = embeds
            if components is not None:
                body["components"] = components
            body.update(patch)
        data = self._rest.patch(
            "/api/v1/channels/%s/messages/%s" % (_path_segment(channel_id), _path_segment(str(message_id))),
            body,
        )
        return Message(data["message"], self)

    def list_messages(self, channel_id, limit=None, before=None, after=None, around=None):
        """Up to 100 messages, newest first. Page with one of before, after or around."""
        qs = _query(limit=limit, before=before, after=after, around=around)
        data = self._rest.get("/api/v1/channels/%s/messages%s" % (_path_segment(channel_id), qs))
        return [Message(m, self) for m in data.get("messages", [])]

    def _message_path(self, channel_id, message_id):
        return "/api/v1/channels/%s/messages/%s" % (_path_segment(channel_id), _path_segment(str(message_id)))

    def get_message(self, channel_id, message_id):
        """One message, with its reactions summary."""
        data = self._rest.get(self._message_path(channel_id, message_id))
        return Message(data["message"], self)

    def send_typing(self, channel_id):
        """Shows "<bot> is typing..." in a channel for a few seconds."""
        self._rest.post("/api/v1/channels/%s/typing" % _path_segment(channel_id))

    def list_reactions(self, channel_id, message_id):
        """Every emoji on a message: [{"emoji", "count", "me"}]."""
        data = self._rest.get(self._message_path(channel_id, message_id) + "/reactions")
        return (data or {}).get("reactions", [])

    def list_reaction_users(self, channel_id, message_id, emoji, limit=None):
        """Who reacted with one emoji, earliest first (up to 100)."""
        data = self._rest.get(
            self._message_path(channel_id, message_id)
            + "/reactions/%s%s" % (quote(str(emoji), safe=""), _query(limit=limit))
        )
        return (data or {}).get("users", [])

    def remove_user_reaction(self, channel_id, message_id, emoji, user_id):
        """Removes someone else's reaction (messages.delete + manage_messages)."""
        data = self._rest.delete(
            self._message_path(channel_id, message_id)
            + "/reactions/%s/%s" % (quote(str(emoji), safe=""), _path_segment(user_id))
        )
        return bool((data or {}).get("removed"))

    def clear_reactions(self, channel_id, message_id, emoji=None):
        """Clears every reaction, or one emoji's. Returns how many were removed."""
        data = self._rest.delete(self._message_path(channel_id, message_id) + "/reactions" + _query(emoji=emoji))
        return (data or {}).get("removed", 0)

    def list_forum_posts(self, forum_id, limit=None):
        """A forum's posts, pinned first, then by latest activity."""
        data = self._rest.get("/api/v1/channels/%s/posts%s" % (_path_segment(forum_id), _query(limit=limit)))
        return (data or {}).get("posts", [])

    def create_forum_post(self, forum_id, title, content=None, tags=None, embeds=None, components=None):
        """Starts a forum post. Returns (post, message); reply with send_message(post["id"], ...)."""
        body = {"title": title}
        if content is not None:
            body["content"] = content
        if tags is not None:
            body["tags"] = list(tags)
        if embeds is not None:
            body["embeds"] = embeds
        if components is not None:
            body["components"] = components
        data = self._rest.post("/api/v1/channels/%s/posts" % _path_segment(forum_id), body)
        return data["post"], Message(data["message"], self)

    def delete_message(self, channel_id, message_id):
        self._rest.delete(
            "/api/v1/channels/%s/messages/%s" % (_path_segment(channel_id), _path_segment(str(message_id)))
        )

    def bulk_delete_messages(self, channel_id, message_ids):
        data = self._rest.post(
            "/api/v1/channels/%s/messages/bulk-delete" % _path_segment(channel_id),
            {"message_ids": list(message_ids)},
        )
        return (data or {}).get("deleted", 0)

    def add_reaction(self, channel_id, message_id, emoji):
        return self._rest.put(
            "/api/v1/channels/%s/messages/%s/reactions/%s"
            % (_path_segment(channel_id), _path_segment(str(message_id)), quote(str(emoji), safe=""))
        )

    def remove_reaction(self, channel_id, message_id, emoji):
        return self._rest.delete(
            "/api/v1/channels/%s/messages/%s/reactions/%s"
            % (_path_segment(channel_id), _path_segment(str(message_id)), quote(str(emoji), safe=""))
        )

    def list_pins(self, channel_id):
        data = self._rest.get("/api/v1/channels/%s/pins" % _path_segment(channel_id))
        return (data or {}).get("pins", [])

    def pin_message(self, channel_id, message_id):
        return self._rest.put(
            "/api/v1/channels/%s/pins/%s" % (_path_segment(channel_id), _path_segment(str(message_id)))
        )

    def unpin_message(self, channel_id, message_id):
        return self._rest.delete(
            "/api/v1/channels/%s/pins/%s" % (_path_segment(channel_id), _path_segment(str(message_id)))
        )

    def get_server(self, server_id):
        data = self._rest.get("/api/v1/servers/%s" % _path_segment(server_id))
        return (data or {}).get("server")

    def update_server(self, server_id, **patch):
        data = self._rest.patch("/api/v1/servers/%s" % _path_segment(server_id), patch)
        return (data or {}).get("server")

    def get_server_permissions(self, server_id):
        return self._rest.get("/api/v1/servers/%s/permissions" % _path_segment(server_id))

    def list_audit_log(self, server_id, limit=None):
        qs = ("?limit=%s" % int(limit)) if limit is not None else ""
        data = self._rest.get("/api/v1/servers/%s/audit%s" % (_path_segment(server_id), qs))
        return (data or {}).get("audit", [])

    def list_categories(self, server_id):
        data = self._rest.get("/api/v1/servers/%s/categories" % _path_segment(server_id))
        return (data or {}).get("categories", [])

    def create_category(self, server_id, name):
        data = self._rest.post("/api/v1/servers/%s/categories" % _path_segment(server_id), {"name": name})
        return (data or {}).get("category")

    def update_category(self, category_id, **patch):
        data = self._rest.patch("/api/v1/categories/%s" % _path_segment(category_id), patch)
        return (data or {}).get("category")

    def delete_category(self, category_id):
        self._rest.delete("/api/v1/categories/%s" % _path_segment(category_id))

    def list_channels(self, server_id):
        data = self._rest.get("/api/v1/servers/%s/channels" % _path_segment(server_id))
        return data.get("channels", [])

    def get_channel(self, channel_id):
        data = self._rest.get("/api/v1/channels/%s" % _path_segment(channel_id))
        return (data or {}).get("channel")

    def create_channel(self, server_id, name, type="text", category_id=None, **options):
        body = {"name": name, "type": type, "category_id": category_id}
        body.update({k: v for k, v in options.items() if v is not None})
        data = self._rest.post("/api/v1/servers/%s/channels" % _path_segment(server_id), body)
        return data.get("channel_id")

    def update_channel(self, channel_id, **patch):
        data = self._rest.patch("/api/v1/channels/%s" % _path_segment(channel_id), patch)
        return (data or {}).get("channel")

    def rename_channel(self, channel_id, name):
        return self.update_channel(channel_id, name=name)

    def delete_channel(self, channel_id):
        self._rest.delete("/api/v1/channels/%s" % _path_segment(channel_id))

    def list_channel_permissions(self, channel_id):
        data = self._rest.get("/api/v1/channels/%s/permissions" % _path_segment(channel_id))
        return (data or {}).get("permissions", [])

    def set_channel_permission(self, channel_id, role_id, **overwrite):
        return self._rest.put(
            "/api/v1/channels/%s/permissions/%s" % (_path_segment(channel_id), _path_segment(role_id)),
            overwrite,
        )

    def delete_channel_permission(self, channel_id, role_id):
        return self._rest.delete(
            "/api/v1/channels/%s/permissions/%s" % (_path_segment(channel_id), _path_segment(role_id))
        )

    def list_members(self, server_id, query=None, role=None, limit=None):
        """Members, optionally filtered by name (query), role id, and limit."""
        data = self._rest.get(
            "/api/v1/servers/%s/members%s" % (_path_segment(server_id), _query(query=query, role=role, limit=limit))
        )
        return data.get("members", [])

    def get_member(self, server_id, user_id):
        data = self._rest.get("/api/v1/servers/%s/members/%s" % (_path_segment(server_id), _path_segment(user_id)))
        return (data or {}).get("member")

    def kick_member(self, server_id, user_id):
        return self._rest.delete("/api/v1/servers/%s/members/%s" % (_path_segment(server_id), _path_segment(user_id)))

    def timeout_member(self, server_id, user_id, timeout_minutes, reason=None):
        body = {"timeout_minutes": timeout_minutes}
        if reason is not None:
            body["reason"] = reason
        return self._rest.patch(
            "/api/v1/servers/%s/members/%s" % (_path_segment(server_id), _path_segment(user_id)),
            body,
        )

    def add_member_role(self, server_id, user_id, role_id):
        return self._rest.put(
            "/api/v1/servers/%s/members/%s/roles/%s"
            % (_path_segment(server_id), _path_segment(user_id), _path_segment(role_id))
        )

    def remove_member_role(self, server_id, user_id, role_id):
        return self._rest.delete(
            "/api/v1/servers/%s/members/%s/roles/%s"
            % (_path_segment(server_id), _path_segment(user_id), _path_segment(role_id))
        )

    def list_bans(self, server_id):
        data = self._rest.get("/api/v1/servers/%s/bans" % _path_segment(server_id))
        return (data or {}).get("bans", [])

    def ban_member(self, server_id, user_id, reason=None):
        body = {}
        if reason is not None:
            body["reason"] = reason
        return self._rest.put(
            "/api/v1/servers/%s/bans/%s" % (_path_segment(server_id), _path_segment(user_id)),
            body,
        )

    def unban_member(self, server_id, user_id):
        return self._rest.delete("/api/v1/servers/%s/bans/%s" % (_path_segment(server_id), _path_segment(user_id)))

    def list_roles(self, server_id):
        data = self._rest.get("/api/v1/servers/%s/roles" % _path_segment(server_id))
        return (data or {}).get("roles", [])

    def create_role(self, server_id, **role):
        data = self._rest.post("/api/v1/servers/%s/roles" % _path_segment(server_id), role)
        return (data or {}).get("role")

    def get_role(self, server_id, role_id):
        data = self._rest.get("/api/v1/servers/%s/roles/%s" % (_path_segment(server_id), _path_segment(role_id)))
        return (data or {}).get("role")

    def update_role(self, server_id, role_id, **patch):
        data = self._rest.patch(
            "/api/v1/servers/%s/roles/%s" % (_path_segment(server_id), _path_segment(role_id)),
            patch,
        )
        return (data or {}).get("role")

    def delete_role(self, server_id, role_id):
        return self._rest.delete(
            "/api/v1/servers/%s/roles/%s" % (_path_segment(server_id), _path_segment(role_id))
        )

    def list_webhooks(self, server_id):
        data = self._rest.get("/api/v1/servers/%s/webhooks" % _path_segment(server_id))
        return (data or {}).get("webhooks", [])

    def create_webhook(self, server_id, **options):
        data = self._rest.post("/api/v1/servers/%s/webhooks" % _path_segment(server_id), options)
        return (data or {}).get("webhook")

    def get_webhook(self, webhook_id):
        data = self._rest.get("/api/v1/webhooks/%s" % _path_segment(webhook_id))
        return (data or {}).get("webhook")

    def update_webhook(self, webhook_id, **patch):
        data = self._rest.patch("/api/v1/webhooks/%s" % _path_segment(webhook_id), patch)
        return (data or {}).get("webhook")

    def delete_webhook(self, webhook_id):
        self._rest.delete("/api/v1/webhooks/%s" % _path_segment(webhook_id))

    def list_commands(self):
        data = self._rest.get("/api/v1/commands")
        return (data or {}).get("commands", [])

    def set_commands(self, commands):
        data = self._rest.put("/api/v1/commands", {"commands": commands})
        return (data or {}).get("commands", [])

    def upsert_command(self, **command):
        data = self._rest.post("/api/v1/commands", command)
        return (data or {}).get("command", data)

    def delete_command(self, name):
        return self._rest.delete("/api/v1/commands?name=%s" % quote(str(name), safe=""))

    def respond_to_interaction(self, interaction_id, **response):
        return self._rest.post(
            "/api/v1/interactions/%s/callback" % _path_segment(interaction_id),
            response,
        )

    def leave_server(self, server_id):
        return self._rest.post("/api/v1/servers/%s/leave" % _path_segment(server_id))

    # ------------------------------------------------------------ the bot itself

    def fetch_me(self):
        """The bot's own profile and custom status, plus its account scopes: {"user", "bot"}."""
        return self._rest.get("/api/v1/users/@me")

    def set_status(self, text):
        """Sets the bot's custom status ("Watching 12 servers"); None clears it. Up to 64 characters."""
        data = self._rest.patch("/api/v1/users/@me", {"status_text": text})
        return ((data or {}).get("user") or {}).get("status_text")

    def list_servers(self):
        """Every space the bot is in, with the scopes granted there."""
        data = self._rest.get("/api/v1/users/@me/servers")
        return (data or {}).get("servers", [])

    def get_user(self, user_id):
        """A user's public profile, if they share a space with the bot (members.read)."""
        data = self._rest.get("/api/v1/users/%s" % _path_segment(user_id))
        return (data or {}).get("user")

    def create_invite(self, server_id, scopes):
        if not self.user:
            raise RuntimeError("Client is not connected - call connect() first.")
        return self._rest.post(
            "/api/v1/bots/%s/invites" % _path_segment(self.user["id"]),
            {"server_id": server_id, "scopes": scopes},
        )
