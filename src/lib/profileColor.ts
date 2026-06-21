import type { CSSProperties } from "react";

export const DEFAULT_ACCENT = "#5865f2";

export interface ProfileAccentFields {
  accent_color?: string | null;
  accent_color_2?: string | null;
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
  return profile.accent_color!;
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

export function getAccentBackground(profile: ProfileAccentFields): string {
  if (!usesCustomAccent(profile)) return DEFAULT_ACCENT;
  const c1 = profile.accent_color!;
  const c2 = profile.accent_color_2!;
  if (!isProfileGradient(profile)) return c1;
  return `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
}

export function getAvatarStyle(profile: ProfileAccentFields): CSSProperties {
  const bg = getAccentBackground(profile);
  const sample = isProfileGradient(profile)
    ? mixHex(profile.accent_color!, profile.accent_color_2!, 0.5)
    : usesCustomAccent(profile)
      ? profile.accent_color!
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
      backgroundImage: `linear-gradient(135deg, ${profile.accent_color} 0%, ${profile.accent_color_2} 100%)`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
    };
  }
  const solid = profile.accent_color!;
  const color = onDarkBackground && relativeLuminance(solid) < 0.45 ? lightenHex(solid) : solid;
  return { color };
}

export function getUsernameColor(profile: ProfileAccentFields, onDarkBackground = true): string | undefined {
  const style = getUsernameStyle(profile, onDarkBackground);
  return typeof style.color === "string" ? style.color : undefined;
}
