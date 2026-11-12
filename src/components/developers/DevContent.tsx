"use client";

import { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { DOCS_URL } from "@/components/developers/DevelopersHeader";

/* Pieces the developer portal and the developer overview page share. Kept
   apart from DeveloperPortal so the overview doesn't load the app context. */

const SECONDARY =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-button-secondary px-4 py-2 text-[14px] font-semibold text-header-primary transition-colors hover:bg-button-secondary-hover disabled:opacity-50";

export const RESOURCES: { title: string; body: string; href: string }[] = [
  { title: "Getting started", body: "Make a bot, connect it and answer your first message.", href: `${DOCS_URL}/getting-started/` },
  { title: "API reference", body: "Every endpoint, event, scope and limit.", href: `${DOCS_URL}/api-reference/` },
  { title: "Client libraries", body: "@disband/bot for JavaScript, disband-bot for Python.", href: `${DOCS_URL}/clients/` },
  { title: "Templates", body: "Moderation, tickets, polls and more, ready to fork.", href: `${DOCS_URL}/templates/` },
];

export const WHATS_NEW: { title: string; body: string }[] = [
  { title: "Forum posts", body: "List a forum's posts and start new ones." },
  { title: "Reactions", body: "See who reacted, clear reactions, and get reactionAdd and reactionRemove events." },
  { title: "Typing indicator", body: "Show “is typing…” while your bot works on an answer." },
  { title: "More events", body: "Channel, role and server changes, and serverJoin and serverLeave for the bot itself." },
  { title: "History and lookups", body: "Page after or around a message, fetch one message, find members by name." },
  { title: "Custom status", body: "Set your bot's status text from code." },
];

export function CopyButton({ text, label = "Copy", compact }: { text: string; label?: string; compact?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={compact ? label : undefined}
      className={compact
        ? "inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-interactive-hover hover:text-header-primary"
        : SECONDARY}
      onClick={() => { void navigator.clipboard.writeText(text); setDone(true); window.setTimeout(() => setDone(false), 1500); }}>
      {done ? <Check size={15} strokeWidth={2.4} /> : <Copy size={15} strokeWidth={2.2} />}
      {!compact && (done ? "Copied" : label)}
    </button>
  );
}

const SNIPPETS: { id: string; label: string; install: string; code: string }[] = [
  {
    id: "js",
    label: "JavaScript",
    install: "npm install @disband/bot",
    code: `import { Client } from "@disband/bot";

const client = new Client({ token: process.env.DISBAND_BOT_TOKEN });

client.on("ready", (bot) => console.log(\`Signed in as \${bot.name}\`));

client.on("messageCreate", async (message) => {
  if (message.authorIsBot) return;
  if (message.content === "!ping") await message.reply("pong");
});

await client.connect();`,
  },
  {
    id: "py",
    label: "Python",
    install: "pip install disband-bot",
    code: `import os
from disband_bot import Client

client = Client(token=os.environ["DISBAND_BOT_TOKEN"])

@client.on("messageCreate")
def on_message(message):
    if message.author_is_bot:
        return
    if message.content == "!ping":
        message.reply("pong")

client.run()`,
  },
  {
    id: "http",
    label: "HTTP",
    install: "Any language with an HTTP client works.",
    code: `# Wait up to 20 seconds for events
curl "https://www.disband.dev/api/v1/gateway?timeout=20" \\
  -H "Authorization: Bot $DISBAND_BOT_TOKEN"

# Send a message
curl -X POST "https://www.disband.dev/api/v1/channels/$CHANNEL_ID/messages" \\
  -H "Authorization: Bot $DISBAND_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "content": "Hello from my bot" }'`,
  },
];

export function QuickStart() {
  const [tab, setTab] = useState(SNIPPETS[0].id);
  const snippet = SNIPPETS.find((s) => s.id === tab) ?? SNIPPETS[0];
  return (
    <section className="overflow-hidden rounded-xl border border-divider bg-bg-secondary">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-tertiary text-text-muted"><Sparkles size={16} strokeWidth={2.2} /></span>
          <h3 className="text-[16px] font-semibold text-header-primary">Quick start</h3>
        </div>
        <div role="tablist" aria-label="Language" className="flex rounded-lg bg-bg-tertiary p-0.5">
          {SNIPPETS.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={tab === s.id} onClick={() => setTab(s.id)}
              className={`rounded-md px-3 py-1 text-[13px] font-semibold transition-colors ${tab === s.id ? "bg-bg-primary text-header-primary shadow-sm" : "text-text-muted hover:text-text-normal"}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-bg-tertiary px-3 py-2">
          <code className="truncate text-[13px] text-text-normal">{snippet.install}</code>
          {snippet.id !== "http" && <CopyButton text={snippet.install} label="Copy install command" compact />}
        </div>
        <div className="relative">
          <pre className="max-h-[360px] overflow-auto rounded-lg bg-bg-tertiary p-4 pr-12 text-[13px] leading-relaxed text-text-normal"><code>{snippet.code}</code></pre>
          <div className="absolute right-2 top-2"><CopyButton text={snippet.code} label="Copy code" compact /></div>
        </div>
        <p className="text-[13px] text-text-muted">
          Keep the token in an environment variable, never in your code. More in the{" "}
          <a className="text-text-link hover:underline" href={`${DOCS_URL}/getting-started/`} target="_blank" rel="noreferrer">getting started guide</a>.
        </p>
      </div>
    </section>
  );
}
