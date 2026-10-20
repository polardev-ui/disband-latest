import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 The link-preview card (Open Graph / Twitter): a blurple brand panel with the
 white logo and wordmark, and a small drawing of the classic app beside it
 (server rail, channel list, chat) so the preview looks like the product.
 Rendered by next/og (Satori), so styles are inline and flex-only.
*/

const logo = `data:image/png;base64,${readFileSync(join(process.cwd(), "public/logo-white.png")).toString("base64")}`;

const C = {
  brand: "#5865f2",
  rail: "#1e1f22",
  side: "#2b2d31",
  chat: "#313338",
  text: "#dbdee1",
  muted: "#949ba4",
  head: "#f2f3f5",
};

function Bar({ w, h = 10, c = "#4e5058", r = 5, mt = 0 }: { w: number; h?: number; c?: string; r?: number; mt?: number }) {
  return <div style={{ width: w, height: h, background: c, borderRadius: r, marginTop: mt, display: "flex" }} />;
}

function Message({ color, name, lines }: { color: string; name: number; lines: number[] }) {
  return (
    <div style={{ display: "flex", marginTop: 22 }}>
      <div style={{ width: 40, height: 40, borderRadius: 20, background: color, display: "flex" }} />
      <div style={{ display: "flex", flexDirection: "column", marginLeft: 14 }}>
        <Bar w={name} h={11} c={color} />
        {lines.map((w, i) => (
          <Bar key={i} w={w} mt={10} c="#6d6f78" />
        ))}
      </div>
    </div>
  );
}

export function OgCard() {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: C.brand, fontFamily: "sans-serif" }}>
      {/* Brand side */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 520, padding: "0 0 0 72px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={92} height={92} alt="" />
        <div style={{ fontSize: 84, fontWeight: 800, color: "#fff", letterSpacing: -2, marginTop: 26, lineHeight: 1 }}>Disband</div>
        <div style={{ fontSize: 29, color: "rgba(255,255,255,0.86)", marginTop: 20, lineHeight: 1.25, maxWidth: 460 }}>
          A place for your people to talk.
        </div>
        <div style={{ display: "flex", marginTop: 34 }}>
          {["Spaces", "Voice", "Private"].map((t) => (
            <div key={t} style={{ display: "flex", fontSize: 22, color: "#fff", background: "rgba(0,0,0,0.18)", borderRadius: 20, padding: "8px 18px", marginRight: 12 }}>
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* The app, drawn small, running off the right edge */}
      <div style={{ display: "flex", marginTop: 70, marginLeft: 10, height: 600, borderRadius: "14px 0 0 0", overflow: "hidden", boxShadow: "0 18px 50px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 72, background: C.rail, paddingTop: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: C.brand, display: "flex" }} />
          <div style={{ width: 32, height: 2, background: "#35363c", marginTop: 10, display: "flex" }} />
          {["#23a55a", "#f0b232", "#eb459e", "#3ba55c"].map((c) => (
            <div key={c} style={{ width: 48, height: 48, borderRadius: 24, background: c, marginTop: 10, display: "flex", opacity: 0.85 }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 190, background: C.side, padding: "18px 14px" }}>
          <Bar w={120} h={14} c={C.head} />
          <Bar w={80} h={9} c={C.muted} mt={26} />
          {[110, 90, 130, 100].map((w, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", marginTop: 14, padding: "6px 8px", borderRadius: 4, background: i === 1 ? "#404249" : "transparent" }}>
              <div style={{ fontSize: 20, color: C.muted, marginRight: 8, display: "flex" }}>#</div>
              <Bar w={w - 20} c={i === 1 ? C.head : "#80848e"} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 420, background: C.chat, padding: "18px 22px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ fontSize: 22, color: C.muted, marginRight: 8, display: "flex" }}>#</div>
            <Bar w={110} h={13} c={C.head} />
          </div>
          <Message color="#f47b67" name={90} lines={[260, 190]} />
          <Message color="#3ba55c" name={110} lines={[300]} />
          <Message color="#5865f2" name={80} lines={[240, 280]} />
          <Message color="#eb459e" name={100} lines={[210]} />
          <div style={{ display: "flex", marginTop: 26, height: 44, borderRadius: 8, background: "#383a40" }} />
        </div>
      </div>
    </div>
  );
}
