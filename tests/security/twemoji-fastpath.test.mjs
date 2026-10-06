/**
 * Twemoji fast path (mayContainEmoji).
 *
 * The gate must be a SUPERSET of "contains an emoji grapheme": false means
 * the segmentation walk is skipped outright (the common case — most message
 * text has no emoji). A false negative would render emoji as plain text, so
 * every emoji class the renderer handles must test true here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mayContainEmoji } from '../../src/components/ui/Twemoji.tsx';

test('plain text takes the fast path', () => {
  for (const text of [
    'hello world',
    'Okay, this one feels like me.',
    "it's a test — with smart quotes “” and an apostrophe",
    '@nova_reyes check #general please',
    'https://example.com/a?b=1&c=2',
    '***bold*** and `code` and > quote',
    '',
  ]) {
    assert.equal(mayContainEmoji(text), false, JSON.stringify(text));
  }
});

test('every handled emoji class keeps the slow path', () => {
  for (const text of [
    'hello 🎉', // pictographic
    'family 👨‍👩‍👧 test', // ZWJ sequence
    '👍🏽 done', // skin tone
    '🇺🇸 flag', // regional-indicator pair
    '© 2026', // text-presentation symbol
    'arrows ← →', // symbol range
    'stars ♥ ♦', // dingbats
    'press #️⃣ now', // keycap
    'call ☎️ me', // symbol with variation selector
    'snowman ☃', // bare symbol, no VS16
  ]) {
    assert.equal(mayContainEmoji(text), true, JSON.stringify(text));
  }
});
