"use client";

import { useState } from "react";

interface TooltipProps {
  label: string;
  children: React.ReactNode;
  side?: "right" | "left" | "top";
}

export function Tooltip({ label, children, side = "right" }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  const position =
    side === "right"
      ? "left-full top-1/2 ml-3 -translate-y-1/2"
      : side === "left"
        ? "right-full top-1/2 mr-3 -translate-y-1/2"
        : "bottom-full left-1/2 mb-2 -translate-x-1/2";

  return (
    <div
      className="relative flex items-center justify-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={`tooltip-content pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-[#111214] px-3 py-1.5 text-sm font-semibold text-white shadow-lg ${position}`}
        >
          {label}
          {side === "right" && (
            <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#111214]" />
          )}
        </div>
      )}
    </div>
  );
}
