"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OVERLAY_Z } from "@/lib/overlay";

interface TooltipProps {

  label: React.ReactNode;
  disabled?: boolean;
  children: React.ReactNode;
  side?: "right" | "left" | "top" | "bottom";

  as?: "div" | "span";
  /** Extra classes for the trigger wrapper (e.g. "w-full" to stretch a button). */
  className?: string;
}

export function Tooltip({ label, children, side = "right", disabled = false, as: Trigger = "div", className = "" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLElement>(null);

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

    if (side === "bottom") {
      setPos({
        left: rect.left + rect.width / 2,
        top: rect.bottom + gap,
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
      : side === "bottom"
        ? "translate(-50%, 0)"
        : side === "left"
          ? "translate(-100%, -50%)"
          : "translateY(-50%)";

  return (
    <>
      <Trigger
        ref={triggerRef as React.Ref<HTMLDivElement & HTMLSpanElement>}
        className={`relative inline-flex items-center justify-center ${className}`}
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
        onClickCapture={() => setVisible(false)}
      >
        {children}
      </Trigger>

      {mounted && visible && !disabled
        && createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed"
            style={{ top: pos.top, left: pos.left, transform, zIndex: OVERLAY_Z.tooltip }}
          >
            <div
              data-side={side}
              className="tooltip-content relative max-w-[196px] rounded-[5px] bg-bg-floating px-3 py-2 text-[14px] font-semibold leading-[18px] text-text-normal shadow-[0_8px_16px_rgba(0,0,0,0.24)]"
            >
              {label}
              {side === "right" && (
                <span className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-bg-floating" />
              )}
              {side === "left" && (
                <span className="absolute left-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-l-bg-floating" />
              )}
              {side === "top" && (
                <span className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent border-t-bg-floating" />
              )}
              {side === "bottom" && (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-b-bg-floating" />
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
