"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { SpaceBotCommand } from "@/lib/bot-commands";

// Per space, for a minute: the list only changes when a bot re-registers.
const cache = new Map<string, { at: number; commands: SpaceBotCommand[] }>();
const TTL = 60_000;

/** Slash commands from the bots in a space, for the composer's "/" list. */
export function useSpaceBotCommands(serverId: string | null | undefined): SpaceBotCommand[] {
  const [commands, setCommands] = useState<SpaceBotCommand[]>(() => (serverId ? cache.get(serverId)?.commands ?? [] : []));

  useEffect(() => {
    if (!serverId) {
      setCommands([]);
      return;
    }
    const hit = cache.get(serverId);
    setCommands(hit?.commands ?? []);
    if (hit && Date.now() - hit.at < TTL) return;
    let live = true;
    void getSupabaseClient()
      .rpc("space_bot_commands", { p_server_id: serverId })
      .then(({ data, error }) => {
        if (error || !Array.isArray(data)) return;
        cache.set(serverId, { at: Date.now(), commands: data as SpaceBotCommand[] });
        if (live) setCommands(data as SpaceBotCommand[]);
      });
    return () => {
      live = false;
    };
  }, [serverId]);

  return commands;
}
