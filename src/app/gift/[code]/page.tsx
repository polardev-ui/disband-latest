"use client";

import { use } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { GiftCard } from "@/components/gift/GiftCard";

/**
 * A gift link opened on its own.
 *
 * Inside Disband a gift renders as a card in the conversation; this is the
 * same card for a link that arrived by other means — pasted into a browser,
 * or followed from somewhere that is not a Disband message.
 */
export default function GiftPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-tertiary px-6 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo adaptive size={44} className="h-11 w-11" priority />
          <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.02em] text-text-normal">
            Someone sent you a gift
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
            Claim it and the plan is applied to your account straight away.
          </p>
        </div>

        <GiftCard code={code} />

        <p className="mt-6 text-center text-[13px] text-text-muted">
          <Link href="/app" className="font-medium text-text-normal transition-colors hover:text-brand">
            Open Disband
          </Link>
        </p>
      </div>
    </div>
  );
}
