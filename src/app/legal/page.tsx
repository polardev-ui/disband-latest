import Link from "next/link";
import type { Metadata } from "next";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingLayout";

export const metadata: Metadata = {
  title: "Legal Information",
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
          Last updated November 6, 2026
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
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">Legal Documents</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>
                <Link href="/terms" className="text-brand hover:underline">Terms of Service</Link> — the
                rules for using Disband.
              </li>
              <li>
                <Link href="/privacy" className="text-brand hover:underline">Privacy Policy</Link> — what
                we collect, how we use it, and your rights.
              </li>
              <li>
                <Link href="/eula" className="text-brand hover:underline">End User License Agreement</Link>{" "}
                — your license to the Disband apps.
              </li>
              <li>
                <Link href="/copyright" className="text-brand hover:underline">Copyright Policy</Link> —
                reporting infringement, counter-notices, and repeat infringers.
              </li>
              <li>
                <Link href="/legal/eu-uk" className="text-brand hover:underline">EU and UK Information</Link>{" "}
                — Digital Services Act and Online Safety Act contacts, reporting, and appeals.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">1. Operator</h2>
            <p>
              Disband is owned and operated by <strong>Genysis IQ LLC</strong>, a Florida limited
              liability company, 10524 Moss Park Rd, Suite 204-653, Orlando, Florida 32832, United
              States. Email: legal@disband.dev.
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
            <p>
              Your license to install and use the Disband apps is set out in the{" "}
              <Link href="/eula" className="text-brand hover:underline">
                End User License Agreement
              </Link>
              .
            </p>
            <p>
              To report material on Disband that infringes your copyright, see our{" "}
              <Link href="/copyright" className="text-brand hover:underline">
                Copyright Policy
              </Link>
              .
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
              Resend, Apple, Google, Hive, DeepSeek, and GIPHY. Our{" "}
              <Link href="/privacy" className="text-brand hover:underline">
                Privacy Policy
              </Link>{" "}
              explains what each one does.
            </p>
            <p>
              Those providers may have their own terms, privacy policies, service limitations, and
              security practices. App Store and Google Play purchases are also governed by the
              applicable store’s rules.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">5. Credits and Open-Source Licenses</h2>
            <p>
              Emoji graphics are from Twemoji, copyright Twitter, Inc. and other contributors, licensed
              under{" "}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                className="text-brand hover:underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                CC BY 4.0
              </a>
              .
            </p>
            <p>
              The Geist (Vercel), Noto Sans (Google), Press Start 2P (CodeMan38), and Oswald (Vernon
              Adams and contributors) typefaces are used under the{" "}
              <a
                href="https://openfontlicense.org"
                className="text-brand hover:underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                SIL Open Font License 1.1
              </a>
              .
            </p>
            <p>
              Disband is built with open-source software. Each open-source component is used under the
              terms of its own license, and nothing in our terms restricts the rights those licenses
              give you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">6. No Professional or Emergency Service</h2>
            <p>
              Disband is a communications and community platform. It is not an emergency service and
              should not be relied upon for emergency communications, medical advice, legal advice,
              financial advice, or other professional services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">7. Contact</h2>
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
