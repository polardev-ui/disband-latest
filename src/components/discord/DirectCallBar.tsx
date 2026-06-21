"use client";

import { useEffect } from "react";
import { useDirectCall } from "@/hooks/useDirectCall";
import { IconPhone } from "@/components/icons";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";

interface DirectCallBarProps {
  localUserId: string;
  peer: Profile;
  callId: string;
  onEnd: () => void;
}

export function DirectCallBar({ localUserId, peer, callId, onEnd }: DirectCallBarProps) {
  const call = useDirectCall(localUserId, peer.id, callId);

  useEffect(() => {
    void call.startCall();
    return () => { void call.endCall(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-status-online/30 bg-status-online/10 px-4 py-2">
      <div className="flex items-center gap-2 text-sm">
        <IconPhone size={18} className="text-status-online" />
        <span>
          Voice call with <strong>{displayName(peer)}</strong>
          {call.active ? " — connected" : " — connecting…"}
        </span>
      </div>
      <button
        type="button"
        onClick={() => { void call.endCall(); onEnd(); }}
        className="rounded bg-status-dnd px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
      >
        End Call
      </button>
      {call.remoteStream && (
        <audio
          ref={(el) => {
            if (el) {
              el.srcObject = call.remoteStream;
              void el.play().catch(() => {});
            }
          }}
          autoPlay
          playsInline
        />
      )}
      {call.error && <p className="text-xs text-status-dnd">{call.error}</p>}
    </div>
  );
}
