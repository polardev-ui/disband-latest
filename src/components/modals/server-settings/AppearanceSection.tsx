"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { getSupabaseClient } from "@/lib/supabase/client";
import { safeImageUrl } from "@/lib/safe-url";
import { serverInitials } from "@/lib/utils";
import { IconTrash, IconUpload } from "@/components/icons";
import { FilePickButton, InlineError, SettingsSection, btn, iconBtnDanger } from "./ui";
import type { SectionProps } from "./types";

const IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif";

export function AppearanceSection({ server, isOwner }: SectionProps) {
  const { updateServer, members } = useApp();
  const { upload } = useMediaUpload();
  const [busy, setBusy] = useState<"icon" | "banner" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The roster loads a page at a time, so its length undercounts on big
  // spaces; ask the server for the real total for the invite card.
  const [memberCount, setMemberCount] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    void getSupabaseClient()
      .rpc("get_server_member_counts", { p_server_id: server.id })
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        const row = data as { total?: number | string } | null;
        if (row && row.total != null) setMemberCount(Number(row.total));
      });
    return () => {
      live = false;
    };
  }, [server.id]);

  const shownCount = memberCount ?? members.length;

  const icon = safeImageUrl(server.icon_url);
  const banner = safeImageUrl(server.banner_url);

  async function setImage(kind: "icon" | "banner", file: File | null) {
    if (!isOwner) return;
    if (file && !file.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    if (file && file.size > 8 * 1024 * 1024) {
      setError("Images can be up to 8 MB.");
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      let url: string | null = null;
      if (file) {
        const res = await upload(file);
        if (!res) {
          setError("The upload didn't go through. Try again.");
          return;
        }
        url = res.url;
      }
      const err = await updateServer(server.id, kind === "icon" ? { icon_url: url } : { banner_url: url });
      if (err) setError(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pb-10">
      {/* A live invite card, so changes are judged where people see them. */}
      <SettingsSection title="Preview" description="How your space looks on an invite.">
        <div className="p-5">
          <div className="mx-auto max-w-[400px] overflow-hidden rounded-[14px] border border-divider bg-bg-primary">
            <div className="relative h-[120px] bg-bg-accent">
              {banner ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={banner} alt="" className="view-enter h-full w-full object-cover" key={banner} />
              ) : (
                <div className="h-full w-full bg-[linear-gradient(135deg,var(--color-brand)_0%,color-mix(in_srgb,var(--color-brand)_35%,var(--color-bg-accent))_100%)] opacity-60" />
              )}
            </div>
            <div className="flex items-end gap-3 px-4 pb-4">
              <div className="-mt-8 shrink-0 rounded-[30%] bg-bg-primary p-1">
                <SpaceIcon url={icon} name={server.name} size={56} />
              </div>
              <div className="min-w-0 pb-0.5">
                <p className="truncate text-[15px] font-semibold text-text-normal">{server.name}</p>
                <p className="text-[12px] text-text-muted">
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-status-online align-middle" />
                  {shownCount} {shownCount === 1 ? "member" : "members"}
                </p>
              </div>
              <span className="ml-auto rounded-[8px] bg-status-online px-3 py-1.5 text-[12.5px] font-semibold text-white">Join</span>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Space icon" description="Square images work best. At least 512 × 512.">
        <div className="flex items-center gap-4 px-5 py-4">
          <div className={busy === "icon" ? "animate-pulse" : ""}>
            <SpaceIcon url={icon} name={server.name} size={72} />
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <FilePickButton accept={IMAGE_TYPES} disabled={!isOwner || busy !== null} onPick={(f) => void setImage("icon", f)}>
              <IconUpload size={15} /> {busy === "icon" ? "Uploading…" : icon ? "Change icon" : "Upload icon"}
            </FilePickButton>
            {icon && (
              <button
                type="button"
                aria-label="Remove icon"
                title="Remove icon"
                disabled={!isOwner || busy !== null}
                onClick={() => void setImage("icon", null)}
                className={iconBtnDanger}
              >
                <IconTrash size={16} />
              </button>
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Banner" description="Wide images work best, around 960 × 540. Shown on invites and in Discover.">
        <div className="space-y-3 px-5 py-4">
          <div className={`relative aspect-[16/6] overflow-hidden rounded-[12px] border border-divider bg-bg-accent ${busy === "banner" ? "animate-pulse" : ""}`}>
            {banner ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner} alt="" className="view-enter h-full w-full object-cover" key={banner} />
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-text-muted">No banner yet</div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilePickButton accept={IMAGE_TYPES} disabled={!isOwner || busy !== null} onPick={(f) => void setImage("banner", f)}>
              <IconUpload size={15} /> {busy === "banner" ? "Uploading…" : banner ? "Change banner" : "Upload banner"}
            </FilePickButton>
            {banner && (
              <button
                type="button"
                disabled={!isOwner || busy !== null}
                onClick={() => void setImage("banner", null)}
                className={btn.ghost}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </SettingsSection>

      <InlineError>{error}</InlineError>
    </div>
  );
}

export function SpaceIcon({ url, name, size }: { url: string | null; name: string; size: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" key={url} className="view-enter rounded-[30%] object-cover" style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-[30%] bg-brand font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.3 }}
    >
      {serverInitials(name)}
    </span>
  );
}
