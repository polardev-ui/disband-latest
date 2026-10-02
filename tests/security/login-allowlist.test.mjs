/**
 * Login gate allowlist.
 *
 * Apple's App Review account (`disband@apple.com`) must always be able to
 * reach the sign-in form: it uses a mailbox that can never receive our mail
 * (so email confirmation can never be completed by clicking), Apple's egress
 * can read as a proxy to the VPN detectors, and several testers share the one
 * account — which is precisely what the burst cap and per-email rate limits
 * trip on. These tests lock the address in and check the merge rules for the
 * `LOGIN_ALLOWLIST_EMAILS` env extension.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { isLoginAllowlisted } = await import('../../src/lib/login-allowlist.ts');

test('the Apple review account is always allowlisted', () => {
  assert.equal(isLoginAllowlisted('disband@apple.com', undefined), true);
  assert.equal(isLoginAllowlisted('  Disband@Apple.com  ', undefined), true);
  assert.equal(isLoginAllowlisted('DISBAND@APPLE.COM', ''), true);
});

test('ordinary addresses are not allowlisted by default', () => {
  assert.equal(isLoginAllowlisted('someone@example.com', undefined), false);
  assert.equal(isLoginAllowlisted('someone@example.com', ''), false);
  assert.equal(isLoginAllowlisted('', undefined), false);
});

test('LOGIN_ALLOWLIST_EMAILS adds addresses', () => {
  const env = 'qa@test.example, , not-an-email, Second@Example.COM';
  assert.equal(isLoginAllowlisted('qa@test.example', env), true);
  assert.equal(isLoginAllowlisted('second@example.com', env), true);
  assert.equal(isLoginAllowlisted('third@example.com', env), false);
  assert.equal(isLoginAllowlisted('not-an-email', env), false);
});

test('the env var can only add — it cannot drop the built-in review account', () => {
  // Removing an entry via env would reproduce the exact lockout this list
  // exists to prevent, so the built-in always wins.
  assert.equal(isLoginAllowlisted('disband@apple.com', 'other@example.com'), true);
});
