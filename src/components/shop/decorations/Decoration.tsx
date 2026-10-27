"use client";

import { useContext, useId, useRef, type CSSProperties, type ReactNode } from "react";
import {
  DecorationLabContext,
  useDecorationHover,
  useDecorationRunning,
  useHoverCycle,
  type HoverPhase,
} from "./useDecorationMotion";
import { DESIGNS, type DecorationDesign } from "./designs";
import "./decorations.css";

/** What every design's layers are drawn with. */
export interface DecorationLayerProps {
  /** Prefix for gradient and filter ids; unique per mounted avatar. */
  uid: string;
  phase: HoverPhase;
  /** Increments each time the hover performance starts. Key animated groups on it. */
  cycle: number;
  hovering: boolean;
}

export interface DesignSpec {
  /** Length of one hover performance, in ms at 1x. */
  cycleMs: number;
  /** Pause before replaying while still hovered; null plays once per hover. */
  gapMs: number | null;
  /** Drawn behind the photo: the far side of a halo, a road's shadow. */
  back?: (p: DecorationLayerProps) => ReactNode;
  front: (p: DecorationLayerProps) => ReactNode;
}

/*
 Every design draws on the same 200 × 200 canvas: the avatar is the circle of
 radius 50 at (100, 100), so the canvas is twice the avatar's diameter and is
 centred on it. Pieces can reach 50 units past the photo on every side.

 Two layers mount as siblings inside the avatar wrapper: `back` at z-index -1
 (the wrapper isolates, so that lands between its background and the photo)
 and `front` at 2, over the photo. A halo can therefore pass behind the head
 and come round in front of it.
*/
const LAYER_STYLE: CSSProperties = {
  position: "absolute",
  width: "200%",
  height: "200%",
  left: "-50%",
  top: "-50%",
  pointerEvents: "none",
};

export function Decoration({ design, playing = true }: { design: DecorationDesign; playing?: boolean }) {
  const spec = DESIGNS[design];
  const anchor = useRef<HTMLSpanElement>(null);
  const uid = `dx${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const lab = useContext(DecorationLabContext);
  const hovered = useDecorationHover(anchor);
  const { running, motionAllowed } = useDecorationRunning(anchor, playing);
  const { phase, cycle, hovering } = useHoverCycle({
    hovered,
    enabled: motionAllowed,
    cycleMs: spec.cycleMs,
    gapMs: spec.gapMs,
  });

  const props: DecorationLayerProps = { uid, phase, cycle, hovering };
  const svgAttrs = {
    viewBox: "0 0 200 200",
    className: `deco deco-${design}`,
    "data-running": running,
    "data-phase": phase,
    "data-hover": hovering,
    "aria-hidden": true,
    focusable: false,
  } as const;
  const vars = { "--deco-slow": lab?.slow ?? 1 } as CSSProperties;

  return (
    <>
      {spec.back && (
        <span className="deco-layer deco-back" style={{ ...LAYER_STYLE, ...vars, zIndex: -1 }} aria-hidden>
          <svg {...svgAttrs}>{spec.back(props)}</svg>
        </span>
      )}
      <span ref={anchor} className="deco-layer deco-front" style={{ ...LAYER_STYLE, ...vars, zIndex: 2 }} aria-hidden>
        <svg {...svgAttrs}>{spec.front(props)}</svg>
      </span>
    </>
  );
}
