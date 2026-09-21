"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { formatTypingLabel, type TypingUser } from "@/hooks/useTypingPresence";
import type { Profile } from "@/lib/supabase/types";

const MAX_AVATARS = 3;
const EXIT_MS = 300;

export function TypingIndicator({
  typers,
  members,
  groupContext,
}: {
  typers: TypingUser[];
  members: Profile[];
  groupContext: boolean;
}) {
  const [leaving, setLeaving] = useState<Map<string, TypingUser>>(new Map());
  const knownRef = useRef<Map<string, TypingUser>>(new Map());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const now = new Map(typers.map((t) => [t.userId, t]));
    for (const [id, user] of knownRef.current) {
      if (!now.has(id)) {
        knownRef.current.delete(id);
        setLeaving((prev) => (prev.has(id) ? prev : new Map(prev).set(id, user)));
        const timer = setTimeout(() => {
          setLeaving((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
          timers.current.delete(id);
        }, EXIT_MS);
        timers.current.set(id, timer);
      }
    }
    for (const [id, user] of now) {
      knownRef.current.set(id, user);
      const timer = timers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timers.current.delete(id);
        setLeaving((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }
    }
  }, [typers]);

  useEffect(() => {
    const stash = timers.current;
    return () => {
      for (const timer of stash.values()) clearTimeout(timer);
    };
  }, []);

  // The old code returned null as soon as `typers` emptied, so the tracked
  // exit animation above never played and the composer jumped. Keep the
  // container mounted while anyone is leaving and fade it out over EXIT_MS.
  const active = typers.length > 0;
  if (!active && leaving.size === 0) return null;

  const byId = new Map(members.map((m) => [m.id, m]));
  const shown = typers.slice(0, MAX_AVATARS);
  const leavingShown = [...leaving.values()].filter(
    (t) => !typers.some((x) => x.userId === t.userId),
  ).slice(0, Math.max(0, MAX_AVATARS - shown.length));

  return (
    <div
      className={`flex items-center gap-2 px-4 pb-2 transition-opacity duration-300 ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!active}
    >
      {groupContext && (
        <div className="flex shrink-0 items-center">
          {shown.map((t, i) => {
            const profile = byId.get(t.userId);
            if (!profile) return null;
            return (
              <span
                key={t.userId}
                title={t.name}
                className="avatar-pop -ml-1.5 rounded-full ring-2 ring-bg-primary first:ml-0"
                style={{ zIndex: MAX_AVATARS - i }}
              >
                <Avatar profile={profile} size="sm" className="h-6 w-6" />
              </span>
            );
          })}
          {leavingShown.map((t) => {
            const profile = byId.get(t.userId);
            if (!profile) return null;
            return (
              <span
                key={`leaving-${t.userId}`}
                className="avatar-leave -ml-1.5 rounded-full opacity-0 ring-2 ring-bg-primary"
              >
                <Avatar profile={profile} size="sm" className="h-6 w-6" />
              </span>
            );
          })}
          {typers.length > MAX_AVATARS && (
            <span className="avatar-pop -ml-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-bg-accent px-1 text-[10px] font-bold text-text-muted ring-2 ring-bg-primary">
              +{typers.length - MAX_AVATARS}
            </span>
          )}
        </div>
      )}
      {/* Animated dots are a phone affordance and live in the iOS and Android
          clients only; web and desktop keep the written label. */}
      {active && (
        <p className="min-w-0 truncate text-[13px] leading-5 text-text-muted">
          {formatTypingLabel(typers, groupContext)}
        </p>
      )}
    </div>
  );
}
