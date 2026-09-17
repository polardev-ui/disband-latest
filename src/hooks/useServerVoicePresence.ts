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

    const sub = getSupabaseClient()
      .channel(`server-voice:${serverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_presence" }, () => void load())
      .subscribe();

    return () => {
      active = false;
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
