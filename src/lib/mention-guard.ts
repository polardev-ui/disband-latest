"use client";

import { rateLimit } from "@/lib/rate-limit";
import { mentionsEveryone } from "@/lib/utils";

/**
 * Client-side pre-check mirroring 0092_mention_rate.sql.
 * The Postgres trigger is authoritative; this just fails fast with a
 * friendly message before the optimistic insert.
 */
export function checkMentionSend(
  userId: string,
  mentionIds: string[],
  content: string,
): string | null {
  if (mentionIds.length > 10) return "Too many mentions in one message (max 10).";

  const everyone = mentionsEveryone(content);
  if (mentionIds.length === 0 && !everyone) return null;

  const min = rateLimit(`mention:${userId}:min`, 10, 60_000);
  if (!min.allowed) return "You are pinging people too quickly. Slow down.";

  const hr = rateLimit(`mention:${userId}:hr`, 50, 3_600_000);
  if (!hr.allowed) return "Mention limit reached. Try again later.";

  if (everyone) {
    const ev = rateLimit(`mention:${userId}:everyone`, 2, 600_000);
    if (!ev.allowed) return "@everyone is rate limited. Try again in a few minutes.";
  }

  return null;
}
