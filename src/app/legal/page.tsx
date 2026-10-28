import Link from "next/link";
import type { Metadata } from "next";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingLayout";

export const metadata: Metadata = {
  title: "Legal — Disband",
  description:
    "Legal information for Disband: ownership, intellectual property, privacy, security, and third-party providers.",
  alternates: { canonical: "/legal" },
};

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-[#1e1f22]">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-24 sm:pt-28">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#6e727a]">
          Last updated October 28, 2026
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
          Legal Information
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#9aa0a8]">
          Everything below describes who owns and operates Disband, how your data is handled, and the
          terms under which the service is provided.
        </p>

        <div className="mt-12 space-y-12 text-[15px] leading-relaxed text-[#9aa0a8]">
          <section>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">1. Operator</h2>
            <p>
              Disband is owned and operated by <strong>Genysis IQ LLC</strong>, 10524 Moss Park Rd,
              Suite 204-653, Orlando, Florida 32832, United States.
            </p>
            <p>
              Genysis IQ LLC is the entity responsible for the Service, its operation, and its legal
              and financial obligations.
            </p>
            <p>
              Josh Clark previously owned Disband and currently serves as the lead software engineer
              and primary developer. Diego Quintero provides security advisory support.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">2. Intellectual Property</h2>
            <p>
              Disband’s name, logos, software, designs, artwork, website content, service
              architecture, features, and other original materials are owned by or licensed to Genysis
              IQ LLC.
            </p>
            <p>
              Except as expressly permitted by law or in writing, you may not copy or reproduce
              Disband materials, redistribute or resell the Service, reverse engineer or decompile the
              Service, remove proprietary notices, use Disband branding in a misleading way, impersonate
              Disband or Genysis IQ, or claim ownership of Disband’s software or service assets.
            </p>
            <p>
              Usernames, space names, messages, media, and other user-created content remain owned by
              the users or other rights holders who own them. User content is subject to the license
              described in the Terms of Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">3. Security and Encryption</h2>
            <p>
              Disband messages and media are not end-to-end encrypted. They may be stored in
              server-readable form on infrastructure used by Disband, including Supabase and related
              storage or delivery services.
            </p>
            <p>
              Voice and video calls use WebRTC transport encryption, including DTLS-SRTP, between
              peers where supported. Call signaling and metadata pass through Disband servers.
            </p>
            <p>
              No security system is perfect. Disband does not guarantee uninterrupted operation or
              that the Service will be free from vulnerabilities.
            </p>
            <p>
              Security issues may be reported through the available bug-reporting channels. Good-faith
              security research should avoid accessing, modifying, deleting, or disclosing other
              users’ information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">4. Third-Party Services</h2>
            <p>
              Disband uses third-party providers, including Supabase, Vercel, Cloudflare, Stripe,
              Resend, Apple, and Google.
            </p>
            <p>
              Those providers may have their own terms, privacy policies, service limitations, and
              security practices. App Store and Google Play purchases are also governed by the
              applicable store’s rules.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">5. No Professional or Emergency Service</h2>
            <p>
              Disband is a communications and community platform. It is not an emergency service and
              should not be relied upon for emergency communications, medical advice, legal advice,
              financial advice, or other professional services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">6. Contact</h2>
            <p>Legal questions may be sent to <strong>legal@disband.dev</strong>.</p>
          </section>
        </div>

        <Link href="/home" className="mt-10 inline-block text-sm text-brand hover:underline">
          ← Back to home
        </Link>
      </main>
      <MarketingFooter />
    </div>
  );
}
