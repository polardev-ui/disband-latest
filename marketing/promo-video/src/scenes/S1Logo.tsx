import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Audio } from "@remotion/media";
import { shutterModern } from "@remotion/sfx";
import { THEME } from "../theme";

/** Frame the mark lands on centre; the inversions start here. */
const LOCK = 26;
/** How many black/white flips. */
const FLIPS = 5;
/** Frames each flip holds. */
const FLIP_HOLD = 5;

/**
 * The mark slides up from below, clicks into centre, then the frame and the
 * logo trade colours five times.
 *
 * The slide uses a hard-out bezier rather than a spring: a spring overshoots
 * and settles, which reads as bouncy. This needs to arrive and stop dead, so
 * the colour flips feel like a shutter firing on a locked-off frame.
 */
export const S1Logo: React.FC = () => {
  const frame = useCurrentFrame();

  // Which half of the flip cycle we are in. Before LOCK it is always the
  // normal scheme, so the slide-in happens on black.
  const flipIndex = Math.max(0, Math.floor((frame - LOCK) / FLIP_HOLD));
  const inverted = frame >= LOCK && flipIndex < FLIPS * 2 && flipIndex % 2 === 1;

  return (
    <AbsoluteFill
      name="Logo stinger"
      style={{
        backgroundColor: inverted ? THEME.paper : THEME.ink,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* One shutter per inversion, so the sound sits on the cut. */}
      {Array.from({ length: FLIPS }, (_, i) => (
        <Audio
          key={i}
          src={shutterModern}
          from={LOCK + i * FLIP_HOLD * 2}
          volume={0.55}
        />
      ))}

      <Interactive.Div
        name="Mark"
        style={{
          width: 420,
          height: 420,
          translate: `0px ${interpolate(frame, [0, LOCK], [980, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}px`,
          // A whisper of scale on landing sells the "click into place".
          scale: interpolate(frame, [LOCK - 4, LOCK, LOCK + 4], [1.06, 0.97, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
          }),
          // The logo is white art; inverting the frame means inverting it too.
          filter: inverted ? "invert(1)" : "none",
        }}
      >
        <CanvasImage
          src={staticFile("logo.png")}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </Interactive.Div>
    </AbsoluteFill>
  );
};
