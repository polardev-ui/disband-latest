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
        <p className="mt-2 text-sm text-[#949ba4]">Last updated: September 2026</p>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-[#b5bac1]">
          <p>
            By creating an account, downloading, accessing, or using Disband (the &quot;Service&quot;),
            you agree to these Terms of Service (the &quot;Terms&quot;). If you do not agree to these
            Terms, do not use the Service. Your continued use of the Service after we post changes to
            these Terms constitutes acceptance of those changes.
          </p>

          <h2 className="text-lg font-semibold text-white">1. The Service</h2>
          <p>
            Disband provides servers and channels, direct messages, group chats, and voice and video
            calling across desktop, mobile, and the web. The Service is provided as-is, may evolve
            over time, and some features may be made available only on certain platforms or to paid
            subscribers (&quot;basic&quot; and &quot;super&quot; plans). Nothing in these Terms grants you
            ownership of Disband, its software, branding, or infrastructure.
          </p>

          <h2 className="text-lg font-semibold text-white">2. Your account</h2>
          <p>
            You are responsible for everything done through your account. You must keep your password
            and login credentials private, and you should sign out on shared devices. If you believe
            your account has been compromised, change your password immediately and contact us at{" "}
            <a href="mailto:legal@disband.dev" className="text-[#00a8fc] hover:underline">
              legal@disband.dev
            </a>
            . One person may operate more than one account, but each account must have a genuine,
            distinct identity — you may not create accounts to evade a ban, circumvent a restriction,
            or artificially inflate activity.
          </p>

          <h2 className="text-lg font-semibold text-white">3. Acceptable use</h2>
          <p>
            You may not use the Service to: harass, threaten, or bully others; distribute malware,
            viruses, or harmful code; send spam, scams, or phishing; impersonate other people or
            organizations; engage in any illegal activity; share content you do not have the right to
            share; evade a ban, suspension, or other restriction; or interfere with other users'
            enjoyment of the Service. We may remove content and suspend accounts that violate these
            rules — including permanent suspension, at our discretion and without notice.
          </p>

          <h2 className="text-lg font-semibold text-white">4. No illegal modifications</h2>
          <p>
            You must not modify, reverse engineer, decompile, disassemble, tamper with, or attempt to
            defeat any part of Disband — including its client software, servers, configuration,
            databases, APIs, security measures, rate limits, or the experience of other users. You may
            not use scripts, automated tools, or unauthorized third-party software to modify the app,
            inject data, forge requests, access areas you are not permitted to access, or otherwise
            manipulate the Service in a way that is not intended. Making unauthorized modifications to
            the app — or abusing, exploiting, or attempting to circumvent its protections — is a
            serious violation of these Terms and <strong>will result in the permanent suspension of
            your account</strong>. Illegal activity committed in connection with such modifications
            (including unauthorized access to systems or data) may also be reported to law enforcement
            and pursued to the fullest extent of the law. Reporting a bug or security issue in good
            faith through our documented channels is welcome and is not a violation of this section.
          </p>

          <h2 className="text-lg font-semibold text-white">5. Encryption &amp; privacy</h2>
          <p>
            Disband provides end-to-end encrypted messaging. You are responsible for safeguarding your
            account credentials. We design our systems so that encrypted conversation content is not
            accessible to Disband or third parties, including through subpoena or similar legal process
            directed at message contents. Nothing in these Terms requires you to abandon your privacy
            rights, and no modification of the Service may be used to bypass that encryption.
          </p>

          <h2 className="text-lg font-semibold text-white">6. Content you post</h2>
          <p>
            You retain ownership of the content you post, send, or upload. You grant Disband a
            worldwide, non-exclusive, royalty-free license to store, transmit, display, and process
            that content solely to operate and improve the Service. You represent that you own or have
            the necessary rights to every piece of content you post. We may remove content that
            violates these Terms, applicable law, or the rights of others, and we may retain or delete
            content in accordance with our policies and legal obligations.
          </p>

          <h2 className="text-lg font-semibold text-white">7. Moderation, suspensions, and termination</h2>
          <p>
            We take action against accounts and communities that violate these Terms. Measures range
            from warnings, content removal, and temporary suspension to{" "}
            <strong>permanent suspension</strong> — which ends your ability to use the Service,
            including any paid features. Permanent suspension may result from: serious or repeated
            violations of acceptable use; illegal modifications to the app or its infrastructure;
            attempts to evade moderation or bans; abuse of our staff or safety systems; or activity
            that harms other users, the Service, or its operation. Depending on the conduct, we may
            also terminate or disable specific servers, restrict access, withhold or claw back
            features, or report unlawful activity to the appropriate authorities. You may delete your
            account at any time; some information may be retained where required by law.
          </p>

          <h2 className="text-lg font-semibold text-white">8. Billing and paid plans</h2>
          <p>
            Paid plans are billed on a recurring basis and renew automatically until cancelled.
            Promotion codes and payments are subject to the terms shown at check-in, and cancellation
            takes effect at the end of your current billing period. We do not provide refunds except
            where required by law or where we are unable to provide the paid service. If you are
            permanently suspended, we may terminate your paid plan and deny refunds for the unused
            portion, in our discretion and to the extent permitted by law.
          </p>

          <h2 className="text-lg font-semibold text-white">9. Service availability</h2>
          <p>
            We strive for high availability but do not guarantee uninterrupted service. The Service
            may be unavailable for maintenance, upgrades, or reasons outside our control, and features
            may change as Disband evolves. You accept that temporary interruptions are part of any
            online service.
          </p>

          <h2 className="text-lg font-semibold text-white">10. Limitation of liability</h2>
          <p>
            Disband is provided &quot;as is&quot; and &quot;as available&quot; to the maximum extent
            permitted by law. We do not warrant that the Service will be error-free, secure, or wholly
            uninterrupted. To the maximum extent permitted by law, Disband and its operators are not
            liable for indirect, incidental, special, consequential, or punitive damages, loss of
            profits, data, or goodwill, or for any damages arising from your use of — or inability to
            use — the Service. Our total liability for any claim related to the Service will not
            exceed the greater of (a) the amount you paid us in the twelve (12) months preceding the
            claim or (b) twenty-five dollars ($25).
          </p>

          <h2 className="text-lg font-semibold text-white">11. Indemnity</h2>
          <p>
            You agree to indemnify and hold harmless Disband and its operators, affiliates, and staff
            from any claims, damages, liabilities, and expenses (including reasonable legal fees)
            arising out of your use of the Service, your content, your violation of these Terms, or
            your violation of any law or the rights of a third party — including claims arising from
            unauthorized modifications you make to the Service.
          </p>

          <h2 className="text-lg font-semibold text-white">12. Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. When we make material changes, we will update
            the &quot;Last updated&quot; date above and, where practical, notify you in the app or by
            email. Continued use of the Service after changes take effect means you accept the updated
            Terms. If you do not agree, you should stop using the Service and delete your account.
          </p>

          <h2 className="text-lg font-semibold text-white">13. Governing law and disputes</h2>
          <p>
            These Terms are governed by the laws of the jurisdiction in which Disband operates
            (United States), without regard to conflict-of-law principles. You agree that any dispute
            arising out of these Terms or the Service will be resolved exclusively in the appropriate
            federal or state courts, and you consent to the personal jurisdiction of those courts.
          </p>

          <h2 className="text-lg font-semibold text-white">14. Severability and waiver</h2>
          <p>
            If any provision of these Terms is found to be unenforceable, that provision will be
            enforced to the maximum extent permissible, and the remaining provisions will remain in
            full force and effect. Our failure to enforce any provision is not a waiver of that
            provision or of our right to enforce it later.
          </p>

          <h2 className="text-lg font-semibold text-white">15. Contact</h2>
          <p>
            Questions about these Terms or reports of abuse or security issues can be sent to:{" "}
            <a href="mailto:legal@disband.dev" className="text-[#00a8fc] hover:underline">
              legal@disband.dev
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