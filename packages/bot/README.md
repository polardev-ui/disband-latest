# @disband/bot

The official JavaScript client for [Disband](https://www.disband.dev) bots.

Bots are self-hosted: you run the code yourself, a space owner approves the bot,
and the bot connects with its token. Disband never hosts or executes your bot.

- Node.js 18+ (uses `fetch`)
- Zero runtime dependencies
- Long-poll gateway + typed helpers for the core and extended Bot API

## Install

```bash
npm install @disband/bot
```

## Quick start

```js
import { Client } from "@disband/bot";

const client = new Client({ token: process.env.DISBAND_BOT_TOKEN });

client.on("ready", (me) => {
  console.log(`Logged in as ${me.name}`);
});

client.on("messageCreate", async (message) => {
  if (message.authorIsBot) return;
  if (message.content === "!ping") await message.reply("pong");
});

await client.connect();
```

## Client options

```js
new Client({
  token: "…",                    // required
  baseUrl: "https://www.disband.dev",
  gatewayTimeout: 20,            // seconds (1–20)
  requestTimeout: 30000,         // ms
  allowInsecureLocalhost: false, // allow http://localhost only for local dev
});
```

## Events

| Event | Payload | Description |
| --- | --- | --- |
| `ready` | `user` | Fired after connecting. |
| `messageCreate` | `Message` | A message was posted in a visible channel. |
| `messageUpdate` | `Message` | A message was edited. |
| `messageDelete` | `Message` | A message was deleted (partial fields). |
| `memberJoin` | object | A member joined a space (`members.read`). |
| `memberLeave` | object | A member left a space (`members.read`). |
| `memberUpdate` | object | A member's roles changed (`members.read`). |
| `interactionCreate` | object | A slash command or button press for this bot. |
| `error` | `Error` | Gateway/API handler errors (the loop retries automatically). |
| `debug` | `string` | Non-fatal diagnostics. |

`Message` fields: `id`, `channelId`, `serverId`, `author`, `content`,
`replyToId`, `mentions`, `embeds`, `components`, `interaction`, `webhookId`,
`attachment`, `createdAt`, `editedAt`, `displayId`, `raw`.

`Message` helpers: `reply(content, options?)`, `edit(patch)`, `delete()`,
`react(emoji)`, `unreact(emoji)`, `pin()`, `unpin()`.

## API methods

### Messages, reactions, pins

```js
await client.sendMessage(channelId, "Hello", {
  replyToId, embeds, components,
});
await client.editMessage(channelId, messageId, { content: "Edited" });
const messages = await client.listMessages(channelId, { limit: 50, before });
await client.deleteMessage(channelId, messageId);
const deleted = await client.bulkDeleteMessages(channelId, [id1, id2]); // UUIDs, 1-100

await client.addReaction(channelId, messageId, "👍");
await client.removeReaction(channelId, messageId, "👍");
const pins = await client.listPins(channelId);
await client.pinMessage(channelId, messageId);
await client.unpinMessage(channelId, messageId);
```

### Servers, audit

```js
const server = await client.getServer(serverId); // servers.read/messages.read/channels.read/members.read
const updated = await client.updateServer(serverId, { name, description, discoverable }); // manage_server
const perms = await client.getServerPermissions(serverId); // scopes, roles, permission map
const audit = await client.listAuditLog(serverId, { limit: 100 }); // audit.read or view_audit_log
```

### Categories and channels

```js
const categories = await client.listCategories(serverId);
const category = await client.createCategory(serverId, "Support");
await client.updateCategory(categoryId, { name, position });
await client.deleteCategory(categoryId);

const channels = await client.listChannels(serverId); // visible channels only
const channel = await client.getChannel(channelId);
const channelId = await client.createChannel(serverId, "staff-chat", {
  type: "text",           // or "voice"
  categoryId,
  topic,
  slowModeSeconds,
  readOnly,
  userLimit,
  permissions: [          // role overwrites
    { role_id: everyoneRoleId, can_view: false },
    { role_id: staffRoleId, can_view: true, can_post: true },
  ],
});
await client.updateChannel(channelId, { name, topic, slow_mode_seconds, category_id, position, read_only, locked, user_limit });
await client.renameChannel(channelId, "new-name");
await client.deleteChannel(channelId);

const overwrites = await client.listChannelPermissions(channelId);
await client.setChannelPermission(channelId, roleId, { can_view: true, can_post: true });
await client.deleteChannelPermission(channelId, roleId);
```

> Private channels are just channels with role overwrites. To make one private,
> deny `can_view` for `@everyone` and allow it for the roles that should see it.
> Hidden channels are omitted from lists and return 403/404 on direct access.

### Members, bans, roles

```js
const members = await client.listMembers(serverId);
const member = await client.getMember(serverId, userId);
await client.kickMember(serverId, userId);
await client.timeoutMember(serverId, userId, 10, "Cooling off"); // 1–40320 minutes
await client.addMemberRole(serverId, userId, roleId);
await client.removeMemberRole(serverId, userId, roleId);

const bans = await client.listBans(serverId);
await client.banMember(serverId, userId, { reason: "Spam" });
await client.unbanMember(serverId, userId);

const roles = await client.listRoles(serverId);
const role = await client.createRole(serverId, {
  name: "Ticket Staff", color: "#5865f2", permissions: { send_messages: true }, position: 2,
});
const one = await client.getRole(serverId, roleId);
await client.updateRole(serverId, roleId, { name, color, permissions, self_assignable, position });
await client.deleteRole(serverId, roleId);
```

Moderation/role actions enforce hierarchy: you cannot act on the owner,
moderators, bots, yourself, or roles at/above the bot's highest role.

### Webhooks

```js
const webhooks = await client.listWebhooks(serverId);
const webhook = await client.createWebhook(serverId, { channel_id, name, avatar_url });
const one = await client.getWebhook(webhookId);
await client.updateWebhook(webhookId, { name, avatar_url, channel_id, reset_token: true });
await client.deleteWebhook(webhookId);
```

Webhook objects include a posting `url` — treat it as a secret. Webhooks in
channels the bot cannot view are hidden.

### Commands and interactions

```js
const commands = await client.listCommands();
await client.setCommands([{ name: "ping", description: "Ping", options: [] }]);
await client.upsertCommand({ name: "ping", description: "Ping" });
await client.deleteCommand("ping");

client.on("interactionCreate", async (interaction) => {
  await client.respondToInteraction(interaction.id, {
    content: "Pong!",
    ephemeral: true,
  });
});
```

### Invites and lifecycle

```js
await client.leaveServer(serverId);
const invite = await client.createInvite(serverId, ["messages.read", "messages.write"]);
// invite.invite_url -> send to the space owner
```

## Scopes

Account scopes and per-space grants are intersected; lowering account scopes
trims existing grants immediately.

`messages.read`, `messages.write`, `messages.delete`, `messages.react`,
`members.read`, `members.kick`, `members.ban`, `members.timeout`,
`channels.read`, `channels.manage`, `webhooks.manage`, `roles.manage`,
`servers.read`, `audit.read`.

Management actions also require the matching role permission in the space (e.g.
`manage_channels`, `manage_roles`, `manage_messages`, `manage_webhooks`,
`manage_server`, `pin_messages`, `ban`, `view_audit_log`).

## Errors

Thrown errors: `AuthError` (401), `PermissionError` (403), `RateLimitError` (429,
has `retryAfter` seconds), `HttpError` (other non-2xx). Each has `status`,
`message`, and `body`.

## License

MIT
