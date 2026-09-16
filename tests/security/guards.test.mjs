import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, assertSafeUrl, fetchSafeHtml } from '../../src/lib/ssrf-guard.ts';
import { checkoutOrigin } from '../../src/lib/checkout-origin.ts';
import { rateLimit } from '../../src/lib/rate-limit.ts';

test('SSRF blocks internal, mapped, transition and reserved addresses', async () => {
  for (const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','192.168.1.1','198.18.0.1','224.0.0.1','::','::1','::ffff:127.0.0.1','::ffff:7f00:1','fc00::1','fe90::1','ff02::1','2002:7f00:1::','2001:db8::1']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111','2001:4860:4860::8888']) assert.equal(isPrivateAddress(ip), false, ip);
  for (const url of ['file:///etc/passwd','http://2130706433','http://0x7f000001','http://[::ffff:7f00:1]','https://user:pass@example.com','https://example.com:22','http://localhost.']) await assert.rejects(assertSafeUrl(url), undefined, url);
  await assert.rejects(fetchSafeHtml('http://127.0.0.1:3000/'));
});

test('checkout returns only trusted destinations, localhost only in development', () => {
  const before = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    for (const origin of ['https://attacker.example','https://www.disband.dev.attacker.example','null','http://localhost:3000','https://user:pass@attacker.example']) assert.equal(checkoutOrigin(new Request('https://www.disband.dev/api', { headers: { origin } })), 'https://www.disband.dev');
    process.env.NODE_ENV = 'development';
    assert.equal(checkoutOrigin(new Request('http://localhost:3000/api', { headers: { origin: 'http://localhost:3000' } })), 'http://localhost:3000');
  } finally { process.env.NODE_ENV = before; }
});

test('rate limiter rejects bursts and caps allocation for unique keys', () => {
  assert.equal(rateLimit('burst', 1, 60000).allowed, true);
  assert.equal(rateLimit('burst', 1, 60000).allowed, false);
  for (let i=0; i<10000; i++) rateLimit(`spray-${i}`,1,60000);
  assert.equal(rateLimit('after-capacity',1,60000).allowed, false);
});
