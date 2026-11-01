"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Profile, VoicePresence } from "@/lib/supabase/types";

export interface PresenceMember extends VoicePresence {
  profile?: Profile;
}

export function useServerVoicePresence(serverId: string | null) {
  const [byChannel, setByChannel] = useState<Map<string, PresenceMember[]>>(new Map());

  const [startTimes, setStartTimes] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!serverId) {
      setByChannel(new Map());
      setStartTimes(new Map());
      return;
    }
    let active = true;
    // The space's voice channel ids barely change; reading them on every
    // presence event doubled each update's round trips.
    let voiceIds: string[] | null = null;
    let timer: number | undefined;

    const load = async () => {
      const supabase = getSupabaseClient();
      if (!voiceIds) {
        const { data: chs } = await supabase
          .from("channels")
          .select("id")
          .eq("server_id", serverId)
          .eq("type", "voice");
        voiceIds = ((chs as { id: string }[] | null) ?? []).map((c) => c.id);
      }
      if (!active) return;
      if (voiceIds.length === 0) {
        setByChannel(new Map());
        return;
      }
      const { data: rows } = await supabase
        .from("voice_presence_live")
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

    // One burst of changes (a join writes, then heartbeats) is one reload.
    // Changes in other spaces' channels are ignored.
    const schedule = (channelId?: string) => {
      if (channelId && voiceIds && !voiceIds.includes(channelId)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 120);
    };

    const sub = getSupabaseClient()
      .channel(`server-voice:${serverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_presence" }, (change) => {
        const row = (change.new && "channel_id" in change.new ? change.new : change.old) as { channel_id?: string };
        schedule(row?.channel_id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "channels", filter: `server_id=eq.${serverId}` }, () => {
        voiceIds = null;
        schedule();
      })
      .subscribe();

    return () => {
      active = false;
      window.clearTimeout(timer);
      void sub.unsubscribe();
    };
  }, [serverId]);

  useEffect(() => {
    setStartTimes((prev) => {
      const next = new Map(prev);
      for (const [id, members] of byChannel) {
        if (members.length === 0) continue;
        if (next.has(id)) continue;
        const earliest = members.reduce((min: number, m) => {
          const t = m.joined_at ? Date.parse(m.joined_at) : NaN;
          return Number.isFinite(t) && (!Number.isFinite(min) || t < min) ? t : min;
        }, NaN);
        next.set(id, Number.isFinite(earliest) ? earliest : Date.now());
      }
      for (const id of [...next.keys()]) {
        const members = byChannel.get(id);
        if (!members || members.length === 0) next.delete(id);
      }
      return next;
    });
  }, [byChannel]);

  return { byChannel, startTimes };
}
