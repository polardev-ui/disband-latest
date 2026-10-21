import type { CSSProperties } from "react";

export const DEFAULT_ACCENT = "#7a7d85";

export interface ProfileAccentFields {
  accent_color?: string | null;
  accent_color_2?: string | null;
}

export interface RoleGradientFields {
  color: string;
  gradient_to?: string | null;
  gradient_animated?: boolean;
}

export function roleGradientTextStyle(role: RoleGradientFields | null | undefined): CSSProperties | undefined {
  if (!role?.gradient_to?.trim()) return undefined;
  return {
    backgroundImage: `linear-gradient(90deg, ${role.color}, ${role.gradient_to.trim()})`,
    backgroundSize: role.gradient_animated ? "200% 100%" : undefined,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
}

export function roleIsGradientAnimated(role: RoleGradientFields | null | undefined): boolean {
  return !!role?.gradient_to?.trim() && !!role.gradient_animated;
}

export function normalizeHex(color: string): string {
  const c = color.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(c)) {
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }
  return c;
}

export function usesCustomAccent(profile: ProfileAccentFields): boolean {
  return !!(profile.accent_color && profile.accent_color_2);
}

const HEX_COLOR = /^#[0-9a-f]{6}$/;

export function sanitizeHex(color: string | null | undefined, fallback = DEFAULT_ACCENT): string {
  if (!color) return fallback;
  const n = normalizeHex(color);
  return HEX_COLOR.test(n) ? n : fallback;
}

export function isProfileGradient(profile: ProfileAccentFields): boolean {
  if (!usesCustomAccent(profile)) return false;
  return normalizeHex(profile.accent_color!) !== normalizeHex(profile.accent_color_2!);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex);
  if (!/^#[0-9a-f]{6}$/.test(n)) return null;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channels = [rgb.r, rgb.g, rgb.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrastTextColor(hex: string): "#ffffff" | "#060607" {
  return relativeLuminance(hex) > 0.45 ? "#060607" : "#ffffff";
}

