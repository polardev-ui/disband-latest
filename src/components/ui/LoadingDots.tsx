"use client";

/**
 * The typing-indicator dots, larger: shown on a button while the action it
 * started is still running.
 */
export function LoadingDots({ size = 7, className = "" }: { size?: number; className?: string }) {
  return (
    <span role="status" aria-label="Working" className={`inline-flex items-center gap-[5px] ${className}`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="typing-dot rounded-full bg-current" style={{ width: size, height: size }} />
      ))}
    </span>
  );
}

/** Button content that keeps the button's width while the dots show. */
export function BusyLabel({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  if (!busy) return <>{children}</>;
  return (
    <span className="relative inline-flex items-center justify-center">
      <span className="invisible">{children}</span>
      <span className="absolute inset-0 flex items-center justify-center">
        <LoadingDots />
      </span>
    </span>
  );
}

/** Greys a confirm button out while it works. */
export const BUSY_BUTTON = "!cursor-wait !bg-bg-tertiary !text-text-normal !opacity-100";
