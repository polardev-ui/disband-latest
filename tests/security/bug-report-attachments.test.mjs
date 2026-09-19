import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBugReport } from '../../src/lib/bug-reports.ts';

const report = (attachments) => ({
  title: 'Broken upload',
  description: 'The upload failed unexpectedly.',
  steps: '',
  attachments,
});
const attachment = (url, overrides = {}) => ({ url, name: 'error.png', type: 'image/png', ...overrides });

test('bug reports accept uploaded CDN attachments and reject unrelated links', () => {
  assert.equal(validateBugReport(report([attachment('https://cdn.disband.dev/v1/images/file.png')])), null);
  for (const url of [
    'https://attacker.example/file.png',
    'https://cdn.disband.dev.attacker.example/v1/images/file.png',
    'http://cdn.disband.dev/v1/images/file.png',
    'https://cdn.disband.dev/v1/link/preview',
    'https://cdn.disband.dev/v1/images/',
    'https://cdn.disband.dev/v1/images/file.png?redirect=attacker.example',
  ]) assert.notEqual(validateBugReport(report([attachment(url)])), null, url);
});

test('bug reports reject malformed attachment fields without throwing', () => {
  for (const value of [null, 'file', {}, { url: 42 }, attachment('bad'),
    attachment('https://cdn.disband.dev/v1/images/file.png', { name: 42 }),
    attachment('https://cdn.disband.dev/v1/images/file.png', { type: null }),
    attachment('https://cdn.disband.dev/v1/images/file.png', { name: 'bad\nname' }),
  ]) assert.notEqual(validateBugReport(report([value])), null);
  assert.notEqual(validateBugReport(report(Array(7).fill(attachment('https://cdn.disband.dev/v1/images/file.png')))), null);
});
