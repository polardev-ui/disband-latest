/**
 * Webhook/embed payload normalisation. These are the rules applied before an
 * embed reaches the database: Discord's limits, http(s)-only URLs and a clean
 * stored shape.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  EMBED_LIMITS,
  embedColorHex,
  normalizeEmbeds,
  safeEmbedUrl,
} from "../../src/lib/embeds.ts";

test("normalizes a Discord-shaped embed and keeps only known fields", () => {
  const result = normalizeEmbeds([
    {
      title: "  Release 1.2  ",
      description: "What changed",
      url: "https://disband.dev/changelog",
      color: "#5865f2",
      timestamp: "2026-10-19T12:00:00Z",
      footer: { text: "Disband", icon_url: "https://www.disband.dev/logo.png" },
      author: { name: "Team", url: "https://www.disband.dev" },
      image: { url: "https://www.disband.dev/banner.png" },
      fields: [
        { name: "Fixed", value: "Webhooks", inline: true },
        { name: "Added", value: "Embeds", inline: false },
      ],
      unknown: "dropped",
    },
  ]);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const [embed] = result.embeds;
  assert.equal(embed.title, "Release 1.2");
  assert.equal(embed.color, 0x5865f2);
  assert.equal(embed.timestamp, "2026-10-19T12:00:00.000Z");
  assert.deepEqual(embed.fields, [
    { name: "Fixed", value: "Webhooks", inline: true },
    { name: "Added", value: "Embeds", inline: false },
  ]);
  assert.equal("unknown" in embed, false);
  assert.equal(embedColorHex(embed.color), "#5865f2");
});

test("drops unsafe URLs instead of rejecting the whole payload", () => {
  assert.equal(safeEmbedUrl("javascript:alert(1)"), undefined);
  assert.equal(safeEmbedUrl("data:text/html,hi"), undefined);
  assert.equal(safeEmbedUrl("https://user:pass@example.com/x"), undefined);
  assert.equal(safeEmbedUrl("https://example.com/" + "a".repeat(2048)), undefined);

  const result = normalizeEmbeds([
    {
      title: "Safe title",
      url: "javascript:alert(1)",
      image: { url: "file:///etc/passwd" },
      author: { name: "Team", url: "ftp://example.com" },
    },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.embeds[0].title, "Safe title");
  assert.equal(result.embeds[0].url, undefined);
  assert.equal(result.embeds[0].image, undefined);
  assert.equal(result.embeds[0].author.url, undefined);
});

test("enforces Discord's hard limits with its wording", () => {
  const tooMany = normalizeEmbeds(Array.from({ length: EMBED_LIMITS.embeds + 1 }, (_, i) => ({ title: `#${i}` })));
  assert.equal(tooMany.ok, false);
  if (!tooMany.ok) assert.match(tooMany.error, /10 or fewer/);

  const tooManyFields = normalizeEmbeds([
    { fields: Array.from({ length: EMBED_LIMITS.fields + 1 }, () => ({ name: "n", value: "v" })) },
  ]);
  assert.equal(tooManyFields.ok, false);
  if (!tooManyFields.ok) assert.match(tooManyFields.error, /25 or fewer/);

  const missingValue = normalizeEmbeds([{ fields: [{ name: "Fixed" }] }]);
  assert.equal(missingValue.ok, false);
  if (!missingValue.ok) assert.match(missingValue.error, /name and value are required/);

  const empty = normalizeEmbeds([{ unknown: true }]);
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.match(empty.error, /Embed is empty/);

  const huge = normalizeEmbeds([
    { description: "x".repeat(3500) },
    { description: "y".repeat(3500) },
  ]);
  assert.equal(huge.ok, false);
  if (!huge.ok) assert.match(huge.error, /maximum size of 6000/);
});

test("trims long text to the per-field limits", () => {
  const result = normalizeEmbeds([
    {
      title: "t".repeat(EMBED_LIMITS.title + 20),
      description: "d".repeat(EMBED_LIMITS.description + 20),
      fields: [{ name: "n".repeat(EMBED_LIMITS.fieldName + 20), value: "v".repeat(EMBED_LIMITS.fieldValue + 20) }],
    },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.embeds[0].title.length, EMBED_LIMITS.title);
  assert.equal(result.embeds[0].description.length, EMBED_LIMITS.description);
  assert.equal(result.embeds[0].fields[0].name.length, EMBED_LIMITS.fieldName);
  assert.equal(result.embeds[0].fields[0].value.length, EMBED_LIMITS.fieldValue);
});

test("null and absent embeds are empty, not errors", () => {
  assert.deepEqual(normalizeEmbeds(null), { ok: true, embeds: [] });
  assert.deepEqual(normalizeEmbeds(undefined), { ok: true, embeds: [] });
  assert.deepEqual(normalizeEmbeds([]), { ok: true, embeds: [] });
});
