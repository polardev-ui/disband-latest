import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Status",
  description: "Live operational status, uptime history, incidents and scheduled maintenance for Disband.",
  alternates: { canonical: "/status" },
};

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}