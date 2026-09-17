

export type SkinId =
  | "minecraft" | "cod" | "y2k" | "frutiger"
  | "terminal" | "vaporwave" | "paper" | "neon" | "brutalist";

export interface SkinDefinition {
  id: SkinId;
  label: string;
  description: string;

  swatch: [string, string, string, string];

  sample: {

    font: string;
    radius: string;
  };
}

export const SKINS: SkinDefinition[] = [
  {
    id: "minecraft",
    label: "Minecraft",
    description: "Pixel type, hard bevels, and not one rounded corner.",
    swatch: ["#1d1d1d", "#2f2f2f", "#3b3b3b", "#5b8c3a"],
    sample: { font: '"Disband Pixel", monospace', radius: "0px" },
  },
  {
    id: "cod",
    label: "Call of Duty",
    description: "Dusty khaki, stencilled caps, and a film grain over it all.",
    swatch: ["#121210", "#1c1b17", "#24231e", "#b4802a"],
    sample: { font: '"Disband Condensed", sans-serif', radius: "1px" },
  },
  {
    id: "y2k",
    label: "2000s",
    description: "Tahoma, beveled controls, and that Windows XP blue.",
    swatch: ["#0a246a", "#d6d2c2", "#ece9d8", "#0054e3"],
    sample: { font: "Tahoma, Verdana, sans-serif", radius: "2px" },
  },
  {
    id: "frutiger",
    label: "Frutiger Aero",
    description: "Glossy glass, blue into green, light caught on every corner.",
    swatch: ["#072433", "#0b3247", "#0e3b52", "#35c3f3"],
    sample: { font: '"Segoe UI", system-ui, sans-serif', radius: "14px" },
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Green phosphor on black, monospaced, with the scanlines.",
    swatch: ["#000200", "#050c05", "#030703", "#2fe86b"],
    sample: { font: '"SF Mono", Menlo, monospace', radius: "0px" },
  },
  {
    id: "vaporwave",
    label: "Vaporwave",
    description: "Hot pink and cyan over purple, chrome on every button.",
    swatch: ["#170733", "#220c46", "#2a1052", "#ff5ea8"],
    sample: { font: '"Segoe UI", system-ui, sans-serif', radius: "6px" },
  },
  {
    id: "paper",
    label: "Paper",
    description: "Warm off-white and a serif — reads like something printed.",
    swatch: ["#e8e0d0", "#f3ede1", "#fbf7ef", "#8a5a2b"],
    sample: { font: 'Georgia, "Iowan Old Style", serif', radius: "3px" },
  },
  {
    id: "neon",
    label: "Neon",
    description: "Near-black, with magenta and cyan bleeding off every edge.",
    swatch: ["#030308", "#0a0a14", "#07070d", "#ff2e88"],
    sample: { font: 'system-ui, sans-serif', radius: "2px" },
  },
  {
    id: "brutalist",
    label: "Brutalist",
    description: "Black on white, two-pixel borders, shadows that are solid blocks.",
    swatch: ["#000000", "#f2f2f2", "#ffffff", "#1400ff"],
    sample: { font: '"Helvetica Neue", Arial, sans-serif', radius: "0px" },
  },
];

export const SKIN_IDS = SKINS.map((s) => s.id);

export function isSkinId(value: string | null | undefined): value is SkinId {
  return !!value && (SKIN_IDS as string[]).includes(value);
}
