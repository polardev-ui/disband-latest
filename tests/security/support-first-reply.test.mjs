import { registerHooks } from 'node:module';
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

// Exercise the actual ticket-creation route with no database/model/network calls.
const stateKey = '__supportFirstReplyTest';
const mocks = {
  '@/lib/supabase/server': `export const getRouteUser = async () => globalThis.${stateKey}.user; export const getServiceSupabase = () => globalThis.${stateKey}.service;`,
  '@/lib/rate-limit': `export const rateLimit = () => ({allowed: !globalThis.${stateKey}.limited, retryAfterSeconds: 60}); export const tooManyRequests = () => Response.json({error:'Rate limited'}, {status:429});`,
  '@/lib/auth-guard': 'export const persistentRateLimitCheck = async () => false;',
  '@/lib/tether-support': `export const chatWithSupportTether = async (input) => { const state = globalThis.${stateKey}; state.calls.push(input); if (state.wait) await state.wait; if (state.modelError) throw state.modelError; return 'Here is how to fix that.'; };`,
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks[specifier]) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    return nextResolve(specifier, context);
  },
});
const { POST } = await import('../../src/app/api/support/tickets/route.ts');
const { DeepSeekUnavailableError } = await import('../../src/lib/deepseek.ts');
const user = { id: 'signed-in-user', email: 'user@example.com' };
let state;
beforeEach(() => {
  state = { user, calls: [], rows: [], limited: false, modelError: null, failRole: null };
  state.service = {
    auth: { admin: { getUserById: async () => ({ data: { user } }) } },
    from(table) {
      return {
        insert(row) {
          if (table === 'support_tickets') return { select: () => ({ single: async () => ({ data: { id: 'new-ticket', ...row }, error: null }) }) };
          if (state.failRole === row.role) return Promise.resolve({ error: { message: 'Write failed' } });
          state.rows.push(row);
          return Promise.resolve({ error: null });
        },
        update() { return { eq: async () => ({ error: null }) }; },
      };
    },
  };
  globalThis[stateKey] = state;
});
after(() => { hooks.deregister(); delete globalThis[stateKey]; });
const create = (message, extra = {}) => POST(new Request('http://localhost/api/support/tickets', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ subject: message, message, ...extra }),
}));

for (const message of ["I can't log in", 'Billing question', 'Someone is harassing me', 'Something is broken', 'My microphone stopped working']) {
  test(`first reply is generated and saved for: ${message}`, async () => {
    const response = await create(message, { user_id: 'another-user' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ticket.id, 'new-ticket');
    assert.equal(state.calls.length, 1);
    assert.equal(state.calls[0].userId, user.id);
    assert.deepEqual(state.calls[0].history, [{ role: 'user', content: message }]);
    assert.deepEqual(state.rows, [
      { ticket_id: 'new-ticket', role: 'user', content: message },
      { ticket_id: 'new-ticket', role: 'tether', content: 'Here is how to fix that.' },
    ]);
  });
}

test('creation does not finish before Tether answers and the reply is persisted', async () => {
  let release;
  state.wait = new Promise(resolve => { release = resolve; });
  let finished = false;
  const response = create('Help with a call').then(result => { finished = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.calls.length, 1);
  assert.equal(finished, false);
  assert.equal(state.rows.length, 1);
  release();
  await response;
  assert.equal(state.rows.at(-1).role, 'tether');
});

test('model unavailability leaves a visible reply instead of a silent conversation', async () => {
  state.modelError = new DeepSeekUnavailableError('Unavailable');
  const response = await create('Help');
  assert.equal(response.status, 200);
  assert.match(state.rows.at(-1).content, /warming up/);
});

test('failed initial-message writes do not invoke Tether and surface an error on the existing ticket', async () => {
  state.failRole = 'user';
  const data = await (await create('Help')).json();
  assert.equal(state.calls.length, 0);
  assert.equal(data.ticket.id, 'new-ticket');
  assert.match(data.replyError, /first message could not be saved/);
});

test('failed reply persistence keeps the ticket and reports the failure', async () => {
  state.failRole = 'tether';
  const data = await (await create('Help')).json();
  assert.equal(data.ticket.id, 'new-ticket');
  assert.match(data.replyError, /reply could not be saved/);
  assert.equal(state.rows.length, 1);
});

test('logged-out and rate-limited requests never invoke Tether', async () => {
  state.user = null;
  assert.equal((await create('Help')).status, 401);
  state.user = user;
  state.limited = true;
  assert.equal((await create('Help')).status, 429);
  assert.equal(state.calls.length, 0);
});
