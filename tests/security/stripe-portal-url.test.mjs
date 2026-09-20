import test from 'node:test';
import assert from 'node:assert/strict';
import { stripePortalDestination } from '../../src/lib/stripe-portal-url.ts';

test('billing portal redirects only to Stripe', () => {
  const session = 'https://billing.stripe.com/p/session/test_123';
  assert.equal(stripePortalDestination(session), session);
  for (const value of [
    'https://attacker.example/p/session/test_123',
    'https://billing.stripe.com.attacker.example/p/session/test_123',
    'http://billing.stripe.com/p/session/test_123',
    'https://billing.stripe.com:444/p/session/test_123',
    'https://user@billing.stripe.com/p/session/test_123',
    'javascript:alert(1)',
    '/p/session/test_123',
    null,
  ]) assert.equal(stripePortalDestination(value), null, String(value));
});
