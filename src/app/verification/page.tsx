import type { Metadata } from "next";
import { Suspense } from "react";
import { VerificationPanel } from "@/app/verification/VerificationPanel";

export const metadata: Metadata = {
  title: "Verify Email — Disband",
  description: "Confirm your Disband email address.",
  alternates: { canonical: "/verification" },
  robots: { index: false, follow: false },
};

export default function VerificationPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-tertiary">
      <Suspense>
        <VerificationPanel />
      </Suspense>
    </div>
  );
}
