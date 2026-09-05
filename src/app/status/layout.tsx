import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Status",
  description: "Real-time health checks across Disband services — API, app, auth, and CDN.",
  alternates: { canonical: "/status" },
};

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}