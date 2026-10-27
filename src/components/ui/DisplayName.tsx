"use client";

import { displayName } from "@/lib/utils";
import { effectClass, shopItem } from "@/lib/shop";
import { NAME_FONT_CLASS, type NameFontId } from "@/lib/nameFonts";

interface DisplayNameProps {
  profile: {
    display_name?: string | null;
    username?: string | null;
    equipped_name_effect?: string | null;
    name_font?: string | null;
    name_color?: string | null;
    name_color_2?: string | null;
    name_gradient_dir?: string | null;
  };
  className?: string;
}

/**
 * Someone's name with whatever name effect they are wearing.
 *
 * Use this anywhere a name is rendered, so a purchased effect appears in the
 * member list and the chat log rather than only on the profile card.
 */
export function DisplayName({ profile, className = "" }: DisplayNameProps) {
  const name = displayName(profile);
  const item = shopItem(profile.equipped_name_effect);
  const fontClass = NAME_FONT_CLASS[(profile.name_font as NameFontId) ?? "default"] ?? "";
  const startColor = profile.name_color || (profile.name_color_2 ? "#ffffff" : null);
  const hasGradient = Boolean(startColor && profile.name_color_2);
  const angle = profile.name_gradient_dir || "135deg";
  const colorStyle = hasGradient
    ? {
        backgroundImage: `linear-gradient(${angle}, ${startColor}, ${profile.name_color_2})`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      }
    : startColor
      ? { color: startColor }
      : undefined;

  if (!item) {
    return (
      <span className={`${fontClass} ${className}`} style={colorStyle}>
        {name}
      </span>
    );
  }

  const fx = effectClass(profile.equipped_name_effect);

  // Wave animates each letter in turn, so it needs the name split up and an
  // index per span. Everything else paints the whole string at once.
  if (item.id === "name-wave") {
    return (
      <span className={`fx-name ${fx} ${fontClass} ${className}`} style={colorStyle} aria-label={name}>
        {Array.from(name).map((ch, i) => (
          <span key={`${ch}-${i}`} style={{ ["--fx-i" as string]: i }} aria-hidden>
            {ch === " " ? " " : ch}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className={`fx-name ${fx} ${fontClass} ${className}`} style={colorStyle}>
      {name}
    </span>
  );
}
