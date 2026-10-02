"use client";

import type { CSSProperties } from "react";
import { useCosmeticMotion } from "./useCosmeticMotion";
import type { FlightDesign } from "@/lib/shop";
import "./flight-cosmetics.css";

/** Four illustrated sprites share one cached atlas. Only articulated parts move. */
export function FlightCosmetic({ design, profile = false, playing = true }: {
  design: FlightDesign; profile?: boolean; playing?: boolean;
}) {
  const { ref, running } = useCosmeticMotion(playing);
  return <span ref={ref} aria-hidden="true"
    className={`flight-art flight-${design} ${profile ? "flight-profile" : "flight-avatar"}`}
    data-running={running}
    style={{ "--flight-atlas": `url("/shop/art/flight/${design}.webp")` } as CSSProperties}>
    <span className="flight-wing flight-wing-left"><span className="flight-sprite flight-sprite-left" /></span>
    <span className="flight-wing flight-wing-right"><span className="flight-sprite flight-sprite-right" /></span>
    {!profile && <span className="flight-frame flight-sprite flight-sprite-frame" />}
    <span className="flight-pendant"><span className="flight-sprite flight-sprite-charm" /></span>
    {profile && <span className="flight-pendant flight-pendant-second"><span className="flight-sprite flight-sprite-charm" /></span>}
    <span className="flight-accents">
      {Array.from({ length: profile ? 9 : 4 }, (_, i) => <i key={i} style={{
        "--i": i, left: `${profile ? 5 + (i * 37) % 90 : [12, 85, 28, 72][i]}%`,
        top: `${profile ? 12 + (i * 19) % 78 : [23, 27, 84, 89][i]}%`,
      } as CSSProperties} />)}
    </span>
  </span>;
}
