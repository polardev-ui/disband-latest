import Image from "next/image";

interface LogoProps {
  size?: number;
  className?: string;
  alt?: string;
  priority?: boolean;

  adaptive?: boolean;
}

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
