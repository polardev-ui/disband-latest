/** Shopping cart — the Shop's icon in the DM sidebar and wherever the Shop opens from. */
export function CartIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M2.5 3a1 1 0 0 0 0 2h1.27l2.4 10.08A2.5 2.5 0 0 0 8.6 17h8.9a2.5 2.5 0 0 0 2.43-1.92l1.5-6.33A1.5 1.5 0 0 0 19.97 7H6.2l-.56-2.37A2.1 2.1 0 0 0 3.6 3H2.5Zm5.6 11.62L6.68 9h12.66l-1.36 5.62a.5.5 0 0 1-.49.38H8.6a.5.5 0 0 1-.49-.38ZM9 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
      />
    </svg>
  );
}
