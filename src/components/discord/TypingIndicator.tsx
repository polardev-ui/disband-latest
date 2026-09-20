"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { formatTypingLabel, type TypingUser } from "@/hooks/useTypingPresence";
import type { Profile } from "@/lib/supabase/types";

const MAX_AVATARS = 3;
const EXIT_MS = 300;

function TypingDots() {
  return (
    <span
      className="inline-flex items-center gap-[5px] rounded-full bg-bg-accent px-3 py-2"
      role="status"
      aria-label="Typing"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="typing-dot h-[7px] w-[7px] rounded-full bg-text-muted"
          // A third of the cycle apart, so the pulse travels left to right
          // evenly instead of the three dots drifting in and out of phase.
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}

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

  if (typers.length === 0) return null;

  const byId = new Map(members.map((m) => [m.id, m]));
  const shown = typers.slice(0, MAX_AVATARS);
  const leavingShown = [...leaving.values()].filter(
    (t) => !typers.some((x) => x.userId === t.userId),
  ).slice(0, Math.max(0, MAX_AVATARS - shown.length));

  return (
    <div className="flex items-end gap-2 px-4 pb-2">
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
      <div className="min-w-0">
        <TypingDots />
        {groupContext && (
          <p className="mt-1 truncate text-[11px] text-text-muted">
            {formatTypingLabel(typers, true)}
          </p>
        )}
      </div>
    </div>
  );
}
