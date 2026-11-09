import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewApp } from "./PreviewApp";

export const metadata: Metadata = {
  title: "UI preview",
  robots: { index: false, follow: false },
};

/** Development-only: the signed-in app over sample data. 404 in production. */
export default function DevPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewApp />;
}
