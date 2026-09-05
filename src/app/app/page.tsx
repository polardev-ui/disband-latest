import type { Metadata } from "next";
import { DisbandRoot } from "@/components/DisbandRoot";

export const metadata: Metadata = {
  title: "Disband app",
  description: "Disband app",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function AppPage() {
  return <DisbandRoot />;
}
