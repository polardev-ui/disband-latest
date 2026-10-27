import localFont from "next/font/local";

export type NameFontId = "default" | "matcha" | "gothic" | "future" | "spooky" | "pixels";

export const NAME_FONT_OPTIONS: { id: NameFontId; label: string; beta: boolean; limited?: boolean }[] = [
  { id: "default", label: "Default", beta: false },
  { id: "matcha", label: "Matcha", beta: true },
  { id: "gothic", label: "Gothic", beta: true },
  { id: "future", label: "Future", beta: true },
  { id: "spooky", label: "Spooky", beta: true, limited: true },
  { id: "pixels", label: "Pixels", beta: true },
];

const matcha = localFont({ src: "../fonts/Matcha.otf", display: "swap" });
const gothic = localFont({ src: "../fonts/Gothic.otf", display: "swap" });
const future = localFont({ src: "../fonts/Future.otf", display: "swap" });
const spooky = localFont({ src: "../fonts/Spooky.otf", display: "swap" });
const pixels = localFont({ src: "../fonts/Pixels.ttf", display: "swap" });

export const NAME_FONT_CLASS: Record<NameFontId, string> = {
  default: "",
  matcha: matcha.className,
  gothic: gothic.className,
  future: future.className,
  spooky: spooky.className,
  pixels: pixels.className,
};

export function isNameFontAvailable(id: NameFontId): boolean {
  if (id === "spooky") {
    // Limited-time Halloween font.
    const month = new Date().getMonth(); // 0-based; October is 9
    return month === 9;
  }
  return true;
}
