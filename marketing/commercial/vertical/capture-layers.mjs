// Splits the iOS Messages screen into the layers the exploded-phone shot pulls
// apart: the base (background + status bar), the server rail, the raised
// panel and the floating dock. Stacked back together they are the same image
// as build/textures/ios-inbox.png. Another screen with the same shell can be
// split too; its files carry the screen name.
//   node vertical/capture-layers.mjs          -> build/textures/layer-*.png
//   node vertical/capture-layers.mjs server   -> build/textures/layer-server-*.png
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { serve } from "../tools/serve.mjs";

const OUT = path.resolve("build/textures");
fs.mkdirSync(OUT, { recursive: true });

const SCREEN = process.argv[2] ?? "inbox";
const PREFIX = SCREEN === "inbox" ? "layer" : `layer-${SCREEN}`;
const PARTS = [".status", ".rail", ".panel", ".dock"];
const LAYERS = [
  { name: "base", keep: [".status"], opaque: true },
  { name: "rail", keep: [".rail"] },
  { name: "panel", keep: [".panel"] },
  { name: "dock", keep: [".dock"] },
];

const { server, origin } = await serve();
const browser = await chromium.launch();
for (const layer of LAYERS) {
  const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
  page.on("pageerror", (e) => console.error(layer.name, e.message));
  await page.goto(`${origin}/ui/ios.html?screen=${SCREEN}`);
  await page.waitForSelector("body[data-ready]", { timeout: 20000 });
  const hide = PARTS.filter((p) => !layer.keep.includes(p));
  let css = `${hide.join(",")} { visibility: hidden !important; }`;
  if (!layer.opaque) css += "html, body, .screen { background: transparent !important; }";
  await page.addStyleTag({ content: css });
  await page.screenshot({ path: path.join(OUT, `${PREFIX}-${layer.name}.png`), omitBackground: !layer.opaque });
  await page.close();
  console.log("captured layer", SCREEN, layer.name);
}
await browser.close();
server.close();
