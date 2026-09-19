import test from 'node:test';
import assert from 'node:assert/strict';
import { getSavedSessions, saveSession } from '../../src/lib/saved-sessions.ts';

const key = 'disband-saved-sessions';

test('legacy saved accounts lose bearer tokens when read', () => {
  const storage = new Map([[key, JSON.stringify([{
    user_id: 'user-1', email: 'person@example.com', username: 'person',
    display_name: 'Person', avatar_url: null, saved_at: 1,
    access_token: 'old-access', refresh_token: 'old-refresh',
  }])]]);
  globalThis.window = {
    localStorage: {
      getItem: (name) => storage.get(name) ?? null,
      setItem: (name, value) => storage.set(name, value),
    },
  };
  try {
    assert.deepEqual(getSavedSessions(), [{
      user_id: 'user-1', email: 'person@example.com', username: 'person',
      display_name: 'Person', avatar_url: null, saved_at: 1,
    }]);
    assert.equal(storage.get(key).includes('old-refresh'), false);
    assert.equal(storage.get(key).includes('old-access'), false);

    saveSession({
      user: { id: 'user-2', email: 'another@example.com', user_metadata: {} },
      access_token: 'new-access', refresh_token: 'new-refresh',
    });
    assert.equal(storage.get(key).includes('new-refresh'), false);
    assert.equal(storage.get(key).includes('new-access'), false);
    assert.equal(getSavedSessions().length, 2);
  } finally {
    delete globalThis.window;
  }
});
