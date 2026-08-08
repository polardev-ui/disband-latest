"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Profile, VoicePresence } from "@/lib/supabase/types";

export interface PresenceMember extends VoicePresence {
  profile?: Profile;
}

/**
 * Loads and live-subscribes to voice presence for every voice channel in a
 * server, keyed by channel_id. Lets the channel sidebar show who is connected
 * (and muted/deafened) without the viewer joining the voice channel.
 */
export function useServerVoicePresence(serverId: string | null) {
  const [byChannel, setByChannel] = useState<Map<string, PresenceMember[]>>(new Map());

  useEffect(() => {
    if (!serverId) {
      setByChannel(new Map());
      return;
    }
    let active = true;

    const load = async () => {
      const supabase = getSupabaseClient();
      const { data: chs } = await supabase
        .from("channels")
        .select("id")
        .eq("server_id", serverId)
        .eq("type", "voice");
      const voiceIds = ((chs as { id: string }[] | null) ?? []).map((c) => c.id);
      if (!active) return;
      if (voiceIds.length === 0) {
        setByChannel(new Map());
        return;
      }
      const { data: rows } = await supabase
        .from("voice_presence")
        .select("*, profile:profiles(*)")
        .in("channel_id", voiceIds);
      if (!active) return;
      const map = new Map<string, PresenceMember[]>();
      (rows as PresenceMember[] | null)?.forEach((r) => {
        const list = map.get(r.channel_id) ?? [];
        list.push(r);
        map.set(r.channel_id, list);
      });
      setByChannel(map);
    };

    void load();

    const sub = getSupabaseClient()
      .channel(`server-voice:${serverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_presence" }, () => void load())
      .subscribe();

    return () => {
      active = false;
      void sub.unsubscribe();
    };
  }, [serverId]);

  return byChannel;
}
