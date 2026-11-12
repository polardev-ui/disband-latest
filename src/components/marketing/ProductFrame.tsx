import { Logo } from "@/components/ui/Logo";

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

/**
 * A static picture of the app for the homepage, drawn in the app's own
 * palette (dark theme): rail and channel list on one surface with the user
 * card running under both, the conversation, and the member list.
 */
export function ProductFrame({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#1a181e] shadow-[0_40px_90px_-30px_rgba(10,6,40,0.85)]">
        <div className="flex h-[420px] text-left">
          <div className="flex shrink-0 flex-col">
            <div className="flex min-h-0 flex-1">
              <div className="flex w-[58px] shrink-0 flex-col items-center gap-2.5 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#4641d9]">
                  <Logo size={22} className="h-[22px] w-[22px] brightness-0 invert" />
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2a2730] text-[#f0b232]">★</span>
                <span className="h-0.5 w-6 rounded-full bg-[#2f2c36]" />
                <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#4641d9] text-[11px] font-semibold text-white">DH</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2a2730] text-[11px] font-semibold text-[#cecbd4]">DL</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[#3d3946] text-[16px] text-[#b1acbb]">+</span>
              </div>
              <div className="hidden w-[176px] shrink-0 flex-col sm:flex">
                <div className="flex h-11 items-center border-b border-[#24212a] px-3.5 text-[13px] font-semibold text-white">Disband Demo HQ</div>
                <div className="px-2 py-3">
                  <p className="px-2 pb-1.5 text-[11px] font-semibold text-[#9d97aa]">Text Channels</p>
                  {channels.filter((c) => c.type === "text").map((c) => (
                    <div key={c.name} className={`mb-0.5 flex items-center gap-1.5 rounded-lg px-2 py-[6px] text-[13px] ${c.active ? "bg-[#302d36] text-white" : "text-[#9d97aa]"}`}>
                      <HashIcon />
                      <span className="truncate">{c.name}</span>
                    </div>
                  ))}
                  <p className="px-2 pb-1.5 pt-3 text-[11px] font-semibold text-[#9d97aa]">Voice</p>
                  {channels.filter((c) => c.type === "voice").map((c) => (
                    <div key={c.name} className="flex items-center gap-1.5 rounded-lg px-2 py-[6px] text-[13px] text-[#9d97aa]">
                      <SpeakerIcon />
                      <span className="truncate">{c.name}</span>
                      <span className="ml-auto text-[10px]">{c.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="m-2 mt-0 flex items-center gap-2 rounded-xl border border-[#2f2c36] bg-[#232028] px-2 py-2">
              <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[#8b6fd4] text-[11px] font-semibold text-white">
                Y
                <span className="absolute -bottom-0.5 -right-0.5 h-[9px] w-[9px] rounded-full border-2 border-[#232028] bg-[#23a55a]" />
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block text-[12px] font-semibold leading-4 text-white">you</span>
                <span className="block text-[10px] leading-3 text-[#9d97aa]">Online</span>
              </span>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col border-l border-[#24212a] bg-[#1f1d23]">
            <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[#24212a] px-4 text-[#9d97aa]">
              <HashIcon />
              <span className="text-[13px] font-semibold text-white">general</span>
              <span className="ml-2 hidden truncate text-[12px] sm:inline">where the team hangs out</span>
            </div>
            <div className="flex-1 space-y-4 overflow-hidden px-4 py-4">
              {conversation.map((msg) => (
                <div key={msg.name} className="flex gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ backgroundColor: msg.color }}>
                    {msg.initial}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2">
                      <span className="text-[13px] font-semibold text-white">{msg.name}</span>
                      <span className="text-[10px] text-[#9d97aa]">Today at {msg.time}</span>
                    </p>
                    {msg.lines.map((line) => (
                      <p key={line} className="text-[13px] leading-[1.45] text-[#e5e4e9]">{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="shrink-0 px-4 pb-4">
              <div className="flex items-center gap-2 rounded-xl border border-[#2f2c36] bg-[#26232b] px-3 py-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#b1acbb] text-[13px] leading-none text-[#26232b]">+</span>
                <span className="text-[13px] text-[#9d97aa]">Message #general</span>
              </div>
            </div>
          </div>

          <div className={`hidden w-[150px] shrink-0 border-l border-[#24212a] bg-[#1f1d23] px-2.5 py-3 ${compact ? "" : "lg:block"}`}>
            {/* Static on purpose: the hero above already shows the live count,
                and two LiveOnlineCount instances share one presence channel. */}
            <p className="px-1.5 pb-2 text-[11px] font-semibold text-[#9d97aa]">Online — 3</p>
            {members.map((m) => (
              <div key={m.name} className="mb-1 flex items-center gap-2 rounded-lg px-1.5 py-1">
                <span className="relative">
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ backgroundColor: m.color }}>
                    {m.initial}
                  </span>
                  <span className="absolute -bottom-0.5 -right-0.5 h-[9px] w-[9px] rounded-full border-2 border-[#1f1d23]" style={{ backgroundColor: m.status }} />
                </span>
                <span className="truncate text-[13px] text-[#cecbd4]">{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
