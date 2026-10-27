"use client";

import { useEffect, useState } from "react";

const KEY = "disband.cookie_consent.v1";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const decide = (value: "accepted" | "rejected") => {
    try {
      window.localStorage.setItem(KEY, value);
    } catch {
      // Ignore storage errors; banner will reappear next load.
    }
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9999] border-t border-[#3f4147] bg-[#2b2d31] px-4 py-3 text-[13px] text-text-normal shadow-lg">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="leading-relaxed text-text-muted">
          We use essential cookies to keep you signed in and make the service work. Optional cookies
          help us improve reliability. You can change your choice later in settings.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide("rejected")}
            className="rounded-[3px] bg-bg-tertiary px-3 py-1.5 text-[13px] font-medium text-text-normal hover:bg-bg-modifier-hover"
          >
            Reject optional
          </button>
          <button
            type="button"
            onClick={() => decide("accepted")}
            className="rounded-[3px] bg-[#5865f2] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#4752c4]"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
