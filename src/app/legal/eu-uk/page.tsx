import Link from "next/link";
import type { Metadata } from "next";
import { LegalShell } from "@/components/marketing/LegalShell";

export const metadata: Metadata = {
  title: "EU and UK Information",
  description:
    "Points of contact, reporting illegal content, appeals, and complaints for people in the European Union and the United Kingdom, under the Digital Services Act and the Online Safety Act.",
  alternates: { canonical: "/legal/eu-uk" },
};

const link = "text-brand hover:underline";

export default function EuUkPage() {
  return (
    <LegalShell title="EU and UK Information" updated="November 6, 2026" path="/legal/eu-uk">

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-interactive-normal">
          <p>
            This page sets out information we make available under the EU Digital Services Act
            (Regulation (EU) 2022/2065, the “DSA”) and the UK Online Safety Act 2023. It supplements
            our <Link href="/terms" className={link}>Terms of Service</Link>,{" "}
            <Link href="/privacy" className={link}>Privacy Policy</Link>, and{" "}
            <Link href="/copyright" className={link}>Copyright Policy</Link>.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">1. Who We Are</h2>
          <p>
            Disband is provided by Genysis IQ LLC, a Florida limited liability company established in
            the United States, at 10524 Moss Park Rd, Suite 204-653, Orlando, Florida 32832, United
            States.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">2. Points of Contact</h2>
          <p>
            <strong>For authorities.</strong> Authorities of EU Member States, the European Commission,
            and the European Board for Digital Services can contact us at{" "}
            <strong>legal@disband.dev</strong> (DSA Article 11).
          </p>
          <p>
            <strong>For users.</strong> People who use Disband can contact us at the same address (DSA
            Article 12). This point of contact is handled by people, not only by automated tools.
          </p>
          <p>We accept communications in English.</p>

          <h2 className="text-lg font-semibold text-header-primary">3. Reporting Illegal Content</h2>
          <p>
            Anyone can tell us about content on Disband that they believe is illegal, whether or not
            they have an account.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>In the app:</strong> use Report on the message, profile, or space and choose the
              reason that fits best.
            </li>
            <li>
              <strong>By email:</strong> send a notice to legal@disband.dev.
            </li>
          </ul>
          <p>A notice sent by email should include:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              A sufficiently substantiated explanation of why you believe the content is illegal,
              including, if you can, the law it breaks;
            </li>
            <li>
              The exact location of the content, such as a link to the message, profile, or space, and
              any further detail needed to find it;
            </li>
            <li>
              Your name and email address. These are not required if your notice concerns child sexual
              abuse or exploitation; and
            </li>
            <li>
              A statement confirming your good faith belief that the information and allegations in the
              notice are accurate and complete.
            </li>
          </ol>
          <p>
            Copyright complaints can be sent the same way. Our{" "}
            <Link href="/copyright" className={link}>Copyright Policy</Link> lists what they should
            include.
          </p>
          <p>
            If you give us your contact details, we will confirm that we received your notice and tell
            you what we decided and how you can challenge the decision. We assess notices in a timely,
            diligent, non-arbitrary, and objective manner.
          </p>
          <p>
            Reports are first assessed by our automated systems, including Tether, our AI reviewer,
            which can decide on a report without a person reviewing it. If automated means were used,
            our decision will say so. You can ask for a person to review any decision on your report
            (see Section 6).
          </p>

          <h2 className="text-lg font-semibold text-header-primary">4. How We Moderate</h2>
          <p>
            Our rules are in Section 4 of our Terms of Service. Section 7 explains how we enforce them,
            including:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              The automated tools we use: matching uploads against fingerprints of known prohibited
              media, automated image classification, and review by AI language models;
            </li>
            <li>
              When those tools run: when media is uploaded, on a regular schedule, and when content is
              reported;
            </li>
            <li>
              The actions we take, such as removing content, adding a strike, limiting features, and
              suspending accounts; and
            </li>
            <li>How you can appeal, and when a person reviews a decision.</li>
          </ul>

          <h2 className="text-lg font-semibold text-header-primary">5. What We Tell You When We Act</h2>
          <p>
            If we remove or restrict your content or limit or suspend your account, we tell you, unless
            we do not have a way to contact you or the law prevents it. We explain:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>What we did and, where it applies, for how long;</li>
            <li>
              The facts and circumstances we relied on, including whether we acted on a report or on our
              own initiative;
            </li>
            <li>
              Whether automated means were used to detect the content or to make the decision;
            </li>
            <li>The rule in our Terms, or the law, that we decided the content broke; and</li>
            <li>How you can challenge the decision.</li>
          </ul>
          <p>
            Your strikes and any active limits, with their reasons, end dates, and whether they were
            found by our automated systems or issued by staff, are shown in{" "}
            <strong>Settings → Account Standing</strong>.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">6. Appeals and Complaints</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Suspended accounts:</strong> appeal from the screen you see when you sign in.
            </li>
            <li>
              <strong>Any other decision</strong>, including removed content, strikes, feature limits,
              or our decision on something you reported: email legal@disband.dev with the subject line
              “Appeal” within six months of the decision. Tell us which decision you are appealing and
              why you think it is wrong.
            </li>
          </ul>
          <p>
            A person reviews every appeal. Appeals are not decided by automated means alone. If we
            find that our decision was wrong, we reverse it without undue delay, restoring content or
            access where we can and removing any related strike.
          </p>
          <p>
            You may also go to court. If you are in the EU, you can lodge a complaint with the Digital
            Services Coordinator of the Member State where you live or are established.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">7. Threats to Life or Safety</h2>
          <p>
            If we become aware of information that gives rise to a suspicion that a criminal offense
            involving a threat to the life or safety of a person has taken place, is taking place, or
            is likely to take place, we promptly inform the relevant law enforcement or judicial
            authorities. We report apparent child sexual exploitation to the U.S. National Center for
            Missing &amp; Exploited Children (NCMEC), which may share reports with law enforcement in
            other countries.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">8. Platform Size</h2>
          <p>
            Disband has far fewer than 45 million average monthly active recipients in the EU and is
            not a very large online platform under the DSA.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">9. United Kingdom: Online Safety</h2>
          <p>
            People in the UK can report content they believe is illegal, or harmful to children, as
            described in Section 3. You can also complain to us about:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Content on Disband you believe is illegal or harmful to children;</li>
            <li>
              A decision to remove or restrict your content, to give you a strike or limit your
              account, or to suspend your account;
            </li>
            <li>
              Our automated tools, if you believe they removed or restricted your content in a way that
              breaks our Terms; and
            </li>
            <li>
              How we meet our duties under the Online Safety Act, including our duties to protect
              freedom of expression and privacy.
            </li>
          </ul>
          <p>
            Send complaints to legal@disband.dev with the subject line “Complaint”, or use the appeal
            routes in Section 6. We acknowledge complaints, handle them promptly, and tell you the
            outcome.
          </p>
          <p>
            Ofcom regulates online safety in the UK. It does not resolve individual complaints, but you
            can tell Ofcom about a concern on its website, ofcom.org.uk.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">10. Your Privacy Rights</h2>
          <p>
            Under the EU and UK General Data Protection Regulation you have rights over your personal
            data, including the right to ask for a person to review automated decisions. Our{" "}
            <Link href="/privacy" className={link}>Privacy Policy</Link> explains them, how to use
            them, and how to complain to a data protection authority.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">11. Your Consumer Rights</h2>
          <p>
            If you are a consumer in the EU, the EEA, or the UK, you can usually withdraw from a
            purchase made directly from us within 14 days. Consumers there and in Switzerland also keep
            the protection of the mandatory consumer law where they live. See Sections 9, 12, and 14 of
            our <Link href="/terms" className={link}>Terms of Service</Link>.
          </p>
        </div>

        <Link href="/legal" className="mt-10 inline-block text-sm text-brand hover:underline">
          ← All legal documents
        </Link>
    </LegalShell>
  );
}
