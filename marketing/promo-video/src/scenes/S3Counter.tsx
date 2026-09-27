import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio } from "@remotion/media";
import { mouseClick } from "@remotion/sfx";
import { TypeOn } from "../components/TypeOn";
import { SAFE, THEME, TYPE } from "../theme";

/**
 * The number the counter runs to, and the line that follows it.
 *
 * Both are props so the claim can be corrected without touching the scene.
 * See the note in README-CLAIMS.md before changing them: the figure is a
 * public advertising claim and should match what the database can support.
 */
export const S3Counter: React.FC<{
  target?: number;
  tail?: string;
}> = ({
  target = 10000,
  tail = "users are already signed up within the first three weeks of our release.",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const COUNT_START = 8;
  const COUNT_END = COUNT_START + fps; // one second, per the brief
  const TAIL_START = COUNT_END + Math.round(fps * 0.5);

  // Ease-out so it sprints early and settles onto the final figure, which is
  // what makes the last few hundred readable instead of a blur.
  const value = Math.round(
    interpolate(frame, [COUNT_START, COUNT_END], [0, target], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.1, 0.9, 0.2, 1),
    }),
  );

  // Clicks tighten as the number climbs. Spacing shrinks across the run, so
  // the ear hears the same acceleration the eye sees.
  const clicks: number[] = [];
  for (let f = COUNT_START, gap = 4.2; f < COUNT_END; f += gap, gap *= 0.86) {
    clicks.push(Math.round(f));
  }

  return (
    <AbsoluteFill
      name="Signup counter"
      style={{
        backgroundColor: THEME.paper,
        alignItems: "center",
        justifyContent: "center",
        padding: `${SAFE.y}px ${SAFE.x}px`,
        gap: 28,
      }}
    >
      {clicks.map((f, i) => (
        // Barely audible and muffled, per the brief: low volume and the tops
        // rolled off so it reads as a mechanism rather than a UI sound.
        <Audio
          key={i}
          src={mouseClick}
          from={f}
          volume={0.1}
          toneFrequency={0.55}
        />
      ))}

      <Interactive.Div
        name="Counter"
        style={{
          fontSize: TYPE.counter,
          fontWeight: 700,
          color: THEME.ink,
          letterSpacing: "-0.04em",
          fontVariantNumeric: "tabular-nums",
          // A small settle at the top of the count, once it lands.
          scale: interpolate(frame, [COUNT_END, COUNT_END + 8], [1.05, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
          }),
        }}
      >
        {value.toLocaleString("en-US")}
      </Interactive.Div>

      <TypeOn
        name="Tail line"
        text={tail}
        from={TAIL_START}
        speed={0.9}
        fontSize={TYPE.body}
        weight={500}
        color={THEME.muted}
        style={{ maxWidth: 860, lineHeight: 1.3 }}
      />
    </AbsoluteFill>
  );
};
