"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeChannel } from "@/lib/realtime";

const TYPING_TTL_MS = 5000;
const TYPING_SEND_MS = 1500;

export interface TypingUser {
  userId: string;
  name: string;
}

export type TypingScope =
  | { kind: "channel"; id: string; serverId?: string }
  | { kind: "dm"; id: string };

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
  scope: TypingScope | null,
  self: { id: string; name: string } | null,
) {
  const selfId = self?.id ?? null;
  const selfName = self?.name ?? null;
  const scopeKind = scope?.kind ?? null;
  const scopeId = scope?.id ?? null;
  const serverId = scope?.kind === "channel" ? scope.serverId ?? null : null;

  const [typers, setTypers] = useState<TypingUser[]>([]);
  const typersRef = useRef(new Map<string, { name: string; timer: ReturnType<typeof setTimeout> }>());
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseClient>["channel"]> | null>(null);
  const serverRef = useRef<ReturnType<ReturnType<typeof getSupabaseClient>["channel"]> | null>(null);
  const readyRef = useRef(false);
  const serverReadyRef = useRef(false);
  const lastSentRef = useRef(0);
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;

  const refreshTypers = useCallback(() => {
    const id = selfIdRef.current;
    setTypers(
      [...typersRef.current.entries()]
        .filter(([userId]) => userId !== id)
        .map(([userId, { name }]) => ({ userId, name })),
    );
  }, []);

  useEffect(() => {
    typersRef.current.clear();
    setTypers([]);
    readyRef.current = false;
    serverReadyRef.current = false;
    channelRef.current = null;
    serverRef.current = null;

    if (!scopeKind || !scopeId || !selfId || !selfName) return;

    const supabase = getSupabaseClient();
    const topic = scopeKind === "channel" ? `typing:ch:${scopeId}` : `typing:dm:${scopeId}`;
    const ch = supabase.channel(topic, { config: { broadcast: { self: false } } });

    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      const p = payload as { userId?: string; name?: string };
      if (!p.userId || p.userId === selfIdRef.current || !p.name) return;
      const existing = typersRef.current.get(p.userId);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => {
        typersRef.current.delete(p.userId!);
        refreshTypers();
      }, TYPING_TTL_MS);
      typersRef.current.set(p.userId, { name: p.name, timer });
      refreshTypers();
    });

    let cancelled = false;
    void subscribeChannel(ch)
      .then(() => {
        if (cancelled) return;
        channelRef.current = ch;
        readyRef.current = true;
      })
      .catch(() => {
        readyRef.current = false;
      });

    if (scopeKind === "channel" && serverId) {
      const serverCh = supabase.channel(`typing:server:${serverId}`, {
        config: { broadcast: { self: false } },
      });
      void subscribeChannel(serverCh)
        .then(() => {
          if (cancelled) return;
          serverRef.current = serverCh;
          serverReadyRef.current = true;
        })
        .catch(() => {
          serverReadyRef.current = false;
        });
    }

    return () => {
      cancelled = true;
      readyRef.current = false;
      serverReadyRef.current = false;
      void ch.unsubscribe();
      channelRef.current = null;
      if (serverRef.current) {
        void serverRef.current.unsubscribe();
        serverRef.current = null;
      }
      for (const { timer } of typersRef.current.values()) clearTimeout(timer);
      typersRef.current.clear();
      setTypers([]);
    };
  }, [scopeKind, scopeId, serverId, selfId, selfName, refreshTypers]);

  const notifyTyping = useCallback(() => {
    if (!scopeKind || !scopeId || !selfId || !selfName || !readyRef.current || !channelRef.current) return;
    const now = Date.now();
    if (now - lastSentRef.current < TYPING_SEND_MS) return;
    lastSentRef.current = now;
    void channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: selfId, name: selfName },
    });
    if (scopeKind === "channel" && serverId && serverReadyRef.current && serverRef.current) {
      void serverRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: selfId, channelId: scopeId },
      });
    }
  }, [scopeKind, scopeId, serverId, selfId, selfName]);

  return { typers, notifyTyping };
}
