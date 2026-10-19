/**
 * Server-side Spotify connections (migration 0138). Tokens must never be
 * readable by the browser roles: only the service role may touch the table.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const USER = '00000000-0000-4000-8000-0000000000a1';

test('spotify_connections is service-role only and cascades with the profile', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.profiles(id uuid primary key);
      grant usage on schema public to anon, authenticated, service_role;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;`);
    await db.query(`insert into public.profiles (id) values ($1)`, [USER]);
    await db.exec(await readFile('supabase/migrations/0138_spotify_connections.sql', 'utf8'));

    const shape = await db.query(
      `select relrowsecurity as rls,
              has_table_privilege('anon','public.spotify_connections','select') as anon_select,
              has_table_privilege('authenticated','public.spotify_connections','select') as auth_select,
              has_table_privilege('service_role','public.spotify_connections','select') as service_select
         from pg_class where oid='public.spotify_connections'::regclass`,
    );
    assert.equal(shape.rows[0].rls, true);
    assert.equal(shape.rows[0].anon_select, false);
    assert.equal(shape.rows[0].auth_select, false);
    assert.equal(shape.rows[0].service_select, true);

    await db.query(
      `insert into public.spotify_connections (user_id, access_token, refresh_token, expires_at)
       values ($1, 'access', 'refresh', now() + interval '1 hour')`,
      [USER],
    );
    await assert.rejects(
      db.exec(`set role authenticated; select * from public.spotify_connections`),
      /permission denied/,
    );
    await db.exec('reset role');

    await db.query(`delete from public.profiles where id = $1`, [USER]);
    const left = await db.query('select count(*) as n from public.spotify_connections');
    assert.equal(Number(left.rows[0].n), 0);
  } finally {
    await db.close();
  }
});
