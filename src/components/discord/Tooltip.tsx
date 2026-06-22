"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  label: string;
  children: React.ReactNode;
  side?: "right" | "left" | "top";
}

export function Tooltip({ label, children, side = "right" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 8;

    if (side === "top") {
      setPos({
        left: rect.left + rect.width / 2,
        top: rect.top - gap,
      });
      return;
    }

    if (side === "left") {
      setPos({
        left: rect.left - gap,
        top: rect.top + rect.height / 2,
      });
      return;
    }

    setPos({
      left: rect.right + gap,
      top: rect.top + rect.height / 2,
    });
  }, [side]);

  useEffect(() => {
    if (!visible) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [visible, updatePosition]);

  const transform =
    side === "top"
      ? "translate(-50%, -100%)"
      : side === "left"
        ? "translate(-100%, -50%)"
        : "translateY(-50%)";

  return (
    <>
      <div
        ref={triggerRef}
        className="relative flex items-center justify-center"
        onMouseEnter={() => {
          updatePosition();
          setVisible(true);
        }}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => {
          updatePosition();
          setVisible(true);
        }}
        onBlur={() => setVisible(false)}
      >
        {children}
      </div>

      {mounted && visible
        && createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[200] whitespace-nowrap rounded-md bg-[#111214] px-3 py-1.5 text-sm font-semibold text-white shadow-lg"
            style={{ top: pos.top, left: pos.left, transform }}
          >
            {label}
            {side === "right" && (
              <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#111214]" />
            )}
            {side === "left" && (
              <span className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-[#111214]" />
            )}
            {side === "top" && (
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#111214]" />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
