import { CanvasImage, Interactive, staticFile } from "remotion";
import { THEME } from "../theme";

/**
 * A phone, drawn rather than photographed.
 *
 * The 3D comes from a perspective wrapper on the parent plus per-device
 * rotateY here, so several phones can sit at different depths and catch the
 * light differently. The screenshots inside are the real iOS app.
 */
export const Phone: React.FC<{
  src: string;
  width?: number;
  rotateY?: number;
  rotateZ?: number;
  style?: React.CSSProperties;
  name?: string;
}> = ({ src, width = 460, rotateY = 0, rotateZ = 0, style, name = "Phone" }) => {
  // iPhone 6.9" screenshots are 1320x2868 — keep that ratio exactly or the UI
  // inside stretches and the whole thing stops reading as a real device.
  const height = width * (2868 / 1320);
  const radius = width * 0.115;

  return (
    <Interactive.Div
      name={name}
      style={{
        width,
        height,
        borderRadius: radius,
        padding: width * 0.018,
        backgroundColor: "#111114",
        // A rim light down one edge, which is what makes a flat rectangle
        // read as a metal frame.
        boxShadow: `0 ${width * 0.06}px ${width * 0.14}px rgba(0,0,0,0.28),
                    inset 0 0 0 1.5px rgba(255,255,255,0.22)`,
        rotate: `${rotateZ}deg`,
        transform: `perspective(2200px) rotateY(${rotateY}deg)`,
        ...style,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: radius * 0.9,
          overflow: "hidden",
          backgroundColor: "#000",
        }}
      >
        <CanvasImage
          src={staticFile(src)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    </Interactive.Div>
  );
};

/**
 * The desktop app, drawn as a window.
 *
 * Built from elements rather than a screenshot: there is no captured desktop
 * shot in the repo, and a mocked-up window in the product's real palette is
 * more honest than dressing up an unrelated screen. Swap the body for a
 * <CanvasImage> when a real capture exists.
 */
export const DesktopWindow: React.FC<{
  width?: number;
  rotateY?: number;
  style?: React.CSSProperties;
}> = ({ width = 1500, rotateY = 0, style }) => {
  const height = width * 0.62;
  const rail = width * 0.052;
  const list = width * 0.17;

  return (
    <Interactive.Div
      name="Desktop window"
      style={{
        width,
        height,
        borderRadius: 22,
        overflow: "hidden",
        backgroundColor: "#1E1F22",
        boxShadow: `0 40px 90px rgba(0,0,0,0.30), inset 0 0 0 1px rgba(255,255,255,0.10)`,
        transform: `perspective(2600px) rotateY(${rotateY}deg)`,
        display: "flex",
        ...style,
      }}
    >
      {/* Server rail */}
      <div
        style={{
          width: rail,
          backgroundColor: "#141518",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: rail * 0.18,
          paddingTop: rail * 0.24,
        }}
      >
        {[THEME.brand, "#3F4248", "#3F4248", "#3F4248", "#3F4248"].map((c, i) => (
          <div
            key={i}
            style={{
              width: rail * 0.56,
              height: rail * 0.56,
              borderRadius: i === 0 ? rail * 0.19 : "50%",
              backgroundColor: c,
            }}
          />
        ))}
      </div>

      {/* Channel list */}
      <div style={{ width: list, backgroundColor: "#1A1B1E", padding: list * 0.1 }}>
        <div
          style={{
            height: list * 0.1,
            width: "72%",
            borderRadius: 6,
            backgroundColor: "#2E3035",
            marginBottom: list * 0.12,
          }}
        />
        {[0.9, 0.7, 0.8, 0.55, 0.75, 0.6].map((w, i) => (
          <div
            key={i}
            style={{
              height: list * 0.075,
              width: `${w * 100}%`,
              borderRadius: 6,
              backgroundColor: i === 1 ? "#33363D" : "#242629",
              marginBottom: list * 0.07,
            }}
          />
        ))}
      </div>

      {/* Conversation */}
      <div style={{ flex: 1, padding: width * 0.024, display: "flex", flexDirection: "column", gap: width * 0.016 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "flex", gap: width * 0.012, alignItems: "flex-start" }}>
            <div
              style={{
                width: width * 0.028,
                height: width * 0.028,
                borderRadius: "50%",
                backgroundColor: i % 2 ? "#3F4248" : THEME.brand,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  height: width * 0.011,
                  width: `${18 + i * 6}%`,
                  borderRadius: 5,
                  backgroundColor: "#4A4D55",
                  marginBottom: width * 0.008,
                }}
              />
              <div
                style={{
                  height: width * 0.0105,
                  width: `${52 + ((i * 13) % 34)}%`,
                  borderRadius: 5,
                  backgroundColor: "#303338",
                }}
              />
            </div>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div
          style={{
            height: width * 0.038,
            borderRadius: 10,
            backgroundColor: "#26282C",
          }}
        />
      </div>
    </Interactive.Div>
  );
};

/** A minimal globe: outline, meridians, and a shifting set of parallels. */
export const Globe: React.FC<{ size?: number; spin: number }> = ({ size = 110, spin }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
    <circle cx="50" cy="50" r="46" fill="none" stroke={THEME.ink} strokeWidth="4" />
    {/* Latitudes stay put; the meridians are what carry the rotation. */}
    <path d="M4 50 H96" stroke={THEME.ink} strokeWidth="3" fill="none" />
    <path d="M12 28 H88" stroke={THEME.ink} strokeWidth="3" fill="none" opacity="0.75" />
    <path d="M12 72 H88" stroke={THEME.ink} strokeWidth="3" fill="none" opacity="0.75" />
    {[0, 1, 2].map((i) => {
      // Each meridian is an ellipse whose width tracks its angle, so it
      // narrows to a line as it turns edge-on — a spinning sphere, not a
      // rotating disc.
      const phase = spin + (i * Math.PI * 2) / 3;
      const rx = Math.abs(Math.cos(phase)) * 46;
      return (
        <ellipse
          key={i}
          cx="50"
          cy="50"
          rx={Math.max(0.6, rx)}
          ry="46"
          fill="none"
          stroke={THEME.ink}
          strokeWidth="3"
          opacity={0.35 + Math.abs(Math.cos(phase)) * 0.5}
        />
      );
    })}
  </svg>
);
