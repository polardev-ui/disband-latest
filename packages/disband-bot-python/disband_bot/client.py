"""The Disband bot client."""

import threading
import time

from .errors import AuthError
from .message import Message
from .rest import REST

EVENT_NAMES = frozenset(
    {"ready", "messageCreate", "messageUpdate", "messageDelete", "error"}
)


class Client:
    """A Disband bot.

    Bots are self-hosted: run this client wherever you like, and it talks to
    the Disband API with a bot token created in Settings -> Bots.
    """

    def __init__(self, token, base_url="https://www.disband.dev", gateway_timeout=20):
        if not token:
            raise ValueError("A bot token is required (Client(token=...))")
        self.token = token
        self.base_url = base_url.rstrip("/")
        self.gateway_timeout = gateway_timeout
        self._rest = REST(self)
        self._listeners = {name: [] for name in EVENT_NAMES}
        self._lock = threading.Lock()
        self._stopped = threading.Event()
        self._thread = None
        self.user = None
        self.connected = False

    # ------------------------------------------------------------ events

    def on(self, event, handler=None):
        """Register a handler, usable as a decorator or directly.

        ``client.on("messageCreate", handler)`` or::

            @client.on("messageCreate")
            async def handle(message):
                ...
        """

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
        def wrapped(*args):
            with self._lock:
                self._listeners[event].remove(wrapped)
            handler(*args)

        return self.on(event, wrapped)

    def _emit(self, event, *args):
        with self._lock:
            handlers = list(self._listeners.get(event, ()))
        for handler in handlers:
            try:
                result = handler(*args)
                if hasattr(result, "close"):
                    import asyncio

                    asyncio.ensure_future(result)
            except Exception:
                import traceback

                traceback.print_exc()

    # ------------------------------------------------------------ lifecycle

    def connect(self):
        """Resolves the bot identity, fires ``ready``, starts the gateway.

        Spawns a daemon thread for the gateway loop and returns immediately.
        To block forever, call :meth:`run` instead.
        """
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
            self._thread = threading.Thread(
                target=self._gateway_loop, daemon=True
            )
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
                payload = self._rest.get(
                    "/api/v1/gateway?timeout=%d" % self.gateway_timeout
                )
                for event in payload.get("events", []):
                    if self._stopped.is_set():
                        break
                    name = event["type"]
                    if name in ("messageCreate", "messageUpdate"):
                        self._emit(name, Message(event["payload"].get("message", event["payload"]), self))
                    else:
                        self._emit(name, event["payload"])
            except AuthError:
                self._emit(
                    "error",
                    RuntimeError(
                        "Invalid bot token - check your DISBAND_BOT_TOKEN."
                    ),
                )
                break
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                self._emit("error", exc)
                self._stopped.wait(3)

    # ------------------------------------------------------------ REST helpers

    def send_message(self, channel_id, content, reply_to_id=None):
        data = self._rest.post(
            "/api/v1/channels/%s/messages" % channel_id,
            {"content": content, "reply_to_id": reply_to_id},
        )
        return Message(data["message"], self)

    def list_messages(self, channel_id, limit=None, before=None):
        params = []
        if limit is not None:
            params.append("limit=%d" % limit)
        if before is not None:
            params.append("before=%s" % before)
        qs = ("?" + "&".join(params)) if params else ""
        data = self._rest.get("/api/v1/channels/%s/messages%s" % (channel_id, qs))
        return [Message(m, self) for m in data.get("messages", [])]

    def list_channels(self, server_id):
        data = self._rest.get("/api/v1/servers/%s/channels" % server_id)
        return data.get("channels", [])

    def list_members(self, server_id):
        data = self._rest.get("/api/v1/servers/%s/members" % server_id)
        return data.get("members", [])

    def create_channel(self, server_id, name, type="text", category_id=None):
        data = self._rest.post(
            "/api/v1/servers/%s/channels" % server_id,
            {"name": name, "type": type, "category_id": category_id},
        )
        return data.get("channel_id")

    def rename_channel(self, channel_id, name):
        return self._rest.patch("/api/v1/channels/%s" % channel_id, {"name": name})

    def delete_channel(self, channel_id):
        return self._rest.delete("/api/v1/channels/%s" % channel_id)

    def leave_server(self, server_id):
        return self._rest.post("/api/v1/servers/%s/leave" % server_id)

    def create_invite(self, server_id, scopes):
        if not self.user:
            raise RuntimeError("Client is not connected - call connect() first.")
        return self._rest.post(
            "/api/v1/bots/%s/invites" % self.user["id"],
            {"server_id": server_id, "scopes": scopes},
        )
