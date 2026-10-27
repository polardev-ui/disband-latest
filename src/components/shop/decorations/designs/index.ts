import type { DesignSpec } from "../Decoration";
import { angelic } from "./angelic";
import { devilsDemise } from "./devilsDemise";
import { graphite } from "./graphite";
import { loveYouForever } from "./loveYouForever";
import { onGuard } from "./onGuard";
import { roundTheWorld } from "./roundTheWorld";
import { treatNoTrick } from "./treatNoTrick";

export type DecorationDesign =
  | "graphite"
  | "round-the-world"
  | "angelic"
  | "treat-no-trick"
  | "devils-demise"
  | "love-you-forever"
  | "on-guard";

export const DESIGNS: Record<DecorationDesign, DesignSpec> = {
  graphite,
  "round-the-world": roundTheWorld,
  angelic,
  "treat-no-trick": treatNoTrick,
  "devils-demise": devilsDemise,
  "love-you-forever": loveYouForever,
  "on-guard": onGuard,
};
