# @disband/bot

The official JavaScript client for [Disband](https://www.disband.dev) bots.

Bots are self-hosted: you run the code yourself, a server owner invites the bot,
and the bot connects with its token. Disband never hosts or executes your bot.

## Setup

```bash
npm install @disband/bot
```

or, from this monorepo:

```bash
npm install /path/to/packages/bot
```

Create a bot first:

1. Open **Settings → Bots** in Disband and click **New bot**.
2. Pick the scopes it needs and copy the token it gives you — it's shown once.
3. In **Settings → Bots**, generate an invite link for the server you want to
   join and send it to the server owner to approve.

## Usage

```js
import { Client } from "@disband/bot";

const client = new Client({ token: process.env.DISBAND_BOT_TOKEN });

client.on("ready", (me) => {
  console.log(`Logged in as ${me.name} (${me.scopes.join(", ")})`);
});

client.on("messageCreate", async (message) => {
  if (message.author?.is_bot) return;
  if (message.content !== "!ping") return;
  await message.reply("pong");
});

await client.connect();
```

## API

### `new Client({ token, baseUrl?, gatewayTimeout? })`

- `token` — required. The bot token from Settings → Bots.
- `baseUrl` — optional, defaults to `https://www.disband.dev`.
- `gatewayTimeout` — seconds per gateway poll (default `20`).

### Events

| Event | Args | Description |
|---|---|---|
| `ready` | `user` | Fired after connecting. `user.id` is the bot id. |
| `messageCreate` | `message` | A new message in a server the bot can see. |
| `messageUpdate` | `message` | A message was edited. |
| `messageDelete` | `message` | A message was deleted. |
| `error` | `error` | Gateway errors (the loop retries automatically). |

`Message` exposes `id`, `channelId`, `serverId`, `author`, `content`,
`replyToId`, `mentions`, `attachment`, `createdAt`, `displayId`, and
`message.reply(content)`.

### Methods

```js
await client.sendMessage(channelId, "Deploy finished");
await message.reply("pong");                      // reply to a received message
const msgs = await client.listMessages(channelId, { limit: 25 });
const channels = await client.listChannels(serverId);
const members = await client.listMembers(serverId);
const channelId = await client.createChannel(serverId, "deploys");
await client.renameChannel(channelId, "deploys-2");
await client.deleteChannel(channelId);
await client.leaveServer(serverId);
const { invite_url } = await client.createInvite(serverId, ["messages.read", "messages.write"]);
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
