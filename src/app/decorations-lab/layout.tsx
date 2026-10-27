import type { Metadata } from "next";

// The page itself is a client component, so its title lives here. It is a
// workbench, not a storefront: kept out of search.
export const metadata: Metadata = {
  title: "Decoration Lab",
  description: "Avatar decorations at every size, with slow motion and a frame-by-frame view of each hover.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
