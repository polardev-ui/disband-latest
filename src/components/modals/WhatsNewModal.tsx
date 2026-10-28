"use client";

import { useEffect, useState } from "react";
import { ClassicModal, classicBtn } from "@/components/ui/ClassicModal";
import { CURRENCY } from "@/lib/currency";
import { SpookyBanner } from "./SpookyBanner";

/*
 What's new in this version, once per person per version.
*/

export const WHATS_NEW_VERSION = "2.33.169";
const SEEN_KEY = `disband-whats-new:${WHATS_NEW_VERSION}`;

// Written like a changelog: grouped under coloured headings, plain text.
const SECTIONS: { heading: string; colour: string; items: [string, string][] }[] = [
  {
    heading: "New",
    colour: "#ff8a3d",
    items: [
      [CURRENCY.plural, `Disband's own currency. You earn them for chatting (every 18 messages), creating and joining spaces, joining the Disband Official space and changing your picture or banner. Spend them on Aero for a week or any avatar decoration you like. Your balance, history and everything you can do live in Settings → ${CURRENCY.plural}.`],
      ["Creator Program", "Make videos or stream? Connect YouTube, TikTok or Twitch in Settings → Creator Program. Pass 2,500 followers on any of them and the Content Creator badge appears on your profile automatically, and anyone who hovers it sees your count."],
      ["Promote your space", "Want more people to find your space? Put it at the very top of Discover with a Promoted label, for a day, a week or two. Find it in Space Settings → Promote."],
      ["Account Standing", "A clear look at where your account stands, from Good to Suspended, with any strikes, any limits and when they end. It's in Settings → Account Standing."],
      ["Disband Management", "A new team that looks after Disband's staff and moderators, and can shut down spaces that break the rules."],
    ],
  },
  {
    heading: "Improved",
    colour: "#5865f2",
    items: [
      ["Developer portal", "The bots page is rebuilt from scratch. Bots can now kick, ban and time out members, and every bot gets one install link anyone can use to add it to their own space."],
      ["Decorations", "Angelic's halo now sits round your head, passing behind your picture, and Treat, No Trick has a proper skull with a real jawline that bites over your whole picture."],
      ["Support", "Our support team has a faster inbox, so your requests get answered sooner."],
    ],
  },
  {
    heading: "Fixed",
    colour: "#23a55a",
    items: [
      ["Profile pictures", "Choosing a new profile picture opened the cropper behind Settings, so it couldn't be saved. It opens on top now."],
      ["Desktop", "Delete, kick, ban, leave and rename now ask for confirmation properly in the desktop app, and image links open in your browser."],
      ["Invite links", "Every kind of invite link joins the space it points to."],
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
      banner={<SpookyBanner />}
      title="What's new"
      subtitle={`Version ${WHATS_NEW_VERSION} · Spooky season`}
      footer={<button type="button" onClick={close} className={`${classicBtn.brand} ${classicBtn.md}`}>Got it</button>}
    >
      <div className="channel-scroll -mx-4 max-h-[42vh] overflow-y-auto px-4">
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
