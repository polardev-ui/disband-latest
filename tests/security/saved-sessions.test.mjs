import test from 'node:test';
import assert from 'node:assert/strict';
import { getSavedSessions, getSavedSessionTokens, removeSavedSession, saveSession } from '../../src/lib/saved-sessions.ts';

const key = 'disband-saved-sessions';

test('legacy saved accounts lose bearer tokens when read', () => {
  const storage = new Map([[key, JSON.stringify([{
    user_id: 'user-1', email: 'person@example.com', username: 'person',
    display_name: 'Person', avatar_url: null, saved_at: 1,
    access_token: 'old-access', refresh_token: 'old-refresh',
  }])]]);
  const tabStorage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (name) => storage.get(name) ?? null,
      setItem: (name, value) => storage.set(name, value),
    },
    sessionStorage: {
      getItem: (name) => tabStorage.get(name) ?? null,
      setItem: (name, value) => tabStorage.set(name, value),
      removeItem: (name) => tabStorage.delete(name),
    },
  };
  try {
    assert.deepEqual(getSavedSessions(), [{
      user_id: 'user-1', email: 'person@example.com', username: 'person',
      display_name: 'Person', avatar_url: null, saved_at: 1,
    }]);
    assert.equal(storage.get(key).includes('old-refresh'), false);
    assert.equal(storage.get(key).includes('old-access'), false);
    assert.equal(getSavedSessionTokens('user-1'), null);

    saveSession({
      user: { id: 'user-2', email: 'another@example.com', user_metadata: {} },
      access_token: 'new-access', refresh_token: 'new-refresh',
    });
    assert.equal(storage.get(key).includes('new-refresh'), false);
    assert.equal(storage.get(key).includes('new-access'), false);
    assert.equal(getSavedSessions().length, 2);
    assert.deepEqual(getSavedSessionTokens('user-2'), {
      access_token: 'new-access', refresh_token: 'new-refresh',
    });
    removeSavedSession('user-2');
    assert.equal(getSavedSessionTokens('user-2'), null);
  } finally {
    delete globalThis.window;
  }
});
