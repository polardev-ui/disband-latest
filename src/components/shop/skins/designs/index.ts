import type { ReactNode } from "react";
import type { SkinProps } from "../Skin";
import { Afterglow } from "./afterglow";
import { CatEars } from "./catEars";
import { DeepEnd } from "./deepEnd";
import { EventHorizon } from "./eventHorizon";
import { NightBloom } from "./nightBloom";
import { Snowbound } from "./snowbound";
import { SugarRush } from "./sugarRush";

export type SkinDesign = "night-bloom" | "snowbound" | "event-horizon" | "sugar-rush" | "deep-end" | "afterglow" | "cat-ears";

export const SKINS: Record<SkinDesign, (props: SkinProps) => ReactNode> = {
  "night-bloom": NightBloom,
  snowbound: Snowbound,
  "event-horizon": EventHorizon,
  "sugar-rush": SugarRush,
  "deep-end": DeepEnd,
  afterglow: Afterglow,
  "cat-ears": CatEars,
};

/**
 * How much room each skin's ground needs under a profile's content, as a
 * share of the card's width: the drifts and pines, the sea bed, the grid
 * floor, the pieces in the bottom corners. Profile cards keep this much clear
 * at the bottom (on top of their own bottom margin) so the scene sits below
 * the text instead of behind it.
 */
export const SKIN_FLOOR: Record<SkinDesign, number> = {
  "night-bloom": 12,
  snowbound: 22,
  "event-horizon": 11,
  "sugar-rush": 18,
  "deep-end": 19,
  afterglow: 17,
  // Nothing at the bottom: the ears and blush sit above the text.
  "cat-ears": 0,
};
