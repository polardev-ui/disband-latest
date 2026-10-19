/** Disband's wing: one connected silhouette, with two open feather cuts. */
export function AeroIcon({ size = 24, className = "", colour = "currentColor", highlight, lite = false }: {
  size?: number; className?: string; colour?: string; highlight?: string; lite?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={`shrink-0 ${className}`}>
      <path fill={colour} d="M3 4h19c-.7 3.5-3.3 6-7 6H8v2h9c-.8 3-3.2 5-6.5 5H7v2h5c-1.3 2-3.4 3-6 3H3V4Z" />
      {!lite && <path fill={highlight ?? colour} d="M3 4h19a8.5 8.5 0 0 1-1.7 3H3V4Z" />}
    </svg>
  );
}
