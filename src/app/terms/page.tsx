import Link from "next/link";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";

export const metadata = {
  title: "Terms of Service — Disband",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#1e1f22] text-[#dbdee1]">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-24">
        <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
        <p className="mt-2 text-sm text-[#949ba4]">Last updated: June 2025</p>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-[#b5bac1]">
          <p>
            By using Disband, you agree to these Terms. If you do not agree, do not use the service.
          </p>

          <h2 className="text-lg font-semibold text-white">Acceptable use</h2>
          <p>
            You may not use Disband to harass others, distribute malware, spam, or engage in illegal
            activity. We may suspend accounts that violate these rules.
          </p>

          <h2 className="text-lg font-semibold text-white">Encryption & privacy</h2>
          <p>
            Disband provides end-to-end encrypted messaging. You are responsible for safeguarding your
            account credentials. We design our systems so that encrypted conversation content is not
            accessible to Disband or third parties, including through subpoena or similar legal process
            directed at message contents.
          </p>

          <h2 className="text-lg font-semibold text-white">Service availability</h2>
          <p>
            We strive for high availability but do not guarantee uninterrupted service. Features may
            change as Disband evolves.
          </p>

          <h2 className="text-lg font-semibold text-white">Limitation of liability</h2>
          <p>
            Disband is provided &quot;as is&quot; to the maximum extent permitted by law. We are not liable
            for indirect or consequential damages arising from use of the service.
          </p>

          <h2 className="text-lg font-semibold text-white">Contact</h2>
          <p>
            Legal inquiries:{" "}
            <a href="mailto:legal@disband.wsgpolar.me" className="text-[#00a8fc] hover:underline">
              legal@disband.wsgpolar.me
            </a>
          </p>
        </div>

        <Link href="/home" className="mt-10 inline-block text-sm text-brand hover:underline">
          ← Back to home
        </Link>
      </main>
      <MarketingFooter />
    </div>
  );
}
