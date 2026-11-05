"use client";

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AppProvider } from "@/contexts/AppContext";
import Link from "next/link";

export default function DevelopersDocsPage() {
  return (
    <ThemeProvider>
      <AppProvider>
        <div className="min-h-screen bg-bg-primary text-text-normal">
          <header className="border-b border-divider px-6 py-4">
            <div className="mx-auto flex max-w-5xl items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Disband Bot Documentation</h1>
                <p className="text-sm text-text-muted">Build, deploy, and manage Disband bots</p>
              </div>
              <a href="/developers/applications" className="rounded-lg border border-divider px-4 py-2 text-sm font-semibold hover:bg-interactive-hover">
                My Applications
              </a>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-8 space-y-10">

            {/* Getting Started */}
            <section>
              <h2 className="text-xl font-bold mb-4">Getting Started</h2>
              <p className="text-sm text-text-muted mb-4">
                Bots are self-hosted: you run the code yourself, a server owner invites the bot,
                and the bot connects with its token. Disband never hosts or executes your bot.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">1. Create a bot</h3>
              <p className="text-sm text-text-muted mb-2">
                Open Disband → Settings → Bots (or the Developers portal) → click <strong>New bot</strong>.
                Pick a name and the scopes it needs, then copy the token — it's shown once.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">2. Install the SDK</h3>
              <div className="rounded-lg border border-divider bg-bg-secondary p-4 font-mono text-sm">
                <p className="text-text-muted mb-1"># Python (zero dependencies)</p>
                <p>pip install disband-bot</p>
                <p className="text-text-muted mt-3 mb-1"># JavaScript / TypeScript</p>
                <p>npm install @disband/bot</p>
              </div>

              <h3 className="text-lg font-semibold mt-6 mb-2">3. Write your bot</h3>
              <div className="rounded-lg border border-divider bg-bg-secondary p-4">
                <p className="text-xs font-bold uppercase text-text-muted mb-2">Python</p>
                <pre className="text-sm overflow-x-auto whitespace-pre-wrap">{`from disband_bot import Client

client = Client(token="YOUR_BOT_TOKEN")

@client.on("ready")
def on_ready(me):
    print(f"Logged in as {me['name']}")

@client.on("messageCreate")
def on_message(msg):
    if msg.content == "!ping":
        msg.reply("pong")

client.run()`}</pre>
              </div>
              <div className="rounded-lg border border-divider bg-bg-secondary p-4 mt-4">
                <p className="text-xs font-bold uppercase text-text-muted mb-2">JavaScript / TypeScript</p>
                <pre className="text-sm overflow-x-auto whitespace-pre-wrap">{`import { Client } from "@disband/bot";

const client = new Client({ token: process.env.DISBAND_BOT_TOKEN });

client.on("messageCreate", async (message) => {
  if (message.author?.is_bot) return;
  if (message.content !== "!ping") return;
  await message.reply("pong");
});

await client.connect();`}</pre>
              </div>

              <h3 className="text-lg font-semibold mt-6 mb-2">4. Invite the bot to a space</h3>
              <p className="text-sm text-text-muted">
                In Settings → Bots, click <strong>Invite</strong> on your bot. Choose a space (or use
                <strong> General invite</strong> for a link anyone can use). Copy the invite link and
                share it — the space owner approves it.
              </p>
            </section>

            {/* Scopes */}
            <section>
              <h2 className="text-xl font-bold mb-4">Bot Scopes (Permissions)</h2>
              <p className="text-sm text-text-muted mb-4">
                Scopes control what a bot can do. Pick the minimum set your bot needs.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-divider rounded-lg">
                  <thead>
                    <tr className="bg-bg-secondary">
                      <th className="px-4 py-2 text-left font-semibold">Scope</th>
                      <th className="px-4 py-2 text-left font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["messages.read", "Receive message events and read messages and channels."],
                      ["messages.write", "Send and reply to messages."],
                      ["messages.delete", "Delete messages the bot can see."],
                      ["messages.react", "Add and remove reactions on messages."],
                      ["members.read", "See the member list of spaces the bot has joined."],
                      ["channels.read", "List channels and categories."],
                      ["channels.manage", "Create, rename, and delete channels."],
                      ["webhooks.manage", "Create, edit, and delete webhooks."],
                      ["roles.manage", "Create, edit and delete roles, give and take members' roles, and set channel permissions for roles."],
                    ].map(([scope, desc]) => (
                      <tr key={scope} className="border-t border-divider">
                        <td className="px-4 py-2 font-mono text-xs">{scope}</td>
                        <td className="px-4 py-2 text-text-muted">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Roles */}
            <section id="roles">
              <h2 className="text-xl font-bold mb-4">Roles and Permissions</h2>
              <p className="text-sm text-text-muted mb-4">
                With <code>roles.manage</code> and a role that has <strong>Manage Roles</strong>, a bot can create, edit,
                reorder and delete roles and give or take members&apos; roles. Like people, it only manages roles below its
                own highest role, only changes members below it, never the space owner, and can only switch on permissions
                it has itself. So give your bot a role and drag it above the roles it should look after.
              </p>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm border border-divider rounded-lg">
                  <thead>
                    <tr className="bg-bg-secondary">
                      <th className="px-4 py-2 text-left font-semibold">Request</th>
                      <th className="px-4 py-2 text-left font-semibold">What it does</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["GET /servers/{id}/permissions", "The bot's own permissions, roles, scopes and highest_role_position."],
                      ["GET /servers/{id}/roles", "Every role, highest first. manageable is true for roles below the bot."],
                      ["POST /servers/{id}/roles", "Create a role: name, color, permissions, self_assignable, position."],
                      ["PATCH /servers/{id}/roles/{roleId}", "Edit a role. Only the fields you send change."],
                      ["DELETE /servers/{id}/roles/{roleId}", "Delete a role."],
                      ["PUT /servers/{id}/members/{userId}/roles/{roleId}", "Give a member a role."],
                      ["DELETE /servers/{id}/members/{userId}/roles/{roleId}", "Take a role from a member."],
                      ["GET /channels/{id}/permissions", "The channel's role overrides."],
                      ["PUT /channels/{id}/permissions/{roleId}", "Set can_view, can_post, can_react and can_attach: true, false or null (inherit)."],
                      ["DELETE /channels/{id}/permissions/{roleId}", "Remove a role's override."],
                    ].map(([req, desc]) => (
                      <tr key={req} className="border-t border-divider">
                        <td className="px-4 py-2 font-mono text-xs">{req}</td>
                        <td className="px-4 py-2 text-text-muted">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-text-muted mb-2">
                Channel permissions need <strong>Manage Channels</strong> and <code>channels.manage</code> or{" "}
                <code>roles.manage</code>. Setting <code>@everyone</code> to <code>can_view: false</code> and a Verified role to{" "}
                <code>can_view: true</code> hides a channel until someone is verified. Members from{" "}
                <code>GET /servers/&#123;id&#125;/members</code> list their <code>roles</code>.
              </p>
              <div className="rounded-lg border border-divider bg-bg-secondary p-4">
                <pre className="text-sm overflow-x-auto whitespace-pre-wrap">{`curl -X POST https://www.disband.dev/api/v1/servers/$SERVER/roles \\
  -H "Authorization: Bot $DISBAND_BOT_TOKEN" -H "Content-Type: application/json" \\
  -d '{ "name": "Verified", "color": "#3ba55c", "permissions": { "send_messages": true } }'

curl -X PUT https://www.disband.dev/api/v1/servers/$SERVER/members/$USER/roles/$VERIFIED \\
  -H "Authorization: Bot $DISBAND_BOT_TOKEN"

curl -X PUT https://www.disband.dev/api/v1/channels/$CHANNEL/permissions/$EVERYONE \\
  -H "Authorization: Bot $DISBAND_BOT_TOKEN" -H "Content-Type: application/json" \\
  -d '{ "can_view": false }'`}</pre>
              </div>
            </section>

            {/* General Invites */}
            <section>
              <h2 className="text-xl font-bold mb-4">General Invite Links</h2>
              <p className="text-sm text-text-muted">
                When creating an invite, enable <strong>General invite</strong> to generate a link
                that anyone can use. The recipient signs in, picks a space they manage, and approves
                the bot. Great for distributing bots publicly.
              </p>
            </section>

            {/* Bot Management */}
            <section>
              <h2 className="text-xl font-bold mb-4">Managing Bots</h2>
              <p className="text-sm text-text-muted mb-4">
                Go to <a href="/developers/applications" className="text-brand hover:underline">Developers → Applications</a> to:
              </p>
              <ul className="list-disc list-inside text-sm text-text-muted space-y-1">
                <li>Create and revoke bots</li>
                <li>Customize name, avatar, bio, and scopes</li>
                <li>Generate targeted or general invite links</li>
                <li>Copy bot tokens (shown once at creation)</li>
              </ul>
            </section>

            {/* SDK Reference */}
            <section>
              <h2 className="text-xl font-bold mb-4">SDK Reference</h2>
              <h3 className="text-lg font-semibold mt-4 mb-2">Python</h3>
              <div className="rounded-lg border border-divider bg-bg-secondary p-4 text-sm space-y-1">
                <p><code className="text-brand">client.run()</code> — start the bot (blocking)</p>
                <p><code className="text-brand">client.connect()</code> — connect (async)</p>
                <p><code className="text-brand">client.close()</code> — disconnect</p>
                <p><code className="text-brand">client.send_message(channel_id, content)</code></p>
                <p><code className="text-brand">client.list_messages(channel_id, limit, before)</code></p>
                <p><code className="text-brand">client.list_channels(server_id)</code></p>
                <p><code className="text-brand">client.list_members(server_id)</code></p>
                <p><code className="text-brand">client.create_channel(server_id, name, type, category_id)</code></p>
                <p><code className="text-brand">client.rename_channel(channel_id, name)</code></p>
                <p><code className="text-brand">client.delete_channel(channel_id)</code></p>
                <p><code className="text-brand">client.leave_server(server_id)</code></p>
                <p><code className="text-brand">client.create_invite(server_id, scopes)</code></p>
              </div>
              <h3 className="text-lg font-semibold mt-4 mb-2">JavaScript / TypeScript</h3>
              <div className="rounded-lg border border-divider bg-bg-secondary p-4 text-sm space-y-1">
                <p><code className="text-brand">client.connect()</code> — connect (async)</p>
                <p><code className="text-brand">client.on(event, handler)</code> — register event handler</p>
                <p><code className="text-brand">message.reply(content)</code> — reply to a message</p>
                <p><code className="text-brand">message.edit(content)</code> — edit a message</p>
              </div>
            </section>

            {/* Slash commands */}
            <section id="commands">
              <h2 className="text-xl font-bold mb-4">Slash Commands, Interactions and Buttons</h2>
              <p className="text-sm text-text-muted mb-4">
                Register commands once and they appear in the <code>/</code> list in every space your bot is in.
                When someone runs one (or presses one of your bot&apos;s buttons) you receive an{" "}
                <code>interactionCreate</code> event and answer it within 15 minutes. Answering doesn&apos;t
                need <code>messages.write</code> or <code>messages.read</code>. Every request uses{" "}
                <code>Authorization: Bot YOUR_TOKEN</code> against <code>https://www.disband.dev/api/v1</code>.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">1. Register commands</h3>
              <p className="text-sm text-text-muted mb-2">
                <code>PUT /commands</code> replaces all of your commands with the list you send. <code>POST /commands</code>{" "}
                creates or updates one, <code>GET /commands</code> lists them and <code>DELETE /commands?name=weather</code>{" "}
                removes one. Up to 100 commands with 25 options each. Names are 1–32 lowercase letters, digits,{" "}
                <code>_</code> or <code>-</code>. Option types are <code>string</code>, <code>integer</code>,{" "}
                <code>number</code>, <code>boolean</code>, <code>user</code> and <code>channel</code>. Required
                options come first, and string or number options can list up to 25 <code>choices</code>.
              </p>
              <div className="rounded-lg border border-divider bg-bg-secondary p-4">
                <pre className="text-sm overflow-x-auto whitespace-pre-wrap">{`curl -X PUT https://www.disband.dev/api/v1/commands \\
  -H "Authorization: Bot $DISBAND_BOT_TOKEN" -H "Content-Type: application/json" \\
  -d '[
    { "name": "weather", "description": "Today\\u2019s weather",
      "options": [
        { "name": "city", "description": "Which city", "type": "string", "required": true },
        { "name": "units", "description": "C or F", "type": "string",
          "choices": [{ "name": "Celsius", "value": "c" }, { "name": "Fahrenheit", "value": "f" }] }
      ] },
    { "name": "poll", "description": "Start a yes/no poll" }
  ]'`}</pre>
              </div>

              <h3 className="text-lg font-semibold mt-6 mb-2">2. Receive the interaction</h3>
              <p className="text-sm text-text-muted mb-2">
                It arrives through the gateway (<code>GET /gateway</code>) like any other event. <code>user</code> and{" "}
                <code>channel</code> options arrive as IDs.
              </p>
              <div className="rounded-lg border border-divider bg-bg-secondary p-4">
                <pre className="text-sm overflow-x-auto whitespace-pre-wrap">{`{ "type": "interactionCreate",
  "payload": {
    "id": "6f1c…", "type": "command",            // or "component" for a button
    "server_id": "…", "channel_id": "…",
    "user": { "id": "…", "username": "kai", "display_name": "Kai", "avatar_url": null },
    "command": { "name": "weather", "options": { "city": "London", "units": "c" } },
    "component": null,                            // { "custom_id", "message_id" } for a button
    "expires_at": "2026-11-01T12:15:00Z" } }`}</pre>
              </div>

              <h3 className="text-lg font-semibold mt-6 mb-2">3. Answer it</h3>
              <p className="text-sm text-text-muted mb-2">
                <code>POST /interactions/&#123;id&#125;/callback</code> with <code>content</code>, <code>embeds</code> and{" "}
                <code>components</code>. The reply shows &ldquo;Kai used /weather&rdquo; above it. You can answer up to
                5 times (follow-ups). For a button press, send <code>&quot;update&quot;: true</code> to edit the message
                the button is on instead, for pages, counters or disabling a button once it&apos;s used.
              </p>
              <div className="rounded-lg border border-divider bg-bg-secondary p-4">
                <pre className="text-sm overflow-x-auto whitespace-pre-wrap">{`const base = "https://www.disband.dev/api/v1";
const headers = { Authorization: \`Bot \${process.env.DISBAND_BOT_TOKEN}\`, "Content-Type": "application/json" };

for (;;) {
  const { events } = await fetch(\`\${base}/gateway\`, { headers }).then((r) => r.json());
  for (const { type, payload: i } of events ?? []) {
    if (type !== "interactionCreate") continue;
    const reply = (body) =>
      fetch(\`\${base}/interactions/\${i.id}/callback\`, { method: "POST", headers, body: JSON.stringify(body) });

    if (i.command?.name === "poll") {
      await reply({
        content: "Do you like pizza?",
        components: [{ type: "action_row", components: [
          { type: "button", style: "success", label: "Yes", custom_id: "poll:yes" },
          { type: "button", style: "danger", label: "No", custom_id: "poll:no" },
          { type: "button", style: "link", label: "Docs", url: "https://www.disband.dev/developers/docs" },
        ] }],
      });
    } else if (i.component?.custom_id?.startsWith("poll:")) {
      await reply({ update: true, content: \`\${i.user.display_name} voted \${i.component.custom_id.slice(5)}.\`, components: [] });
    }
  }
}`}</pre>
              </div>

              <h3 className="text-lg font-semibold mt-6 mb-2">Buttons</h3>
              <p className="text-sm text-text-muted">
                Any message your bot sends (<code>POST /channels/&#123;id&#125;/messages</code>) or any answer can carry up
                to 5 <code>action_row</code>s of up to 5 buttons. Styles are <code>primary</code>, <code>secondary</code>,{" "}
                <code>success</code>, <code>danger</code> and <code>link</code> (Discord&apos;s numbers 1–5 work too). A
                link button needs an <code>https</code> <code>url</code>; every other button needs a unique{" "}
                <code>custom_id</code> of up to 100 characters. Labels are up to 80 characters, and a button can have an
                emoji or be <code>disabled</code>.
              </p>
            </section>

            {/* Events */}
            <section>
              <h2 className="text-xl font-bold mb-4">Events</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-divider rounded-lg">
                  <thead>
                    <tr className="bg-bg-secondary">
                      <th className="px-4 py-2 text-left font-semibold">Event</th>
                      <th className="px-4 py-2 text-left font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["ready", "Bot is connected and ready."],
                      ["messageCreate", "A new message was posted."],
                      ["messageUpdate", "A message was edited."],
                      ["messageDelete", "A message was deleted."],
                      ["memberJoin", "Someone joined a space (members.read)."],
                      ["memberLeave", "Someone left or was removed from a space (members.read)."],
                      ["memberUpdate", "A member's roles changed; carries their roles now (members.read)."],
                      ["interactionCreate", "Someone ran one of your slash commands or pressed one of your bot's buttons."],
                      ["error", "An error occurred."],
                    ].map(([ev, desc]) => (
                      <tr key={ev} className="border-t border-divider">
                        <td className="px-4 py-2 font-mono text-xs">{ev}</td>
                        <td className="px-4 py-2 text-text-muted">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Rate Limits */}
            <section>
              <h2 className="text-xl font-bold mb-4">Rate Limits</h2>
              <p className="text-sm text-text-muted">
                Bot API requests are rate-limited per bot. Limits vary by endpoint type
                (read, write, gateway). When rate-limited, the API returns 429 with a
                <code className="mx-1">Retry-After</code> header. Both SDKs handle this
                automatically with exponential backoff.
              </p>
            </section>

            <div className="text-center text-xs text-text-muted pt-8 border-t border-divider">
              <p>Disband Bot SDKs: <code>pip install disband-bot</code> · <code>npm install @disband/bot</code></p>
            </div>
          </main>
        </div>
      </AppProvider>
    </ThemeProvider>
  );
}
