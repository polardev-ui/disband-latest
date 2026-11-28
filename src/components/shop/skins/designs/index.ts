import type { ReactNode } from "react";
import type { SkinProps } from "../Skin";
import { Afterglow } from "./afterglow";
import { CatEars } from "./catEars";
import { DeepEnd } from "./deepEnd";
import { EventHorizon } from "./eventHorizon";
import { MidnightExpress } from "./midnightExpress";
import { GlassGarden } from "./glassGarden";
import { Stormwatch } from "./stormwatch";
import { AstralArchive } from "./astralArchive";
import { Emberfall } from "./emberfall";
import { NightBloom } from "./nightBloom";
import { Snowbound } from "./snowbound";
import { SugarRush } from "./sugarRush";

export type SkinDesign =
  | "night-bloom"
  | "snowbound"
  | "event-horizon"
  | "sugar-rush"
  | "deep-end"
  | "afterglow"
  | "cat-ears"
  // Scene skins, December 2026: whole environments, not edge pieces.
  | "midnight-express"
  | "glass-garden"
  | "stormwatch"
  | "astral-archive"
  | "emberfall";

export const SKINS: Record<SkinDesign, (props: SkinProps) => ReactNode> = {
  "night-bloom": NightBloom,
  snowbound: Snowbound,
  "event-horizon": EventHorizon,
  "sugar-rush": SugarRush,
  "deep-end": DeepEnd,
  afterglow: Afterglow,
  "cat-ears": CatEars,
  "midnight-express": MidnightExpress,
  "glass-garden": GlassGarden,
  stormwatch: Stormwatch,
  "astral-archive": AstralArchive,
  emberfall: Emberfall,
};

/**
 * Skins that paint the whole card (a scene, not pieces at its edges). The
 * card's text tokens switch to the dark-card set under them (scene.css), so
 * they read the same in every app theme.
 */
export const SCENE_SKINS: ReadonlySet<SkinDesign> = new Set<SkinDesign>(["midnight-express", "glass-garden", "stormwatch", "astral-archive", "emberfall"]);

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
  // The table and its lamp.
  "midnight-express": 13,
  // The planters (the tallest leaves stand at the very edges).
  "glass-garden": 20,
  // The sea, below the horizon.
  stormwatch: 22,
  // The shelf and the astrolabe.
  "astral-archive": 20,
  // The ridge and the rocks.
  emberfall: 21,
};
