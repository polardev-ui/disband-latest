"use client";

import { isImageRoleIcon } from "@/lib/role-icons";
import { safeImageUrl } from "@/lib/safe-url";

/** A role's icon beside a name: an uploaded image or an emoji, sized to the text. */
export function RoleIcon({
  icon,
  name,
  size = 16,
  className = "",
}: {
  icon: string | null | undefined;
  name?: string;
  size?: number;
  className?: string;
}) {
  if (!icon) return null;
  const label = name ? `${name} role` : "Role icon";
  if (isImageRoleIcon(icon)) {
    const src = safeImageUrl(icon);
    if (!src) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={label}
        title={name}
        width={size}
        height={size}
        draggable={false}
        className={`inline-block shrink-0 rounded-[4px] object-contain align-[-0.15em] ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={label}
      title={name}
      className={`inline-flex shrink-0 items-center justify-center leading-none ${className}`}
      style={{ fontSize: size * 0.9, width: size, height: size }}
    >
      {icon}
    </span>
  );
}
