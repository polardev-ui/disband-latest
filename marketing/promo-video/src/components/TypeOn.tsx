import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { THEME } from "../theme";

/**
 * Text that types itself on, the way Apple's product films do.
 *
 * Two details carry the effect. The line is laid out in full but invisible,
 * so the block never reflows as characters arrive — text that re-centres
 * while it types reads as a webpage, not a film. And the caret keeps blinking
 * on a fixed cadence rather than being tied to the typing, so it behaves like
 * a cursor rather than a progress bar.
 */
export const TypeOn: React.FC<{
  text: string;
  /** Frame typing begins. */
  from: number;
  /** Frames per character. */
  speed?: number;
  fontSize?: number;
  weight?: number;
  color?: string;
  caret?: boolean;
  name?: string;
  style?: React.CSSProperties;
}> = ({
  text,
  from,
  speed = 1.6,
  fontSize = 96,
  weight = 600,
  color = THEME.ink,
  caret = true,
  name = "Typed line",
  style,
}) => {
  const frame = useCurrentFrame();
  const shown = Math.max(
    0,
    Math.min(text.length, Math.floor((frame - from) / speed)),
  );
  const done = shown >= text.length;
  const started = frame >= from;

  return (
    <Interactive.Div
      name={name}
      style={{
        position: "relative",
        display: "inline-block",
        fontSize,
        fontWeight: weight,
        color,
        letterSpacing: "-0.02em",
        lineHeight: 1.12,
        textAlign: "center",
        ...style,
      }}
    >
      {/* Full text, hidden: reserves the final size so nothing shifts. */}
      <span style={{ visibility: "hidden" }}>{text}</span>
      <span
        style={{
          position: "absolute",
          inset: 0,
          textAlign: "inherit",
        }}
      >
        {text.slice(0, shown)}
        {caret && started && (
          <span
            style={{
              display: "inline-block",
              width: "0.06em",
              height: "0.92em",
              marginLeft: "0.04em",
              verticalAlign: "-0.1em",
              backgroundColor: color,
              // Blinks only once typing has stopped; while characters are
              // arriving a solid caret reads as part of the text.
              opacity: done
                ? Math.round(((frame - from) % 30) / 30) === 0
                  ? 1
                  : 0
                : 1,
            }}
          />
        )}
      </span>
    </Interactive.Div>
  );
};

/** Fades and lifts its children in, for anything that is not typed. */
export const RiseIn: React.FC<{
  from: number;
  duration?: number;
  distance?: number;
  name?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ from, duration = 22, distance = 28, name = "Rise", style, children }) => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name={name}
      style={{
        opacity: interpolate(frame, [from, from + duration], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: `0px ${interpolate(frame, [from, from + duration], [distance, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}px`,
        ...style,
      }}
    >
      {children}
    </Interactive.Div>
  );
};
