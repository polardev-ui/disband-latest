"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { listAllUserServerSounds } from "@/lib/server-sounds";
import type { ServerSound } from "@/lib/supabase/types";
import { playVoiceSoundboardSound } from "@/lib/voice-mixer";

interface SoundboardProps {
  compact?: boolean;
}

export function Soundboard({ compact = false }: SoundboardProps) {
  const { servers } = useApp();
  const [sounds, setSounds] = useState<ServerSound[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!servers.length) return;
    let mounted = true;
    setLoading(true);
    listAllUserServerSounds(servers.map((s) => s.id))
      .then((rows) => {
        if (mounted) setSounds(rows);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [servers]);

  const groups = servers
    .map((server) => ({
      server,
      sounds: sounds.filter((sound) => sound.server_id === server.id),
    }))
    .filter((group) => group.sounds.length > 0);

  return (
    <section className={`rounded-xl border border-divider bg-bg-secondary/80 ${compact ? "p-2" : "p-4"}`}>
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-normal">Soundboard</h3>
        <span className="text-xs text-text-muted">
          {sounds.length}/200 loaded
        </span>
      </header>
      {loading && <p className="text-xs text-text-muted">Loading sounds…</p>}
      {!loading && groups.length === 0 && (
        <p className="text-xs text-text-muted">
          Upload sounds in server settings to use them here.
        </p>
      )}
      <div className="max-h-56 space-y-3 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.server.id}>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              {group.server.name}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.sounds.map((sound) => (
                <button
                  key={sound.id}
                  type="button"
                  onClick={() => playVoiceSoundboardSound(sound.url)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-bg-tertiary px-3 py-1.5 text-xs text-text-normal hover:bg-interactive-hover"
                  title={sound.name}
                >
                  <span>{sound.emoji}</span>
                  <span className="max-w-24 truncate">{sound.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
