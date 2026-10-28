import Link from "next/link";
import type { Metadata } from "next";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The rules of Disband — what you own, what we expect from you, and the limits of using the service.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#1e1f22] text-[#dbdee1]">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-24">
        <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
        <p className="mt-2 text-sm text-[#949ba4]">Last updated: October 28, 2026</p>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-[#b5bac1]">
          <p>
            These Terms of Service (“Terms”) form a legal agreement between you and{" "}
            <strong>Genysis IQ LLC</strong> (“Genysis IQ,” “Disband,” “we,” “us,” or “our”).
          </p>
          <p>
            By creating an account, downloading, accessing, or using Disband, you agree to these
            Terms. If you do not agree, do not use the Service.
          </p>

          <h2 className="text-lg font-semibold text-white">1. The Service</h2>
          <p>Disband provides online communications and community features, including:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Spaces and channels;</li>
            <li>Direct messages;</li>
            <li>Group chats;</li>
            <li>Voice and video calls;</li>
            <li>User profiles;</li>
            <li>Media and file sharing;</li>
            <li>Moderation tools; and</li>
            <li>Paid products and subscriptions.</li>
          </ul>
          <p>
            The Service may change, evolve, be interrupted, or be discontinued. Features may vary by
            platform, region, account type, or subscription.
          </p>

          <h2 className="text-lg font-semibold text-white">2. Eligibility</h2>
          <p>
            You must be at least 13 years old to use Disband, unless a higher minimum age applies
            where you live.
          </p>
          <p>You may not use Disband if doing so would violate applicable law or if you have been permanently banned from the Service.</p>
          <p>
            You must provide accurate registration information, including your date of birth, and keep
            it reasonably current.
          </p>

          <h2 className="text-lg font-semibold text-white">3. Your Account</h2>
          <p>You are responsible for activity conducted through your account.</p>
          <p>You must:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Keep your password and login credentials confidential;</li>
            <li>Avoid sharing account access;</li>
            <li>Sign out of shared devices;</li>
            <li>Notify us if you believe your account is compromised; and</li>
            <li>Provide accurate account information.</li>
          </ul>
          <p>
            You may operate more than one account only if each account is legitimate and is not used to
            evade a ban, restriction, or moderation action.
          </p>
          <p>Contact <strong>legal@disband.dev</strong> if you believe your account has been compromised.</p>

          <h2 className="text-lg font-semibold text-white">4. Acceptable Use</h2>
          <p>You may not use Disband to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Break the law;</li>
            <li>Harass, threaten, stalk, or bully others;</li>
            <li>Promote hate or violent threats;</li>
            <li>Exploit or endanger children;</li>
            <li>Distribute malware, viruses, or harmful code;</li>
            <li>Send spam, scams, phishing links, or deceptive content;</li>
            <li>Impersonate another person or organization;</li>
            <li>Share another person’s private information without authorization;</li>
            <li>Infringe intellectual-property or privacy rights;</li>
            <li>Facilitate fraud or illegal activity;</li>
            <li>Evade a ban or suspension;</li>
            <li>Interfere with the Service or other users;</li>
            <li>Probe, scan, overload, or attack our systems;</li>
            <li>Circumvent rate limits or access controls;</li>
            <li>Modify, tamper with, or reverse engineer the Service;</li>
            <li>Forge requests, inject unauthorized data, or access restricted areas;</li>
            <li>Use unauthorized bots, scripts, or automation; or</li>
            <li>Use Disband to distribute content you do not have the right to share.</li>
          </ul>
          <p>
            Good-faith bug and security reports are permitted when submitted through authorized
            channels and do not involve unauthorized access, disruption, data extraction, or disclosure.
          </p>

          <h2 className="text-lg font-semibold text-white">5. Encryption and Privacy</h2>
          <p>
            Disband messages and media are not end-to-end encrypted. They may be stored in
            server-readable form and accessed by authorized Disband personnel for moderation, abuse
            investigations, account recovery, security, legal compliance, and operation of the
            Service.
          </p>
          <p>
            Voice and video calls use WebRTC transport encryption where supported. Call signaling and
            metadata pass through Disband servers.
          </p>
          <p>
            Do not use Disband for information that requires end-to-end encryption or a legally
            protected confidential communications system.
          </p>

          <h2 className="text-lg font-semibold text-white">6. User Content</h2>
          <p>
            You retain ownership of content you post or upload, subject to the rights of other people
            and entities that may own or control that content.
          </p>
          <p>You represent that:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>You own the content or have permission to use it;</li>
            <li>Your content does not violate the law;</li>
            <li>Your content does not infringe another person’s rights; and</li>
            <li>You have the necessary authority to submit the content.</li>
          </ul>
          <p>You grant Genysis IQ a worldwide, non-exclusive, royalty-free license to host, store, reproduce, transmit, display, process, and technically modify your content only as reasonably necessary to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Provide and operate the Service;</li>
            <li>Deliver content to intended recipients;</li>
            <li>Maintain and secure the Service;</li>
            <li>Moderate and investigate abuse;</li>
            <li>Create backups;</li>
            <li>Comply with legal obligations; and</li>
            <li>Enforce these Terms.</li>
          </ul>
          <p>
            This license ends within a reasonable period after deletion of the applicable content or
            account, except for copies retained in backups, legal records, abuse records, or copies
            lawfully retained by other users.
          </p>

          <h2 className="text-lg font-semibold text-white">7. Moderation</h2>
          <p>Space owners and moderators may establish additional rules for their communities.</p>
          <p>We may, but are not required to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Review content;</li>
            <li>Remove or restrict content;</li>
            <li>Investigate reports;</li>
            <li>Limit features;</li>
            <li>Suspend accounts;</li>
            <li>Remove spaces; or</li>
            <li>Report conduct to law enforcement.</li>
          </ul>
          <p>We do not guarantee that all unlawful, harmful, or rule-breaking content will be detected or removed.</p>

          <h2 className="text-lg font-semibold text-white">8. Suspension and Termination</h2>
          <p>We may suspend or terminate accounts, spaces, or content when we reasonably believe that:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>These Terms or applicable law were violated;</li>
            <li>The Service or users were harmed or threatened;</li>
            <li>The account presents a security or fraud risk;</li>
            <li>A user attempted to evade moderation;</li>
            <li>A user abused staff or safety systems; or</li>
            <li>Action is required to protect the Service or community.</li>
          </ul>
          <p>Serious or repeated violations may result in permanent suspension.</p>
          <p>
            You may stop using the Service and delete your account at any time. Account deletion does
            not automatically delete copies retained by other users, legal records, backups, or
            information required for security or compliance.
          </p>

          <h2 className="text-lg font-semibold text-white">9. Paid Services</h2>
          <p>Disband may offer paid products, including:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Disband Lite:</strong> currently $2.99 per month;</li>
            <li><strong>Disband Aero:</strong> currently $8.99 per month; and</li>
            <li><strong>Server Catalysts:</strong> one-time purchases applied to a selected space.</li>
          </ul>
          <p>Prices, features, taxes, and availability may change. Applicable taxes may be calculated and collected by Stripe or the relevant app store.</p>

          <h3 className="text-base font-semibold text-white">Subscriptions</h3>
          <p>
            Subscriptions automatically renew unless canceled before the renewal deadline shown by the
            applicable payment platform.
          </p>
          <p>
            For web purchases, Stripe processes payment. For purchases through Apple or Google, the
            applicable app store processes payment and controls subscription management under its
            rules.
          </p>
          <p>
            Canceling a subscription generally stops future renewals but does not automatically refund
            the current billing period. You generally retain access until the end of the paid period
            unless your account is suspended or terminated.
          </p>

          <h3 className="text-base font-semibold text-white">Refunds</h3>
          <p>
            Except where required by law, or where Genysis IQ cannot provide the paid service, payments
            are non-refundable.
          </p>
          <p>
            Apple and Google purchases are also subject to their respective refund policies. Genysis IQ
            may not be able to issue refunds for transactions processed directly by those stores.
          </p>
          <p>
            If your account is permanently suspended, we may terminate paid services and deny refunds
            for unused time to the extent permitted by law.
          </p>

          <h3 className="text-base font-semibold text-white">Server Catalysts</h3>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Are one-time purchases;</li>
            <li>Apply only to the selected space;</li>
            <li>Do not automatically renew;</li>
            <li>Are not transferable between spaces; and</li>
            <li>May not have cash value outside the Service.</li>
          </ul>

          <h2 className="text-lg font-semibold text-white">10. Availability and Changes</h2>
          <p>
            The Service is provided on an “as available” basis. We do not guarantee uninterrupted,
            timely, secure, or error-free operation.
          </p>
          <p>
            We may change, suspend, or discontinue features, including paid features, when reasonably
            necessary for legal, technical, business, security, or operational reasons.
          </p>

          <h2 className="text-lg font-semibold text-white">11. Disclaimers</h2>
          <p>
            To the maximum extent permitted by law, the Service is provided “as is” and “as
            available,” without warranties of any kind, express or implied.
          </p>
          <p>We disclaim warranties of:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Merchantability;</li>
            <li>Fitness for a particular purpose;</li>
            <li>Non-infringement;</li>
            <li>Accuracy;</li>
            <li>Reliability;</li>
            <li>Availability; and</li>
            <li>Security.</li>
          </ul>
          <p>Nothing in these Terms excludes a warranty or consumer right that cannot legally be excluded.</p>

          <h2 className="text-lg font-semibold text-white">12. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Genysis IQ, its owners, employees, contractors,
            advisors, affiliates, and service providers will not be liable for indirect, incidental,
            special, consequential, exemplary, or punitive damages, including loss of:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Data;</li>
            <li>Profits;</li>
            <li>Revenue;</li>
            <li>Business opportunities;</li>
            <li>Goodwill; or</li>
            <li>Access to the Service.</li>
          </ul>
          <p>Our total liability for all claims relating to the Service will not exceed the greater of:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>The amounts you paid to Genysis IQ during the 12 months before the event giving rise to the claim; or</li>
            <li><strong>$25.00</strong>.</li>
          </ol>
          <p>
            This limitation does not apply where liability cannot legally be limited, including
            certain liability for fraud, intentional misconduct, personal injury, or non-waivable
            consumer rights.
          </p>

          <h2 className="text-lg font-semibold text-white">13. Indemnification</h2>
          <p>
            To the maximum extent permitted by law, you agree to defend, indemnify, and hold harmless
            Genysis IQ, its owners, employees, contractors, advisors, affiliates, and service
            providers from claims, damages, liabilities, losses, costs, and reasonable legal fees
            arising from:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Your use of the Service;</li>
            <li>Your content;</li>
            <li>Your violation of these Terms;</li>
            <li>Your violation of applicable law;</li>
            <li>Your violation of another person’s rights; or</li>
            <li>Your unauthorized modification, misuse, or abuse of the Service.</li>
          </ul>
          <p>This provision does not require you to indemnify Genysis IQ for Genysis IQ’s own unlawful conduct.</p>

          <h2 className="text-lg font-semibold text-white">14. Governing Law and Courts</h2>
          <p>These Terms are governed by the laws of the State of Florida, without regard to conflict-of-law rules.</p>
          <p>
            Any dispute arising from these Terms or the Service must be brought exclusively in the
            state or federal courts located in Orange County, Florida, and you consent to those
            courts’ jurisdiction and venue.
          </p>
          <p>Nothing in this section prevents a consumer from asserting rights that cannot legally be waived.</p>

          <h2 className="text-lg font-semibold text-white">15. Changes to These Terms</h2>
          <p>
            We may update these Terms. When material changes are made, we may update the “Last
            updated” date and provide notice where reasonably practical.
          </p>
          <p>
            Your continued use of the Service after the effective date of revised Terms means you
            accept them. If you do not agree, stop using the Service and delete your account.
          </p>

          <h2 className="text-lg font-semibold text-white">16. General Provisions</h2>
          <p>
            If a court finds part of these Terms unenforceable, the remaining provisions will remain
            in effect.
          </p>
          <p>Our failure to enforce a provision is not a waiver of our right to enforce it later.</p>
          <p>
            These Terms, together with applicable policies and written agreements, constitute the
            agreement between you and Genysis IQ concerning the Service.
          </p>

          <h2 className="text-lg font-semibold text-white">17. Contact</h2>
          <p>Genysis IQ LLC</p>
          <p>10524 Moss Park Rd, Suite 204-653</p>
          <p>Orlando, Florida 32832</p>
          <p>United States</p>
          <p>Legal: legal@disband.dev</p>
          <p>Privacy: privacy@disband.dev</p>
        </div>

        <Link href="/home" className="mt-10 inline-block text-sm text-brand hover:underline">
          ← Back to home
        </Link>
      </main>
      <MarketingFooter />
    </div>
  );
}
