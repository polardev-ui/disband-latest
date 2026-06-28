/**
 * Theme registry for Disband.
 * Each entry maps to a `[data-theme="id"]` block in globals.css.
 */
export type ThemeId = "light" | "dark" | "midnight" | "sunset" | "ocean" | "rose-gold" | "plasma" | "nord";

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  description: string;
  /** Preview swatches: [tertiary, secondary, primary canvas, brand]. */
  swatch: [string, string, string, string];
  /** Minimum plan required to use this theme (undefined = free). */
  plan?: "basic" | "super";
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "dark",
    label: "Disband Dark",
    description: "Classic Disband dark theme",
    swatch: ["#1e1f22", "#2b2d31", "#313338", "#5865f2"],
  },
  {
    id: "midnight",
    label: "AMOLED",
    description: "Pure black for OLED displays",
    swatch: ["#050506", "#0a0a0b", "#060607", "#5865f2"],
  },
  {
    id: "light",
    label: "Disband Light",
    description: "Bright and clean",
    swatch: ["#e3e5e8", "#f2f3f5", "#ffffff", "#5865f2"],
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Warm tones, pink accent",
    swatch: ["#181214", "#231c1e", "#2a2224", "#eb459e"],
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Cool blues, teal accent (Basic)",
    swatch: ["#0d1b2a", "#1b2838", "#1b2a3a", "#2dd4bf"],
    plan: "basic",
  },
  {
    id: "rose-gold",
    label: "Rose Gold",
    description: "Elegant rose tones, gold accent (Super)",
    swatch: ["#1c1415", "#2c1d1f", "#332224", "#f5a0b8"],
    plan: "super",
  },
  {
    id: "plasma",
    label: "Plasma",
    description: "Deep purple with vibrant magenta (Super)",
    swatch: ["#0e0a16", "#1a0f2e", "#1f1137", "#c77dff"],
    plan: "super",
  },
  {
    id: "nord",
    label: "Nord",
    description: "Arctic blues, frost accent (Super)",
    swatch: ["#2e3440", "#3b4252", "#434c5e", "#88c0d0"],
    plan: "super",
  },
];

export const DEFAULT_THEME: ThemeId = "dark";

export const THEME_IDS = THEMES.map((t) => t.id);

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return !!value && (THEME_IDS as string[]).includes(value);
}
