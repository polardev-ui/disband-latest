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

const matcha = localFont({ src: "../fonts/Matcha.otf", display: "swap" });
const gothic = localFont({ src: "../fonts/Gothic.otf", display: "swap" });
const future = localFont({ src: "../fonts/Future.otf", display: "swap" });
const spooky = localFont({ src: "../fonts/Spooky.otf", display: "swap" });
const pixels = localFont({ src: "../fonts/Pixels.ttf", display: "swap" });
const brutal = localFont({ src: "../fonts/Brutal.ttf", display: "swap" });
const graffiti = localFont({ src: "../fonts/Graffiti.otf", display: "swap" });
const dunker = localFont({ src: "../fonts/Dunker.otf", display: "swap" });
const sharp = localFont({ src: "../fonts/Sharp.otf", display: "swap" });

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
