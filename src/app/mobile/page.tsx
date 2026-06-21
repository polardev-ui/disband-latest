import { MobileWaitlistScreen } from "@/components/mobile/MobileWaitlistScreen";

export const metadata = {
  title: "Disband — Mobile coming soon",
  description: "Disband is not available on mobile browsers yet. Join the waitlist to be notified at launch.",
};

export default function MobilePage() {
  return <MobileWaitlistScreen />;
}
