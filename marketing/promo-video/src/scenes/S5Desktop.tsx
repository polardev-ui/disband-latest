import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { DesktopWindow, Phone } from "../components/Devices";
import { RiseIn } from "../components/TypeOn";
import { SAFE, THEME, TYPE } from "../theme";

/**
 * The desktop app turning into frame, with a phone alongside it.
 *
 * The two devices together are the point of the line — "live syncing" needs
 * to be shown as two screens, not stated over one.
 */
export const S5Desktop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="On desktop"
      style={{
        backgroundColor: THEME.paper,
        alignItems: "center",
        justifyContent: "center",
        padding: `${SAFE.y}px ${SAFE.x}px`,
        overflow: "hidden",
      }}
    >
      <Interactive.Div
        name="Device pair"
        style={{
          position: "absolute",
          top: 300,
          width: 940,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          translate: `0px ${interpolate(frame, [0, 4 * fps], [0, -38], {
            extrapolateRight: "clamp",
          })}px`,
        }}
      >
        <DesktopWindow
          width={800}
          // Settles from a turned angle to almost flat, so the window reads as
          // an object in space before it squares up to the viewer.
          rotateY={interpolate(frame, [0, 2.4 * fps], [22, 6], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}
        />
        <Phone
          name="Synced phone"
          src="ios-07-profile.png"
          width={196}
          rotateY={-16}
          style={{
            marginLeft: -96,
            marginBottom: -64,
            zIndex: 3,
            opacity: interpolate(frame, [Math.round(0.7 * fps), Math.round(1.4 * fps)], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
      </Interactive.Div>

      <RiseIn
        name="Sync line"
        from={Math.round(1.8 * fps)}
        style={{
          position: "absolute",
          bottom: SAFE.y + 40,
          maxWidth: 900,
          fontSize: TYPE.headlineTight,
          fontWeight: 650,
          color: THEME.ink,
          letterSpacing: "-0.02em",
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        Cross-device support with live syncing
      </RiseIn>
    </AbsoluteFill>
  );
};
