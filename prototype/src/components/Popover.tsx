import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useEscape, useOutsideClick } from "../lib/hooks";

// Fixed-position popover anchored to an element. Rendered into the design's
// root element (from PortalRoot) so it inherits that design's tokens.

export const PortalRoot = createContext<HTMLElement | null>(null);
export const usePortalRoot = () => useContext(PortalRoot);

export function Popover({
  anchor,
  container,
  onClose,
  children,
  className = "",
  align = "end",
  label,
}: {
  anchor: RefObject<HTMLElement | null>;
  container?: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  align?: "start" | "end";
  label?: string;
}) {
  const ctxRoot = usePortalRoot();
  const target = container ?? ctxRoot;
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const [side, setSide] = useState<"below" | "above">("below");

  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const el = ref.current;
    if (!a || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = a.bottom + 6 + h <= vh - 8 || a.top - 6 - h < 8;
    const top = below ? a.bottom + 6 : a.top - 6 - h;
    let left = align === "end" ? a.right - w : a.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    setSide(below ? "below" : "above");
    setStyle({ top: Math.max(8, top), left });
  }, [anchor, align]);

  useEscape(onClose);
  useOutsideClick([ref, anchor as RefObject<HTMLElement | null>], onClose);

  if (!target) return null;
  return createPortal(
    <div ref={ref} className={`pop ${className}`} data-side={side} style={style} role="dialog" aria-label={label}>
      {children}
    </div>,
    target,
  );
}
