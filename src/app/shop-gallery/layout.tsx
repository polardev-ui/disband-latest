import type { Metadata } from "next";

// The page itself is a client component, so its title lives here.
export const metadata: Metadata = {
  title: "Shop Gallery",
  description: "Every ring, effect and decoration in the Disband shop.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
