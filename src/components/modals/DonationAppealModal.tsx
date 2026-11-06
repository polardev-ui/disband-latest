"use client";

import { useEffect, useState } from "react";
import { ClassicModal, classicBtn } from "@/components/ui/ClassicModal";
import { PinchedBill } from "@/components/donate/PinchedBill";
import { PUBLIC_ENV } from "@/lib/public-env";
import { safeWindowOpen } from "@/lib/safe-url";
import { useI18n } from "@/contexts/I18nContext";

/*
 The "we need help" note, shown once per person per appeal. Replaces the
 What's New popup. Bump APPEAL_ID to show a new appeal to everyone again.

 Only the web and desktop apps render this; the iOS and Android apps are
 native and never show it, which keeps donation asks out of the app stores.
*/

export const APPEAL_ID = "2026-11-costs";
const SEEN_KEY = `disband-appeal:${APPEAL_ID}`;

function donateUrl(): string {
  try {
    return `${new URL(PUBLIC_ENV.webAppUrl).origin}/donate`;
  } catch {
    return "https://disband.dev/donate";
  }
}

export function DonationAppealModal() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = !!localStorage.getItem(SEEN_KEY);
    } catch {
      // No storage: skip rather than show it on every load.
    }
    if (seen) return;
    // A moment after load, so it doesn't land on top of sign-in prompts.
    const timer = window.setTimeout(() => setOpen(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  const close = () => {
    try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* ignore */ }
    setOpen(false);
  };

  const donate = () => {
    safeWindowOpen(donateUrl());
    close();
  };

  return (
    <ClassicModal
      open={open}
      onClose={close}
      width={480}
      centered={false}
      banner={
        <div className="flex h-[180px] items-end justify-center overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#3a2a24_0%,#1e1f22_70%)]">
          <PinchedBill className="w-[170px] translate-y-3" />
        </div>
      }
      title={t("We need your help")}
      subtitle={t("A note from the Disband team")}
      footer={
        <>
          <button type="button" onClick={close} className={`${classicBtn.link} ${classicBtn.md}`}>
            {t("Not now")}
          </button>
          <button type="button" onClick={donate} className={`${classicBtn.brand} ${classicBtn.md}`}>
            {t("Donate")}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-[15px] leading-[21px] text-text-normal">
        <p>
          {t("Disband costs about $350 a month to run: servers, storage, voice and video, safety tools and email. Right now, what Disband earns from Aero and Lite doesn’t cover that.")}
        </p>
        <p>
          {t("We don’t sell your data, and we want to keep Disband free for everyone. If Disband matters to you, a donation of any size helps keep it online.")}
        </p>
        <p className="text-[13px] leading-[18px] text-text-muted">
          {t("Donations go to Genysis IQ LLC, the company that runs Disband. They aren’t tax-deductible, and apart from a Donor badge on your profile they don’t unlock anything.")}
        </p>
      </div>
    </ClassicModal>
  );
}
