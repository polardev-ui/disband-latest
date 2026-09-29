/**
 * Sale pricing: the client displays it, the checkout revalidates it. Both go
 * through effectivePriceCents, so a bad value can never raise a price or
 * zero one out from either side.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { effectivePriceCents } from '../../src/lib/shop.ts';

test('no sale means list price', () => {
  assert.equal(effectivePriceCents(600, null), 600);
  assert.equal(effectivePriceCents(600, undefined), 600);
});

test('a valid sale price wins', () => {
  assert.equal(effectivePriceCents(600, 450), 450);
  assert.equal(effectivePriceCents(800, 599), 599);
});

test('a sale that is zero, negative, or at/above list is ignored', () => {
  assert.equal(effectivePriceCents(600, 0), 600);
  assert.equal(effectivePriceCents(600, -50), 600);
  assert.equal(effectivePriceCents(600, 600), 600);
  assert.equal(effectivePriceCents(600, 9999), 600);
  assert.equal(effectivePriceCents(600, NaN), 600);
});
