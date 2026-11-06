import Link from "next/link";
import type { Metadata } from "next";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";

export const metadata: Metadata = {
  title: "Copyright Policy",
  description:
    "How to report copyright infringement on Disband, how counter-notices work, and what happens to accounts that repeatedly infringe.",
  alternates: { canonical: "/copyright" },
};

const link = "text-brand hover:underline";

export default function CopyrightPage() {
  return (
    <div className="min-h-screen bg-[#1e1f22] text-[#dbdee1]">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-24">
        <h1 className="text-3xl font-bold text-white">Copyright Policy</h1>
        <p className="mt-2 text-sm text-[#949ba4]">Last updated: November 6, 2026</p>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-[#b5bac1]">
          <p>
            Genysis IQ LLC (“Genysis IQ,” “Disband,” “we,” “us,” or “our”) respects the intellectual
            property of others and expects people who use Disband to do the same. This policy explains
            how to report material on Disband that you believe infringes your copyright, how people
            whose material is removed can respond, and what happens to accounts that infringe
            repeatedly. It forms part of our{" "}
            <Link href="/terms" className={link}>Terms of Service</Link>.
          </p>
          <p>
            We respond to notices that meet the requirements of the U.S. Digital Millennium Copyright
            Act (“DMCA”), 17 U.S.C. § 512. We also accept copyright complaints under the laws of other
            countries, including notices under the EU Digital Services Act, through the same channel.
          </p>

          <h2 className="text-lg font-semibold text-white">1. Before You Send a Notice</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Only the copyright owner, or a person authorized to act on the owner’s behalf, may send a
              notice.
            </li>
            <li>
              Consider whether the use may be permitted, for example under a license, as fair use, or
              under another exception or limitation in the law that applies.
            </li>
            <li>
              A notice is a legal document. Under 17 U.S.C. § 512(f), a person who knowingly and
              materially misrepresents that material is infringing may be liable for damages,
              including costs and attorneys’ fees.
            </li>
            <li>
              This policy covers copyright. For trademark, impersonation, or privacy complaints, see
              Section 7 or use the Report option in the app.
            </li>
          </ul>

          <h2 className="text-lg font-semibold text-white">2. How to Send a Copyright Notice</h2>
          <p>Send your notice to our designated Copyright Agent:</p>
          <p className="whitespace-pre-line">
            Copyright Agent{"\n"}
            Genysis IQ LLC{"\n"}
            10524 Moss Park Rd, Suite 204-653{"\n"}
            Orlando, Florida 32832{"\n"}
            United States{"\n\n"}
            Phone: +1 (321) 351-9810{"\n"}
            Email: legal@disband.dev (subject line: “Copyright Notice”)
          </p>
          <p>Your notice must include:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              A physical or electronic signature of the copyright owner or of a person authorized to act
              on the owner’s behalf;
            </li>
            <li>
              Identification of the copyrighted work you claim has been infringed or, if a single notice
              covers multiple works, a representative list of those works;
            </li>
            <li>
              Identification of the material you claim is infringing and that you want removed or
              disabled, with information reasonably sufficient for us to find it. A link to each
              message, file, profile, or space is best. Otherwise, describe where it appears precisely
              enough for us to locate it, such as the space and channel, the account that posted it,
              and the date;
            </li>
            <li>Your name, postal address, telephone number, and email address;</li>
            <li>
              A statement that you have a good faith belief that use of the material in the manner
              complained of is not authorized by the copyright owner, its agent, or the law; and
            </li>
            <li>
              A statement that the information in the notice is accurate and, under penalty of perjury,
              that you are authorized to act on behalf of the owner of an exclusive right that is
              allegedly infringed.
            </li>
          </ol>
          <p>
            If a notice is missing information we need, we will try to contact you to complete it. We
            may not be able to act on a notice until it is complete.
          </p>

          <h2 className="text-lg font-semibold text-white">3. What Happens After a Notice</h2>
          <p>
            We review each notice and, where appropriate, remove or disable access to the material
            promptly. We will let you know what we decided.
          </p>
          <p>
            Where we can, we tell the person who posted the material that it was removed and why. We
            may give them a copy of the notice, including your name and contact information, so that
            they can respond or send a counter-notice.
          </p>

          <h2 className="text-lg font-semibold text-white">4. Counter-Notices</h2>
          <p>
            If material you posted was removed because of a copyright notice and you believe it was
            removed because of a mistake or misidentification, you may send a counter-notice to our
            Copyright Agent at the address in Section 2. Your counter-notice must include:
          </p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Your physical or electronic signature;</li>
            <li>
              Identification of the material that was removed or disabled and the location where it
              appeared before it was removed or disabled;
            </li>
            <li>
              A statement under penalty of perjury that you have a good faith belief that the material
              was removed or disabled as a result of mistake or misidentification of the material to be
              removed or disabled; and
            </li>
            <li>
              Your name, address, and telephone number, and a statement that you consent to the
              jurisdiction of the U.S. Federal District Court for the judicial district in which your
              address is located or, if your address is outside the United States, for any judicial
              district in which Genysis IQ may be found, and that you will accept service of process
              from the person who sent the original notice or that person’s agent.
            </li>
          </ol>
          <p>
            When we receive a valid counter-notice, we will promptly send a copy to the person who sent
            the original notice and tell them that we will restore the material in 10 business days. We
            will restore the material, or allow you to post it again where it cannot be restored, no
            sooner than 10 and no later than 14 business days after we receive the counter-notice,
            unless our Copyright Agent first receives notice that the complaining party has filed an
            action seeking a court order to restrain you from engaging in infringing activity relating
            to the material.
          </p>
          <p>
            Your counter-notice, including your name and contact information, will be shared with the
            person who sent the original notice. Knowingly and materially misrepresenting that material
            was removed by mistake can make you liable for damages under 17 U.S.C. § 512(f).
          </p>

          <h2 className="text-lg font-semibold text-white">5. Repeat Infringers</h2>
          <p>
            In appropriate circumstances, we disable or terminate the accounts of users who repeatedly
            infringe copyrights or other intellectual property rights.
          </p>
          <p>
            Each time material is removed in response to a valid notice, the account that posted it
            receives a copyright strike, which counts toward that account’s standing. A strike is
            withdrawn if the material is restored after a counter-notice or if the notice is withdrawn.
            Accounts that repeatedly receive copyright strikes will be permanently suspended. We may act
            sooner where infringement is flagrant or an account exists mainly to infringe, and we may
            also remove spaces that are used mainly to share infringing material.
          </p>

          <h2 className="text-lg font-semibold text-white">6. Spaces and Moderators</h2>
          <p>
            Space owners and moderators can remove content in their own spaces, but they cannot act on
            copyright notices for us. Send copyright notices to our Copyright Agent as described in
            Section 2.
          </p>

          <h2 className="text-lg font-semibold text-white">7. Trademarks and Other Rights</h2>
          <p>
            To report a trademark infringement, email legal@disband.dev with your name and contact
            details, the trademark and its registration details, where it is used on Disband, and why
            the use is likely to cause confusion. We review trademark, impersonation, and other
            intellectual property complaints under our Terms of Service and applicable law.
          </p>

          <h2 className="text-lg font-semibold text-white">8. Notices From Outside the United States</h2>
          <p>
            You can send copyright and other intellectual property complaints under the laws of any
            country to the address in Section 2, and we will assess them under the law that applies. A
            notice that includes the information listed in Section 2 will usually give us what we need.
            People in the European Union and the United Kingdom can find more about reporting illegal
            content on our{" "}
            <Link href="/legal/eu-uk" className={link}>EU and UK Information</Link> page.
          </p>

          <h2 className="text-lg font-semibold text-white">9. Disband’s Own Materials</h2>
          <p>
            Disband’s software, designs, artwork, and other original materials are protected by
            copyright and other laws and are owned by or licensed to Genysis IQ LLC. See our{" "}
            <Link href="/legal" className={link}>Legal Information</Link> page and{" "}
            <Link href="/eula" className={link}>End User License Agreement</Link>.
          </p>

          <h2 className="text-lg font-semibold text-white">10. Changes to This Policy</h2>
          <p>
            We may update this policy from time to time. When we do, we will update the “Last updated”
            date above.
          </p>
        </div>

        <Link href="/legal" className="mt-10 inline-block text-sm text-brand hover:underline">
          ← All legal documents
        </Link>
      </main>
      <MarketingFooter />
    </div>
  );
}
