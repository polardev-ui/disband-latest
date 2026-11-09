"use client";

import Link from "next/link";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Logo } from "@/components/ui/Logo";
import { BotAuthorizeFlow } from "./BotAuthorizeFlow";

/** /bot-invite/<code>: add a bot to one of your spaces. */
export function BotInviteCard({ code }: { code: string }) {
  return (
    <ThemeProvider>
      <div className="aero-hero relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
        <Link href="/home" className="relative z-[1] mb-6 flex items-center gap-2.5 text-white">
          <Logo size={26} />
          <span className="text-[20px] font-bold tracking-tight">Disband</span>
        </Link>
        <div className="modal-pop relative z-[1] w-full max-w-[440px] overflow-visible rounded-2xl border border-border-subtle bg-bg-primary shadow-[0_40px_90px_-30px_rgba(10,6,40,0.85)]">
          <BotAuthorizeFlow code={code} />
        </div>
        <p className="relative z-[1] mt-5 max-w-sm text-center text-[12px] leading-4 text-white/70">
          Bots are made by their developers, not Disband, unless they show a verified ✓ BOT tag.
        </p>
      </div>
    </ThemeProvider>
  );
}
