import type { ReactNode } from "react";
import type { SkinProps } from "../Skin";
import { Afterglow } from "./afterglow";
import { DeepEnd } from "./deepEnd";
import { EventHorizon } from "./eventHorizon";
import { NightBloom } from "./nightBloom";
import { Snowbound } from "./snowbound";
import { SugarRush } from "./sugarRush";

export type SkinDesign = "night-bloom" | "snowbound" | "event-horizon" | "sugar-rush" | "deep-end" | "afterglow";

export const SKINS: Record<SkinDesign, (props: SkinProps) => ReactNode> = {
  "night-bloom": NightBloom,
  snowbound: Snowbound,
  "event-horizon": EventHorizon,
  "sugar-rush": SugarRush,
  "deep-end": DeepEnd,
  afterglow: Afterglow,
};
