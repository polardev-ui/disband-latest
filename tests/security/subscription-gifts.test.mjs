/**
 * Gifted Aero counts like paid Aero (subscription-gifts.test covers the DB
 * side implicitly; this pins the pure merge logic).
 *
 * Regression: dashboard gift grants showed the Aero badge while the Tether
 * gate — subscriptions-table-only — told gifted users to subscribe.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasActiveGiftAero, planWithGifts } from '../../src/lib/subscription.ts';

const ACTIVE_SUB = { plan: 'aero', status: 'active' };
const FREE_SUB = { plan: 'free', status: 'active' };
const GIFT = [{ plan: 'aero', expires_at: '2026-12-28T03:49:03.214Z' }];

test('paid subscription alone grants aero', () => {
  assert.equal(planWithGifts(ACTIVE_SUB, null), 'aero');
  assert.equal(planWithGifts(ACTIVE_SUB, []), 'aero');
});

test('an unexpired aero gift grants aero with no subscription row', () => {
  assert.equal(planWithGifts(null, GIFT), 'aero');
  assert.equal(planWithGifts(FREE_SUB, GIFT), 'aero');
});

test('expired gifts grant nothing', () => {
  const dead = [{ plan: 'aero', expires_at: '2020-01-01T00:00:00.000Z' }];
  assert.equal(hasActiveGiftAero(dead), false);
  assert.equal(planWithGifts(null, dead), 'free');
  assert.equal(planWithGifts(null, [{ plan: 'aero', expires_at: null }]), 'aero');
});

test('non-aero gifts and legacy names behave', () => {
  assert.equal(planWithGifts(null, [{ plan: 'free', expires_at: null }]), 'free');
  assert.equal(planWithGifts(null, [{ plan: 'basic', expires_at: null }]), 'aero');
  assert.equal(planWithGifts(null, null), 'free');
  assert.equal(planWithGifts(null, []), 'free');
});
