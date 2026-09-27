import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Phone, Globe } from "../components/Devices";
import { RiseIn } from "../components/TypeOn";
import { SAFE, THEME } from "../theme";

/**
 * Three phones drifting through frame, then the line and a turning globe.
 *
 * The phones are on slightly different speeds and depths so the group has
 * parallax; moving them as one block would look like a sliding image.
 */
export const S4Mobile: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drift = (mult: number) =>
    interpolate(frame, [0, 4 * fps], [0, -46 * mult], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      name="On iPhone"
      style={{
        backgroundColor: THEME.paper,
        alignItems: "center",
        justifyContent: "center",
        padding: `${SAFE.y}px ${SAFE.x}px`,
        overflow: "hidden",
      }}
    >
      <Interactive.Div
        name="Phone group"
        style={{
          position: "absolute",
          top: 250,
          display: "flex",
          alignItems: "center",
          gap: 18,
          scale: interpolate(frame, [0, 30], [0.94, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      >
        <Phone
          name="Phone left"
          src="ios-03-servers.png"
          width={252}
          rotateY={26}
          rotateZ={-4}
          style={{ translate: `0px ${drift(0.6) + 56}px`, opacity: 0.96 }}
        />
        <Phone
          name="Phone centre"
          src="ios-04-chat.png"
          width={356}
          rotateY={0}
          style={{ translate: `0px ${drift(1)}px`, zIndex: 2 }}
        />
        <Phone
          name="Phone right"
          src="ios-05-messages.png"
          width={252}
          rotateY={-26}
          rotateZ={4}
          style={{ translate: `0px ${drift(0.6) + 56}px`, opacity: 0.96 }}
        />
      </Interactive.Div>

      <RiseIn
        name="Globe line"
        from={Math.round(1.6 * fps)}
        style={{
          position: "absolute",
          bottom: SAFE.y + 30,
          left: SAFE.x,
          right: SAFE.x,
          fontSize: 72,
          fontWeight: 650,
          color: THEME.ink,
          letterSpacing: "-0.02em",
          textAlign: "center",
          lineHeight: 1.12,
        }}
      >
        Available all around the{" "}
        <span style={{ whiteSpace: "nowrap" }}>
          globe
          <span style={{ display: "inline-block", verticalAlign: "-0.14em", marginLeft: 18 }}>
            <Globe size={66} spin={(frame / fps) * 1.5} />
          </span>
        </span>
      </RiseIn>
    </AbsoluteFill>
  );
};
