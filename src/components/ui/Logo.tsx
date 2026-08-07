import Image from "next/image";

interface LogoProps {
  size?: number;
  className?: string;
  alt?: string;
  priority?: boolean;
  /**
   * Opt in on themed surfaces (anything using `bg-bg-*`).
   *
   * The mark is a white glyph, so it disappears on the light theme. This flags
   * it to be flattened to black there. Leave it off on the marketing pages and
   * anywhere else with a hardcoded dark background, where the white mark is
   * always correct regardless of the user's stored theme.
   */
  adaptive?: boolean;
}

/** Transparent mark for dark UI surfaces (site, auth, marketing). */
export function Logo({
  size = 32,
  className = "",
  alt = "Disband",
  priority = false,
  adaptive = false,
}: LogoProps) {
  return (
    <Image
      src="/logo.png"
      alt={alt}
      width={size}
      height={size}
      className={`${adaptive ? "logo-adaptive " : ""}${className}`}
      priority={priority}
    />
  );
}

/** Solid-background mark for favicons, app icons, and light surfaces. */
export function LogoApp({ size = 32, className = "", alt = "Disband", priority = false }: LogoProps) {
  return (
    <Image
      src="/logo-app.png"
      alt={alt}
      width={size}
      height={size}
      className={className}
      priority={priority}
    />
  );
}
