import localFont from "next/font/local";

export type NameFontId = "default" | "matcha" | "gothic" | "future" | "spooky" | "pixels" | "brutal" | "graffiti" | "dunker" | "sharp";

export const NAME_FONT_OPTIONS: { id: NameFontId; label: string; beta: boolean; limited?: boolean }[] = [
  { id: "default", label: "Default", beta: false },
  { id: "matcha", label: "Matcha", beta: true },
  { id: "gothic", label: "Gothic", beta: true },
  { id: "future", label: "Future", beta: true },
  { id: "spooky", label: "Spooky", beta: true, limited: true },
  { id: "pixels", label: "Pixels", beta: true },
  { id: "brutal", label: "Brutal", beta: true },
  { id: "graffiti", label: "Graffiti", beta: true },
  { id: "dunker", label: "Dunker", beta: true },
  { id: "sharp", label: "Sharp", beta: true },
];

// Not preloaded: each font downloads only when a name on screen uses it.
// Preloading all nine put ~270 KB of fonts in front of the app on every load.
const matcha = localFont({ src: "../fonts/Matcha.otf", display: "swap", preload: false });
const gothic = localFont({ src: "../fonts/Gothic.otf", display: "swap", preload: false });
const future = localFont({ src: "../fonts/Future.otf", display: "swap", preload: false });
const spooky = localFont({ src: "../fonts/Spooky.otf", display: "swap", preload: false });
const pixels = localFont({ src: "../fonts/Pixels.ttf", display: "swap", preload: false });
const brutal = localFont({ src: "../fonts/Brutal.ttf", display: "swap", preload: false });
const graffiti = localFont({ src: "../fonts/Graffiti.otf", display: "swap", preload: false });
const dunker = localFont({ src: "../fonts/Dunker.otf", display: "swap", preload: false });
const sharp = localFont({ src: "../fonts/Sharp.otf", display: "swap", preload: false });

export const NAME_FONT_CLASS: Record<NameFontId, string> = {
  default: "",
  matcha: matcha.className,
  gothic: gothic.className,
  future: future.className,
  spooky: spooky.className,
  pixels: pixels.className,
  brutal: brutal.className,
  graffiti: graffiti.className,
  dunker: dunker.className,
  sharp: sharp.className,
};

export function isNameFontAvailable(id: NameFontId): boolean {
  if (id === "spooky") {
    // Limited-time Halloween font.
    const month = new Date().getMonth(); // 0-based; October is 9
    return month === 9;
  }
  return true;
}
