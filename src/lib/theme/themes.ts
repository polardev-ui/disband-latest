/**
 * Theme registry for Disband.
 * Each entry maps to a `[data-theme="id"]` block in globals.css.
 */
export type ThemeId = "light" | "dark" | "midnight" | "sunset";

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  description: string;
  /** Preview swatches: [tertiary, secondary, primary canvas, brand]. */
  swatch: [string, string, string, string];
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
];

export const DEFAULT_THEME: ThemeId = "dark";

export const THEME_IDS = THEMES.map((t) => t.id);

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return !!value && (THEME_IDS as string[]).includes(value);
}
