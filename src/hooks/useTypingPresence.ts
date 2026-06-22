"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const TYPING_TTL_MS = 4000;
const TYPING_SEND_MS = 2000;

export interface TypingUser {
  userId: string;
  name: string;
}

export function formatTypingLabel(typers: TypingUser[], useSeveralRule: boolean): string | null {
  if (typers.length === 0) return null;
  if (useSeveralRule && typers.length > 3) return "Several people are typing…";
  if (typers.length === 1) return `${typers[0].name} is typing…`;
  if (typers.length === 2) return `${typers[0].name} and ${typers[1].name} are typing…`;
  if (typers.length === 3) {
    return `${typers[0].name}, ${typers[1].name}, and ${typers[2].name} are typing…`;
  }
  return "Several people are typing…";
}

export function useTypingPresence(
  scope: { kind: "channel" | "dm"; id: string } | null,
  self: { id: string; name: string } | null,
) {
  const [typers, setTypers] = useState<TypingUser[]>([]);
  const typersRef = useRef(new Map<string, { name: string; timer: ReturnType<typeof setTimeout> }>());
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseClient>["channel"]> | null>(null);
  const lastSentRef = useRef(0);

  const syncTypers = useCallback(() => {
    const selfId = self?.id;
    setTypers(
      [...typersRef.current.entries()]
        .filter(([id]) => id !== selfId)
        .map(([userId, { name }]) => ({ userId, name })),
    );
  }, [self?.id]);

  useEffect(() => {
    if (!scope || !self) {
      setTypers([]);
      return;
    }

    const supabase = getSupabaseClient();
    const topic = scope.kind === "channel" ? `typing:ch:${scope.id}` : `typing:dm:${scope.id}`;
    const ch = supabase.channel(topic, { config: { broadcast: { self: false } } });

    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      const p = payload as { userId?: string; name?: string };
      if (!p.userId || p.userId === self.id || !p.name) return;
      const existing = typersRef.current.get(p.userId);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => {
        typersRef.current.delete(p.userId!);
        syncTypers();
      }, TYPING_TTL_MS);
      typersRef.current.set(p.userId, { name: p.name, timer });
      syncTypers();
    });

    void ch.subscribe();
    channelRef.current = ch;

    return () => {
      void ch.unsubscribe();
      channelRef.current = null;
      for (const { timer } of typersRef.current.values()) clearTimeout(timer);
      typersRef.current.clear();
      setTypers([]);
    };
  }, [scope?.kind, scope?.id, self, syncTypers]);

  const notifyTyping = useCallback(() => {
    if (!scope || !self || !channelRef.current) return;
    const now = Date.now();
    if (now - lastSentRef.current < TYPING_SEND_MS) return;
    lastSentRef.current = now;
    void channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: self.id, name: self.name },
    });
  }, [scope, self]);

  return { typers, notifyTyping };
}
