import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { UiTestBench } from "./UiTestBench";

export const metadata: Metadata = { title: "UI test bench", robots: { index: false, follow: false } };

/**
 * Dev-only playground for the web/desktop UI: composer, gifting, media and
 * profile surfaces with sample data, no sign-in needed. Production builds
 * (including the desktop bundle) return 404.
 */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UiTestBench />;
}
