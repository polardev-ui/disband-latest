import Link from "next/link";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";

export const metadata = {
  title: "Privacy Policy — Disband",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#1e1f22] text-[#dbdee1]">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-24">
        <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-[#949ba4]">Last updated: June 2025</p>

        <div className="prose-disband mt-8 space-y-6 text-[15px] leading-relaxed text-[#b5bac1]">
          <p>
            Disband is built around privacy. We collect only what we need to operate the service —
            account credentials, profile information you choose to share, and the data required to
            deliver messages and calls to their intended recipients.
          </p>

          <h2 className="text-lg font-semibold text-white">End-to-end encryption</h2>
          <p>
            Messages and media on Disband are protected with end-to-end encryption (E2EE). Content is
            encrypted on your device before it is transmitted and can only be decrypted by participants
            in a conversation. Disband cannot read the contents of your encrypted chats.
          </p>

          <h2 className="text-lg font-semibold text-white">Law enforcement & legal requests</h2>
          <p>
            Because user communications are end-to-end encrypted, Disband does not possess readable
            copies of message content. We do not accept subpoenas or other legal demands seeking access
            to the contents of encrypted conversations, as we are technically unable to provide such
            data and are committed to protecting member privacy.
          </p>
          <p>
            We may respond to valid legal process regarding basic account metadata where applicable law
            requires it and where data is in our possession in unencrypted form (for example, email
            address or account creation date). We will notify users when permitted by law.
          </p>

          <h2 className="text-lg font-semibold text-white">Data retention</h2>
          <p>
            Account data is retained while your account is active. You may delete your account at any
            time through settings or by contacting support. Encrypted message payloads are not stored
            in decryptable form on our servers.
          </p>

          <h2 className="text-lg font-semibold text-white">Contact</h2>
          <p>
            Questions about this policy? Reach us at{" "}
            <a href="mailto:privacy@disband.wsgpolar.me" className="text-[#00a8fc] hover:underline">
              privacy@disband.wsgpolar.me
            </a>
            .
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
