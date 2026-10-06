/**
 * capHistoryRows: scrollback paging must not accumulate unbounded state.
 *
 * Realtime inserts trim to the latest window, but paging up prepends
 * indefinitely. Past MAX_HISTORY_ROWS the oldest rows are dropped (they
 * remain refetchable via hasMore).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { capHistoryRows, MAX_HISTORY_ROWS } from '../../src/lib/message-pagination.ts';

const row = (id) => ({ id });

test('short lists pass through untouched', () => {
  const rows = [row('a'), row('b')];
  const out = capHistoryRows(rows);
  assert.equal(out.trimmed, false);
  assert.deepEqual(out.rows, rows);
});

test('over-cap lists keep the newest rows', () => {
  const rows = Array.from({ length: MAX_HISTORY_ROWS + 50 }, (_, i) => row(`m${i}`));
  const out = capHistoryRows(rows);
  assert.equal(out.trimmed, true);
  assert.equal(out.rows.length, MAX_HISTORY_ROWS);
  assert.equal(out.rows[0].id, 'm50');
  assert.equal(out.rows[MAX_HISTORY_ROWS - 1].id, `m${MAX_HISTORY_ROWS + 49}`);
});

test('exactly at cap is not trimmed', () => {
  const rows = Array.from({ length: MAX_HISTORY_ROWS }, (_, i) => row(`m${i}`));
  assert.equal(capHistoryRows(rows).trimmed, false);
});
