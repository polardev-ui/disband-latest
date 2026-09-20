import type { Metadata } from "next";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingLayout";

export const metadata: Metadata = {
  title: "Legal — Disband",
  description:
    "Legal information for Disband: ownership, intellectual property, privacy, security, and third-party providers.",
  alternates: { canonical: "/legal" },
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-[#9aa0a8]">{children}</div>
    </section>
  );
}

const contents = [
  { id: "entity", label: "1. Entity & Ownership" },
  { id: "ip", label: "2. Intellectual Property" },
  { id: "privacy", label: "3. Privacy & Your Data" },
  { id: "security", label: "4. Security" },
  { id: "providers", label: "5. Third-Party Providers" },
  { id: "accounts", label: "6. Accounts & Acceptable Use" },
  { id: "content", label: "7. Your Content" },
  { id: "termination", label: "8. Suspension & Termination" },
  { id: "disclaimers", label: "9. Disclaimers & Limitation of Liability" },
  { id: "changes", label: "10. Changes & Contact" },
];

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-[#1e1f22]">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-24 sm:pt-28">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#6e727a]">
          Last updated September 2026
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
          Legal Information
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#9aa0a8]">
          Everything below describes who owns and operates Disband, how your data is handled,
          and the terms under which the service is provided. If anything here conflicts with a
          separate written agreement, the written agreement controls.
        </p>

        <nav className="mt-8 grid gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 sm:grid-cols-2">
          {contents.map((c) => (
            <a key={c.id} href={`#${c.id}`} className="text-sm text-[#b5bac1] transition-colors hover:text-white">
              {c.label}
            </a>
          ))}
        </nav>

        <div className="mt-12 space-y-12">
          <Section id="entity" title="1. Entity & Ownership">
            <p>
              Disband is owned and operated by <span className="font-semibold text-white">Genysis IQ</span>,
              its parent company. Disband is not its own corporation at this time; all corporate,
              legal, and financial responsibility for the service sits with Genysis IQ.
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <span className="font-semibold text-white">Lead programmer / Owner:</span> Josh Clark
                (15 years old).
              </li>
              <li>
                <span className="font-semibold text-white">Security advisor:</span> Diego Quintero.
              </li>
              <li>
                <span className="font-semibold text-white">Marketing:</span> powered by the community.
                Disband has no paid marketing department; growth comes from its users.
              </li>
            </ul>
          </Section>

          <Section id="ip" title="2. Intellectual Property">
            <p>
              All rights to Disband — including its name, logos, artwork, website copy, software,
              and service assets — are reserved by the parent company (Genysis IQ) and are
              non-transferable unless admitted in writing by both the parent company and the owner
              of Disband.
            </p>
            <p>
              You may not copy, redistribute, reverse-engineer, or misrepresent Disband or its
              assets without prior written permission. Usernames, space names, and community
              content created by users remain the responsibility of the users who post them, as
              described in Section 7.
            </p>
          </Section>

          <Section id="privacy" title="3. Privacy & Your Data">
            <p>
              Your data is stored on a <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Supabase</a> database
              and it is never shared with another company. Your data is not and will not be sold to
              third parties or external companies — not now, not ever. If Disband&apos;s ownership
              ever changes, this section will be updated before anything about your data changes.
            </p>
            <p>In practice this means:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Account data (email, username, profile) exists to operate your account and nothing else.</li>
              <li>Messages, spaces, and media you create are stored so the service functions and are never mined for advertising.</li>
              <li>We do not sell, rent, or trade personal information, and we do not share it with data brokers.</li>
              <li>Limited operational data (e.g. error logs, rate-limit counters) is kept only as long as needed for security and reliability.</li>
            </ul>
            <p>
              You may request deletion of your account and associated personal data at any time;
              deletion removes your account records from active systems within a reasonable period,
              subject to legal retention obligations (for example, records needed to resolve fraud
              or abuse).
            </p>
          </Section>

          <Section id="security" title="4. Security">
            <p>
              Content on Disband is encrypted within 7 custom layers of encryption, along with
              redaction of sensitive data and space randomization. In plain terms: data is
              protected in multiple independent stages rather than a single point of failure,
              sensitive fields are stripped or masked wherever they are not strictly needed, and
              infrastructure placement is randomized to avoid predictable targets.
            </p>
            <p>
              Security review is advised by Diego Quintero (see Section 1). Suspected
              vulnerabilities can be reported through the{" "}
              <a href="/bug-report" className="text-brand hover:underline">bug report page</a>;
              eligible reports may earn the Bug Bounty Hunter badge. No system is perfectly secure,
              and Section 9 applies.
            </p>
          </Section>

          <Section id="providers" title="5. Third-Party Providers">
            <p>
              Disband relies on the following independent providers to operate. Each processes
              data under its own terms and policies, linked where practical:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <span className="font-semibold text-white">Supabase</span> — primary application
                database. Data stored here is never shared with another company and is never sold.
              </li>
              <li>
                <span className="font-semibold text-white">Cloudflare</span> — stores encrypted
                images (encrypted through Supabase) on the CDN and is the domain registrar of
                Disband.
              </li>
              <li>
                <span className="font-semibold text-white">Vercel</span> — hosts disband.dev,
                disband.app, and all other respective public-facing materials served to the users
                of Disband.
              </li>
              <li>
                <span className="font-semibold text-white">Apple Inc. and Google Inc.</span> —
                Disband relies on Apple and Google to publish apps on both the Google Play Store
                and the Apple App Store. Store installations are governed by Apple&apos;s and
                Google&apos;s own terms in addition to these.
              </li>
              <li>
                <span className="font-semibold text-white">Payment processing</span> — paid
                subscriptions and one-time purchases are processed by our payment provider;
                Disband does not store full payment card numbers.
              </li>
            </ul>
          </Section>

          <Section id="accounts" title="6. Accounts & Acceptable Use">
            <p>
              You must provide accurate registration information and keep your credentials
              confidential. You are responsible for activity under your account.
            </p>
            <p>You agree not to use Disband to:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Break the law, or facilitate harassment, hate, threats, or exploitation of any kind.</li>
              <li>Distribute malware, spam, scams, or deceptive content, including phishing links.</li>
              <li>Share content you do not have the right to share, including others&apos; private information.</li>
              <li>Attempt to breach, probe, or overload Disband&apos;s systems, or circumvent rate limits, bans, or access controls.</li>
              <li>Automate access outside the documented bot API and your granted scopes.</li>
            </ul>
            <p>
              Space owners and moderators set additional rules for their own communities; violating
              them may lead to removal from those communities under Section 8.
            </p>
          </Section>

          <Section id="content" title="7. Your Content">
            <p>
              You retain whatever rights you already hold in content you post. By posting, you grant
              Disband a limited, worldwide license to store, display, and transmit that content
              solely to operate the service (for example, showing your messages to members of the
              same space or conversation).
            </p>
            <p>
              You are solely responsible for content you post. Disband does not pre-screen
              communities and is not liable for user-generated content, though we act on reports
              of abuse under Section 8.
            </p>
          </Section>

          <Section id="termination" title="8. Suspension & Termination">
            <p>
              We may suspend or terminate accounts, spaces, or content that violate these terms,
              the law, or the safety of the community — including platform bans for severe or
              repeated abuse. You may delete your account at any time; deletion ends your license
              for future use but does not retroactively erase copies others lawfully made (such as
              quoted messages).
            </p>
          </Section>

          <Section id="disclaimers" title="9. Disclaimers & Limitation of Liability">
            <p>
              Disband is provided &quot;as is&quot; and &quot;as available,&quot; without warranties
              of any kind, express or implied, including merchantability, fitness for a particular
              purpose, and non-infringement. We do not warrant uninterrupted or error-free operation.
            </p>
            <p>
              To the maximum extent permitted by law, Genysis IQ, the owner, and advisors will not
              be liable for indirect, incidental, special, consequential, or punitive damages, or
              for loss of data, profits, or goodwill arising from your use of the service. Total
              liability is limited to the amounts you paid to Disband in the 12 months before the
              claim, or $10 if you paid nothing.
            </p>
          </Section>

          <Section id="changes" title="10. Changes & Contact">
            <p>
              These terms may change as Disband grows; material changes will be dated above, and
              continued use after changes take effect constitutes acceptance. For legal questions,
              abuse reports, or data requests, use the{" "}
              <a href="/bug-report" className="text-brand hover:underline">bug report page</a> or
              the contact channels listed on the homepage.
            </p>
          </Section>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
