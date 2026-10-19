import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";
import { getStatusSnapshot } from "@/lib/status-data";
import { StatusView } from "./StatusView";

export const revalidate = 30;

export default async function StatusPage() {
  const snapshot = await getStatusSnapshot();
  return (
    <div className="min-h-screen bg-bg-tertiary text-text-normal">
      <MarketingNav />
      <StatusView initial={snapshot} />
      <MarketingFooter />
    </div>
  );
}
