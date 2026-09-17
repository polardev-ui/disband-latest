
export type ThemeId = "light" | "dark" | "midnight" | "sunset" | "ocean" | "rose-gold" | "plasma" | "nord" | "graphite" | "forest" | "cobalt" | "ember" | "parchment" | "porcelain" | "orchid" | "copper";

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  mode?: "light" | "dark";
  description: string;

  swatch: [string, string, string, string];

  plan?: "aero";
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
    mode: "light",
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
    description: "Cool blues, teal accent (Aero)",
    swatch: ["#0d1b2a", "#1b2838", "#1b2a3a", "#2dd4bf"],
    plan: "aero",
  },
  {
    id: "rose-gold",
    label: "Rose Gold",
    description: "Elegant rose tones, gold accent (Aero)",
    swatch: ["#1c1415", "#2c1d1f", "#332224", "#f5a0b8"],
    plan: "aero",
  },
  {
    id: "plasma",
    label: "Plasma",
    description: "Deep purple with vibrant magenta (Aero)",
    swatch: ["#0e0a16", "#1a0f2e", "#1f1137", "#c77dff"],
    plan: "aero",
  },
  {
    id: "nord",
    label: "Nord",
    description: "Arctic blues, frost accent (Aero)",
    swatch: ["#2e3440", "#3b4252", "#434c5e", "#88c0d0"],
    plan: "aero",
  },
  {id:"graphite",label:"Graphite",description:"A quiet charcoal workspace with warm silver accents.",mode:"dark",swatch:["#0d0e0f","#18191b","#222426","#bec3c9"]},
  {id:"forest",label:"Forest",description:"Pine surfaces and a fresh fern accent.",mode:"dark",swatch:["#0c1713","#13251d","#1c3026","#85c59f"]},
  {id:"cobalt",label:"Cobalt",description:"Deep ink with crisp electric blue details.",mode:"dark",swatch:["#0a1125","#111d37","#182647","#8caeff"]},
  {id:"ember",label:"Ember",description:"Charred brown, terracotta, and warm cream.",mode:"dark",swatch:["#1b100d","#2a1a14","#35241c","#eca580"]},
  {id:"parchment",label:"Parchment",description:"Warm paper, sepia ink, and library green.",mode:"light",swatch:["#ded6c6","#eee8dc","#faf5e9","#35664f"]},
  {id:"porcelain",label:"Porcelain",description:"Cool white surfaces with a precise blue accent.",mode:"light",swatch:["#dce5ed","#ecf1f7","#fafcfe","#295e9e"]},
  {id:"orchid",label:"Orchid",description:"Muted plum with lavender highlights.",mode:"dark",swatch:["#1c1421","#2a1e32","#36263f","#d4afe9"]},
  {id:"copper",label:"Copper",description:"Slate blue with burnished copper details.",mode:"dark",swatch:["#11191d","#1d2a31","#26363f","#e6b28b"]},
];

export const DEFAULT_THEME: ThemeId = "dark";

export const THEME_IDS = THEMES.map((t) => t.id);

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return !!value && (THEME_IDS as string[]).includes(value);
}

export function themeColorScheme(id:ThemeId){return THEMES.find(t=>t.id===id)?.mode ?? "dark";}
