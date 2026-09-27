import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { RiseIn } from "../components/TypeOn";
import { SAFE, THEME, TYPE } from "../theme";

/**
 * The card: mark, name, slogan, address, call to action, and the legal line.
 *
 * Everything lands in sequence rather than together — a block of five things
 * appearing at once gives the viewer nowhere to look first.
 */
export const S6Outro: React.FC<{
  owner?: string;
}> = ({ owner = "Genysis IQ" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const year = new Date().getFullYear();

  return (
    <AbsoluteFill
      name="Outro"
      style={{
        backgroundColor: THEME.paper,
        alignItems: "center",
        justifyContent: "center",
        padding: `${SAFE.y}px ${SAFE.x}px`,
      }}
    >
      <Interactive.Div
        name="Card"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
        }}
      >
        <Interactive.Div
          name="Mark"
          style={{
            width: 210,
            height: 210,
            marginBottom: 10,
            scale: interpolate(frame, [0, 26], [0.86, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
            }),
            opacity: interpolate(frame, [0, 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            // The mark is white art, so it needs inverting on paper.
            filter: "invert(1)",
          }}
        >
          <CanvasImage
            src={staticFile("logo.png")}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </Interactive.Div>

        <RiseIn
          name="Wordmark"
          from={14}
          style={{
            fontSize: 118,
            fontWeight: 750,
            letterSpacing: "-0.035em",
            color: THEME.ink,
            lineHeight: 1,
          }}
        >
          Disband
        </RiseIn>

        <RiseIn
          name="Slogan"
          from={Math.round(0.8 * fps)}
          style={{
            fontSize: TYPE.body,
            fontWeight: 500,
            color: THEME.muted,
            letterSpacing: "-0.01em",
          }}
        >
          Privacy first, privacy always.
        </RiseIn>

        <RiseIn
          name="Address"
          from={Math.round(1.35 * fps)}
          style={{
            marginTop: 18,
            fontSize: TYPE.caption + 6,
            fontWeight: 650,
            color: THEME.ink,
            letterSpacing: "-0.01em",
          }}
        >
          disband.dev
        </RiseIn>

        <RiseIn
          name="CTA"
          from={Math.round(1.9 * fps)}
          style={{
            marginTop: 6,
            fontSize: TYPE.caption,
            fontWeight: 500,
            color: THEME.muted,
          }}
        >
          Reserve your spot before it&rsquo;s too late.
        </RiseIn>
      </Interactive.Div>

      <RiseIn
        name="Legal"
        from={Math.round(2.5 * fps)}
        duration={26}
        distance={12}
        style={{
          position: "absolute",
          bottom: SAFE.y - 60,
          left: SAFE.x,
          right: SAFE.x,
          fontSize: TYPE.legal,
          lineHeight: 1.45,
          color: THEME.muted,
          textAlign: "center",
          letterSpacing: "0.005em",
        }}
      >
        © {year} {owner}. Disband is owned and operated by {owner}. All software,
        source code, designs, trademarks and assets are protected by copyright and
        may not be copied, distributed or reproduced without permission.
      </RiseIn>
    </AbsoluteFill>
  );
};
