/**
 * Bot invite links (disband.dev/bot-invite/<code>) in messages. They get an
 * "Authorize App" card instead of the website's link preview.
 */

const BOT_INVITE_RE = /(?:https?:\/\/)?(?:www\.)?disband\.dev\/bot-invite\/([a-z0-9]{16,64})\b\/?/gi;

export function extractBotInviteCodes(text: string, max = 3): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(BOT_INVITE_RE)) {
    const code = m[1].toLowerCase();
    if (!out.includes(code)) out.push(code);
    if (out.length >= max) break;
  }
  return out;
}

export function stripBotInviteLinks(text: string): string {
  return text.replace(BOT_INVITE_RE, "").replace(/[ \t]{2,}/g, " ").trim();
}

export function isBotInviteUrl(url: string): boolean {
  return new RegExp(BOT_INVITE_RE.source, "i").test(url);
}
