import type { Metadata } from "next";
import { RootRedirect } from "@/components/routing/RootRedirect";

export const metadata: Metadata = {
  title: "Free voice & text chat for your people",
  description:
    "Disband is a free, privacy-first chat app — servers and channels, direct messages, group chats, and voice and video calls across desktop, mobile, and the web.",
  // "/" is a client redirect to /home — keep search consolidated on /home.
  alternates: { canonical: "/home" },
};

export default function RootPage() {
  return <RootRedirect />;
}
