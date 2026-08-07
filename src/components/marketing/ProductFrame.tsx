import { Logo } from "@/components/ui/Logo";

/**
 * A static, faithful rendering of the Disband client for the marketing hero.
 *
 * Deliberately shows real copy rather than grey placeholder bars — skeleton
 * mockups read as unfinished, and the point of the hero image is to show what
 * the product actually looks like.
 */

const channels = [
  { name: "announcements", type: "text" as const },
  { name: "general", type: "text" as const, active: true },
  { name: "design-review", type: "text" as const },
  { name: "Lounge", type: "voice" as const, count: 3 },
];

const conversation = [
  {
    initial: "N",
    name: "Nova",
    color: "#e0669a",
    time: "10:24",
    lines: ["pushed the sidebar fix — it holds up on the 11-inch now"],
  },
  {
    initial: "K",
    name: "Kai",
    color: "#3aa8c1",
    time: "10:26",
    lines: ["nice. p95 is down to 84ms after the batching change too"],
  },
  {
    initial: "M",
    name: "Mila",
    color: "#8b6fd4",
    time: "10:31",
    lines: ["community call is Friday at 4 — I'll drop a reminder in here", "anyone want the agenda slot after mine?"],
  },
];

const members = [
  { initial: "N", name: "Nova", color: "#e0669a", status: "#3ba55d" },
  { initial: "K", name: "Kai", color: "#3aa8c1", status: "#3ba55d" },
  { initial: "M", name: "Mila", color: "#8b6fd4", status: "#faa61a" },
  { initial: "T", name: "Theo", color: "#d98c47", status: "#80848e" },
];

function HashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  );
}

export function ProductFrame() {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-lg border border-white/10 bg-[#1e1f22] shadow-[0_24px_70px_-20px_rgba(0,0,0,0.75)]">
        {/* Title bar */}
        <div className="flex h-9 items-center gap-2 border-b border-black/40 bg-[#17181b] px-3.5">
          <span className="h-[11px] w-[11px] rounded-full bg-[#ed6a5e]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#f4bf50]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#61c454]" />
          <span className="ml-2 text-[11px] text-[#6e727a]">Disband</span>
        </div>

        <div className="flex h-[398px] text-left">
          {/* Server rail */}
          <div className="flex w-[58px] shrink-0 flex-col items-center gap-2.5 bg-[#131417] py-3">
            <Logo size={34} className="h-[34px] w-[34px]" />
            <span className="h-px w-6 bg-white/10" />
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-brand text-[12px] font-semibold text-white">
              DH
            </span>
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[16px] bg-[#26282d] text-[12px] font-semibold text-[#9aa0a8]">
              DL
            </span>
          </div>

          {/* Channel list */}
          <div className="hidden w-[172px] shrink-0 flex-col bg-[#1a1b1f] sm:flex">
            <div className="flex h-11 items-center border-b border-black/30 px-3.5 text-[13px] font-semibold text-white">
              Disband Demo HQ
            </div>
            <div className="px-2 py-3">
              <p className="px-2 pb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6e727a]">
                Text channels
              </p>
              {channels
                .filter((c) => c.type === "text")
                .map((c) => (
                  <div
                    key={c.name}
                    className={`mb-0.5 flex items-center gap-1.5 rounded px-2 py-[5px] text-[13px] ${
                      c.active ? "bg-white/[0.07] text-white" : "text-[#8b9097]"
                    }`}
                  >
                    <HashIcon />
                    <span className="truncate">{c.name}</span>
                  </div>
                ))}

              <p className="px-2 pb-1.5 pt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6e727a]">
                Voice channels
              </p>
              {channels
                .filter((c) => c.type === "voice")
                .map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center gap-1.5 rounded px-2 py-[5px] text-[13px] text-[#8b9097]"
                  >
                    <SpeakerIcon />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto text-[10px] text-[#6e727a]">{c.count}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Conversation */}
          <div className="flex min-w-0 flex-1 flex-col bg-[#212328]">
            <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-black/30 px-4 text-[#8b9097]">
              <HashIcon />
              <span className="text-[13px] font-semibold text-white">general</span>
            </div>

            <div className="flex-1 space-y-4 overflow-hidden px-4 py-4">
              {conversation.map((msg) => (
                <div key={msg.name} className="flex gap-2.5">
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
                    style={{ backgroundColor: msg.color }}
                  >
                    {msg.initial}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2">
                      <span className="text-[13px] font-semibold text-white">{msg.name}</span>
                      <span className="text-[10px] text-[#6e727a]">{msg.time}</span>
                    </p>
                    {msg.lines.map((line) => (
                      <p key={line} className="text-[13px] leading-[1.45] text-[#c4c9d0]">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="shrink-0 px-4 pb-4">
              <div className="flex items-center gap-2 rounded-lg bg-[#2a2c32] px-3 py-2.5">
                <span className="text-[15px] leading-none text-[#6e727a]">+</span>
                <span className="text-[13px] text-[#6e727a]">Message #general</span>
              </div>
            </div>
          </div>

          {/* Member list */}
          <div className="hidden w-[148px] shrink-0 bg-[#1a1b1f] px-2.5 py-3 lg:block">
            <p className="px-1.5 pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6e727a]">
              Online — 4
            </p>
            {members.map((m) => (
              <div key={m.name} className="mb-1 flex items-center gap-2 rounded px-1.5 py-1">
                <span className="relative">
                  <span
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-semibold text-white"
                    style={{ backgroundColor: m.color }}
                  >
                    {m.initial}
                  </span>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-[9px] w-[9px] rounded-full border-2 border-[#1a1b1f]"
                    style={{ backgroundColor: m.status }}
                  />
                </span>
                <span className="truncate text-[13px] text-[#8b9097]">{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
