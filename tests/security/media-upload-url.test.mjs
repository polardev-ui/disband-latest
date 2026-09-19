import test from 'node:test';
import assert from 'node:assert/strict';
import { isTrustedUploadUrl } from '../../src/lib/media/uploadMedia.ts';

test('media uploads accept only image URLs on the configured CDN', () => {
  assert.equal(isTrustedUploadUrl('https://cdn.disband.dev/v1/images/01234567-89ab-4cde-8f01-23456789abcd.png'), true);
  for (const value of [
    'not a URL',
    'https://attacker.example/v1/images/file.png',
    'https://cdn.disband.dev.attacker.example/v1/images/file.png',
    'http://cdn.disband.dev/v1/images/file.png',
    'https://cdn.disband.dev/v1/link/preview',
    'https://cdn.disband.dev/v1/images/',
    'https://cdn.disband.dev/v1/images/file.png?next=https://attacker.example',
    'https://cdn.disband.dev/v1/images/a%2Fb.png',
    { href: 'https://cdn.disband.dev/v1/images/file.png' },
  ]) assert.equal(isTrustedUploadUrl(value), false, String(value));
});
