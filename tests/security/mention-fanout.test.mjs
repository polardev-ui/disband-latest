/**
 * @everyone fanout (migration 0114).
 *
 * PostgreSQL regex \b is BACKSPACE, not a word boundary (\y is). The trigger
 * and the bot gate were written with PCRE habits, so in production an
 * @everyone in a 4,826-member server produced zero expansion notifications —
 * only client-resolved @user mentions (which deliberately skip the token)
 * ever notified anyone. The bot-side gate failed the other way: it never
 * matched, so bots could @everyone without the mention_everyone permission.
 *
 * This binds notify_mentions (from 0114) to fixture tables and proves the
 * expansion end to end. bot_send_message is too entangled to execute here
 * (bots, grants, permission functions); its one-character fix is proven
 * identical by construction, and the def-contains-\y assertion below guards
 * both functions against future copies dropping it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ALICE = '00000000-0000-4000-8000-0000000000a1';
const BOB = '00000000-0000-4000-8000-0000000000b2';
const CARA = '00000000-0000-4000-8000-0000000000c3';
const DAVE = '00000000-0000-4000-8000-0000000000d4';
const SERVER = '00000000-0000-4000-8000-00000000e500';
const CHANNEL = '00000000-0000-4000-8000-00000000f600';

test('@everyone notifies every member except the author', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.profiles(id uuid primary key, username text, display_name text);
      create table public.bots(id uuid primary key);
      create table public.channels(id uuid primary key, server_id uuid);
      create table public.server_members(server_id uuid, user_id uuid);
      create table public.messages(
        id uuid primary key default gen_random_uuid(), channel_id uuid, author_id uuid,
        content text not null default '', mentions uuid[] not null default '{}');
      create table public.notifications(
        id uuid primary key default gen_random_uuid(), user_id uuid, type text,
        title text, body text, link text);`);
    await db.exec(await readFile('supabase/migrations/0114_everyone_regex.sql', 'utf8'));
    await db.exec(`create trigger messages_notify_mentions after insert on public.messages
      for each row execute function public.notify_mentions();`);

    await db.query(
      `insert into public.profiles (id, username, display_name) values
        ($1, 'alice', 'Alice'), ($2, 'bob', 'Bob'), ($3, 'cara', 'Cara'), ($4, 'dave', 'Dave')`,
      [ALICE, BOB, CARA, DAVE],
    );
    await db.query(`insert into public.channels (id, server_id) values ($1, $2)`, [CHANNEL, SERVER]);
    await db.query(
      `insert into public.server_members (server_id, user_id) values ($1, $2), ($1, $3), ($1, $4)`,
      [SERVER, ALICE, BOB, CARA],
    );

    // The old pattern never matched real text; the fixed one must.
    const matched = await db.query(`select '@everyone hello' ~* '@everyone\\y' as yes,
      '@everyone hello' ~* '@everyone\\b' as no`);
    assert.equal(matched.rows[0].yes, true);
    assert.equal(matched.rows[0].no, false);

    await db.query(
      `insert into public.messages (channel_id, author_id, content) values ($1, $2, '@everyone hello everyone')`,
      [CHANNEL, ALICE],
    );
    const got = async (u) =>
      (await db.query(`select title, body, link from public.notifications where user_id = $1 and type = 'mention'`, [u])).rows;
    assert.equal((await got(BOB)).length, 1, 'member notified');
    assert.equal((await got(CARA)).length, 1, 'member notified');
    assert.equal((await got(ALICE)).length, 0, 'author never notifies themselves');
    assert.equal((await got(DAVE)).length, 0, 'non-member not notified');
    const bob = (await got(BOB))[0];
    assert.equal(bob.title, 'Alice mentioned you');
    assert.equal(bob.link, `channel:${CHANNEL}`);

    // A plain message with a client-resolved mention still notifies exactly it.
    await db.query(
      `insert into public.messages (channel_id, author_id, content, mentions) values ($1, $2, 'hi @bob', $3)`,
      [CHANNEL, ALICE, [BOB]],
    );
    assert.equal((await got(BOB)).length, 2);
    assert.equal((await got(CARA)).length, 1, 'no expansion without the token');

    // Both fixed bodies keep the correction.
    for (const fn of ['notify_mentions', 'bot_send_message']) {
      const { rows } = await db.query(
        `select pg_get_functiondef(oid) as def from pg_proc where proname = $1`, [fn]);
      assert.ok(rows.length > 0, `${fn} exists`);
      assert.match(rows[0].def, /\\y/, `${fn} uses a real word boundary`);
      assert.doesNotMatch(rows[0].def, /everyone\\b/, `${fn} has no backspace variant left`);
      assert.doesNotMatch(rows[0].def, /here\\b/, `${fn} has no backspace variant left`);
    }
  } finally {
    await db.close();
  }
});
