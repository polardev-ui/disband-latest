"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";
import { CosmeticMotionContext } from "../AnimatedCosmetic";
import { SKINS, type SkinDesign } from "./designs";
import "./skins.css";

/** What every skin is drawn with. */
export interface SkinProps {
  /** Prefix for gradient, mask and filter ids; unique per mounted card. */
  uid: string;
}

/*
 A profile skin: drawn artwork around a profile card of any size.

 Cards range from the gallery's 180-wide tiles to the 600-wide profile
 modal, so nothing is drawn on one fixed canvas. Each skin is a set of
 pieces pinned to the card's edges and corners (sized as a share of the
 card's width, so they keep their proportions), plus particles that travel
 the whole card. Particles are HTML wrappers moved with transforms, which the
 compositor can run on its own; the pieces' SVG only animates small parts.

 Each skin opens with a short intro the first time it is seen, then loops.
 It pauses (keeping its place) off screen and in a hidden tab, and holds its
 final pose when the surface turns cosmetics off or motion is reduced.
*/
export function Skin({ design, playing = true }: { design: SkinDesign; playing?: boolean }) {
  const contextPlaying = useContext(CosmeticMotionContext);
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const update = () => setShown(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const still = !playing || !contextPlaying;
  const uid = `sk${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const Design = SKINS[design];
  return (
    <span ref={ref} className={`skin skin-${design}`} data-still={still} data-running={!still && visible && shown} aria-hidden="true">
      <Design uid={uid} />
    </span>
  );
}
