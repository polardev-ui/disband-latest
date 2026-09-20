import test from 'node:test';
import assert from 'node:assert/strict';
import { isTrustedUploadUrl } from '../../src/lib/media/uploadMedia.ts';

test('media uploads accept only image URLs on the configured CDN', () => {
  const fileKey = '01234567-89ab-4cde-8f01-23456789abcd.png';
  const userId = '11111111-2222-4333-8444-555555555555';
  assert.equal(isTrustedUploadUrl(`https://cdn.disband.dev/v1/images/${fileKey}`), true);
  assert.equal(isTrustedUploadUrl(`https://cdn.disband.dev/v1/images/${userId}/${fileKey}`), true);
  for (const value of [
    'not a URL',
    'https://attacker.example/v1/images/file.png',
    'https://cdn.disband.dev.attacker.example/v1/images/file.png',
    'http://cdn.disband.dev/v1/images/file.png',
    'https://cdn.disband.dev/v1/link/preview',
    'https://cdn.disband.dev/v1/images/',
    'https://cdn.disband.dev/v1/images/file.png?next=https://attacker.example',
    'https://cdn.disband.dev/v1/images/a%2Fb.png',
    'https://cdn.disband.dev/v1/images/11111111-2222-4333-8444-555555555555/other/file.png',
    { href: 'https://cdn.disband.dev/v1/images/file.png' },
  ]) assert.equal(isTrustedUploadUrl(value), false, String(value));
});
