import type { Metadata } from "next";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";

export const metadata: Metadata = {
  title: "Bots — Disband Docs",
  description: "Create and run a self-hosted bot on Disband: scopes, invites, tokens, and the client libraries.",
  alternates: { canonical: "/docs/bots" },
};

const SCOPE_ROWS: { scope: string; label: string; description: string }[] = [
  { scope: "messages.read", label: "Read messages", description: "Receive message events on the gateway and read messages/channels." },
  { scope: "messages.write", label: "Post messages", description: "Send and reply to messages in channels the bot can see." },
  { scope: "members.read", label: "Read members", description: "List the members of servers the bot has joined." },
  { scope: "channels.manage", label: "Manage channels", description: "Create, rename, and delete channels — also needs the manage_channels role in the server." },
];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[13px] text-[#8ea1e1]">
      {children}
    </code>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-[13px] leading-relaxed text-[#b5bac1]">
      {children}
    </pre>
  );
}

export default function BotsDocsPage() {
  return (
    <div className="min-h-screen bg-[#1e1f22] text-[#dbdee1]">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-20">
        <p className="text-sm font-semibold uppercase tracking-widest text-[#5865f2]">Docs</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Bots</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#b5bac1]">
          Bots are self-hosted integrations. You run the code, Disband relays messages to and from
          it. Disband never hosts or executes your bot&apos;s code.
        </p>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-white">How it works</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14.5px] leading-relaxed text-[#b5bac1]">
            <li>
              Create a bot in <strong className="text-white">Settings → Bots</strong> and pick the
              scopes it needs. You get a token back — it&apos;s shown once.
            </li>
            <li>
              In <strong className="text-white">Settings → Bots</strong>, generate an invite link
              for the server you want the bot to join, and send it to that server&apos;s owner.
            </li>
            <li>
              The owner opens the link and approves. The bot becomes a member of the server.
            </li>
            <li>
              You run the client library somewhere (a server, a cloud function, your laptop) and it
              connects to Disband with the token.
            </li>
          </ol>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-white">Scopes</h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[#b5bac1]">
            A bot&apos;s reach in a server is the <em>intersection</em> of the scopes you requested
            when creating it and the scopes the owner approved for that specific server:
          </p>
          <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-[#949ba4]">
                  <th className="px-4 py-2 font-semibold">Scope</th>
                  <th className="px-4 py-2 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody>
                {SCOPE_ROWS.map((row) => (
                  <tr key={row.scope} className="border-b border-white/5 last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12.5px] text-[#8ea1e1]">
                      {row.scope}
                    </td>
                    <td className="px-4 py-2.5 text-[#b5bac1]">{row.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-white">Client libraries</h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[#b5bac1]">
            The official clients are token-authenticated and have zero runtime dependencies.
          </p>

          <h3 className="mt-6 text-lg font-semibold text-white">JavaScript</h3>
          <p className="mt-2 text-[14.5px] leading-relaxed text-[#b5bac1]">
            Works from Node.js 18+, Deno, Bun, and the browser. Install from this repo:
          </p>
          <Pre>{`npm install /path/to/packages/bot`}</Pre>
          <Pre>{`import { Client } from "@disband/bot";

const client = new Client({ token: process.env.DISBAND_BOT_TOKEN });

client.on("ready", (me) => console.log(\`Logged in as \${me.name}\`));

client.on("messageCreate", async (message) => {
  if (message.author?.is_bot) return;
  if (message.content !== "!ping") return;
  await message.reply("pong");
});

await client.connect();`}</Pre>

          <h3 className="mt-8 text-lg font-semibold text-white">Python</h3>
          <p className="mt-2 text-[14.5px] leading-relaxed text-[#b5bac1]">
            Standard library only (threading + urllib). Install from this repo:
          </p>
          <Pre>{`pip install ./packages/disband-bot-python`}</Pre>
          <Pre>{`from disband_bot import Client

client = Client(token=DISBAND_BOT_TOKEN)

@client.on("messageCreate")
def handle(message):
    if message.author_is_bot:
        return
    if message.content == "!ping":
        message.reply("pong")

client.run()`}</Pre>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-white">API</h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[#b5bac1]">
            All endpoints take <Code>Authorization: Bot {"<token>"}</Code>. Errors return JSON with
            an <Code>error</Code> field and a 4xx/5xx status.
          </p>
          <div className="mt-4 overflow-hidden rounded-lg border border-white/10 font-mono text-[12.5px] text-[#b5bac1]">
            <div className="border-b border-white/10 bg-white/5 px-4 py-2 text-[#949ba4]">Endpoints</div>
            {[
              ["GET", "/api/v1/gateway?timeout=20", "Long-poll for message events (messageCreate / messageUpdate / messageDelete)."],
              ["POST", "/api/v1/channels/:id/messages", "Send a message. Body: { content, reply_to_id }."],
              ["GET", "/api/v1/channels/:id/messages", "Read messages. Query: limit, before."],
              ["GET", "/api/v1/servers/:id/channels", "List channels."],
              ["GET", "/api/v1/servers/:id/members", "List members."],
              ["POST", "/api/v1/servers/:id/channels", "Create a channel. Body: { name, type, category_id }."],
              ["PATCH", "/api/v1/channels/:id", "Rename a channel. Body: { name }."],
              ["DELETE", "/api/v1/channels/:id", "Delete a channel."],
              ["POST", "/api/v1/servers/:id/leave", "Remove the bot from a server."],
              ["POST", "/api/v1/bots/:botId/invites", "Generate an invite. Body: { server_id, scopes }."],
            ].map(([method, path, desc]) => (
              <div key={path as string} className="flex gap-3 border-b border-white/5 px-4 py-2 last:border-b-0">
                <span
                  className={`w-16 shrink-0 font-semibold ${
                    method === "GET" ? "text-[#57f287]" : method === "POST" ? "text-[#f0b232]" : "text-[#8ea1e1]"
                  }`}
                >
                  {method}
                </span>
                <span className="whitespace-nowrap text-white">{path}</span>
                <span className="hidden min-w-0 flex-1 text-[#949ba4] sm:block">{desc}</span>
              </div>
            ))}
          </div>

          <h3 className="mt-8 text-lg font-semibold text-white">Message payload</h3>
          <Pre>{`{
  "id": "…",
  "channel_id": "…",
  "server_id": "…",
  "author": { "id": "…", "username": "…", "display_name": "…", "avatar_url": "…", "is_bot": false },
  "content": "Deploy finished",
  "reply_to_id": null,
  "mentions": [],
  "attachment_url": null,
  "attachment_type": null,
  "created_at": "2026-01-01T00:00:00Z",
  "edited_at": null,
  "display_id": 1234
}`}</Pre>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-white">Limits &amp; safety</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[14.5px] leading-relaxed text-[#b5bac1]">
            <li>Up to 5 bots per account. A bot can be revoked at any time, which kills its token.</li>
            <li>Messages up to 4,000 characters. Bots need the <Code>mention_everyone</Code> role permission to use <Code>@everyone</Code>.</li>
            <li>Only a server&apos;s owner can approve a bot invite. Invites expire after 7 days.</li>
            <li>Bot tokens are hashed at rest; the raw token is never stored or retrievable.</li>
            <li>Bots can never reach the database directly — every action goes through scoped API endpoints.</li>
          </ul>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
