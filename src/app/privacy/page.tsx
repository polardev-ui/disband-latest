import Link from "next/link";
import type { Metadata } from "next";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Disband handles your data — what we store, what we never sell, and the choices you have over your messages and profile.",
  alternates: { canonical: "/privacy" },
};

const link = "text-brand hover:underline";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#1e1f22] text-[#dbdee1]">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-24">
        <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-[#949ba4]">Last updated: November 6, 2026</p>

        <div className="prose-disband mt-8 space-y-6 text-[15px] leading-relaxed text-[#b5bac1]">
          <p>
            Genysis IQ LLC (“Genysis IQ,” “Disband,” “we,” “us,” or “our”) operates Disband, including
            its websites, applications, spaces, messaging, voice and video features, and related
            services (collectively, the “Service”).
          </p>
          <p>
            This Privacy Policy explains what information we collect, how we use it, when we share it,
            and the choices available to you. For the purposes of the EU General Data Protection
            Regulation and the UK General Data Protection Regulation (together, the “GDPR”), Genysis IQ
            LLC is the controller of the personal data described in this Policy. Our contact details
            are in Section 13.
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
            Your date of birth is required during registration so we can check that you meet the
            minimum age. It is self-declared and is not shown publicly. We do not currently require
            government identification or other identity verification.
          </p>
          <p>We do not receive or store your plaintext password.</p>

          <h3 className="text-base font-semibold text-white">B. Content you provide</h3>
          <p>We collect and store content you submit through the Service, including:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Messages;</li>
            <li>Images, files, and other media;</li>
            <li>Space and channel content;</li>
            <li>Profile information;</li>
            <li>Moderation reports and appeals;</li>
            <li>Bug reports;</li>
            <li>Support messages; and</li>
            <li>Other content you voluntarily provide.</li>
          </ul>
          <p>
            Messages and media on Disband are <strong>not end-to-end encrypted</strong>. They are
            stored in server-readable form, are checked by our automated safety systems (see Section
            3), and may be accessed by authorized Disband personnel for moderation, abuse
            investigations, account recovery, security, and operation of the Service.
          </p>
          <p>
            Do not use Disband to transmit information that requires end-to-end encryption or a legally
            protected confidential communications system.
          </p>

          <h3 className="text-base font-semibold text-white">C. Technical, device, and security information</h3>
          <p>We collect:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Sign-in session records, including the IP address and the browser or device description
              (user agent) used to sign in, and when each session was created and last used;
            </li>
            <li>Hashed IP addresses used for signup-abuse prevention;</li>
            <li>Temporary rate-limit counters;</li>
            <li>
              Push notification tokens for the devices where you allow notifications, with the device
              platform and app version;
            </li>
            <li>Timestamps;</li>
            <li>Message and media size;</li>
            <li>Space membership and participation information;</li>
            <li>Account and session information; and</li>
            <li>Information required to maintain security and prevent abuse.</li>
          </ul>
          <p>
            Hashed IP addresses used for signup blocking are not intended to be stored permanently.
            Service providers may independently create or retain technical logs, including raw IP
            addresses, under their own policies.
          </p>
          <p>We do not collect or store:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Precise location;</li>
            <li>Advertising identifiers;</li>
            <li>Your contacts or address book;</li>
            <li>Data from third-party analytics or advertising tools, because we do not use them; or</li>
            <li>Crash reports through a dedicated crash-monitoring service.</li>
          </ul>

          <h3 className="text-base font-semibold text-white">D. Activity and connected services</h3>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Presence.</strong> We process whether you are online, idle, or in a call so we can
              show your status to other people, subject to your settings.
            </li>
            <li>
              <strong>Games on desktop.</strong> The desktop app checks which programs are running on
              your computer about every 15 seconds to recognize games, and it can receive status
              updates from games that support Rich Presence. The list of running programs stays on your
              device. Your activity settings control whether the game you are playing and its status
              are shared.
            </li>
            <li>
              <strong>Music.</strong> If you connect Spotify or Last.fm, we receive what you are
              listening to so we can show it on your profile, along with the details needed to keep the
              connection working.
            </li>
            <li>
              <strong>Connected accounts.</strong> If you connect a Discord account, or verify a
              creator account on YouTube, TikTok, or Twitch, we receive information from that service,
              such as your account ID and name and, for creator verification, public statistics such as
              follower or subscriber counts. We use it to show the connection and to check eligibility.
            </li>
          </ul>
          <p>You can disconnect these services or change your activity settings at any time.</p>

          <h3 className="text-base font-semibold text-white">E. Voice and video information</h3>
          <p>
            Voice and video calls use WebRTC transport encryption, including DTLS-SRTP. One-to-one
            calls connect directly between devices where possible, or through relay (TURN) servers
            operated by Cloudflare. Group calls and voice channels are routed through Cloudflare
            Realtime media servers. Calls are encrypted in transit, but they are not end-to-end
            encrypted.
          </p>
          <p>We do not record voice or video calls.</p>
          <p>Call signaling and certain call metadata pass through Disband servers. We may process information such as:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Call participants;</li>
            <li>Connection and signaling information;</li>
            <li>Call timing;</li>
            <li>Session identifiers; and</li>
            <li>Technical information needed to establish and maintain the call.</li>
          </ul>

          <h3 className="text-base font-semibold text-white">F. Payment information</h3>
          <p>Paid services may be purchased through Stripe, Apple, or Google.</p>
          <p>
            If you make a donation on our donate page, we keep a record of the amount, the time, any
            message you add, and your account if you were logged in. The amount, the time and your
            message appear publicly on the donor wall. Your display name and avatar appear only if
            you choose to show them; otherwise the donation is listed as anonymous. If you show your
            name, your profile also gets a Donor badge showing the total of those donations, which you
            can hide in your settings. Anonymous donations are not counted toward the badge. If you delete your
            account, your donations stay in our payment records but are shown as anonymous.
          </p>
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

          <h3 className="text-base font-semibold text-white">G. Information from other people</h3>
          <p>
            Other people may give us information about you, for example when they mention you, add you
            to a group chat, or report your content. Space owners and moderators may record moderation
            actions that involve you.
          </p>

          <h2 className="text-lg font-semibold text-white">2. How We Use Information</h2>
          <p>We use information to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Create and manage accounts;</li>
            <li>Authenticate users;</li>
            <li>Deliver messages, media, spaces, notifications, and calls;</li>
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
          <p>
            We do not use message content for advertising, and we do not share personal information for
            targeted advertising.
          </p>

          <h3 className="text-base font-semibold text-white">Legal bases (EEA, UK, and Switzerland)</h3>
          <p>Where the GDPR or similar laws apply, we rely on these legal bases:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Performance of our contract with you</strong>: to create your account, provide
              messaging, spaces, calls, notifications, purchases, and support, and to check that you
              meet the minimum age.
            </li>
            <li>
              <strong>Our legitimate interests</strong>: to keep Disband and its users safe and secure,
              including automated scanning, moderation, and investigating reports; to prevent spam,
              fraud, and ban evasion; to fix and improve the Service; to establish, exercise, or defend
              legal claims; and to meet legal obligations under laws outside the EEA and the UK, such as
              U.S. reporting duties. You can object to processing based on legitimate interests (see
              Section 8).
            </li>
            <li>
              <strong>Legal obligations</strong>: to keep tax and accounting records, respond to lawful
              requests, and meet other obligations under applicable law.
            </li>
            <li>
              <strong>Consent</strong>: for optional features you choose to turn on, such as connected
              accounts, music and game activity sharing, and push notifications on your device. You
              can withdraw consent at any time by disconnecting the service or changing your settings.
              This does not affect processing that happened before.
            </li>
            <li>
              <strong>Vital interests</strong>: to protect someone’s life or physical safety in an
              emergency.
            </li>
          </ul>
          <p>
            Your email address, username, password, and date of birth are required to create an
            account. Without them we cannot provide the Service. We do not ask for sensitive
            information such as health or religious beliefs. If you choose to share it on Disband, we
            process it only to provide the Service as you direct and to keep the Service safe.
          </p>

          <h2 className="text-lg font-semibold text-white">3. Moderation, Automated Decisions, and AI</h2>

          <h3 className="text-base font-semibold text-white">Access by Disband personnel</h3>
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

          <h3 className="text-base font-semibold text-white">Automated safety systems</h3>
          <p>We use automated systems to find content that breaks our Terms or the law. They check:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Images and other media when they are uploaded, including media sent in direct messages
              and group chats;
            </li>
            <li>Profiles, spaces, channels, and messages, on a regular schedule; and</li>
            <li>Content that people report.</li>
          </ul>
          <p>
            These systems compare media with digital fingerprints (hashes) of known prohibited media,
            use automated image classification provided by Hive, and use AI language models provided
            by DeepSeek, including Tether, our AI reviewer, which reviews flagged and reported content.
          </p>
          <p>
            When these systems find a likely violation, they can remove content, add a strike to an
            account, limit features, or hold or suspend an account without a person reviewing the
            decision first. Tether also decides on reports. Decisions are based on what the content
            shows or says compared with our rules, and an account’s history, such as earlier strikes,
            affects how serious the consequence is. These decisions can significantly affect you, for
            example by limiting your access to the Service.
          </p>
          <p>
            You can ask for a person to review any automated decision, give your point of view, and
            contest the decision. To appeal a suspension, use the screen you see when you sign in. For
            any other decision, email legal@disband.dev. See our{" "}
            <Link href="/legal/eu-uk" className={link}>EU and UK Information</Link> page for details.
          </p>

          <h3 className="text-base font-semibold text-white">Tether, our AI assistant</h3>
          <p>
            Tether is an AI assistant. When someone writes @tether in a channel, direct message, or
            group chat, or messages Tether directly, the recent messages in that conversation,
            including images and messages written by other participants, are sent to DeepSeek so
            Tether can reply. Support requests may also be answered by Tether. Tether’s replies are
            generated by AI and may be inaccurate.
          </p>
          <p>Disband does not train AI models on your content.</p>

          <h3 className="text-base font-semibold text-white">Child safety</h3>
          <p>
            If we find apparent child sexual exploitation material, we remove it, preserve it as the
            law requires, and report it to the U.S. National Center for Missing &amp; Exploited
            Children (NCMEC), which may share reports with law enforcement around the world.
          </p>

          <h2 className="text-lg font-semibold text-white">4. Cookies and Similar Technologies</h2>
          <p>Disband uses essential cookies and similar technologies for purposes such as:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Authentication;</li>
            <li>Maintaining sessions;</li>
            <li>Security; and</li>
            <li>Remembering necessary account settings.</li>
          </ul>
          <p>
            We also store settings on your device using local storage. Stripe sets cookies on checkout
            pages to prevent fraud. At sign-up, Cloudflare Turnstile checks that you are a person and
            may process information about your browser and device to do so.
          </p>
          <p>
            These technologies are strictly necessary for the features you use. We do not use
            advertising cookies or third-party analytics cookies.
          </p>
          <p>Disabling essential cookies may prevent portions of the Service from functioning.</p>

          <h2 className="text-lg font-semibold text-white">5. How We Share Information</h2>

          <h3 className="text-base font-semibold text-white">Other people on Disband</h3>
          <p>
            Your profile is visible to other users. Messages and media go to the people, group chats,
            spaces, and channels you send them to. Your status and activity are shown according to
            your settings.
          </p>

          <h3 className="text-base font-semibold text-white">Service providers</h3>
          <p>We use independent providers to operate Disband, including:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Supabase</strong> — PostgreSQL database, authentication, and storage;</li>
            <li><strong>Vercel</strong> — web hosting;</li>
            <li>
              <strong>Cloudflare</strong> — network and content delivery, storage and delivery of
              uploaded media, call relays and group-call media servers, and bot protection at sign-up;
            </li>
            <li><strong>Stripe</strong> — web payment processing;</li>
            <li><strong>Resend</strong> — email delivery;</li>
            <li>
              <strong>Apple</strong> — App Store distribution and related purchases, and push
              notifications on Apple devices;
            </li>
            <li>
              <strong>Google</strong> — Google Play distribution and related purchases, push
              notifications on Android through Firebase Cloud Messaging, and YouTube account
              verification;
            </li>
            <li><strong>Hive</strong> — automated image moderation;</li>
            <li>
              <strong>DeepSeek</strong> — AI models used for content moderation and the Tether
              assistant;
            </li>
            <li>
              <strong>GIPHY</strong> — GIF search and GIF delivery. GIFs load from GIPHY’s servers.
            </li>
          </ul>
          <p>
            These providers may process information on our behalf or independently under their own
            policies and contractual obligations. Supabase, Vercel, Cloudflare, Stripe, Resend, and
            Hive process personal data for us under data processing agreements that limit how they
            may use it and require them to keep it secure. DeepSeek does not offer a data processing
            agreement, so we only send it what is needed for moderation and Tether, and we are
            working to replace it with a provider that does.
          </p>

          <h3 className="text-base font-semibold text-white">Services you connect</h3>
          <p>
            When you connect Discord, Spotify, Last.fm, YouTube, TikTok, or Twitch, that service
            handles the connection under its own terms and privacy policy.
          </p>

          <h3 className="text-base font-semibold text-white">Bots</h3>
          <p>
            Spaces can add bots, including bots built by other developers. A bot can access the
            messages, members, and other information that its permissions allow in that space. Its
            developer handles that information under their own terms and privacy practices, not this
            Policy.
          </p>

          <h3 className="text-base font-semibold text-white">Legal, safety, and business transfers</h3>
          <p>We may also disclose information when reasonably necessary to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Comply with a subpoena, court order, or other valid legal process;</li>
            <li>Report apparent child sexual exploitation to NCMEC;</li>
            <li>Protect users, the public, or Genysis IQ;</li>
            <li>Investigate fraud, abuse, or security incidents;</li>
            <li>Enforce our agreements;</li>
            <li>Complete a merger, acquisition, financing, restructuring, or sale of assets; or</li>
            <li>Prevent harm or illegal activity.</li>
          </ul>
          <p>We do not sell, rent, or trade personal information to data brokers or advertising companies.</p>

          <h2 className="text-lg font-semibold text-white">6. International Transfers</h2>
          <p>
            Genysis IQ is based in the United States, and our main database is hosted in the United
            States. Our providers also process information in other countries, and DeepSeek may
            process information in China. These countries may not have data protection laws
            equivalent to those where you live.
          </p>
          <p>
            When we transfer personal data from the EEA, the UK, or Switzerland to a country without an
            adequacy decision, we use appropriate safeguards, such as the European Commission’s
            Standard Contractual Clauses (with the UK Addendum where relevant), which are built into
            our data processing agreements with our main providers, or rely on the EU–U.S. Data
            Privacy Framework where a provider is certified under it. You can ask for more
            information about these safeguards at privacy@disband.dev.
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
          <p>In particular:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>We keep account information for as long as your account exists.</li>
            <li>
              Deleting your account schedules it for removal 14 days later. You can cancel by signing
              back in within the first 24 hours.
            </li>
            <li>
              We keep moderation records, such as strikes, reports, and appeals, for as long as needed
              to enforce our rules and prevent ban evasion, even after a strike expires.
            </li>
            <li>
              We keep purchase records for as long as tax and accounting laws require, which is
              usually up to seven years.
            </li>
            <li>
              We preserve material reported to NCMEC for at least one year, as U.S. law requires.
            </li>
            <li>Backups are overwritten on a rolling schedule.</li>
          </ul>
          <p>
            When your account is removed, we will delete or de-identify account information from active
            systems within a reasonable period, subject to technical limitations and legal, security,
            fraud-prevention, backup, and dispute-resolution requirements.
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
          <p>
            You can download a copy of your account data and delete your account in{" "}
            <strong>Settings → My Account</strong>. You can update most account and profile information
            in Settings.
          </p>
          <p>Depending on where you live, you may also have the right to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Access the personal information we hold about you;</li>
            <li>Correct inaccurate information;</li>
            <li>Delete personal information;</li>
            <li>Receive certain information in a portable format and have it sent to another service;</li>
            <li>Restrict certain processing;</li>
            <li>Object to processing based on our legitimate interests;</li>
            <li>Withdraw consent at any time, where we rely on consent; and</li>
            <li>
              Not be subject to a decision based solely on automated processing that significantly
              affects you, and ask for a person to review it (see Section 3).
            </li>
          </ul>
          <p>
            To make a request, contact <strong>privacy@disband.dev</strong>. We may need to verify your
            identity before completing a request. We respond within one month, or within three months
            for complex requests, in which case we will tell you within the first month.
          </p>
          <p>
            We may deny or limit a request where permitted by law, including when responding would
            compromise security, expose another person’s information, or interfere with fraud prevention
            or legal obligations.
          </p>
          <p>
            If you are in the EEA, you can complain to the data protection authority in the country
            where you live or work, or where you believe an infringement took place. In the UK, you can
            complain to the Information Commissioner’s Office (ico.org.uk). In Switzerland, you can
            complain to the Federal Data Protection and Information Commissioner. We would appreciate
            the chance to address your concern first.
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
          <p>We do not sell the personal information of users under 18 or use it for advertising.</p>
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
            when changes are made. If we make material changes, we will tell you in the Service or by
            email before they take effect where reasonably practical.
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