function mixHex(a: string, b: string, weightB = 0.5): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a;
  const w = Math.min(1, Math.max(0, weightB));
  const mix = (x: number, y: number) => Math.round(x * (1 - w) + y * w);
  const r = mix(ca.r, cb.r);
  const g = mix(ca.g, cb.g);
  const bl = mix(ca.b, cb.b);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(17, 18, 20, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Profile themes are always painted on a dark base. Mixing the chosen colour
 * into that base keeps white text readable even when someone picks white,
 * yellow or another very light colour for their profile. A plain overlay
 * would leave those profiles washed out and the text unreadable.
 */
const PROFILE_CARD_BASE = "#111214";

function profileTone(color: string, weight: number): string {
  let w = weight;
  let tone = mixHex(PROFILE_CARD_BASE, color, w);
  while (w > 0.18 && relativeLuminance(tone) > 0.1) {
    w -= 0.025;
    tone = mixHex(PROFILE_CARD_BASE, color, w);
  }
  return tone;
}

export interface ProfileCardTheme {
  /** Background and text tokens for a profile painted in the user's colours. */
  style: CSSProperties;
  /** Tints a banner image so the theme runs from the banner into the card. */
  bannerTint: string;
  /** The surface colour behind the overlapping avatar and status dot. */
  avatarRing: string;
  /** Solid accent for the profile's primary action. */
  primary: string;
  primaryText: "#ffffff" | "#060607";
}

function lightenHex(hex: string, targetLuminance = 0.55): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  let { r, g, b } = rgb;
  for (let i = 0; i < 12 && relativeLuminance(`#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`) < targetLuminance; i++) {
    r = Math.min(255, r + 18);
    g = Math.min(255, g + 18);
    b = Math.min(255, b + 18);
  }
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function getAccentSampleColor(profile: ProfileAccentFields): string {
  if (!usesCustomAccent(profile)) return DEFAULT_ACCENT;
  if (isProfileGradient(profile)) return mixHex(profile.accent_color!, profile.accent_color_2!, 0.5);
  return sanitizeHex(profile.accent_color);
}

export function getProfilePanelStyle(profile: ProfileAccentFields): CSSProperties {
  const sample = getAccentSampleColor(profile);
  return {
    background: getAccentBackground(profile),
    color: contrastTextColor(sample),
  };
}

export function getProfilePanelMutedColor(profile: ProfileAccentFields): string {
  const sample = getAccentSampleColor(profile);
  return contrastTextColor(sample) === "#ffffff" ? "rgba(255,255,255,0.72)" : "rgba(6,6,7,0.62)";
}

/**
 * The Discord-style profile theme: the two accent colours are mixed into a
 * dark base, then blended through a soft diagonal gradient with a gentle
 * colour bloom at each end. The result is matte rather than glossy, and it
 * works for a single colour too — the same colour gets a top-to-bottom depth
 * instead of a flat fill.
 *
 * Returns null for profiles that still use the default style so those keep
 * the app's ordinary card surface.
 */
export function getProfileCardTheme(profile: ProfileAccentFields): ProfileCardTheme | null {
  if (!usesCustomAccent(profile)) return null;

  const c1 = sanitizeHex(profile.accent_color);
  const c2 = sanitizeHex(profile.accent_color_2);
  const top = profileTone(c1, 0.38);
  const bottom = profileTone(c2, 0.34);
  const middle = mixHex(top, bottom, 0.52);

  return {
    style: {
      background: [
        `radial-gradient(120% 85% at 8% 0%, ${rgba(c1, 0.12)} 0%, transparent 58%)`,
        `radial-gradient(115% 95% at 94% 104%, ${rgba(c2, 0.14)} 0%, transparent 62%)`,
        `linear-gradient(160deg, ${top} 0%, ${middle} 54%, ${bottom} 100%)`,
      ].join(", "),
      color: "#ffffff",
      textShadow: "0 1px 2px rgba(0,0,0,0.28)",
      // Scope the profile's text and surface tokens to the themed card. This
      // keeps the card readable in the light theme too, where the ordinary
      // header and muted tokens are dark.
      "--header-primary": "#ffffff",
      "--header-secondary": "#e3e5e8",
      "--text-normal": "#f2f3f5",
      "--text-muted": "#cdd1d6",
      "--text-link": "#9ecbff",
      "--interactive-normal": "#d7dade",
      "--interactive-active": "#ffffff",
      "--channels-default": "#cdd1d6",
      "--divider": "rgba(255,255,255,0.16)",
      "--bg-floating": "rgba(17,18,20,0.82)",
      "--overlay-surface": "rgba(17,18,20,0.86)",
      "--overlay-panel": "rgba(17,18,20,0.86)",
      "--bg-accent": "rgba(17,18,20,0.28)",
      "--bg-tertiary": "rgba(17,18,20,0.32)",
      "--bg-secondary": "rgba(17,18,20,0.24)",
      "--interactive-hover": "rgba(255,255,255,0.08)",
      "--interactive-selected": "rgba(255,255,255,0.12)",
    } as CSSProperties,
    bannerTint: `linear-gradient(180deg, ${rgba(c1, 0.48)} 0%, ${rgba(c1, 0.2)} 38%, ${rgba(top, 0.36)} 72%, ${top} 100%)`,
    avatarRing: top,
    primary: c1,
    primaryText: contrastTextColor(c1),
  };
}

export function getAccentBackground(profile: ProfileAccentFields): string {
  if (!usesCustomAccent(profile)) return DEFAULT_ACCENT;
  const c1 = sanitizeHex(profile.accent_color);
  const c2 = sanitizeHex(profile.accent_color_2);
  if (!isProfileGradient(profile)) return c1;
  return `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
}

export function getAvatarStyle(profile: ProfileAccentFields): CSSProperties {
  const bg = getAccentBackground(profile);
  const sample = isProfileGradient(profile)
    ? mixHex(profile.accent_color!, profile.accent_color_2!, 0.5)
    : usesCustomAccent(profile)
      ? sanitizeHex(profile.accent_color)
      : DEFAULT_ACCENT;
  return {
    background: bg,
    color: contrastTextColor(sample),
  };
}

export function getUsernameStyle(profile: ProfileAccentFields, onDarkBackground = true): CSSProperties {
  if (!usesCustomAccent(profile)) {
    return { color: DEFAULT_ACCENT };
  }
  if (isProfileGradient(profile)) {
    return {
      backgroundImage: `linear-gradient(135deg, ${sanitizeHex(profile.accent_color)} 0%, ${sanitizeHex(profile.accent_color_2)} 100%)`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
    };
  }
  const solid = sanitizeHex(profile.accent_color);
  const color = onDarkBackground && relativeLuminance(solid) < 0.45 ? lightenHex(solid) : solid;
  return { color };
}
