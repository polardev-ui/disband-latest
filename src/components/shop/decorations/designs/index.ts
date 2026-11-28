import type { DesignSpec } from "../Decoration";
import { angelic } from "./angelic";
import { circuitBloom } from "./circuitBloom";
import { crystalResonance } from "./crystalResonance";
import { deepSeaDrifter } from "./deepSeaDrifter";
import { koiCurrent } from "./koiCurrent";
import { liquidChrome } from "./liquidChrome";
import { magneticField } from "./magneticField";
import { moonlitOrbit } from "./moonlitOrbit";
import { paperPlane } from "./paperPlane";
import { pixelComet } from "./pixelComet";
import { pocketPhantom } from "./pocketPhantom";
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
  | "cat-ears"
  // The night-and-motion collection, December 2026.
  | "moonlit-orbit"
  | "liquid-chrome"
  | "pixel-comet"
  | "deep-sea-drifter"
  | "koi-current"
  | "pocket-phantom"
  | "circuit-bloom"
  | "paper-plane"
  | "crystal-resonance"
  | "magnetic-field";

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
  "moonlit-orbit": moonlitOrbit,
  "liquid-chrome": liquidChrome,
  "pixel-comet": pixelComet,
  "deep-sea-drifter": deepSeaDrifter,
  "koi-current": koiCurrent,
  "pocket-phantom": pocketPhantom,
  "circuit-bloom": circuitBloom,
  "paper-plane": paperPlane,
  "crystal-resonance": crystalResonance,
  "magnetic-field": magneticField,
};
