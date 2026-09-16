import { redirect } from "next/navigation";
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Logo } from "@/components/ui/Logo";

export const metadata = {
  title: "Referral — Disband",
  description: "Join Disband with a friend's referral code.",
};

export const dynamic = "force-dynamic";

export default async function ReferralPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const wellFormed = /^[0-9a-zA-Z]{9}$/.test(code);
  let exists = false;
  if (wellFormed) {
    const db = getServiceSupabase();
    if (db) {
      const { data } = await db
        .from("referral_codes")
        .select("user_id")
        .eq("code", code)
        .maybeSingle();
      exists = !!data;
    }
  }

  if (exists) {
    redirect(`/login?ref=${code}`);
  }

  return (
    <ThemeProvider>
      <div className="flex min-h-screen items-center justify-center bg-bg-tertiary px-6 py-12">
        <div className="w-full max-w-[400px] text-center">
          <div className="mb-8 flex flex-col items-center">
            <Logo adaptive size={44} className="h-11 w-11" priority />
            <h1 className="mt-5 text-[26px] font-semibold tracking-[-0.02em] text-text-normal">
              This referral code isn&apos;t valid
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
              {wellFormed
                ? "That code doesn't match an account. Codes are 9 characters, like disband.dev/referral/9aXc7Ople."
                : "Referral codes are 9 letters and digits, like disband.dev/referral/9aXc7Ople."}
            </p>
          </div>
          <Link
            href="/login"
            className="block w-full rounded-md bg-brand py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-brand-hover"
          >
            Create an account anyway
          </Link>
        </div>
      </div>
    </ThemeProvider>
  );
}
