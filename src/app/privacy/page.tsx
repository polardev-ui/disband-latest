import Link from "next/link";
import type { Metadata } from "next";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Disband handles your data — what we store, what we never sell, and the choices you have over your messages and profile.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#1e1f22] text-[#dbdee1]">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-24">
        <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-[#949ba4]">Last updated: October 28, 2026</p>

        <div className="prose-disband mt-8 space-y-6 text-[15px] leading-relaxed text-[#b5bac1]">
          <p>
            Genysis IQ LLC (“Genysis IQ,” “Disband,” “we,” “us,” or “our”) operates Disband, including
            its websites, applications, spaces, messaging, voice and video features, and related
            services (collectively, the “Service”).
          </p>
          <p>
            This Privacy Policy explains what information we collect, how we use it, when we share it,
            and the choices available to you.
          </p>

          <h2 className="text-lg font-semibold text-white">1. Information We Collect</h2>

          <h3 className="text-base font-semibold text-white">A. Account information</h3>
          <p>When you create an account, we may collect:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Email address;</li>
            <li>Username and display name;</li>
            <li>Password information, including a password hash managed by Supabase Auth;</li>
            <li>Date of birth;</li>
            <li>Profile photo and other profile information you choose to provide.</li>
          </ul>
          <p>
            Your date of birth is required during registration. It is self-declared. We do not
            currently require government identification or other identity verification.
          </p>
          <p>We do not receive or store your plaintext password.</p>

          <h3 className="text-base font-semibold text-white">B. Content you provide</h3>
          <p>We collect and store content you submit through the Service, including:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Messages;</li>
            <li>Images, files, and other media;</li>
            <li>Space and channel content;</li>
            <li>Profile information;</li>
            <li>Moderation reports;</li>
            <li>Bug reports;</li>
            <li>Support messages; and</li>
            <li>Other content you voluntarily provide.</li>
          </ul>
          <p>
            Messages and media on Disband are <strong>not end-to-end encrypted</strong>. They are
            stored in server-readable form and may be accessed by authorized Disband personnel for
            moderation, abuse investigations, account recovery, security, and operation of the Service.
          </p>
          <p>
            Do not use Disband to transmit information that requires end-to-end encryption or a legally
            protected confidential communications system.
          </p>

          <h3 className="text-base font-semibold text-white">C. Technical and security information</h3>
          <p>We may collect limited technical information, including:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Hashed IP addresses used for signup-abuse prevention;</li>
            <li>Temporary rate-limit counters;</li>
            <li>Timestamps;</li>
            <li>Message and media size;</li>
            <li>Space membership and participation information;</li>
            <li>Account and session information;</li>
            <li>Information required to maintain security and prevent abuse.</li>
          </ul>
          <p>
            Hashed IP addresses used for signup blocking are not intended to be stored permanently.
            However, service providers may independently create or retain technical logs, including
            raw IP addresses, under their own policies.
          </p>
          <p>We do not intentionally collect or store:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Device information;</li>
            <li>Browser information;</li>
            <li>Approximate location;</li>
            <li>Advertising identifiers;</li>
            <li>Contacts;</li>
            <li>Push-notification tokens;</li>
            <li>Analytics data; or</li>
            <li>Crash reports through a dedicated crash-monitoring service.</li>
          </ul>
          <p>
            Browser information may be processed locally by your browser or device but is not
            intentionally stored by Disband as an account profile.
          </p>

          <h3 className="text-base font-semibold text-white">D. Voice and video information</h3>
          <p>
            Voice and video calls use WebRTC transport encryption, including DTLS-SRTP, between
            participating devices where supported.
          </p>
          <p>Call signaling and certain call metadata pass through Disband servers. We may process information such as:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Call participants;</li>
            <li>Connection and signaling information;</li>
            <li>Call timing;</li>
            <li>Session identifiers; and</li>
            <li>Technical information needed to establish and maintain the call.</li>
          </ul>
          <p>Disband does not claim that voice or video calls are end-to-end encrypted.</p>

          <h3 className="text-base font-semibold text-white">E. Payment information</h3>
          <p>Paid services may be purchased through Stripe, Apple, or Google.</p>
          <p>
            Disband does not store full payment card numbers. Payment providers process payment
            information under their own privacy policies and terms. We may receive limited
            information such as:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Subscription status;</li>
            <li>Purchase or transaction identifiers;</li>
            <li>Product purchased;</li>
            <li>Payment status;</li>
            <li>Billing country or region; and</li>
            <li>Limited billing information provided by the payment provider.</li>
          </ul>

          <h2 className="text-lg font-semibold text-white">2. How We Use Information</h2>
          <p>We use information to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Create and manage accounts;</li>
            <li>Authenticate users;</li>
            <li>Deliver messages, media, spaces, and calls;</li>
            <li>Process subscriptions and purchases;</li>
            <li>Provide customer support;</li>
            <li>Respond to bug reports and security reports;</li>
            <li>Moderate content and communities;</li>
            <li>Investigate abuse, fraud, threats, and violations;</li>
            <li>Enforce our Terms of Service;</li>
            <li>Prevent spam, account abuse, and unauthorized access;</li>
            <li>Maintain, secure, and improve the Service;</li>
            <li>Comply with legal obligations; and</li>
            <li>Protect the rights, safety, and property of users and Genysis IQ.</li>
          </ul>
          <p>We do not sell personal information.</p>
          <p>We do not use message content for third-party advertising.</p>

          <h2 className="text-lg font-semibold text-white">3. Moderation and Access to Content</h2>
          <p>
            Because Disband does not provide end-to-end encryption for messages and media, authorized
            personnel may access content when reasonably necessary to:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Investigate reports;</li>
            <li>Enforce the Terms of Service;</li>
            <li>Respond to abuse or safety concerns;</li>
            <li>Recover or secure accounts;</li>
            <li>Investigate fraud or security incidents;</li>
            <li>Comply with legal obligations; or</li>
            <li>Operate and maintain the Service.</li>
          </ul>
          <p>We do not promise that content is private from Disband personnel.</p>

          <h2 className="text-lg font-semibold text-white">4. Cookies and Similar Technologies</h2>
          <p>Disband uses essential cookies and similar technologies for purposes such as:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Authentication;</li>
            <li>Maintaining sessions;</li>
            <li>Security; and</li>
            <li>Remembering necessary account settings.</li>
          </ul>
          <p>We do not currently use advertising cookies or third-party analytics cookies.</p>
          <p>Disabling essential cookies may prevent portions of the Service from functioning.</p>

          <h2 className="text-lg font-semibold text-white">5. Service Providers</h2>
          <p>We use independent providers to operate Disband, including:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Supabase</strong> — PostgreSQL database, authentication, and storage;</li>
            <li><strong>Vercel</strong> — web hosting;</li>
            <li><strong>Cloudflare</strong> — content delivery and domain-related services;</li>
            <li><strong>Stripe</strong> — web payment processing;</li>
            <li><strong>Resend</strong> — transactional email delivery;</li>
            <li><strong>Apple</strong> — App Store distribution and related purchases;</li>
            <li><strong>Google</strong> — Google Play distribution and related purchases.</li>
          </ul>
          <p>
            These providers may process information on our behalf or independently under their own
            policies and contractual obligations.
          </p>
          <p>We may also disclose information when reasonably necessary to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Comply with a subpoena, court order, or other valid legal process;</li>
            <li>Protect users, the public, or Genysis IQ;</li>
            <li>Investigate fraud, abuse, or security incidents;</li>
            <li>Enforce our agreements;</li>
            <li>Complete a merger, acquisition, financing, restructuring, or sale of assets; or</li>
            <li>Prevent harm or illegal activity.</li>
          </ul>
          <p>We do not sell, rent, or trade personal information to data brokers or advertising companies.</p>

          <h2 className="text-lg font-semibold text-white">6. International Processing</h2>
          <p>
            Our users may access Disband from many countries. Information may be processed or stored in
            the United States or other countries where Genysis IQ or its service providers operate.
          </p>
          <p>
            Privacy protections may differ between countries. By using the Service, you understand that
            information may be transferred to jurisdictions outside your country.
          </p>

          <h2 className="text-lg font-semibold text-white">7. Data Retention</h2>
          <p>We retain information for as long as reasonably necessary to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Provide the Service;</li>
            <li>Maintain account functionality;</li>
            <li>Complete transactions;</li>
            <li>Prevent abuse and fraud;</li>
            <li>Resolve disputes;</li>
            <li>Enforce agreements;</li>
            <li>Maintain security; or</li>
            <li>Comply with legal obligations.</li>
          </ul>
          <p>
            When you delete your account, we will delete or de-identify account information from active
            systems within a reasonable period, subject to technical limitations and legal,
            security, fraud-prevention, backup, and dispute-resolution requirements.
          </p>
          <p>Deleting your account does not necessarily delete:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Copies of content retained by other users;</li>
            <li>Content quoted, copied, or redistributed by others;</li>
            <li>Information required for legal compliance;</li>
            <li>Security or abuse records;</li>
            <li>Information contained in backups until those backups are overwritten; or</li>
            <li>Transaction records that must be retained.</li>
          </ul>

          <h2 className="text-lg font-semibold text-white">8. Your Privacy Rights</h2>
          <p>Depending on where you live, you may have rights to request:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Access to personal information;</li>
            <li>Correction of inaccurate information;</li>
            <li>Deletion of personal information;</li>
            <li>A copy or export of certain information;</li>
            <li>Restriction or objection to certain processing; or</li>
            <li>Information about how your information is used.</li>
          </ul>
          <p>
            To make a request, contact <strong>privacy@disband.dev</strong>. We may need to verify your
            identity before completing a request.
          </p>
          <p>
            We may deny or limit a request where permitted by law, including when responding would
            compromise security, expose another person’s information, or interfere with fraud prevention
            or legal obligations.
          </p>

          <h2 className="text-lg font-semibold text-white">9. Children</h2>
          <p>
            Disband is not intended for children under 13. You must be at least 13 years old to use the
            Service, unless a higher minimum age applies in your location.
          </p>
          <p>
            We do not knowingly collect personal information from children under 13. If we learn that
            a child under 13 has created an account, we may suspend or delete the account and
            associated information.
          </p>
          <p>
            A parent or legal guardian who believes a child under 13 has used Disband may contact{" "}
            <strong>privacy@disband.dev</strong>.
          </p>

          <h2 className="text-lg font-semibold text-white">10. Security</h2>
          <p>
            We use reasonable technical and organizational safeguards designed to protect information.
            These may include access controls, encryption in transit, authentication safeguards,
            security monitoring, and provider security controls.
          </p>
          <p>
            No online service is completely secure. We cannot guarantee that information will never be
            accessed, disclosed, altered, or destroyed through unauthorized activity.
          </p>

          <h2 className="text-lg font-semibold text-white">11. Legal Requests</h2>
          <p>
            We review and respond to valid legal process as required by applicable law.
          </p>
          <p>
            Because Disband does not use end-to-end encryption for messages and media, readable content
            may exist on our systems and may be disclosed when legally required or otherwise permitted
            under this Policy and our Terms.
          </p>

          <h2 className="text-lg font-semibold text-white">12. Changes</h2>
          <p>
            We may update this Privacy Policy from time to time. We will update the “Last updated” date
            when changes are made. Where legally required or reasonably practical, we may provide
            additional notice.
          </p>

          <h2 className="text-lg font-semibold text-white">13. Contact</h2>
          <p>Privacy questions and requests may be sent to:</p>
          <p className="whitespace-pre-line">
            Genysis IQ LLC{"\n"}
            10524 Moss Park Rd, Suite 204-653{"\n"}
            Orlando, Florida 32832{"\n"}
            United States{"\n\n"}
            Email: privacy@disband.dev
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
