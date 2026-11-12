"use client";

import { ArrowRight, ExternalLink } from "lucide-react";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { DevelopersHeader, DOCS_URL } from "@/components/developers/DevelopersHeader";
import { QuickStart, RESOURCES, WHATS_NEW } from "@/components/developers/DevContent";

/*
 The developer overview. The full guides and the API reference live on the
 docs site (docs.disband.dev, built from the disband-docs repository); this
 page is the way in, so nothing here goes stale on its own.
*/

const EVENTS: { group: string; names: string[]; scope: string }[] = [
  { group: "Messages", names: ["messageCreate", "messageUpdate", "messageDelete"], scope: "messages.read" },
  { group: "Reactions", names: ["reactionAdd", "reactionRemove"], scope: "messages.read" },
  { group: "Members", names: ["memberJoin", "memberLeave", "memberUpdate"], scope: "members.read" },
  { group: "Channels", names: ["channelCreate", "channelUpdate", "channelDelete"], scope: "channels.read or messages.read" },
  { group: "Roles", names: ["roleCreate", "roleUpdate", "roleDelete"], scope: "members.read or roles.manage" },
  { group: "Spaces", names: ["serverUpdate", "serverJoin", "serverLeave", "scopesUpdate"], scope: "any grant" },
  { group: "Interactions", names: ["interactionCreate"], scope: "none needed" },
];

const LIMITS: { label: string; value: string }[] = [
  { label: "Reads", value: "120 / min" },
  { label: "Writes", value: "60 / min" },
  { label: "Gateway polls", value: "15 / min" },
  { label: "Message length", value: "4,000" },
];

export default function DevelopersDocsPage() {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-bg-primary text-text-normal">
        <DevelopersHeader current="docs" />
        <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <section className="py-14 sm:py-20">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-brand">Disband for developers</p>
            <h1 className="mt-3 max-w-3xl text-[38px] font-bold leading-[1.08] tracking-[-0.03em] text-header-primary sm:text-[52px]">
              Build bots people actually want in their space.
            </h1>
            <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-text-muted">
              Bots run on your own machine or server and talk to Disband over a small HTTP API: slash commands, buttons,
              embeds, forums, moderation and live events. Libraries for JavaScript and Python, or plain HTTP from anything.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="/developers/applications"
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover">
                Create an application <ArrowRight size={16} />
              </a>
              <a href={`${DOCS_URL}/getting-started/`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-button-secondary px-5 py-2.5 text-[15px] font-semibold text-header-primary transition-colors hover:bg-button-secondary-hover">
                Read the guide <ExternalLink size={14} />
              </a>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <QuickStart />
            <div className="space-y-6">
              <section className="rounded-xl border border-divider bg-bg-secondary p-5">
                <h2 className="text-[16px] font-semibold text-header-primary">How it works</h2>
                <ol className="mt-3 space-y-3 text-[14px] leading-relaxed text-text-muted">
                  <li><span className="font-semibold text-text-normal">1.</span> Create an application and copy its token.</li>
                  <li><span className="font-semibold text-text-normal">2.</span> Run your bot with the token. It polls the gateway for events.</li>
                  <li><span className="font-semibold text-text-normal">3.</span> Share the install link. Space owners choose what it may do.</li>
                </ol>
              </section>
              <section className="rounded-xl border border-divider bg-bg-secondary p-5">
                <h2 className="text-[16px] font-semibold text-header-primary">Limits, per bot</h2>
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  {LIMITS.map((l) => (
                    <div key={l.label}>
                      <dt className="text-[12px] text-text-muted">{l.label}</dt>
                      <dd className="text-[15px] font-semibold text-header-primary">{l.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[12px] text-text-muted">The libraries wait out a 429 and retry for you.</p>
              </section>
            </div>
          </div>

          <section className="mt-14">
            <h2 className="text-[22px] font-bold text-header-primary">Gateway events</h2>
            <p className="mt-1 text-[15px] text-text-muted">What your bot hears about, and what each kind needs. Only channels it can see produce events.</p>
            <div className="mt-5 overflow-hidden rounded-xl border border-divider">
              {EVENTS.map((e, i) => (
                <div key={e.group} className={`grid gap-2 px-5 py-3.5 sm:grid-cols-[140px_minmax(0,1fr)_220px] sm:items-center ${i % 2 ? "bg-bg-secondary/60" : "bg-bg-secondary"}`}>
                  <span className="text-[14px] font-semibold text-header-primary">{e.group}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {e.names.map((n) => <code key={n} className="rounded-md bg-bg-tertiary px-2 py-0.5 text-[12.5px] text-text-normal">{n}</code>)}
                  </span>
                  <span className="text-[13px] text-text-muted sm:text-right">{e.scope}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-14">
            <h2 className="text-[22px] font-bold text-header-primary">New in the API</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {WHATS_NEW.map((w) => (
                <div key={w.title} className="rounded-xl border border-divider bg-bg-secondary p-4">
                  <p className="text-[15px] font-semibold text-header-primary">{w.title}</p>
                  <p className="mt-1 text-[13px] leading-snug text-text-muted">{w.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-14">
            <h2 className="text-[22px] font-bold text-header-primary">Documentation</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {RESOURCES.map((r) => (
                <a key={r.title} href={r.href} target="_blank" rel="noreferrer"
                  className="group rounded-xl border border-divider bg-bg-secondary p-4 transition-colors hover:border-brand/50">
                  <span className="flex items-center justify-between text-[15px] font-semibold text-header-primary">
                    {r.title}
                    <ExternalLink size={14} className="text-text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-1 block text-[13px] leading-snug text-text-muted">{r.body}</span>
                </a>
              ))}
            </div>
          </section>
        </main>
      </div>
    </ThemeProvider>
  );
}
