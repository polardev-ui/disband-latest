"use client";

import { useEffect, useState } from "react";
import { ClassicModal, classicBtn } from "@/components/ui/ClassicModal";
import { CURRENCY } from "@/lib/currency";

/*
 What's new in this version, once per person per version.
*/

export const WHATS_NEW_VERSION = "2.33.169";
const SEEN_KEY = `disband-whats-new:${WHATS_NEW_VERSION}`;

const ITEMS: { title: string; body: string; accent: string }[] = [
  { title: `${CURRENCY.plural}`, body: `Earn ${CURRENCY.plural} by chatting, creating and joining spaces and more, then spend them on Aero for a week or a free decoration. Settings → ${CURRENCY.plural}.`, accent: "#9b7bff" },
  { title: "Creator Program", body: "Connect YouTube, TikTok or Twitch. Pass 2,500 followers and the Content Creator badge appears on your profile, with your count on hover.", accent: "#ff4f6d" },
  { title: "Promote your space", body: "Put your space at the top of Discover from 1 day to 2 weeks, from Space Settings → Promote.", accent: "#ffd166" },
  { title: "Account Standing", body: "See where your account stands, any strikes and limits, and what each tier means. Settings → Account Standing.", accent: "#23a55a" },
  { title: "A better developer portal", body: "Bots get kick, ban and timeout permissions, and one install link anyone can use to add your bot to their space.", accent: "#5865f2" },
  { title: "New avatar decorations", body: "Angelic now wears its halo round your head, and Treat, No Trick has a proper skull with a real jawline.", accent: "#f0883e" },
  { title: "Disband Management", body: "A new staff tier that looks after the staff and moderation teams and can suspend spaces that break the rules.", accent: "#f0883e" },
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
      width={520}
      title="What's new"
      subtitle={`Disband ${WHATS_NEW_VERSION}`}
      footer={<button type="button" onClick={close} className={`${classicBtn.brand} ${classicBtn.md}`}>Nice</button>}
    >
      <ul className="channel-scroll max-h-[55vh] space-y-3 overflow-y-auto text-left">
        {ITEMS.map((item) => (
          <li key={item.title} className="flex gap-3 rounded-lg bg-bg-secondary p-3">
            <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ background: item.accent }} />
            <div>
              <p className="font-semibold text-header-primary">{item.title}</p>
              <p className="text-[14px] leading-5 text-text-normal">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </ClassicModal>
  );
}
