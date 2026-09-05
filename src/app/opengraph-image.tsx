import { ImageResponse } from "next/og";

export const alt = "Disband — A place for your people to talk";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1e1f22 0%, #131417 55%, #2b2d31 100%)",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {/* Brand mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 148,
            height: 148,
            borderRadius: 38,
            background: "linear-gradient(135deg, #5865f2 0%, #3c45a0 100%)",
            boxShadow: "0 24px 60px -18px rgba(88, 101, 242, 0.7)",
          }}
        >
          <div style={{ fontSize: 74, fontWeight: 800, letterSpacing: -2 }}>D</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginLeft: 48 }}>
          <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>
            Disband
          </div>
          <div
            style={{
              fontSize: 30,
              color: "#9aa0a8",
              marginTop: 18,
              fontWeight: 500,
              letterSpacing: -0.3,
            }}
          >
            A place for your people to talk.
          </div>
        </div>
      </div>
    ),
    size,
  );
}