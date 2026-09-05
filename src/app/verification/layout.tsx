import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function VerificationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}