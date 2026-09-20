import type { Metadata } from "next";
import { RootRedirect } from "@/components/routing/RootRedirect";

export const metadata: Metadata = {
  title: "Free voice & text chat for your people",
  description:
    "Disband is a free, privacy-first chat app — spaces and channels, direct messages, group chats, and voice and video calls across desktop, mobile, and the web.",

  alternates: { canonical: "/home" },
};

export default function RootPage() {
  return <RootRedirect />;
}
