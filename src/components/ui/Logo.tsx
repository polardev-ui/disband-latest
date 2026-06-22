import Image from "next/image";

interface LogoProps {
  size?: number;
  className?: string;
  alt?: string;
  priority?: boolean;
}

/** Transparent mark for dark UI surfaces (site, auth, marketing). */
export function Logo({ size = 32, className = "", alt = "Disband", priority = false }: LogoProps) {
  return (
    <Image
      src="/logo.png"
      alt={alt}
      width={size}
      height={size}
      className={className}
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
