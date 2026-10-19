"use client";

import { useSearchParams } from "next/navigation";

const STATES: Record<string, { title: string; body: string }> = {
  "old-confirmed": {
    title: "One more step",
    body: "You approved the change from your old email. Now check your new email account and click the confirmation link there to finish.",
  },
  completed: {
    title: "Email changed ✓",
    body: "Your new email is confirmed and active. You can sign in with it right away — this page is safe to close.",
  },
  invalid: {
    title: "Link not valid",
    body: "This confirmation link doesn't match an active email change. It may already have been used. Start the change again from your account settings.",
  },
  expired: {
    title: "Link expired",
    body: "Confirmation links expire after 24 hours. Start the email change again from your account settings.",
  },
  taken: {
    title: "Email unavailable",
    body: "That address is already attached to another Disband account. Pick a different email and try again.",
  },
};

export function EmailChangeStatus() {
  const params = useSearchParams();
  const state = params.get("state") ?? "invalid";
  const copy = STATES[state] ?? STATES.invalid;
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-primary px-6">
      <div className="w-full max-w-md rounded-[8px] border border-divider bg-bg-secondary p-8 text-center">
        <p className="text-xl font-semibold text-text-normal">{copy.title}</p>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">{copy.body}</p>
      </div>
    </main>
  );
}
