import type { Server } from "@/lib/supabase/types";

/** Props every Space settings section receives. */
export interface SectionProps {
  server: Server;
  isOwner: boolean;
  catalystCount: number;
  /** Opens the Catalyst sheet, when the host can. */
  onBoost?: () => void;
}
