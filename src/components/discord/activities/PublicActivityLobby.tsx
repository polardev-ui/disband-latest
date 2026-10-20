"use client";
import { useEffect, useState } from "react";
import {
  activityDefinition,
  listPublicActivities,
  type ActivityRoom,
} from "@/lib/activities";
import { ActivityGlyph } from "./ActivityGlyph";
export function PublicActivityLobby({
  onOpen,
}: {
  onOpen: (id: string) => void;
}) {
  const [rooms, setRooms] = useState<ActivityRoom[]>([]),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true,
      inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await listPublicActivities();
        if (alive) {
          setRooms(next);
          setError(null);
        }
      } catch {
        if (alive) setError("Couldn’t load public games. Retrying shortly…");
      } finally {
        inFlight = false;
        if (alive) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <section className="space-y-2 px-3 pb-3">
      <h4 className="text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">
        Open rooms
      </h4>
      {error && (
        <p role="alert" className="text-[13px] text-status-dnd">
          {error}
        </p>
      )}
      {loading ? (
        <p className="py-3 text-[14px] text-text-muted">Finding games…</p>
      ) : !rooms.length ? (
        <p className="rounded-[4px] bg-bg-secondary p-3 text-[14px] text-text-muted">
          No public games yet. Choose a game above to host the first room.
        </p>
      ) : (
        rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => onOpen(room.id)}
            className="flex w-full items-center gap-3 rounded-[4px] bg-bg-secondary p-3 text-left hover:bg-interactive-hover focus-visible:outline-brand"
          >
            <ActivityGlyph kind={room.kind} />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-header-primary">
                {activityDefinition(room.kind).name}
              </span>
              <span className="block truncate text-[12px] text-text-muted">
                Hosted by {room.hostName} · {room.participantCount}/
                {room.capacity} players
              </span>
            </span>
            <span className="rounded-[3px] bg-button-secondary px-3 py-1.5 text-[13px] font-medium text-white">
              {room.participantCount >= room.capacity ? "Watch" : "Join"}
            </span>
          </button>
        ))
      )}
    </section>
  );
}
