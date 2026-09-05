import { ImageResponse } from "next/og";

export const alt = "Disband — A place for your people to talk";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// The desktop app is a static export, and `output: export` refuses to build a
// route that has not said whether it is static. This image depends on nothing
// from the request, so generating it once at build time is what it wants —
// without this the Tauri build fails collecting page data.
export const dynamic = "force-static";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1e1f22 0%, #131417 55%, #2b2d31 100%)",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 112,
            height: 112,
            borderRadius: 30,
            background: "linear-gradient(135deg, #5865f2 0%, #3c45a0 100%)",
            boxShadow: "0 20px 48px -18px rgba(88, 101, 242, 0.7)",
          }}
        >
          <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2 }}>D</div>
        </div>
        <div style={{ fontSize: 66, fontWeight: 800, letterSpacing: -2, marginTop: 32 }}>
          Disband
        </div>
        <div style={{ fontSize: 28, color: "#9aa0a8", marginTop: 14, fontWeight: 500 }}>
          A place for your people to talk.
        </div>
      </div>
    ),
    size,
  );
}