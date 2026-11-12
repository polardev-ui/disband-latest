# disband-bot

The official Python client for [Disband](https://www.disband.dev) bots.

Bots are self-hosted: you run the code yourself, a space owner approves the bot,
and the bot connects with its token. Disband never hosts or executes your bot.
This client uses only the Python standard library.

- Python 3.9+
- Zero runtime dependencies
- Long-poll gateway + helpers for the core and extended Bot API

## Install

```bash
pip install disband-bot
```

## Quick start

```python
import os
from disband_bot import Client

client = Client(token=os.environ["DISBAND_BOT_TOKEN"])

@client.on("ready")
def on_ready(me):
    print("Logged in as", me["name"])

@client.on("messageCreate")
def on_message(message):
    if message.author_is_bot:
        return
    if message.content == "!ping":
        message.reply("pong")

client.run()  # connects and blocks forever
```

## Client options

```python
Client(
    token="…",                    # required
    base_url="https://www.disband.dev",
    gateway_timeout=20,           # seconds (1–20)
    allow_insecure_localhost=False,
    retry_rate_limits=True,       # wait out a 429's Retry-After and try again
    max_retries=3,                # retries per request before a RateLimitError
)
```

Use `client.connect()` to start in a background thread, or `client.run()` to
block. Call `client.close()` to stop.

## Events

| Event | Payload | Description |
| --- | --- | --- |
| `ready` | `dict` | Fired after connecting. |
| `messageCreate` | `Message` | A message was posted in a visible channel. |
| `messageUpdate` | `Message` | A message was edited. |
| `messageDelete` | `Message` | A message was deleted (partial fields). |
| `reactionAdd` | `dict` | Someone reacted (`message_id`, `channel_id`, `emoji`, `user_id`, `user`). |
| `reactionRemove` | `dict` | A reaction was removed (same fields, no `user`). |
| `memberJoin` | `dict` | A member joined a space (`members.read`). |
| `memberLeave` | `dict` | A member left a space (`members.read`). |
| `memberUpdate` | `dict` | A member's roles changed (`members.read`). |
| `channelCreate` | `dict` | A channel or forum post the bot can see was made. |
| `channelUpdate` | `dict` | Its name, topic, position or settings changed. |
| `channelDelete` | `dict` | It was deleted. |
| `roleCreate` / `roleUpdate` / `roleDelete` | `dict` | Roles changed (`members.read` or `roles.manage`). |
| `serverUpdate` | `dict` | The space's name, icon, banner or owner changed. |
| `serverJoin` | `dict` | The bot was added to a space (with its granted `scopes`). |
| `serverLeave` | `dict` | The bot was removed from a space. |
| `scopesUpdate` | `dict` | The scopes granted in a space changed. |
| `interactionCreate` | `dict` | A slash command or button press for this bot. |
| `error` | `Exception` | Gateway/API handler errors (the loop retries automatically). |

`Message` attributes: `id`, `channel_id`, `server_id`, `author`, `content`,
`reply_to_id`, `mentions`, `embeds`, `components`, `interaction`, `webhook_id`,
`attachment`, `created_at`, `edited_at`, `display_id`, `raw`,
`author_is_bot`.

`Message` helpers: `reply(content=None, **options)`, `edit(content_or_patch=None, **patch)`,
`delete()`, `react(emoji)`, `unreact(emoji)`, `pin()`, `unpin()`.

## API methods

### Messages, reactions, pins

```python
msg = client.send_message(channel_id, "Hello", embeds=[...], components=[...], reply_to_id=msg_id)
client.edit_message(channel_id, message_id, content="Edited")
messages = client.list_messages(channel_id, limit=50, before=message_id)  # or after= / around=
message = client.get_message(channel_id, message_id)  # message.reactions
client.delete_message(channel_id, message_id)
deleted = client.bulk_delete_messages(channel_id, [id1, id2])  # UUIDs, 1-100
client.send_typing(channel_id)  # "<bot> is typing..." for a few seconds

client.add_reaction(channel_id, message_id, "👍")
client.remove_reaction(channel_id, message_id, "👍")
reactions = client.list_reactions(channel_id, message_id)  # [{"emoji", "count", "me"}]
users = client.list_reaction_users(channel_id, message_id, "👍", limit=100)
client.remove_user_reaction(channel_id, message_id, "👍", user_id)  # manage_messages
removed = client.clear_reactions(channel_id, message_id, emoji="👍")  # or all
pins = client.list_pins(channel_id)
client.pin_message(channel_id, message_id)
client.unpin_message(channel_id, message_id)
```

### Forum posts

```python
posts = client.list_forum_posts(forum_id, limit=50)
post, message = client.create_forum_post(forum_id, "Release notes", content="v2 is out", tags=["announcement"])
client.send_message(post["id"], "Questions welcome here.")  # a post is a channel
```

### The bot itself

```python
me = client.fetch_me()  # {"user": {...}, "bot": {...}}
client.set_status("Watching 12 servers")  # None clears it
servers = client.list_servers()
profile = client.get_user(user_id)  # shares a space, members.read
found = client.list_members(server_id, query="ali", role=role_id, limit=25)
```

### Servers, audit

```python
server = client.get_server(server_id)
updated = client.update_server(server_id, name="New name", discoverable=True)
perms = client.get_server_permissions(server_id)
audit = client.list_audit_log(server_id, limit=100)
```

### Categories and channels

```python
categories = client.list_categories(server_id)
category = client.create_category(server_id, "Support")
client.update_category(category_id, name="Support", position=1)
client.delete_category(category_id)

channels = client.list_channels(server_id)  # visible channels only
channel = client.get_channel(channel_id)
channel_id = client.create_channel(server_id, "staff-chat", type="text", category_id=cat_id,
    topic="Staff", permissions=[
        {"role_id": everyone_role_id, "can_view": False},
        {"role_id": staff_role_id, "can_view": True, "can_post": True},
    ])
client.update_channel(channel_id, name="new-name", topic=None, slow_mode_seconds=10)
client.rename_channel(channel_id, "new-name")
client.delete_channel(channel_id)

overwrites = client.list_channel_permissions(channel_id)
client.set_channel_permission(channel_id, role_id, can_view=True, can_post=True)
client.delete_channel_permission(channel_id, role_id)
```

> Private channels are channels with role overwrites. Deny `can_view` for
> `@everyone` and allow it for staff roles. Hidden channels are omitted from
> lists and return 403/404 on direct access.

### Members, bans, roles

```python
members = client.list_members(server_id)
member = client.get_member(server_id, user_id)
client.kick_member(server_id, user_id)
client.timeout_member(server_id, user_id, 10, reason="Cooling off")  # 1–40320 minutes
client.add_member_role(server_id, user_id, role_id)
client.remove_member_role(server_id, user_id, role_id)

bans = client.list_bans(server_id)
client.ban_member(server_id, user_id, reason="Spam")
client.unban_member(server_id, user_id)

roles = client.list_roles(server_id)
role = client.create_role(server_id, name="Ticket Staff", color="#5865f2",
    permissions={"send_messages": True}, position=2)
one = client.get_role(server_id, role_id)
client.update_role(server_id, role_id, name="Staff", permissions={"send_messages": True})
client.delete_role(server_id, role_id)
```

Moderation/role actions enforce hierarchy (no acting on owner/moderators/bots or
roles at/above the bot's highest role).

### Webhooks

```python
webhooks = client.list_webhooks(server_id)
webhook = client.create_webhook(server_id, channel_id=channel_id, name="Deploys")
one = client.get_webhook(webhook_id)
client.update_webhook(webhook_id, name="New name", reset_token=True)
client.delete_webhook(webhook_id)
```

Webhook objects include a posting `url` — treat it as a secret. Webhooks in
channels the bot cannot view are hidden.

### Commands and interactions

```python
commands = client.list_commands()
client.set_commands([{"name": "ping", "description": "Ping", "options": []}])
client.upsert_command(name="ping", description="Ping")
client.delete_command("ping")

@client.on("interactionCreate")
def on_interaction(interaction):
    client.respond_to_interaction(interaction["id"], content="Pong!", ephemeral=True)
```

### Invites and lifecycle

```python
client.leave_server(server_id)
invite = client.create_invite(server_id, ["messages.read", "messages.write"])
# invite["invite_url"] -> send to the space owner
```

## Scopes

Account scopes and per-space grants are intersected; lowering account scopes
trims existing grants immediately.

`messages.read`, `messages.write`, `messages.delete`, `messages.react`,
`members.read`, `members.kick`, `members.ban`, `members.timeout`,
`channels.read`, `channels.manage`, `webhooks.manage`, `roles.manage`,
`servers.read`, `audit.read`.

Management actions also require the matching role permission in the space.

## Errors

Exceptions: `AuthError` (401), `PermissionError` (403), `RateLimitError` (429,
`.retry_after` seconds), `HttpError` (other failures). Each carries `.status`,
`.message`/message, and `.body`.

## License

MIT
