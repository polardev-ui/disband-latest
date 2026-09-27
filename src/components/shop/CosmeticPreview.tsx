"use client";

import { AvatarDecoration } from "./AvatarDecoration";
import { ProfileOverlay } from "./ProfileOverlay";
import { effectClass } from "@/lib/shop";
import { safeImageUrl } from "@/lib/safe-url";

export type PreviewSelf = { name: string; avatarUrl?: string | null };

export function CosmeticAvatar({ ringId, self, size = 88, playing = true }: {
  ringId?: string | null; self: PreviewSelf; size?: number; playing?: boolean;
}) {
  const avatar = safeImageUrl(self.avatarUrl);
  return <span className={`fx-ring cosmetic-avatar ${effectClass(ringId)}`} style={{ width: size, height: size }}>
    <span className="cosmetic-avatar-face" style={{ fontSize: size * .32 }}>
      {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : (self.name.trim().charAt(0) || "P").toUpperCase()}
    </span>
    <AvatarDecoration itemId={ringId} playing={playing} />
  </span>;
}

/** Shared by the public gallery and checkout storefront, using the live renderers. */
export function CosmeticProfile({ ringId, overlayId, self, playing = true, light = false, compact = false }: {
  ringId?: string | null; overlayId?: string | null; self: PreviewSelf;
  playing?: boolean; light?: boolean; compact?: boolean;
}) {
  return <div className={`cosmetic-profile fx-overlay-host ${light ? "cosmetic-profile-light" : ""} ${compact ? "cosmetic-profile-compact" : ""}`}>
    <div className="cosmetic-profile-banner" />
    <ProfileOverlay itemId={overlayId} playing={playing} />
    <div className="cosmetic-profile-content">
      <CosmeticAvatar ringId={ringId} self={self} size={compact ? 56 : 82} playing={playing} />
      <h3>{self.name.trim() || "Your name"}</h3>
      <p className="cosmetic-handle">@{(self.name.trim() || "you").toLowerCase().replace(/\s+/g, "_")}</p>
      <div className="cosmetic-profile-divider" />
      <p className="cosmetic-profile-label">A little about me</p>
      <p className="cosmetic-bio">Good music. Late nights.<br />Making this little corner mine.</p>
      {!compact && <div className="cosmetic-interest"><span>Music</span><span>Design</span><span>Night owl</span></div>}
      <div className="cosmetic-profile-footer"><span className="cosmetic-online" /> Around for a chat</div>
    </div>
  </div>;
}
