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
