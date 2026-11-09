import Link from "next/link";
import type { Metadata } from "next";
import { LegalShell } from "@/components/marketing/LegalShell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The rules of Disband — what you own, what we expect from you, and the limits of using the service.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="November 6, 2026" path="/terms">

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-interactive-normal">
          <p>
            These Terms of Service (“Terms”) form a legal agreement between you and{" "}
            <strong>Genysis IQ LLC</strong> (“Genysis IQ,” “Disband,” “we,” “us,” or “our”).
          </p>
          <p>
            By creating an account, downloading, accessing, or using Disband, you agree to these
            Terms. If you do not agree, do not use the Service.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">1. The Service</h2>
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

          <h2 className="text-lg font-semibold text-header-primary">2. Eligibility</h2>
          <p>
            You must be at least 13 years old to use Disband, unless a higher minimum age applies
            where you live.
          </p>
          <p>You may not use Disband if doing so would violate applicable law or if you have been permanently banned from the Service.</p>
          <p>
            You must provide accurate registration information, including your date of birth, and keep
            it reasonably current.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">3. Your Account</h2>
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

          <h2 className="text-lg font-semibold text-header-primary">4. Acceptable Use</h2>
          <p>You may not use Disband to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Break the law;</li>
            <li>Harass, threaten, stalk, or bully others;</li>
            <li>Promote hate or violent threats;</li>
            <li>Exploit or endanger children;</li>
            <li>Share sexually explicit content;</li>
            <li>Share graphic violence or gore;</li>
            <li>Promote or encourage suicide, self-harm, or eating disorders;</li>
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

          <h2 className="text-lg font-semibold text-header-primary">5. Encryption and Privacy</h2>
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

          <h2 className="text-lg font-semibold text-header-primary">6. User Content</h2>
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

          <h3 className="text-base font-semibold text-header-primary">Copyright</h3>
          <p>
            We respond to notices of alleged copyright infringement and, in appropriate circumstances,
            terminate the accounts of repeat infringers, as described in our{" "}
            <Link href="/copyright" className="text-brand hover:underline">Copyright Policy</Link>.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">7. Moderation</h2>
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

          <h3 className="text-base font-semibold text-header-primary">How we enforce these Terms</h3>
          <p>We use a combination of automated tools and human review:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Hash matching:</strong> uploaded media is compared with digital fingerprints of
              known prohibited media, such as child sexual abuse material;
            </li>
            <li>
              <strong>Image classification:</strong> images, including images sent in direct messages
              and group chats, are checked by an automated classifier, provided by Hive, for categories
              such as sexual content and graphic violence;
            </li>
            <li>
              <strong>AI review:</strong> AI language models provided by DeepSeek, including Tether, our
              AI reviewer, review flagged content and reports and decide what action to take; and
            </li>
            <li>
              <strong>Human review:</strong> Disband staff decide appeals and may review any decision.
            </li>
          </ul>
          <p>
            These tools check media when it is uploaded, scan profiles, spaces, channels, and messages
            on a regular schedule, and assess reports as they arrive. They can remove content or
            restrict accounts without a person reviewing the decision first, and they can make
            mistakes. You can ask for a person to review any decision.
          </p>
          <p>
            Depending on how serious a violation is and an account’s history, we may remove content,
            add a strike, limit features for a period, hold an account while we review it, or suspend
            an account temporarily or permanently. Strikes expire over time. You can see your strikes
            and any active limits in Settings → Account Standing.
          </p>
          <p>
            We apply and enforce these Terms with due regard to the rights and legitimate interests of
            everyone involved, including freedom of expression.
          </p>

          <h3 className="text-base font-semibold text-header-primary">Reporting</h3>
          <p>
            You can report messages, profiles, and spaces in the app. Anyone, including people without
            an account, can report illegal content by email to legal@disband.dev. See our{" "}
            <Link href="/legal/eu-uk" className="text-brand hover:underline">EU and UK Information</Link>{" "}
            page for what to include, and our{" "}
            <Link href="/copyright" className="text-brand hover:underline">Copyright Policy</Link> for
            copyright complaints.
          </p>

          <h3 className="text-base font-semibold text-header-primary">Notice of decisions</h3>
          <p>
            When we act on your content or account, we tell you what we did and why, whether automated
            means were involved, and how to appeal, unless we cannot contact you or the law prevents
            it.
          </p>

          <h3 className="text-base font-semibold text-header-primary">Appeals and complaints</h3>
          <p>
            You can appeal a suspension from the screen you see when you sign in. To appeal any other
            decision, or a decision on something you reported, email legal@disband.dev with the
            subject line “Appeal” within six months of the decision. A person reviews every appeal.
            People in the UK can also make the complaints described on our EU and UK Information page.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">8. Suspension and Termination</h2>
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

          <h2 className="text-lg font-semibold text-header-primary">9. Paid Services</h2>
          <p>Disband may offer paid products, including:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Disband Lite:</strong> currently $2.99 per month;</li>
            <li><strong>Disband Aero:</strong> currently $8.99 per month; and</li>
            <li><strong>Server Catalysts:</strong> one-time purchases applied to a selected space.</li>
          </ul>
          <p>Prices, features, taxes, and availability may change. Applicable taxes may be calculated and collected by Stripe or the relevant app store.</p>

          <h3 className="text-base font-semibold text-header-primary">Subscriptions</h3>
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

          <h3 className="text-base font-semibold text-header-primary">Refunds</h3>
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

          <h3 className="text-base font-semibold text-header-primary">Server Catalysts</h3>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Are one-time purchases;</li>
            <li>Apply only to the selected space;</li>
            <li>Do not automatically renew;</li>
            <li>Are not transferable between spaces; and</li>
            <li>May not have cash value outside the Service.</li>
          </ul>

          <h3 className="text-base font-semibold text-header-primary">Consumers in the EU, the EEA, and the UK</h3>
          <p>
            If you are a consumer in the European Union, the European Economic Area, or the United
            Kingdom, the following applies in addition to the rest of this Section.
          </p>
          <p>
            <strong>Right of withdrawal.</strong> You may withdraw from a purchase made directly from us
            within 14 days without giving any reason. The withdrawal period ends 14 days after the day
            the purchase was made.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Subscriptions.</strong> If you asked us to start your subscription during the
              withdrawal period and then withdraw, we will refund what you paid, minus an amount
              proportionate to the part of the subscription provided before you told us you were
              withdrawing.
            </li>
            <li>
              <strong>Digital content supplied immediately</strong>, such as Server Catalysts. If, when
              you buy, you expressly agree that we begin supplying it immediately and acknowledge that
              you will lose your right of withdrawal, you lose that right once supply begins.
            </li>
          </ul>
          <p>
            To withdraw, tell us clearly before the withdrawal period ends, for example by emailing
            legal@disband.dev. You may use the model withdrawal form below, but you do not have to. We
            will refund you without undue delay, and no later than 14 days after we are told of your
            withdrawal, using the payment method you used, unless you expressly agree otherwise. You
            will not be charged any fees for the refund.
          </p>
          <p>
            For purchases made through Apple or Google, the store’s own withdrawal and refund process
            applies. Contact us if you need help.
          </p>
          <p>
            <strong>Model withdrawal form.</strong> Complete and return this form only if you wish to
            withdraw from the contract.
          </p>
          <div className="space-y-1.5 rounded-lg border border-white/10 p-4 text-[14px]">
            <p>
              To: Genysis IQ LLC, 10524 Moss Park Rd, Suite 204-653, Orlando, Florida 32832, United
              States; legal@disband.dev
            </p>
            <p>
              I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract for the supply
              of the following digital content (*) / for the provision of the following service (*):
            </p>
            <p>Ordered on (*) / received on (*):</p>
            <p>Name of consumer(s):</p>
            <p>Address of consumer(s):</p>
            <p>Signature of consumer(s) (only if this form is notified on paper):</p>
            <p>Date:</p>
            <p>(*) Delete as appropriate.</p>
          </div>
          <p>
            <strong>Faulty digital content and services.</strong> If digital content or a digital
            service we supply is faulty or not as described, you have legal rights, such as having it
            fixed or receiving a price reduction or refund. These Terms do not limit those rights.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">10. Availability and Changes</h2>
          <p>
            The Service is provided on an “as available” basis. We do not guarantee uninterrupted,
            timely, secure, or error-free operation.
          </p>
          <p>
            We may change, suspend, or discontinue features, including paid features, when reasonably
            necessary for legal, technical, business, security, or operational reasons.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">11. Disclaimers</h2>
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

          <h2 className="text-lg font-semibold text-header-primary">12. Limitation of Liability</h2>
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
          <p>
            If you are a consumer in the EU, the EEA, the UK, or Switzerland, nothing in these Terms
            limits or excludes our liability for death or personal injury caused by our negligence, for
            fraud or fraudulent misrepresentation, for gross negligence or intentional misconduct, or
            for anything else that cannot be limited or excluded under the law of the country where you
            live.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">13. Indemnification</h2>
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

          <h2 className="text-lg font-semibold text-header-primary">14. Governing Law and Courts</h2>
          <p>These Terms are governed by the laws of the State of Florida, without regard to conflict-of-law rules.</p>
          <p>
            Any dispute arising from these Terms or the Service must be brought exclusively in the
            state or federal courts located in Orange County, Florida, and you consent to those
            courts’ jurisdiction and venue.
          </p>
          <p>Nothing in this section prevents a consumer from asserting rights that cannot legally be waived.</p>
          <p>
            If you are a consumer living in the EU, the EEA, the UK, or Switzerland, the choice of
            Florida law does not take away the protection of the mandatory laws of the country where
            you live. You may bring proceedings relating to these Terms in the courts of the country
            where you live, as well as in the courts listed above, and we may bring proceedings against
            you only in the courts of the country where you live.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">15. Changes to These Terms</h2>
          <p>
            We may update these Terms. When material changes are made, we may update the “Last
            updated” date and provide notice where reasonably practical.
          </p>
          <p>
            Your continued use of the Service after the effective date of revised Terms means you
            accept them. If you do not agree, stop using the Service and delete your account.
          </p>
          <p>
            If you are a consumer in the EU, the EEA, or the UK, we will give you reasonable notice of
            material changes before they take effect, and you may end your agreement and delete your
            account before then.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">16. General Provisions</h2>
          <p>
            If a court finds part of these Terms unenforceable, the remaining provisions will remain
            in effect.
          </p>
          <p>Our failure to enforce a provision is not a waiver of our right to enforce it later.</p>
          <p>
            These Terms, together with applicable policies and written agreements, constitute the
            agreement between you and Genysis IQ concerning the Service.
          </p>
          <p>
            Your use of the Disband apps is also governed by our{" "}
            <Link href="/eula" className="text-brand hover:underline">End User License Agreement</Link>.
            Our <Link href="/privacy" className="text-brand hover:underline">Privacy Policy</Link>,{" "}
            <Link href="/copyright" className="text-brand hover:underline">Copyright Policy</Link>, and{" "}
            <Link href="/legal/eu-uk" className="text-brand hover:underline">EU and UK Information</Link>{" "}
            page explain how we handle personal data, copyright complaints, and EU and UK legal
            requirements.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">17. Contact</h2>
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
    </LegalShell>
  );
}
