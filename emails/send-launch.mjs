/**
 * Sends the launch email through Resend.
 *
 * Resend has no image hosting, so the logo can be delivered two ways:
 *
 *   hosted (default) — the <img src> points at a public URL. Small message,
 *     cached by the client, but the image must stay online forever and most
 *     clients block remote images until the reader allows them.
 *
 *   --inline — the PNG is attached with a content_id and the src is rewritten
 *     to cid:disband-logo. Nothing external to host, and it renders even when
 *     remote images are blocked. Costs ~57KB of base64 per message and some
 *     clients also list it as an attachment.
 *
 * Note: this is the transactional send API. Resend BROADCASTS do not support
 * attachments, so --inline is unavailable there and the logo must be a hosted
 * URL. Broadcasts also require the unsubscribe token {{{RESEND_UNSUBSCRIBE_URL}}}.
 *
 * Usage:
 *   RESEND_API_KEY=re_... node send-launch.mjs --to you@example.com [--inline]
 */
import { readFileSync } from "node:fs";
import { Resend } from "resend";

const args = process.argv.slice(2);
const inline = args.includes("--inline");
const to = args[args.indexOf("--to") + 1];

if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
if (!to || to.startsWith("--")) throw new Error("Pass --to <address>");

let html = readFileSync(new URL("./launch.html", import.meta.url), "utf8");
const attachments = [];

if (inline) {
  // Point the tag at the attachment instead of the network.
  html = html.replace("https://disband.wsgpolar.me/disband.png", "cid:disband-logo");
  attachments.push({
    filename: "disband.png",
    content: readFileSync(new URL("./assets/disband.png", import.meta.url)).toString("base64"),
    content_type: "image/png",
    content_id: "disband-logo",
  });
}

const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
  from: "Disband <hello@disband.dev>",
  to,
  subject: "Disband has launched",
  html,
  // Plain-text alternative. Without one, spam filters score the message worse
  // and text-only clients get nothing readable.
  text: [
    "Disband is officially live.",
    "",
    "Servers, channels, direct messages, group chats, voice and video calls,",
    "and a private space for your own notes.",
    "",
    "Download it for Windows, macOS or Linux, or open it in your browser:",
    "https://disband.dev",
    "",
    "iPhone & iPad: our iOS app is submitted and waiting on Apple's review.",
    "We'll let you know as soon as it's approved. Until then, Disband runs",
    "in your mobile browser.",
    "",
    "-- The Disband team",
  ].join("\n"),
  ...(attachments.length ? { attachments } : {}),
});

if (error) {
  console.error("Send failed:", error);
  process.exit(1);
}
console.log(`Sent ${inline ? "with inline logo" : "with hosted logo"} — id ${data.id}`);
