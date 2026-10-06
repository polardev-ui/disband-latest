/**
 * mergeFetchedRows: a fetch snapshot must never wipe messages that arrived
 * over realtime while it was in flight, unsent optimistic rows, or
 * previously paged-in history.
 *
 * Regression: DMs/channels sometimes stayed empty until you left and
 * re-entered the conversation — the loader replaced the list with a stale
 * snapshot whose INSERT events were already consumed, and a failed load
 * blanked the list outright.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeFetchedRows } from '../../src/lib/messages.ts';

const row = (id, ts) => ({ id, created_at: ts });

test('empty previous list returns the fetch as-is', () => {
  const fetched = [row('a', '2026-10-02T10:00:00Z')];
  assert.deepEqual(mergeFetchedRows([], fetched), fetched);
});

test('empty fetch keeps what is on screen', () => {
  const prev = [row('a', '2026-10-02T10:00:00Z')];
  assert.deepEqual(mergeFetchedRows(prev, []), prev);
});

test('realtime arrivals newer than the snapshot survive', () => {
  const prev = [
    row('a', '2026-10-02T10:00:00Z'),
    row('b', '2026-10-02T10:01:00Z'), // arrived while the fetch was in flight
  ];
  const fetched = [row('a', '2026-10-02T10:00:00Z')];
  assert.deepEqual(
    mergeFetchedRows(prev, fetched).map((m) => m.id),
    ['a', 'b'],
  );
});

test('paged-in history older than the page survives', () => {
  const prev = [
    row('old', '2026-10-02T09:00:00Z'),
    row('a', '2026-10-02T10:00:00Z'),
  ];
  const fetched = [row('a', '2026-10-02T10:00:00Z'), row('b', '2026-10-02T10:01:00Z')];
  assert.deepEqual(
    mergeFetchedRows(prev, fetched).map((m) => m.id),
    ['old', 'a', 'b'],
  );
});

test('unsent optimistic rows are never dropped', () => {
  const prev = [
    row('a', '2026-10-02T10:00:00Z'),
    row('opt-1', '2026-10-02T10:00:30Z'),
  ];
  const fetched = [row('a', '2026-10-02T10:00:00Z'), row('b', '2026-10-02T10:01:00Z')];
  assert.deepEqual(
    mergeFetchedRows(prev, fetched).map((m) => m.id),
    ['a', 'b', 'opt-1'],
  );
});

test('rows inside the window but missing from the fetch are treated as deleted', () => {
  const prev = [
    row('a', '2026-10-02T10:00:00Z'),
    row('gone', '2026-10-02T10:00:30Z'),
    row('b', '2026-10-02T10:01:00Z'),
  ];
  const fetched = [row('a', '2026-10-02T10:00:00Z'), row('b', '2026-10-02T10:01:00Z')];
  assert.deepEqual(
    mergeFetchedRows(prev, fetched).map((m) => m.id),
    ['a', 'b'],
  );
});

test('conflicts resolve in favour of the fetched row', () => {
  const prev = [{ id: 'a', created_at: '2026-10-02T10:00:00Z', content: 'stale' }];
  const fetched = [{ id: 'a', created_at: '2026-10-02T10:00:00Z', content: 'fresh' }];
  const merged = mergeFetchedRows(prev, fetched);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].content, 'fresh');
});

test('burst scale: 500 realtime arrivals survive a refresh with no loss or dupes', () => {
  const base = Date.parse('2026-10-02T10:00:00Z');
  const ts = (i) => new Date(base + i * 1000).toISOString();
  // Snapshot taken at message 100; 400 more arrive while it is in flight.
  const fetched = Array.from({ length: 101 }, (_, i) => row(`m${i}`, ts(i)));
  const prev = Array.from({ length: 501 }, (_, i) => row(`m${i}`, ts(i)));
  const merged = mergeFetchedRows(prev, fetched);
  assert.equal(merged.length, 501);
  const ids = merged.map((m) => m.id);
  assert.equal(new Set(ids).size, 501);
  assert.deepEqual(ids, [...ids].sort((a, b) => {
    const na = Number(a.slice(1));
    const nb = Number(b.slice(1));
    return na - nb;
  }));
});
