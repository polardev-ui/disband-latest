"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { safeImageUrl } from "@/lib/safe-url";
import { ClassicModal } from "@/components/ui/ClassicModal";

export function AccountViewerModal({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, status, created_at, bio, is_bot, is_support_staff, show_staff_badge, deletion_requested_at")
        .eq("id", userId)
        .maybeSingle();
      if (alive) {
        setProfile(data ?? null);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!userId) return null;

  return (
    <ClassicModal open={true} title="Account details" onClose={onClose}>
      {loading ? (
        <p className="text-sm text-text-muted">Loading account…</p>
      ) : profile ? (
        <div className="space-y-3 text-sm">
          {safeImageUrl(profile.banner_url) && (
            <div className="h-24 w-full overflow-hidden rounded-[3px] bg-bg-tertiary">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={safeImageUrl(profile.banner_url)!} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-bg-tertiary">
              {safeImageUrl(profile.avatar_url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={safeImageUrl(profile.avatar_url)!} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-lg font-bold text-text-normal">
                  {(profile.display_name || profile.username || "?").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <p className="font-semibold text-text-normal">{profile.display_name || profile.username || "Unknown"}</p>
              <p className="text-xs text-text-muted">@{profile.username || "—"} · {profile.status || "—"}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-text-muted">User ID</span><p className="font-mono text-text-normal">{profile.id}</p></div>
            <div><span className="text-text-muted">Created</span><p className="text-text-normal">{profile.created_at ? new Date(profile.created_at).toLocaleString() : "—"}</p></div>
            <div><span className="text-text-muted">Staff</span><p className="text-text-normal">{profile.is_support_staff ? "Yes" : "No"}</p></div>
            <div><span className="text-text-muted">Bot</span><p className="text-text-normal">{profile.is_bot ? "Yes" : "No"}</p></div>
          </div>
          {profile.bio && (
            <div>
              <p className="text-xs text-text-muted">Bio</p>
              <p className="mt-1 text-sm text-text-normal">{profile.bio}</p>
            </div>
          )}
          {profile.deletion_requested_at && (
            <p className="text-xs text-status-dnd">Deletion requested: {new Date(profile.deletion_requested_at).toLocaleString()}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-muted">Could not load account.</p>
      )}
    </ClassicModal>
  );
}
