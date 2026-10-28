"use client";

import { useEffect, useState } from "react";
import { ClassicModal, classicBtn } from "@/components/ui/ClassicModal";
import { CURRENCY } from "@/lib/currency";

/*
 What's new in this version, once per person per version.
*/

export const WHATS_NEW_VERSION = "2.33.169";
const SEEN_KEY = `disband-whats-new:${WHATS_NEW_VERSION}`;

// Written like a changelog: grouped under coloured headings, plain text.
const SECTIONS: { heading: string; colour: string; items: [string, string][] }[] = [
  {
    heading: "New",
    colour: "#23a55a",
    items: [
      [CURRENCY.plural, `Earn them by chatting, creating and joining spaces, then spend them on Aero for a week or a free decoration. Find them in Settings.`],
      ["Creator Program", "Connect YouTube, TikTok or Twitch. Pass 2,500 followers and you get the Content Creator badge."],
      ["Promote your space", "Put your space at the top of Discover, from Space Settings → Promote."],
      ["Account Standing", "See where your account stands and why, in Settings."],
    ],
  },
  {
    heading: "Improved",
    colour: "#5865f2",
    items: [
      ["Developer portal", "Bots can now kick, ban and time out, and get one install link anyone can use."],
      ["Decorations", "Angelic's halo sits round your head, and Treat, No Trick has a proper skull."],
    ],
  },
];

export function WhatsNewModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      // No storage: skip rather than show it on every load.
    }
  }, []);

  const close = () => {
    try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* ignore */ }
    setOpen(false);
  };

  return (
    <ClassicModal
      open={open}
      onClose={close}
      width={480}
      centered={false}
      title="What's new"
      subtitle={`Version ${WHATS_NEW_VERSION}`}
      footer={<button type="button" onClick={close} className={`${classicBtn.brand} ${classicBtn.md}`}>Got it</button>}
    >
      <div className="channel-scroll -mx-4 max-h-[56vh] overflow-y-auto px-4">
        {SECTIONS.map((section) => (
          <section key={section.heading} className="mb-5 last:mb-0">
            <h3 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase leading-4 tracking-[0.02em]" style={{ color: section.colour }}>
              {section.heading}
              <span className="h-px flex-1" style={{ background: section.colour, opacity: 0.4 }} />
            </h3>
            <ul className="list-disc space-y-2.5 pl-5 text-[15px] leading-[20px] text-text-normal marker:text-text-muted">
              {section.items.map(([title, body]) => (
                <li key={title}>
                  <strong className="font-semibold text-header-primary">{title}.</strong> {body}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </ClassicModal>
  );
}
