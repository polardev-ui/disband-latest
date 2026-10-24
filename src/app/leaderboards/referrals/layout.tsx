import type { Metadata } from "next";

// The page itself is a client component, so its title lives here.
export const metadata: Metadata = {
  title: "Referral Leaderboard",
  description: "Who has brought the most people to Disband.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
