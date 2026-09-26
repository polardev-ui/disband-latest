import test from 'node:test';
import assert from 'node:assert/strict';
import { getSavedRefreshToken, saveSwitchRefreshToken, clearSavedRefreshToken } from '../../src/lib/switch-refresh-tokens.ts';

const refreshKey = (id) => `disband-switch-refresh:${id}`;

function mockWindow(storage) {
  globalThis.window = {
    localStorage: {
      getItem: (name) => storage.get(name) ?? null,
      setItem: (name, value) => storage.set(name, value),
      removeItem: (name) => storage.delete(name),
    },
  };
}

test('refresh tokens persist per account and clear on removal', () => {
  const storage = new Map();
  mockWindow(storage);
  try {
    assert.equal(getSavedRefreshToken('user-1'), null);

    saveSwitchRefreshToken('user-1', 'refresh-1');
    assert.equal(storage.get(refreshKey('user-1')), 'refresh-1');
    assert.equal(getSavedRefreshToken('user-1'), 'refresh-1');

    // A second account gets its own key; neither disturbs the other.
    saveSwitchRefreshToken('user-2', 'refresh-2');
    assert.equal(getSavedRefreshToken('user-1'), 'refresh-1');
    assert.equal(getSavedRefreshToken('user-2'), 'refresh-2');

    // Empty values are never written or returned.
    saveSwitchRefreshToken('user-3', '');
    assert.equal(getSavedRefreshToken('user-3'), null);
    assert.equal(storage.has(refreshKey('user-3')), false);

    clearSavedRefreshToken('user-1');
    assert.equal(getSavedRefreshToken('user-1'), null);
    assert.equal(getSavedRefreshToken('user-2'), 'refresh-2');
  } finally {
    delete globalThis.window;
  }
});
