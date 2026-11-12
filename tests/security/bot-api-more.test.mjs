/**
 * Migration 0259: the bot API's new reads, writes and gateway events.
 *
 * The fixture copies the live definitions of bot_actor, bot_message_to_json
 * and the message-event trigger, and stands in for channel permissions with a
 * "hidden" table (a user can't see a channel listed there) and role
 * permissions with a "perms" table.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const OWNER = U(1), ALICE = U(2), STRANGER = U(3);
const BOT_USER = U(10), BOT2_USER = U(11);
const SERVER = U(100), OTHER_SERVER = U(101);
const GENERAL = U(200), SECRET = U(201), FORUM = U(202);
const BOT = U(300), BOT2 = U(301);

const FIXTURE = `
create role anon; create role authenticated; create role service_role;
create table public.profiles (
  id uuid primary key, username text, display_name text, avatar_url text, banner_url text,
  accent_color text, bio text, pronouns text, is_bot boolean default false,
  verified_bot boolean default false, created_at timestamptz not null default now());
create table public.servers (
  id uuid primary key default gen_random_uuid(), name text not null, description text,
  icon_url text, banner_url text, owner_id uuid not null,
  discoverable boolean not null default false, verified boolean not null default false,
  created_at timestamptz not null default now());
create table public.server_members (
  server_id uuid references public.servers on delete cascade, user_id uuid,
  joined_at timestamptz not null default now(), primary key (server_id, user_id));
create table public.bots (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, user_id uuid not null,
  name text not null, scopes text[] not null default '{}', revoked_at timestamptz);
create table public.bot_grants (
  bot_id uuid references public.bots on delete cascade,
  server_id uuid references public.servers on delete cascade,
  scopes text[] not null, created_at timestamptz not null default now(),
  primary key (bot_id, server_id));
create table public.bot_events (
  id bigserial primary key, bot_id uuid not null references public.bots on delete cascade,
  type text not null, payload jsonb not null,
  created_at timestamptz not null default now(), delivered_at timestamptz);
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers on delete cascade,
  category_id uuid, name text not null, type text not null default 'text',
  position int not null default 0, created_at timestamptz not null default now(),
  read_only boolean not null default false, user_limit int, locked boolean not null default false,
  is_stage boolean not null default false, topic text, slow_mode_seconds int not null default 0,
  parent_id uuid references public.channels on delete cascade, post_author_id uuid,
  post_tags text[] not null default '{}', post_pinned boolean not null default false,
  message_count int not null default 0, available_tags text[] not null default '{}',
  last_message_at timestamptz);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  author_id uuid not null, content text, embeds jsonb, components jsonb, interaction jsonb,
  webhook jsonb, reply_to_id uuid, mentions uuid[], attachment_url text, attachment_type text,
  created_at timestamptz not null default now(), edited_at timestamptz, display_id bigserial);
create table public.message_reactions (
  id uuid primary key default gen_random_uuid(), context_type text not null,
  message_id uuid not null, user_id uuid not null, emoji text not null,
  created_at timestamptz not null default now(),
  unique (context_type, message_id, user_id, emoji));
create table public.server_roles (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers on delete cascade,
  name text not null, color text not null default '#000000', permissions jsonb not null default '{}',
  position int not null default 0, is_default boolean not null default false,
  created_at timestamptz not null default now(), self_assignable boolean not null default false,
  display_id bigserial, icon text);
create table public.audit (actor uuid, server uuid, action text, target_type text, target_id text, details jsonb);
create table public.hidden (user_id uuid, channel_id uuid);
create table public.perms (server_id uuid, user_id uuid, permission text);

create function public.channel_permission_for(p_actor uuid, p_channel_id uuid, p_permission text)
returns boolean language sql stable as $$
  select exists (select 1 from public.channels where id = p_channel_id)
     and not exists (select 1 from public.hidden where user_id = p_actor and channel_id = p_channel_id) $$;
create function public.is_bot_platform_banned(p uuid) returns boolean language sql as $$ select false $$;
create function public.bot_has_server_permission(p_server_id uuid, p_user_id uuid, p_permission text)
returns boolean language sql stable as $$
  select exists (select 1 from public.perms
                 where server_id = p_server_id and user_id = p_user_id and permission = p_permission) $$;
create function public.bot_write_audit(p_actor_id uuid, p_server_id uuid, p_action text, p_target_type text, p_target_id text, p_details jsonb)
returns void language sql as $$
  insert into public.audit values (p_actor_id, p_server_id, p_action, p_target_type, p_target_id, p_details) $$;

-- Live definitions (as of 0258).
create function public.bot_actor(p_bot_id uuid, p_server_id uuid, p_scopes text[], p_permission text default null)
returns uuid language plpgsql stable security definer set search_path to 'public' as $$
declare v_bot public.bots%rowtype;
begin
  select * into v_bot from public.bots where id = p_bot_id;
  if not found then raise exception 'Bot not found'; end if;
  if v_bot.revoked_at is not null then raise exception 'This bot has been revoked'; end if;
  if public.is_bot_platform_banned(p_bot_id) then raise exception 'This bot has been restricted'; end if;
  if not exists (select 1 from public.server_members where server_id = p_server_id and user_id = v_bot.user_id) then
    raise exception 'This bot is not a member of that server';
  end if;
  if p_scopes is not null and not exists (
    select 1 from public.bot_grants where bot_id = p_bot_id and server_id = p_server_id and scopes && p_scopes) then
    raise exception 'This bot does not have % in that server', array_to_string(p_scopes, ' or ');
  end if;
  if p_permission is not null and not public.bot_has_server_permission(p_server_id, v_bot.user_id, p_permission) then
    raise exception 'This bot needs the % role permission', p_permission;
  end if;
  return v_bot.user_id;
end; $$;

create function public.bot_message_to_json(p_msg public.messages, p_server_id uuid)
returns jsonb language plpgsql stable set search_path to 'public' as $$
declare v_author_name text; v_author_username text; v_author_avatar text; v_author_bot boolean;
begin
  select coalesce(display_name, username, 'Unknown'), username, avatar_url, is_bot
    into v_author_name, v_author_username, v_author_avatar, v_author_bot
  from public.profiles where id = p_msg.author_id;
  return jsonb_build_object('id', p_msg.id, 'channel_id', p_msg.channel_id, 'server_id', p_server_id,
    'author', jsonb_build_object('id', p_msg.author_id, 'username', v_author_username,
      'display_name', v_author_name, 'avatar_url', v_author_avatar, 'is_bot', coalesce(v_author_bot, false)),
    'content', p_msg.content, 'embeds', coalesce(p_msg.embeds, '[]'::jsonb),
    'components', coalesce(p_msg.components, '[]'::jsonb), 'interaction', p_msg.interaction,
    'webhook_id', p_msg.webhook ->> 'id', 'reply_to_id', p_msg.reply_to_id, 'mentions', p_msg.mentions,
    'attachment_url', p_msg.attachment_url, 'attachment_type', p_msg.attachment_type,
    'created_at', p_msg.created_at, 'edited_at', p_msg.edited_at, 'display_id', p_msg.display_id);
end; $$;

create function public.bot_events_dispatch() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_server uuid; v_type text; v_payload jsonb;
begin
  if tg_op = 'INSERT' then
    v_type := 'messageCreate';
    select server_id into v_server from public.channels where id = new.channel_id;
    v_payload := public.bot_message_to_json(new, v_server);
  elsif tg_op = 'UPDATE' then
    v_type := 'messageUpdate';
    select server_id into v_server from public.channels where id = new.channel_id;
    v_payload := jsonb_build_object('id', new.id, 'channel_id', new.channel_id, 'server_id', v_server,
      'content', new.content, 'edited_at', new.edited_at);
  else
    v_type := 'messageDelete';
    select server_id into v_server from public.channels where id = old.channel_id;
    v_payload := jsonb_build_object('id', old.id, 'channel_id', old.channel_id, 'server_id', v_server);
  end if;
  if v_server is not null then
    insert into public.bot_events (bot_id, type, payload)
    select b.id, v_type, v_payload from public.bots b
    where b.revoked_at is null
      and public.channel_permission_for(b.user_id, (v_payload->>'channel_id')::uuid, 'view')
      and 'messages.read' = any (b.scopes)
      and exists (select 1 from public.server_members sm where sm.server_id = v_server and sm.user_id = b.user_id)
      and exists (select 1 from public.bot_grants g where g.bot_id = b.id and g.server_id = v_server and 'messages.read' = any (g.scopes));
  end if;
  return coalesce(new, old);
end; $$;
create trigger bot_events_message_create after insert on public.messages for each row execute function public.bot_events_dispatch();
create trigger bot_events_message_update after update on public.messages for each row execute function public.bot_events_dispatch();
create trigger bot_events_message_delete after delete on public.messages for each row execute function public.bot_events_dispatch();
`;

const ALL_SCOPES = `'{messages.read,messages.write,messages.delete,messages.react,members.read,channels.read,channels.manage,roles.manage,servers.read}'`;

async function fixture() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(await readFile('supabase/migrations/0259_bot_api_more.sql', 'utf8'));
  await db.exec(`
    insert into public.profiles (id, username, display_name, is_bot) values
      ('${OWNER}', 'owner', 'Owner', false), ('${ALICE}', 'alice', 'Alice', false),
      ('${STRANGER}', 'stranger', null, false),
      ('${BOT_USER}', 'helper', 'Helper', true), ('${BOT2_USER}', 'reader', 'Reader', true);
    insert into public.servers (id, name, owner_id) values
      ('${SERVER}', 'Home', '${OWNER}'), ('${OTHER_SERVER}', 'Elsewhere', '${OWNER}');
    insert into public.server_members (server_id, user_id) values
      ('${SERVER}', '${OWNER}'), ('${SERVER}', '${ALICE}'), ('${SERVER}', '${BOT_USER}'),
      ('${SERVER}', '${BOT2_USER}'), ('${OTHER_SERVER}', '${STRANGER}');
    insert into public.bots (id, owner_id, user_id, name, scopes) values
      ('${BOT}', '${OWNER}', '${BOT_USER}', 'Helper', ${ALL_SCOPES}),
      ('${BOT2}', '${OWNER}', '${BOT2_USER}', 'Reader', '{messages.read}');
    insert into public.bot_grants (bot_id, server_id, scopes) values
      ('${BOT}', '${SERVER}', ${ALL_SCOPES}), ('${BOT2}', '${SERVER}', '{messages.read}');
    insert into public.channels (id, server_id, name, type, available_tags) values
      ('${GENERAL}', '${SERVER}', 'general', 'text', '{}'),
      ('${SECRET}', '${SERVER}', 'secret', 'text', '{}'),
      ('${FORUM}', '${SERVER}', 'ideas', 'forum', '{bug,idea}');
    insert into public.hidden values ('${BOT2_USER}', '${SECRET}');
    insert into public.messages (id, channel_id, author_id, content, created_at)
      select ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, '${GENERAL}', '${ALICE}',
             'message ' || i, now() - make_interval(mins => 20 - i)
      from generate_series(1, 10) i;
    delete from public.bot_events;
  `);
  return db;
}

const M = (i) => `00000000-0000-0000-0001-${String(i).padStart(12, '0')}`;
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0]?.r;
const take = (db, bot) => one(db, `select public.take_bot_events($1, 100) r`, [bot]);
const contents = (list) => list.map((m) => m.content);

test('history pages before, after and around a message, newest first', async () => {
  const db = await fixture();
  try {
    const list = (args) => one(db, `select public.bot_list_messages(${args}) r`);
    assert.deepEqual(contents(await list(`'${BOT}', '${GENERAL}', 3`)), ['message 10', 'message 9', 'message 8']);
    assert.deepEqual(contents(await list(`'${BOT}', '${GENERAL}', 3, p_before_id => '${M(5)}'`)), ['message 4', 'message 3', 'message 2']);
    assert.deepEqual(contents(await list(`'${BOT}', '${GENERAL}', 3, p_after_id => '${M(5)}'`)), ['message 8', 'message 7', 'message 6']);
    assert.deepEqual(contents(await list(`'${BOT}', '${GENERAL}', 5, p_around_id => '${M(5)}'`)),
      ['message 7', 'message 6', 'message 5', 'message 4', 'message 3']);
    assert.deepEqual(await list(`'${BOT}', '${GENERAL}', 3, p_after_id => '${U(999)}'`), []);
    // The old four-argument call the current route makes still works.
    assert.equal((await list(`p_bot_id => '${BOT}', p_channel_id => '${GENERAL}', p_limit => 2, p_before_id => null`)).length, 2);
    await assert.rejects(list(`'${BOT}', '${GENERAL}', 3, '${M(5)}', '${M(6)}'`), /only one of before, after, or around/);
    await assert.rejects(list(`'${BOT2}', '${SECRET}', 3`), /permission denied/);
  } finally {
    await db.close();
  }
});

test('one message comes with its reactions; who reacted, and clearing them', async () => {
  const db = await fixture();
  try {
    await db.exec(`
      insert into public.message_reactions (context_type, message_id, user_id, emoji) values
        ('channel', '${M(3)}', '${ALICE}', '✅'), ('channel', '${M(3)}', '${BOT_USER}', '✅');`);
    await db.exec(`
      insert into public.message_reactions (context_type, message_id, user_id, emoji) values
        ('channel', '${M(3)}', '${OWNER}', '🎉');`);
    const msg = await one(db, `select public.bot_get_message('${BOT}', '${GENERAL}', '${M(3)}') r`);
    assert.equal(msg.content, 'message 3');
    assert.deepEqual(msg.reactions, [
      { emoji: '✅', count: 2, me: true },
      { emoji: '🎉', count: 1, me: false },
    ]);
    await assert.rejects(db.query(`select public.bot_get_message('${BOT}', '${SECRET}', '${M(3)}')`), /Message not found/);

    const who = await one(db, `select public.bot_list_reactions('${BOT}', '${GENERAL}', '${M(3)}', '✅') r`);
    assert.deepEqual(who.map((u) => u.username).sort(), ['alice', 'helper']);

    // Removing someone else's reaction needs manage_messages.
    await assert.rejects(
      db.query(`select public.bot_remove_reactions('${BOT}', '${GENERAL}', '${M(3)}', '✅', '${ALICE}')`),
      /manage_messages/);
    await db.exec(`insert into public.perms values ('${SERVER}', '${BOT_USER}', 'manage_messages')`);
    assert.equal(await one(db, `select public.bot_remove_reactions('${BOT}', '${GENERAL}', '${M(3)}', '✅', '${ALICE}') r`), 1);
    assert.equal(await one(db, `select public.bot_remove_reactions('${BOT}', '${GENERAL}', '${M(3)}') r`), 2);
    const audit = await db.query(`select count(*)::int n from public.audit where action = 'reaction.remove'`);
    assert.equal(audit.rows[0].n, 2);
    // A read-only bot can't clear anything.
    await assert.rejects(db.query(`select public.bot_remove_reactions('${BOT2}', '${GENERAL}', '${M(3)}')`), /messages\.delete/);
  } finally {
    await db.close();
  }
});

test('servers, profiles and the typing check', async () => {
  const db = await fixture();
  try {
    const servers = await one(db, `select public.bot_list_servers('${BOT}') r`);
    assert.deepEqual(servers.map((s) => s.name), ['Home']);
    assert.ok(servers[0].scopes.includes('members.read'));

    const alice = await one(db, `select public.bot_get_user('${BOT}', '${ALICE}') r`);
    assert.equal(alice.username, 'alice');
    assert.equal(alice.is_bot, false);
    // Someone who shares no space with the bot, and a bot without members.read.
    await assert.rejects(db.query(`select public.bot_get_user('${BOT}', '${STRANGER}')`), /User not found/);
    await assert.rejects(db.query(`select public.bot_get_user('${BOT2}', '${ALICE}')`), /User not found/);
    assert.equal((await one(db, `select public.bot_get_user('${BOT2}', '${BOT2_USER}') r`)).username, 'reader');

    const typing = await one(db, `select public.bot_typing_gate('${BOT}', '${GENERAL}') r`);
    assert.deepEqual(typing, { user_id: BOT_USER, server_id: SERVER, name: 'Helper' });
    await assert.rejects(db.query(`select public.bot_typing_gate('${BOT2}', '${GENERAL}')`), /messages\.write/);
  } finally {
    await db.close();
  }
});

test('forum posts: create with the forum\'s own tags, then list them', async () => {
  const db = await fixture();
  try {
    const made = await one(db, `select public.bot_create_forum_post('${BOT}', '${FORUM}', ' Release notes ', 'v2 is out', '{idea,nope,idea}') r`);
    assert.equal(made.post.title, 'Release notes');
    assert.deepEqual(made.post.tags, ['idea']);
    assert.equal(made.post.forum_id, FORUM);
    assert.equal(made.message.content, 'v2 is out');
    assert.equal(made.message.channel_id, made.post.id);

    const posts = await one(db, `select public.bot_list_forum_posts('${BOT}', '${FORUM}') r`);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].opening, 'v2 is out');

    await assert.rejects(db.query(`select public.bot_create_forum_post('${BOT}', '${GENERAL}', 'x', 'y')`), /Forum not found/);
    await assert.rejects(db.query(`select public.bot_create_forum_post('${BOT}', '${FORUM}', '', 'y')`), /title is required/);
    await assert.rejects(db.query(`select public.bot_create_forum_post('${BOT2}', '${FORUM}', 'x', 'y')`), /messages\.write/);
  } finally {
    await db.close();
  }
});

test('gateway: reaction, channel, role, server and membership events reach the right bots', async () => {
  const db = await fixture();
  try {
    // Joining a space.
    await db.exec(`
      insert into public.server_members (server_id, user_id) values ('${OTHER_SERVER}', '${BOT_USER}');
      insert into public.bot_grants (bot_id, server_id, scopes) values ('${BOT}', '${OTHER_SERVER}', '{messages.read}');`);
    const joined = await take(db, BOT);
    assert.deepEqual(joined.map((e) => e.type), ['serverJoin']);
    assert.equal(joined[0].payload.server.name, 'Elsewhere');

    // Message events still flow through the rewritten delivery.
    await db.exec(`insert into public.messages (channel_id, author_id, content) values ('${SECRET}', '${ALICE}', 'psst')`);
    await db.exec(`insert into public.message_reactions (context_type, message_id, user_id, emoji) values ('channel', '${M(1)}', '${ALICE}', '👍')`);
    await db.exec(`delete from public.message_reactions where emoji = '👍'`);
    await db.exec(`insert into public.message_reactions (context_type, message_id, user_id, emoji) values ('dm', '${M(1)}', '${ALICE}', '👀')`);

    const first = await take(db, BOT);
    assert.deepEqual(first.map((e) => e.type), ['messageCreate', 'reactionAdd', 'reactionRemove']);
    assert.equal(first[1].payload.user.username, 'alice');
    assert.equal(first[1].payload.channel_id, GENERAL);
    // The reader can't see #secret, so it gets the reactions but not "psst".
    assert.deepEqual((await take(db, BOT2)).map((e) => e.type), ['reactionAdd', 'reactionRemove']);
    assert.deepEqual(await take(db, BOT), [], 'delivered once');

    // Channels: new and renamed; a busy channel (new messages) says nothing.
    await db.exec(`insert into public.channels (id, server_id, name) values ('${U(203)}', '${SERVER}', 'news')`);
    await db.exec(`update public.channels set name = 'announcements' where id = '${U(203)}'`);
    await db.exec(`update public.channels set last_message_at = now(), message_count = 5 where id = '${U(203)}'`);
    const chan = await take(db, BOT);
    assert.deepEqual(chan.map((e) => e.type), ['channelCreate', 'channelUpdate']);
    assert.equal(chan[1].payload.channel.name, 'announcements');
    assert.deepEqual((await take(db, BOT2)).map((e) => e.type), ['channelCreate', 'channelUpdate']);
    await db.exec(`delete from public.channels where id = '${U(203)}'`);
    assert.deepEqual((await take(db, BOT)).map((e) => e.type), ['channelDelete']);
    assert.deepEqual((await take(db, BOT2)).map((e) => e.type), ['channelDelete']);

    // Permissions that land just after the row still count: #staff is
    // hidden from the reader, so it never hears of it.
    await db.exec(`insert into public.channels (id, server_id, name) values ('${U(204)}', '${SERVER}', 'staff');
                   insert into public.hidden values ('${BOT2_USER}', '${U(204)}');`);
    assert.deepEqual(await take(db, BOT2), []);

    // Roles go to members.read or roles.manage; the reader has neither.
    await db.exec(`insert into public.server_roles (id, server_id, name) values ('${U(400)}', '${SERVER}', 'Staff')`);
    await db.exec(`update public.server_roles set color = '#ff0000' where id = '${U(400)}'`);
    await db.exec(`delete from public.server_roles where id = '${U(400)}'`);
    assert.deepEqual((await take(db, BOT)).map((e) => e.type), ['channelCreate', 'roleCreate', 'roleUpdate', 'roleDelete']);
    assert.deepEqual(await take(db, BOT2), []);

    // Server settings; then the reader's scopes change and it's removed.
    await db.exec(`update public.servers set name = 'Home Base' where id = '${SERVER}'`);
    const upd = await take(db, BOT);
    assert.deepEqual(upd.map((e) => e.type), ['serverUpdate']);
    assert.equal(upd[0].payload.server.name, 'Home Base');
    await db.exec(`update public.bot_grants set scopes = '{messages.read,members.read}' where bot_id = '${BOT2}'`);
    await db.exec(`delete from public.bot_grants where bot_id = '${BOT2}'`);
    // Its serverUpdate is dropped: by delivery it had left the space.
    assert.deepEqual((await take(db, BOT2)).map((e) => e.type), ['scopesUpdate', 'serverLeave']);
  } finally {
    await db.close();
  }
});

test('deleting a bot with grants still works, and its queue goes with it', async () => {
  const db = await fixture();
  try {
    await db.exec(`delete from public.bots where id = '${BOT}'`);
    const left = await db.query(`select count(*)::int n from public.bot_events where bot_id = '${BOT}'`);
    assert.equal(left.rows[0].n, 0);
  } finally {
    await db.close();
  }
});
