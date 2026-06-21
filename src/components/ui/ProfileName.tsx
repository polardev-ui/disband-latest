"use client";

import type { CSSProperties, ElementType } from "react";
import { getUsernameStyle, type ProfileAccentFields } from "@/lib/profileColor";

interface ProfileNameProps {
  profile: ProfileAccentFields;
  className?: string;
  style?: CSSProperties;
  as?: ElementType;
  onDarkBackground?: boolean;
  colorOverride?: string | null;
}

export function ProfileName({
  profile,
  className = "",
  style,
  as: Tag = "span",
  onDarkBackground = true,
  colorOverride,
}: ProfileNameProps) {
  const accentStyle = colorOverride ? { color: colorOverride } : getUsernameStyle(profile, onDarkBackground);
  return <Tag className={className} style={{ ...accentStyle, ...style }} />;
}
