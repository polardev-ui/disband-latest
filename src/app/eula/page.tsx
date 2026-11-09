import Link from "next/link";
import type { Metadata } from "next";
import { LegalShell } from "@/components/marketing/LegalShell";

export const metadata: Metadata = {
  title: "End User License Agreement",
  description:
    "The license for the Disband apps on desktop, iOS, Android, and the web: what you may do with the software, and what you may not.",
  alternates: { canonical: "/eula" },
};

const link = "text-brand hover:underline";

export default function EulaPage() {
  return (
    <LegalShell title="End User License Agreement" updated="November 6, 2026" path="/eula">

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-interactive-normal">
          <p>
            This End User License Agreement (“EULA”) is a legal agreement between you and{" "}
            <strong>Genysis IQ LLC</strong> (“Genysis IQ,” “Disband,” “we,” “us,” or “our”). It covers
            the Disband apps: our desktop apps for Windows, macOS, and Linux, our iOS and Android apps,
            the Disband web app, and any updates, add-ons, and documentation we provide for them
            (together, the “App”).
          </p>
          <p>
            By downloading, installing, or using the App, you agree to this EULA. If you do not agree,
            do not download, install, or use the App, and delete any copy you have.
          </p>
          <p>
            The App is how you use the Disband service (the “Service”). Your account, your content,
            your conduct, and paid services are governed by our{" "}
            <Link href="/terms" className={link}>Terms of Service</Link> and{" "}
            <Link href="/privacy" className={link}>Privacy Policy</Link>, which form part of this EULA.
            This EULA covers the software itself. If this EULA and the Terms of Service conflict about
            the App, this EULA controls.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">1. License</h2>
          <p>
            Subject to this EULA and the Terms of Service, we grant you a limited, personal,
            non-exclusive, non-transferable, non-sublicensable, revocable license to download, install,
            and use the App on devices you own or control, solely to access and use the Service.
          </p>
          <p>
            If you got the App from an app store, you may use it only as that store’s rules allow (see
            Section 12).
          </p>
          <p>
            You must meet the age requirements in Section 2 of the Terms of Service. If you are under
            18, or under the age of majority where you live, please review this EULA with a parent or
            legal guardian.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">2. Ownership</h2>
          <p>
            The App is licensed, not sold. Genysis IQ and its licensors own the App and all
            intellectual-property rights in it, including its code, design, artwork, and the Disband
            name and logos. We reserve all rights not expressly granted to you in this EULA.
          </p>
          <p>Content you create remains yours, as described in the Terms of Service.</p>
          <p>
            If you send us ideas or feedback about the App, we may use them without restriction or
            payment to you.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">3. Restrictions</h2>
          <p>Except where applicable law expressly allows it despite this restriction, you may not:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Copy, modify, translate, or create derivative works of the App;</li>
            <li>Reverse engineer, decompile, disassemble, or otherwise attempt to derive the App’s source code;</li>
            <li>
              Sell, rent, lease, lend, sublicense, distribute, or publish the App, or make it available
              outside our official download channels;
            </li>
            <li>Remove, alter, or obscure copyright, trademark, or other notices in the App;</li>
            <li>Bypass, disable, or interfere with security features, access controls, rate limits, or usage limits;</li>
            <li>
              Tamper with the App or its network traffic to give yourself roles, permissions, features,
              items, or privileges you have not been granted;
            </li>
            <li>Use a modified or unofficial version of the App, or a third-party client, to access the Service;</li>
            <li>
              Automate the App with scripts, bots, or scrapers, except through the bot and developer
              features we provide, under their own terms;
            </li>
            <li>
              Create accounts, sessions, or requests in bulk, or use the App in a way that overloads or
              degrades the Service;
            </li>
            <li>Use the App to break the law or the Terms of Service; or</li>
            <li>Help or encourage anyone else to do any of these things.</li>
          </ul>
          <p>
            Good-faith security research is welcome when it follows the rules for bug and security
            reports in Section 4 of the Terms of Service.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">4. Source Code and Developer Libraries</h2>
          <p>
            Some of Disband’s source code is publicly viewable. Viewing it does not give you a license
            to copy, modify, redistribute, or deploy it, apart from any rights that come with a specific
            file or package, or that the platform hosting the code grants under its own terms.
          </p>
          <p>
            Developer libraries we publish under an open-source license, such as the Disband bot
            libraries for JavaScript and Python, are governed by that license instead of this EULA.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">5. Third-Party Software and Services</h2>
          <p>
            The App includes third-party and open-source components, such as fonts, icons, and software
            libraries, that are licensed under their own terms. Those terms apply to those components,
            and nothing in this EULA limits the rights they give you.
          </p>
          <p>
            The App connects to services run by other companies, including hosting, payment, and app
            store providers. Their terms and privacy policies apply to your use of their services, and
            we are not responsible for them.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">6. Updates</h2>
          <p>
            The App may download and install updates automatically, through an app store or the desktop
            updater. Some updates may be required to keep using the Service, and older versions may stop
            working. Updates may add, change, or remove features. This EULA applies to every update
            unless the update comes with different terms.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">7. Device Permissions and Data</h2>
          <p>
            Some features need access to parts of your device, such as the microphone and camera for
            calls, screen capture for screen sharing, notifications, and files or photos for uploads.
            The App asks before using them where your device requires it. You can withdraw access in
            your device settings, though related features may then stop working.
          </p>
          <p>
            On desktop, the App checks which programs are running so it can recognize games, and it can
            receive status updates from games that support Rich Presence. The list of running programs
            stays on your device, and your activity settings control what is shared.
          </p>
          <p>
            We handle information from the App as described in our{" "}
            <Link href="/privacy" className={link}>Privacy Policy</Link>.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">8. Purchases and Digital Items</h2>
          <p>
            Subscriptions and other purchases made in or for the App are governed by Section 9 of the
            Terms of Service and, for app store purchases, by the store’s rules.
          </p>
          <p>
            Digital items you get through the App, such as avatar decorations, profile skins, and name
            effects, are licensed to you, not sold. They are tied to your account, have no cash value,
            and cannot be sold, traded, or transferred except through features we provide for that
            purpose. We may change or retire digital items. Except where required by law, we do not
            provide refunds or credit when an item is changed or retired, or when it becomes
            unavailable because your account is suspended or terminated under the Terms of Service.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">9. Term and Termination</h2>
          <p>
            This EULA applies from the time you first download, install, or use the App until it is
            terminated.
          </p>
          <p>
            You may end it at any time by deleting the App from your devices. Deleting the App does not
            delete your Disband account; the Terms of Service explain how to do that.
          </p>
          <p>
            Your license ends automatically if you break this EULA, and we may suspend or end it, along
            with your access to the Service, as described in the Terms of Service. When it ends, you
            must stop using the App and delete it.
          </p>
          <p>Sections 2, 8, 10, 11, 12, 13, 15, and 17 continue to apply after this EULA ends.</p>

          <h2 className="text-lg font-semibold text-header-primary">10. Disclaimer of Warranties</h2>
          <p>
            To the maximum extent permitted by law, the App is provided “as is” and “as available,”
            with all faults and without warranties of any kind, as described in Section 11 of the Terms
            of Service. We do not promise that the App will be uninterrupted, error-free, secure,
            compatible with your device, or free of harmful components, or that defects will be
            corrected.
          </p>
          <p>Nothing in this EULA excludes a warranty or consumer right that cannot legally be excluded.</p>

          <h2 className="text-lg font-semibold text-header-primary">11. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, the limits on liability in Section 12 of the Terms of
            Service apply to the App and to this EULA. Those limits do not apply where liability cannot
            legally be limited.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">12. App Stores</h2>
          <h3 className="text-base font-semibold text-header-primary">Apple App Store</h3>
          <p>
            If you downloaded the App from Apple’s App Store, the following terms also apply. If they
            conflict with the rest of this EULA, they control.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Parties.</strong> This EULA is between you and Genysis IQ only, not Apple Inc.
              (“Apple”). Genysis IQ, not Apple, is solely responsible for the App and its content.
            </li>
            <li>
              <strong>Scope of license.</strong> Your license is limited to using the App on
              Apple-branded products that you own or control, as permitted by the Usage Rules in the
              Apple Media Services Terms and Conditions, except that other accounts associated with you
              through Family Sharing or volume purchasing may also access and use the App.
            </li>
            <li>
              <strong>Maintenance and support.</strong> Genysis IQ is solely responsible for any
              maintenance and support for the App, as described in this EULA or required by law. Apple
              has no obligation to provide maintenance or support for the App.
            </li>
            <li>
              <strong>Warranty.</strong> If the App fails to conform to any warranty that applies to it,
              you may notify Apple, and Apple will refund the purchase price you paid for the App, if
              any. To the maximum extent permitted by law, Apple has no other warranty obligation for the
              App. Any other claims, losses, liabilities, damages, costs, or expenses caused by a failure
              to conform to a warranty are Genysis IQ’s responsibility, to the extent they are not
              disclaimed in this EULA.
            </li>
            <li>
              <strong>Product claims.</strong> Genysis IQ, not Apple, is responsible for addressing any
              claims by you or a third party relating to the App or your possession and use of it,
              including (i) product liability claims; (ii) claims that the App fails to meet an
              applicable legal or regulatory requirement; and (iii) claims arising under consumer
              protection, privacy, or similar laws.
            </li>
            <li>
              <strong>Intellectual property.</strong> If a third party claims that the App, or your
              possession and use of it, infringes that third party’s intellectual-property rights,
              Genysis IQ, not Apple, is solely responsible for investigating, defending, settling, and
              discharging that claim.
            </li>
            <li>
              <strong>Legal compliance.</strong> You represent and warrant that you are not located in a
              country subject to a U.S. Government embargo or designated by the U.S. Government as a
              “terrorist supporting” country, and that you are not on any U.S. Government list of
              prohibited or restricted parties.
            </li>
            <li>
              <strong>Contact.</strong> Send questions, complaints, or claims about the App to Genysis IQ
              at the address in Section 18.
            </li>
            <li>
              <strong>Third-party terms.</strong> When using the App, you must comply with any
              third-party terms that apply, such as your wireless carrier’s or internet provider’s
              terms.
            </li>
            <li>
              <strong>Third-party beneficiary.</strong> Apple and Apple’s subsidiaries are third-party
              beneficiaries of this EULA. Once you accept this EULA, Apple will have the right, and will
              be deemed to have accepted the right, to enforce it against you as a third-party
              beneficiary.
            </li>
          </ul>

          <h3 className="text-base font-semibold text-header-primary">Google Play and other stores</h3>
          <p>
            If you downloaded the App from Google Play, Google Play’s terms and policies also apply to
            your download and any purchases. Google is not a party to this EULA and is not responsible
            for the App. The same applies to any other store you get the App from.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">13. Export Controls and Sanctions</h2>
          <p>
            You may not use, export, or re-export the App in violation of U.S. export control or
            sanctions laws, or any other laws that apply. You represent that you are not located in a
            country subject to comprehensive U.S. sanctions and that you are not on any U.S. Government
            list of prohibited or restricted parties.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">14. U.S. Government End Users</h2>
          <p>
            The App is “commercial computer software” and “commercial computer software documentation”
            as those terms are used in the Federal Acquisition Regulation and the Defense Federal
            Acquisition Regulation Supplement. U.S. Government end users receive only the rights granted
            to all other users under this EULA.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">15. Governing Law and Courts</h2>
          <p>
            This EULA is governed by the laws of the State of Florida, without regard to conflict-of-law
            rules. Disputes about this EULA or the App must be brought as described in Section 14 of the
            Terms of Service.
          </p>
          <p>Nothing in this section prevents a consumer from asserting rights that cannot legally be waived.</p>

          <h2 className="text-lg font-semibold text-header-primary">16. Changes to This EULA</h2>
          <p>
            We may update this EULA. When we make material changes, we will update the “Last updated”
            date and give notice where reasonably practical.
          </p>
          <p>
            If you keep using the App after an updated EULA takes effect, you accept it. If you do not
            agree, stop using the App and delete it.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">17. General Provisions</h2>
          <p>
            This EULA, the Terms of Service, and the Privacy Policy are the entire agreement between you
            and Genysis IQ about the App.
          </p>
          <p>If a court finds part of this EULA unenforceable, the remaining provisions will remain in effect.</p>
          <p>Our failure to enforce a provision is not a waiver of our right to enforce it later.</p>
          <p>
            You may not transfer this EULA or your rights under it without our written consent. We may
            transfer it, for example as part of a merger, acquisition, or sale of assets.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">18. Contact</h2>
          <p>Genysis IQ LLC</p>
          <p>10524 Moss Park Rd, Suite 204-653</p>
          <p>Orlando, Florida 32832</p>
          <p>United States</p>
          <p>Legal: legal@disband.dev</p>
        </div>

        <Link href="/home" className="mt-10 inline-block text-sm text-brand hover:underline">
          ← Back to home
        </Link>
    </LegalShell>
  );
}
