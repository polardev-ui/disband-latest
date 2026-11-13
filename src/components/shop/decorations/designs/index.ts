import type { DesignSpec } from "../Decoration";
import { angelic } from "./angelic";
import { catEars } from "./catEars";
import { devilsDemise } from "./devilsDemise";
import { graphite } from "./graphite";
import { loveYouForever } from "./loveYouForever";
import { onGuard } from "./onGuard";
import { onRepeat } from "./onRepeat";
import { roundTheWorld } from "./roundTheWorld";
import { slurp } from "./slurp";
import { snowedIn } from "./snowedIn";
import { spellbound } from "./spellbound";
import { sunseeker } from "./sunseeker";
import { tangledUp } from "./tangledUp";
import { treatNoTrick } from "./treatNoTrick";

export type DecorationDesign =
  | "graphite"
  | "round-the-world"
  | "angelic"
  | "treat-no-trick"
  | "devils-demise"
  | "love-you-forever"
  | "on-guard"
  | "snowed-in"
  | "on-repeat"
  | "spellbound"
  | "tangled-up"
  | "slurp"
  | "sunseeker"
  | "cat-ears";

export const DESIGNS: Record<DecorationDesign, DesignSpec> = {
  graphite,
  "round-the-world": roundTheWorld,
  angelic,
  "treat-no-trick": treatNoTrick,
  "devils-demise": devilsDemise,
  "love-you-forever": loveYouForever,
  "on-guard": onGuard,
  "snowed-in": snowedIn,
  "on-repeat": onRepeat,
  spellbound,
  "tangled-up": tangledUp,
  slurp,
  sunseeker,
  "cat-ears": catEars,
};
