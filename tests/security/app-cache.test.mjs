import test from 'node:test';
import assert from 'node:assert/strict';
import { getCached, setCache } from '../../src/lib/app-cache.ts';

test('persisted cache survives reload with Unicode profile text', () => {
  const saved = new Map();
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  };
  try {
    const profile = { display_name: 'José 🎉', bio: 'こんにちは世界' };
    setCache('unicode-profile', profile);
    assert.ok(saved.has('disband:cache:unicode-profile'));

    delete globalThis.__disband_cache_store__;
    assert.deepEqual(getCached('unicode-profile'), profile);
  } finally {
    delete globalThis.__disband_cache_store__;
    delete globalThis.localStorage;
  }
});
