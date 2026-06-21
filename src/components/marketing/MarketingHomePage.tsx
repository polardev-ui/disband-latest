import Link from "next/link";
import { MarketingFooter, MarketingNav } from "./MarketingLayout";
import { DownloadSection } from "./DownloadSection";

const features = [
  {
    title: "Servers & channels",
    body: "Organize communities with roles, voice channels, and real-time chat.",
  },
  {
    title: "Direct messages & groups",
    body: "Private conversations, group chats, voice calls, and GIFs — all in one place.",
  },
  {
    title: "Privacy by design",
    body: "End-to-end encrypted messages. Your conversations stay between you and the people you trust.",
  },
  {
    title: "Every desktop platform",
    body: "macOS, Windows, Linux, and the web — one account, everywhere.",
  },
];

export function MarketingHomePage() {
  return (
    <div className="min-h-screen bg-[#1e1f22] text-[#dbdee1]">
      <MarketingNav />

      <main className="pt-14">
        <section className="relative overflow-hidden px-6 pb-16 pt-20 sm:pt-28">
          <div className="marketing-glow pointer-events-none absolute left-1/2 top-0 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-brand/20 blur-[120px]" />
          <div className="relative mx-auto max-w-4xl text-center">
            <p className="marketing-fade-up mb-4 text-sm font-semibold uppercase tracking-widest text-brand">
              Now in production
            </p>
            <h1 className="marketing-fade-up marketing-delay-1 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              Your space to talk,
              <span className="block bg-gradient-to-r from-[#dee0fc] to-brand bg-clip-text text-transparent">
                hang out, and belong
              </span>
            </h1>
            <p className="marketing-fade-up marketing-delay-2 mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#b5bac1]">
              Disband is a modern communication platform for friends and communities — with voice,
              video, and encryption built in from the ground up.
            </p>
            <div className="marketing-fade-up marketing-delay-3 mt-10 flex flex-wrap items-center justify-center gap-4">
              <a
                href="#download"
                className="rounded-xl bg-brand px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand/30 transition-transform hover:scale-[1.02]"
              >
                Get Disband
              </a>
              <Link
                href="/login"
                className="rounded-xl border border-white/10 bg-white/5 px-8 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/10"
              >
                Open in browser
              </Link>
            </div>
          </div>

          <div className="marketing-float relative mx-auto mt-16 max-w-5xl">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#313338] shadow-2xl">
              <div className="flex h-10 items-center gap-2 border-b border-black/20 bg-[#2b2d31] px-4">
                <span className="h-3 w-3 rounded-full bg-[#ed4245]" />
                <span className="h-3 w-3 rounded-full bg-[#faa61a]" />
                <span className="h-3 w-3 rounded-full bg-[#3ba55d]" />
                <span className="ml-2 text-xs text-[#949ba4]">Disband</span>
              </div>
              <div className="grid gap-px bg-black/20 sm:grid-cols-[72px_1fr_200px]">
                <div className="hidden bg-[#1e1f22] p-3 sm:block">
                  <div className="mb-2 h-10 w-10 rounded-2xl bg-brand" />
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 w-10 rounded-2xl bg-[#313338]" />
                    ))}
                  </div>
                </div>
                <div className="min-h-[240px] bg-[#313338] p-4">
                  <div className="mb-4 h-8 rounded bg-[#2b2d31]" />
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex gap-3">
                        <div className="h-10 w-10 shrink-0 rounded-full bg-brand/40" />
                        <div className="flex-1 space-y-1">
                          <div className="h-3 w-24 rounded bg-[#2b2d31]" />
                          <div className="h-3 w-full max-w-md rounded bg-[#2b2d31]/80" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="hidden bg-[#2b2d31] p-3 sm:block">
                  <div className="mb-3 text-xs font-bold uppercase text-[#949ba4]">Online</div>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="mb-2 flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-[#313338]" />
                      <div className="h-2 w-16 rounded bg-[#313338]" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 py-16">
          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2">
            {features.map((f) => (
              <article
                key={f.title}
                className="marketing-fade-up rounded-xl border border-white/5 bg-[#2b2d31]/60 p-6 backdrop-blur-sm"
              >
                <h3 className="text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#b5bac1]">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <DownloadSection />

        <section className="px-6 py-16">
          <div className="marketing-fade-up mx-auto max-w-3xl rounded-2xl border border-brand/20 bg-brand/10 p-8 text-center">
            <h2 className="text-xl font-bold text-white">Ready to join?</h2>
            <p className="mt-2 text-[#b5bac1]">Create a free account and start talking in seconds.</p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-white"
            >
              Log in or sign up
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
