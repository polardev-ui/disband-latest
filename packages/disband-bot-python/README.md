# disband-bot

The official Python client for [Disband](https://www.disband.dev) bots.

Bots are self-hosted: you run the code yourself, a server owner invites the bot,
and the bot connects with its token. Disband never hosts or executes your bot.
This client uses only the Python standard library (threading + urllib).

## Setup

```bash
pip install disband-bot
```

or, from this monorepo:

```bash
pip install ./packages/disband-bot-python
```

Create a bot first:

1. Open **Settings → Bots** in Disband and click **New bot**.
2. Pick the scopes it needs and copy the token it gives you — it's shown once.
3. In **Settings → Bots**, generate an invite link for the server you want to
   join and send it to the server owner to approve.

## Usage

```python
from disband_bot import Client

client = Client(token=DISBAND_BOT_TOKEN)


@client.on("ready")
def on_ready(me):
    print(f"Logged in as {me['name']} ({', '.join(me['scopes'])})")


@client.on("messageCreate")
def on_message(message):
    if message.author_is_bot:
        return
    if message.content == "!ping":
        message.reply("pong")


client.run()  # connects and blocks forever
```

## API

### `Client(token, base_url="https://www.disband.dev", gateway_timeout=20)`

### Events

| Event | Args | Description |
|---|---|---|
| `ready` | `user` | Fired after connecting. `user["id"]` is the bot id. |
| `messageCreate` | `message` | A new message in a server the bot can see. |
| `messageUpdate` | `message` | A message was edited. |
| `messageDelete` | `message` | A message was deleted. |
| `error` | `error` | Gateway errors (the loop retries automatically). |

`Message` exposes `id`, `channel_id`, `server_id`, `author`, `content`,
`reply_to_id`, `mentions`, `attachment`, `created_at`, `display_id`, and
`message.reply(content)`. `message.author_is_bot` tells you whether the sender
was a bot.

### Methods

```python
await client.send_message(channel_id, "Deploy finished")   # async handler? just call it
message.reply("pong")                                       # reply to a received message
msgs = client.list_messages(channel_id, limit=25)
channels = client.list_channels(server_id)
members = client.list_members(server_id)
channel_id = client.create_channel(server_id, "deploys")
client.rename_channel(channel_id, "deploys-2")
client.delete_channel(channel_id)
client.leave_server(server_id)
invite = client.create_invite(server_id, ["messages.read", "messages.write"])
```

## Scopes

A bot's reach is the intersection of the scopes on its bot account and the
scopes an owner approved for a specific server:

- `messages.read` — receive message events and read messages/channels.
- `messages.write` — post and reply.
- `members.read` — read the member list.
- `channels.manage` — create, rename, and delete channels (also needs the
  `manage_channels` role in that server).

## License

MIT
