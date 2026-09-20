import test from 'node:test';
import assert from 'node:assert/strict';
import { signOAuthState, verifyOAuthState } from '../../src/lib/discord.ts';

test('Discord OAuth state is signed, time limited, and rejects stale or future timestamps', async () => {
  const previousSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const realNow = Date.now;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-discord-oauth-state-secret';
  let now = 1_800_000_000_000;
  Date.now = () => now;
  try {
    const state = await signOAuthState({ userId: 'user-1', guild: '12345', nonce: 'nonce-1' });
    assert.deepEqual(await verifyOAuthState(state), {
      userId: 'user-1', guild: '12345', nonce: 'nonce-1', issuedAt: now,
    });
    const [body, signature] = state.split('.');
    const tampered = Buffer.from(JSON.stringify({
      userId: 'other-user', guild: '12345', nonce: 'nonce-1', issuedAt: now,
    })).toString('base64url');
    assert.equal(await verifyOAuthState(`${tampered}.${signature}`), null);
    now += 10 * 60_000 + 1;
    assert.equal(await verifyOAuthState(state), null);
    now -= 10 * 60_000 + 1;
    const future = await signOAuthState({ userId: 'user-1', guild: '12345', nonce: 'nonce-2' });
    now -= 30_001;
    assert.equal(await verifyOAuthState(future), null);
    assert.ok(body);
  } finally {
    Date.now = realNow;
    if (previousSecret === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousSecret;
  }
});
