import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Apple Catalyst upserts grant every unit once and allow unrelated grants', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.server_catalysts (
        id bigint generated always as identity primary key,
        apple_transaction_id text,
        session_seq integer not null default 0
      );
      create unique index idx_server_catalysts_apple_unit
        on public.server_catalysts (apple_transaction_id, session_seq)
        where apple_transaction_id is not null;
    `);
    const deliver = `insert into public.server_catalysts (apple_transaction_id, session_seq)
      values ('apple-purchase', 0), ('apple-purchase', 1)
      on conflict (apple_transaction_id, session_seq) do nothing`;
    // Reproduce the exact SQL failure that PostgREST previously swallowed.
    await assert.rejects(db.exec(deliver), /no unique or exclusion constraint/);
    await db.exec(await readFile('supabase/migrations/0123_apple_catalyst_purchase_units.sql', 'utf8'));
    await db.exec(deliver);
    await db.exec(deliver);
    await db.exec(`insert into public.server_catalysts (apple_transaction_id)
      values (null), (null), (null)`);
    const { rows } = await db.query(`select
      count(*) filter (where apple_transaction_id is not null)::int as purchased,
      count(*) filter (where apple_transaction_id is null)::int as unrelated
      from public.server_catalysts`);
    assert.deepEqual(rows, [{ purchased: 2, unrelated: 3 }]);
  } finally {
    await db.close();
  }
});
