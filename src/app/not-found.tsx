import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-[#131417] text-[#dbdee1]">
      <header className="border-b border-white/[0.06] px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5">
          <Logo size={32} className="h-8 w-8" />
          <span className="font-bold text-white">Disband</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <p className="font-mono text-sm font-semibold tracking-[0.35em] text-[#5865f2]">
          404
        </p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          This channel has been disbanded.
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-[#b5bac1]">
          The page you were looking for doesn&apos;t exist, was moved, or never
          got a seat in the server. No one here can hear you.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/home"
            className="inline-flex items-center rounded-md bg-[#5865f2] px-5 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Back to Disband
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center rounded-md border border-white/10 px-5 py-3 text-[15px] font-medium text-[#c4c9d0] transition-colors hover:border-white/20 hover:text-white"
          >
            Log in
          </Link>
        </div>
      </main>

      <footer className="border-t border-white/[0.06] px-6 py-6 text-center text-sm text-[#949ba4]">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2.5">
          <Logo size={20} className="h-5 w-5" />
          <span>Disband — one codebase, every platform.</span>
        </div>
      </footer>
    </div>
  );
}
