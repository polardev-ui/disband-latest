/**
 * Chat GIF behavior: identity of a favorited GIF, link classification, and
 * stripping a GIF link's raw URL out of the message body (the GIF replaces
 * it, so printing the link twice would be a bug).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { gifFavKey } from '../../src/lib/gif-favorites.ts';
import { removeUrlsFromText } from '../../src/lib/link-preview.ts';
import { classifyLinkUrl } from '../../src/lib/link-kind.ts';

test('the same GIF spelled several ways shares one favorite key', () => {
  const canonical = gifFavKey('https://media.giphy.com/media/abc123/giphy.gif');
  assert.equal(gifFavKey('https://media.giphy.com/media/abc123/giphy.gif?utm_source=share'), canonical);
  assert.equal(gifFavKey('HTTPS://WWW.MEDIA.giphy.com/media/abc123/giphy.gif'), canonical);
  assert.equal(gifFavKey('https://media.giphy.com/media/abc123/giphy.gif/'), canonical);
  assert.equal(gifFavKey('https://media.giphy.com/media/abc123/giphy.gif#frag'), canonical);

  // Different GIFs stay different: the id is in the path, not the query.
  assert.notEqual(gifFavKey('https://media.giphy.com/media/other/giphy.gif'), canonical);
  assert.notEqual(gifFavKey('https://media.giphy.com/media/abc123/200w.gif'), canonical);

  // Unparseable input must not collapse onto anything else.
  assert.equal(gifFavKey('not a url'), 'not a url');
  assert.notEqual(gifFavKey('not a url'), canonical);
});

test('GIF links are recognized beyond the exact-host list', () => {
  assert.equal(classifyLinkUrl('https://media.giphy.com/media/abc/giphy.gif'), 'gif');
  assert.equal(classifyLinkUrl('https://media4.giphy.com/media/abc/giphy.gif'), 'gif');
  assert.equal(classifyLinkUrl('https://giphy.com/gifs/some-fun'), 'gif', 'extensionless giphy URL');
  assert.equal(classifyLinkUrl('https://i.imgur.com/abc.gif'), 'gif');
  assert.equal(classifyLinkUrl('https://totally-unknown-host.example/party.gif'), 'gif');

  assert.equal(classifyLinkUrl('https://example.com/photo.png'), 'image');
  assert.equal(classifyLinkUrl('https://example.com/clip.mp4'), 'video');
  assert.equal(classifyLinkUrl('https://example.com/article'), null);
  assert.equal(classifyLinkUrl('not-a-url'), null);
});

test('a GIF link is stripped from the body, leaving the rest of the text', () => {
  const gif = 'https://media.giphy.com/media/abc/giphy.gif';

  // The whole message was the link: nothing but the GIF remains.
  assert.equal(removeUrlsFromText(gif, [gif]), '');

  // Surrounding prose survives, without the double space the removal leaves.
  assert.equal(removeUrlsFromText(`look at this ${gif} right`, [gif]), 'look at this right');
  assert.equal(removeUrlsFromText(`look\n${gif}\ntext`, [gif]), 'look\ntext');

  // A [label](url) node keeps a meaningful label and drops the target.
  assert.equal(removeUrlsFromText(`[party](${gif})`, [gif]), 'party');
  assert.equal(removeUrlsFromText(`[${gif}](${gif})`, [gif]), '');

  // Non-GIF links are never passed in, so their text is untouched by design.
  const image = 'https://example.com/photo.png';
  assert.equal(removeUrlsFromText(`see ${image}`, []), `see ${image}`);
});
