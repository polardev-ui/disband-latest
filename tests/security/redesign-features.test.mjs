/**
 * The November 2026 features, proven against their migrations:
 *
 *   0237 favorites           — private per person, capped, no duplicates
 *   0238 saved messages      — private; reminders need Lite/Aero; the sweep
 *                              only notifies about messages still readable
 *   0239 topics + slow mode  — the cooldown is enforced by the database,
 *                              moderators and server-side inserts are exempt
 *   0240 forum channels      — members start posts without manage_channels,
 *                              posts carry and keep the forum's permissions,
 *                              only the author or a moderator edits a post
 *   0241 user appearance     — private; setting needs Lite/Aero
 *
 * The fixture is the smallest schema those migrations touch, with the
 * permission helpers reduced to their rules (membership, per-role overrides).
 * Roles and JWT claims follow the other database tests: SET ROLE to a
 * non-superuser, because running as the table owner would bypass RLS.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const MEMBER = '00000000-0000-4000-8000-0000000000b2';
const MOD = '00000000-0000-4000-8000-0000000000c3';
const OUTSIDER = '00000000-0000-4000-8000-0000000000d4';
const BOT = '00000000-0000-4000-8000-0000000000e5';
const SERVER = '10000000-0000-4000-8000-000000000001';
const EVERYONE = '20000000-0000-4000-8000-000000000001';
const VIP = '20000000-0000-4000-8000-000000000002';
const GENERAL = '30000000-0000-4000-8000-000000000001';

async function asRole(db, role, sub, fn) {
  await db.exec(`set role ${role}`);
  await db.exec(`set request.jwt.claim.role = '${role}'`);
  if (sub) await db.exec(`set request.jwt.claim.sub = '${sub}'`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
    await db.exec(`reset request.jwt.claim.sub`);
    await db.exec(`reset request.jwt.claim.role`);
  }
}

async function tryAs(db, sub, fn) {
  try {
    const value = await asRole(db, 'authenticated', sub, fn);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, message: String(error.message ?? error) };
  }
}

const as = (db, sub, fn) => asRole(db, 'authenticated', sub, fn);

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;

    create table public.profiles (id uuid primary key, is_bot boolean not null default false);
    create table public.servers (id uuid primary key, owner_id uuid not null);
    create table public.server_members (
      server_id uuid not null, user_id uuid not null, role text not null default 'member',
      primary key (server_id, user_id));
    create table public.server_roles (id uuid primary key, server_id uuid not null, is_default boolean not null default false);
    create table public.member_roles (server_id uuid not null, user_id uuid not null, role_id uuid not null);
    create table public.test_perms (user_id uuid not null, server_id uuid not null, perm text not null);
    create table public.test_plans (user_id uuid primary key, plan text not null);

    create table public.channels (
      id uuid primary key default gen_random_uuid(),
      server_id uuid not null references public.servers (id) on delete cascade,
      category_id uuid,
      name text not null,
      type text not null check (type in ('text', 'voice')),
      position int not null default 0,
      read_only boolean not null default false,
      last_message_at timestamptz,
      created_at timestamptz not null default now());

    create table public.channel_permissions (
      channel_id uuid not null references public.channels (id) on delete cascade,
      role_id uuid not null references public.server_roles (id) on delete cascade,
      can_view boolean, can_post boolean, can_react boolean, can_attach boolean,
      created_at timestamptz not null default now(),
      primary key (channel_id, role_id));

    create table public.messages (
      id uuid primary key default gen_random_uuid(),
      channel_id uuid not null references public.channels (id) on delete cascade,
      author_id uuid not null,
      content text not null default '',
      attachment_url text,
      mentions uuid[] not null default '{}',
      created_at timestamptz not null default now());

    create table public.dm_threads (id uuid primary key, user_a uuid not null, user_b uuid not null);
    create table public.dm_messages (
      id uuid primary key default gen_random_uuid(), thread_id uuid not null references public.dm_threads (id),
      author_id uuid not null, content text not null default '', created_at timestamptz not null default now());
    create table public.group_chats (id uuid primary key, name text not null);
    create table public.group_chat_members (group_id uuid not null, user_id uuid not null);
    create table public.group_messages (
      id uuid primary key default gen_random_uuid(), group_id uuid not null references public.group_chats (id),
      author_id uuid, content text not null default '', created_at timestamptz not null default now());
    create table public.notifications (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, type text not null,
      title text not null, body text, link text, read boolean not null default false,
      created_at timestamptz not null default now());

    create function public.is_server_member(p_server_id uuid) returns boolean language sql stable as $$
      select exists (select 1 from public.server_members where server_id = p_server_id and user_id = auth.uid()) $$;
    create function public.is_server_owner(p_server_id uuid) returns boolean language sql stable as $$
      select exists (select 1 from public.servers where id = p_server_id and owner_id = auth.uid()) $$;
    create function public.is_server_admin(p_server_id uuid) returns boolean language sql stable as $$
      select exists (select 1 from public.server_members where server_id = p_server_id and user_id = auth.uid() and role = 'admin') $$;
    create function public.member_has_server_permission(p_server_id uuid, p_user uuid, p_perm text)
      returns boolean language sql stable security definer set search_path = public as $$
      select exists (select 1 from public.servers where id = p_server_id and owner_id = p_user)
          or exists (select 1 from public.test_perms where user_id = p_user and server_id = p_server_id and perm = p_perm) $$;
    create function public.is_server_timed_out(p_server_id uuid, p_user uuid) returns boolean language sql stable as $$ select false $$;
    create function public.has_active_restriction(p_user uuid, p_kind text) returns boolean language sql stable as $$ select false $$;
    create function public.get_entitlement(p_user uuid default null) returns jsonb language sql stable security definer set search_path = public as $$
      select jsonb_build_object('plan', coalesce((select plan from public.test_plans where user_id = coalesce(p_user, auth.uid())), 'free')) $$;

    -- The override rule in brief: no rows means open to members; otherwise a
    -- member needs a row granting it on one of their roles (or @everyone).
    create function public.channel_allows(p_channel uuid, p_col text) returns boolean
      language plpgsql stable security definer set search_path = public as $$
      declare v_server uuid; v_any boolean; v_ok boolean;
      begin
        select server_id into v_server from public.channels where id = p_channel;
        if v_server is null or not exists (select 1 from public.server_members where server_id = v_server and user_id = auth.uid()) then
          return false;
        end if;
        if public.member_has_server_permission(v_server, auth.uid(), 'manage_channels') then return true; end if;
        if p_col = 'post' and (select read_only from public.channels where id = p_channel) then return false; end if;
        select exists (select 1 from public.channel_permissions where channel_id = p_channel) into v_any;
        if not v_any then return true; end if;
        execute format($q$
          select exists (
            select 1 from public.channel_permissions cp
             where cp.channel_id = $1 and cp.%I is true
               and cp.role_id in (
                 select role_id from public.member_roles where server_id = $2 and user_id = $3
                 union select id from public.server_roles where server_id = $2 and is_default))$q$,
          'can_' || p_col) into v_ok using p_channel, v_server, auth.uid();
        return v_ok;
      end $$;
    create function public.channel_user_can_view(p_channel_id uuid) returns boolean language sql stable as $$
      select public.channel_allows(p_channel_id, 'view') $$;
    create function public.channel_user_can_post(p_channel_id uuid) returns boolean language sql stable as $$
      select public.channel_allows(p_channel_id, 'post') $$;

    alter table public.channels enable row level security;
    create policy channels_select on public.channels for select to authenticated using (public.is_server_member(server_id));
    create policy channels_mutate on public.channels for all to authenticated
      using (public.member_has_server_permission(server_id, auth.uid(), 'manage_channels'))
      with check (public.member_has_server_permission(server_id, auth.uid(), 'manage_channels'));
    alter table public.messages enable row level security;
    create policy messages_select on public.messages for select to authenticated using (public.channel_user_can_view(channel_id));
    create policy messages_insert on public.messages for insert to authenticated
      with check (auth.uid() = author_id and public.channel_user_can_post(channel_id));
    alter table public.dm_messages enable row level security;
    alter table public.group_messages enable row level security;
    alter table public.notifications enable row level security;
    create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());

    grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  `);

  await db.query(`insert into public.profiles (id, is_bot) values ($1, false), ($2, false), ($3, false), ($4, false), ($5, true)`,
    [OWNER, MEMBER, MOD, OUTSIDER, BOT]);
  await db.query(`insert into public.servers (id, owner_id) values ($1, $2)`, [SERVER, OWNER]);
  await db.query(`insert into public.server_members (server_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member'), ($1, $5, 'member')`,
    [SERVER, OWNER, MEMBER, MOD, BOT]);
  await db.query(`insert into public.server_roles (id, server_id, is_default) values ($1, $3, true), ($2, $3, false)`, [EVERYONE, VIP, SERVER]);
  await db.query(`insert into public.test_perms (user_id, server_id, perm) values ($1, $2, 'manage_messages')`, [MOD, SERVER]);
  await db.query(`insert into public.channels (id, server_id, name, type) values ($1, $2, 'general', 'text')`, [GENERAL, SERVER]);

  for (const file of [
    '0237_favorites.sql',
    '0238_saved_messages_and_reminders.sql',
    '0239_channel_topics_and_slow_mode.sql',
    '0240_forum_channels.sql',
    '0241_user_appearance.sql',
  ]) {
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }
  return db;
}

test('favorites are private, unique per target and capped', async () => {
  const db = await fixture();
  try {
    const star = (who, target) => tryAs(db, who, () =>
      db.query(`insert into public.favorites (user_id, kind, target_id) values ($1, 'channel', $2)`, [who, target]));
    assert.equal((await star(MEMBER, GENERAL)).ok, true);
    assert.equal((await star(MEMBER, GENERAL)).ok, false, 'starring twice is a conflict, not a duplicate');
    assert.equal((await tryAs(db, MEMBER, () =>
      db.query(`insert into public.favorites (user_id, kind, target_id) values ($1, 'channel', $2)`, [OWNER, GENERAL]))).ok,
    false, 'nobody stars on someone else’s behalf');
    assert.equal((await tryAs(db, MEMBER, () =>
      db.query(`insert into public.favorites (user_id, kind, target_id) values ($1, 'space', $2)`, [MEMBER, GENERAL]))).ok,
    false, 'only channels, DMs and groups');

    const theirs = await as(db, OWNER, () => db.query(`select * from public.favorites`));
    assert.equal(theirs.rows.length, 0, 'another person sees none of them');

    for (let i = 0; i < 199; i++) {
      await db.query(`insert into public.favorites (user_id, kind, target_id) values ($1, 'dm', gen_random_uuid())`, [MEMBER]);
    }
    assert.equal((await star(MEMBER, '30000000-0000-4000-8000-0000000000ff')).ok, false, 'the 201st is refused');
  } finally {
    await db.close();
  }
});

test('saved messages: private, reminders gated on plan, sweep respects access', async () => {
  const db = await fixture();
  try {
    const { rows: [msg] } = await db.query(
      `insert into public.messages (channel_id, author_id, content) values ($1, $2, 'ship it on friday') returning id`, [GENERAL, OWNER]);

    const save = (who, remindAt) => tryAs(db, who, () => db.query(
      `insert into public.saved_messages (user_id, context, message_id, container_id, remind_at)
       values ($1, 'channel', $2, $3, $4) returning id`, [who, msg.id, GENERAL, remindAt]));

    assert.equal((await save(MEMBER, null)).ok, true, 'anyone can save');
    assert.equal((await save(MEMBER, null)).ok, false, 'once per message');

    const free = await tryAs(db, MOD, () => db.query(
      `insert into public.saved_messages (user_id, context, message_id, container_id, remind_at)
       values ($1, 'channel', $2, $3, now() + interval '1 hour')`, [MOD, msg.id, GENERAL]));
    assert.equal(free.ok, false);
    assert.match(free.message, /Lite and Aero/);

    await db.query(`insert into public.test_plans (user_id, plan) values ($1, 'lite'), ($2, 'aero')`, [MOD, OWNER]);
    assert.equal((await tryAs(db, MOD, () => db.query(
      `insert into public.saved_messages (user_id, context, message_id, container_id, remind_at)
       values ($1, 'channel', $2, $3, now() - interval '1 day')`, [MOD, msg.id, GENERAL]))).ok, false, 'not in the past');
    assert.equal((await tryAs(db, MOD, () => db.query(
      `insert into public.saved_messages (user_id, context, message_id, container_id, remind_at)
       values ($1, 'channel', $2, $3, now() + interval '30 seconds')`, [MOD, msg.id, GENERAL]))).ok, true);

    const others = await as(db, OWNER, () => db.query(`select * from public.saved_messages`));
    assert.equal(others.rows.length, 0, 'saved lists are private');

    // A reminder for an outsider who cannot read the channel: stamped, silent.
    await db.query(`insert into public.test_plans (user_id, plan) values ($1, 'aero')`, [OUTSIDER]);
    await db.query(`insert into public.saved_messages (user_id, context, message_id, container_id, remind_at)
                    values ($1, 'channel', $2, $3, now() - interval '1 minute')`, [OUTSIDER, msg.id, GENERAL]);
    // Make the moderator's reminder due.
    await db.query(`update public.saved_messages set remind_at = now() - interval '1 second' where user_id = $1`, [MOD]);

    const { rows: [{ delivered }] } = await db.query(`select public.deliver_message_reminders() as delivered`);
    assert.equal(delivered, 1);
    const notes = await db.query(`select user_id, type, body, link from public.notifications`);
    assert.deepEqual(notes.rows.map((r) => [r.user_id, r.type, r.link]), [[MOD, 'reminder', `channel:${GENERAL}`]]);
    assert.equal(notes.rows[0].body, 'ship it on friday');
    const pending = await db.query(`select count(*)::int as n from public.saved_messages where remind_at is not null and reminded_at is null`);
    assert.equal(pending.rows[0].n, 0, 'every due reminder is stamped, delivered or not');
    const again = await db.query(`select public.deliver_message_reminders() as delivered`);
    assert.equal(again.rows[0].delivered, 0, 'never delivered twice');

    // Snoozing clears the stamp; touching only the note keeps it.
    await as(db, MOD, () => db.query(`update public.saved_messages set note = 'release notes' where user_id = $1`, [MOD]));
    let row = (await db.query(`select reminded_at from public.saved_messages where user_id = $1`, [MOD])).rows[0];
    assert.notEqual(row.reminded_at, null);
    await as(db, MOD, () => db.query(`update public.saved_messages set remind_at = now() + interval '2 hours' where user_id = $1`, [MOD]));
    row = (await db.query(`select reminded_at from public.saved_messages where user_id = $1`, [MOD])).rows[0];
    assert.equal(row.reminded_at, null);
    // And a client cannot fake a delivery stamp.
    await as(db, MOD, () => db.query(`update public.saved_messages set reminded_at = now() where user_id = $1`, [MOD]));
    row = (await db.query(`select reminded_at from public.saved_messages where user_id = $1`, [MOD])).rows[0];
    assert.equal(row.reminded_at, null);
  } finally {
    await db.close();
  }
});

test('slow mode is enforced by the database with the right exemptions', async () => {
  const db = await fixture();
  try {
    const post = (who, channel = GENERAL) => tryAs(db, who, () => db.query(
      `insert into public.messages (channel_id, author_id, content) values ($1, $2, 'hi')`, [channel, who]));

    assert.equal((await post(MEMBER)).ok, true);
    assert.equal((await post(MEMBER)).ok, true, 'off by default');

    const set = await tryAs(db, MEMBER, () => db.query(`update public.channels set slow_mode_seconds = 30 where id = $1 returning id`, [GENERAL]));
    assert.equal(set.ok && set.value.rows.length, 0, 'members cannot change it');
    await as(db, OWNER, () => db.query(`update public.channels set slow_mode_seconds = 30, topic = 'Build log' where id = $1`, [GENERAL]));
    assert.equal((await tryAs(db, OWNER, () => db.query(`update public.channels set slow_mode_seconds = 999999 where id = $1`, [GENERAL]))).ok, false, 'capped at six hours');

    const blocked = await post(MEMBER);
    assert.equal(blocked.ok, false);
    assert.match(blocked.message, /Slow mode is on/);
    assert.equal((await post(MOD)).ok, true, 'manage_messages is exempt');
    assert.equal((await post(MOD)).ok, true);
    assert.equal((await post(OWNER)).ok, true, 'the owner is exempt');
    assert.equal((await post(BOT)).ok, true, 'bots are exempt');
    assert.equal((await post(BOT)).ok, true);
    // A server-side insert (no signed-in user) is never held up.
    await db.query(`insert into public.messages (channel_id, author_id, content) values ($1, $2, 'system')`, [GENERAL, MEMBER]);

    // Once the window has passed the member can post again.
    await db.query(`update public.messages set created_at = now() - interval '31 seconds' where author_id = $1`, [MEMBER]);
    assert.equal((await post(MEMBER)).ok, true);
  } finally {
    await db.close();
  }
});

test('forum channels: posts, permissions that follow the forum, and moderation', async () => {
  const db = await fixture();
  try {
    // Creating a forum needs manage_channels, through create_channel.
    assert.equal((await tryAs(db, MEMBER, () => db.query(`select public.create_channel($1, 'help', 'forum')`, [SERVER]))).ok, false);
    const { value: { rows: [{ create_channel: forum }] } } = await tryAs(db, OWNER, () =>
      db.query(`select public.create_channel($1, 'Help Desk', 'forum')`, [SERVER]));
    await as(db, OWNER, () => db.query(`update public.channels set available_tags = '{bug,question,idea}' where id = $1`, [forum]));
    assert.equal((await tryAs(db, OWNER, () => db.query(`update public.channels set available_tags = $2 where id = $1`,
      [forum, Array.from({ length: 21 }, (_, i) => `t${i}`)]))).ok, false, 'at most twenty tags');

    // Any member who can post in the forum can start a post.
    const create = (who, title, content = 'How do I flash the arm?', tags = ['question', 'nonsense']) =>
      tryAs(db, who, () => db.query(`select public.create_forum_post($1, $2, $3, $4) as id`, [forum, title, content, tags]));
    const first = await create(MEMBER, 'Flashing the arm firmware');
    assert.equal(first.ok, true, first.message);
    const postId = first.value.rows[0].id;
    const post = (await db.query(`select * from public.channels where id = $1`, [postId])).rows[0];
    assert.equal(post.parent_id, forum);
    assert.equal(post.type, 'text');
    assert.equal(post.post_author_id, MEMBER);
    assert.deepEqual(post.post_tags, ['question'], 'only tags the forum offers');
    assert.equal(post.message_count, 1, 'the opening message counts');

    assert.equal((await create(MEMBER, '   ')).ok, false, 'a title is required');
    assert.equal((await create(MEMBER, 'x'.repeat(101))).ok, false);
    assert.equal((await create(MEMBER, 'Ping', '@everyone look')).ok, false, 'no mass mentions without the permission');
    assert.equal((await create(OUTSIDER, 'Drive-by')).ok, false, 'non-members cannot post');

    // Replies are ordinary channel messages and are counted.
    await as(db, MOD, () => db.query(`insert into public.messages (channel_id, author_id, content) values ($1, $2, 'Hold the reset button')`, [postId, MOD]));
    assert.equal((await db.query(`select message_count from public.channels where id = $1`, [postId])).rows[0].message_count, 2);

    // A post cannot be re-parented, and a plain channel cannot pretend to be a post.
    assert.equal((await tryAs(db, OWNER, () => db.query(`update public.channels set parent_id = null where id = $1`, [postId]))).ok, false);
    assert.equal((await tryAs(db, OWNER, () => db.query(
      `insert into public.channels (server_id, name, type, parent_id) values ($1, 'sneaky', 'text', $2)`, [SERVER, GENERAL]))).ok, false);

    // Make the forum private to VIP: the post follows, both ways.
    await db.query(`insert into public.channel_permissions (channel_id, role_id, can_view, can_post) values ($1, $2, false, false), ($1, $3, true, true)`,
      [forum, EVERYONE, VIP]);
    const copied = await db.query(`select role_id, can_view from public.channel_permissions where channel_id = $1 order by role_id`, [postId]);
    assert.deepEqual(copied.rows.map((r) => [r.role_id, r.can_view]), [[EVERYONE, false], [VIP, true]]);

    const listFor = async (who) => (await as(db, who, () => db.query(`select id, title, opening from public.get_forum_posts($1)`, [forum]))).rows;
    assert.equal((await listFor(MEMBER)).length, 0, 'the private forum hides its posts');
    assert.equal((await create(MEMBER, 'Locked out')).ok, false, 'and refuses new ones');
    await db.query(`insert into public.member_roles (server_id, user_id, role_id) values ($1, $2, $3)`, [SERVER, MEMBER, VIP]);
    const visible = await listFor(MEMBER);
    assert.equal(visible.length, 1);
    assert.equal(visible[0].opening, 'How do I flash the arm?');

    // A post created after the forum went private starts with its rows.
    const later = await create(MEMBER, 'Second question');
    assert.equal(later.ok, true, later.message);
    const laterRows = await db.query(`select count(*)::int as n from public.channel_permissions where channel_id = $1`, [later.value.rows[0].id]);
    assert.equal(laterRows.rows[0].n, 2);

    // Opening the forum again clears the copies on every post.
    await db.query(`delete from public.channel_permissions where channel_id = $1`, [forum]);
    const leftover = await db.query(`select count(*)::int as n from public.channel_permissions cp join public.channels c on c.id = cp.channel_id where c.parent_id = $1`, [forum]);
    assert.equal(leftover.rows[0].n, 0);

    // Editing: the author can retitle, only moderators pin, strangers do nothing.
    assert.equal((await tryAs(db, MEMBER, () => db.query(`select public.update_forum_post($1, 'Flashing the arm (solved)', '{bug}')`, [postId]))).ok, true);
    assert.equal((await tryAs(db, MEMBER, () => db.query(`select public.update_forum_post($1, null, null, true)`, [postId]))).ok, false);
    assert.equal((await tryAs(db, MOD, () => db.query(`select public.update_forum_post($1, null, null, true)`, [postId]))).ok, true);
    await db.query(`insert into public.server_members (server_id, user_id) values ($1, $2)`, [SERVER, OUTSIDER]);
    assert.equal((await tryAs(db, OUTSIDER, () => db.query(`select public.update_forum_post($1, 'mine now')`, [postId]))).ok, false);
    const edited = (await db.query(`select name, post_tags, post_pinned from public.channels where id = $1`, [postId])).rows[0];
    assert.deepEqual([edited.name, edited.post_tags, edited.post_pinned], ['Flashing the arm (solved)', ['bug'], true]);

    // Pinned posts lead the list.
    const order = await listFor(MEMBER);
    assert.equal(order[0].id, postId);

    // Deleting: strangers cannot, the author can, and the replies go with it.
    assert.equal((await tryAs(db, OUTSIDER, () => db.query(`select public.delete_forum_post($1)`, [postId]))).ok, false);
    assert.equal((await tryAs(db, MEMBER, () => db.query(`select public.delete_forum_post($1)`, [postId]))).ok, true);
    const gone = await db.query(`select count(*)::int as n from public.messages where channel_id = $1`, [postId]);
    assert.equal(gone.rows[0].n, 0);

    // Deleting the forum removes its posts.
    await as(db, OWNER, () => db.query(`delete from public.channels where id = $1`, [forum]));
    const orphans = await db.query(`select count(*)::int as n from public.channels where parent_id is not null`);
    assert.equal(orphans.rows[0].n, 0);
  } finally {
    await db.close();
  }
});

test('appearance settings are private and need Lite or Aero to set', async () => {
  const db = await fixture();
  try {
    const set = (who, accent, wallpaper = null) => tryAs(db, who, () => db.query(
      `insert into public.user_appearance (user_id, accent_color, chat_wallpaper) values ($1, $2, $3)
       on conflict (user_id) do update set accent_color = excluded.accent_color, chat_wallpaper = excluded.chat_wallpaper`,
      [who, accent, wallpaper]));
    const denied = await set(MEMBER, '#ff8800');
    assert.equal(denied.ok, false);
    assert.match(denied.message, /Lite and Aero/);
    assert.equal((await set(MEMBER, null)).ok, true, 'clearing never needs a plan');

    await db.query(`insert into public.test_plans (user_id, plan) values ($1, 'lite')`, [MEMBER]);
    assert.equal((await set(MEMBER, '#ff8800', 'aurora')).ok, true);
    assert.equal((await set(MEMBER, 'orange')).ok, false, 'colours are #rrggbb');
    assert.equal((await set(MEMBER, '#ff8800', '../../etc')).ok, false, 'wallpapers are ids');

    const peek = await as(db, OWNER, () => db.query(`select * from public.user_appearance`));
    assert.equal(peek.rows.length, 0, 'nobody else can read them');
  } finally {
    await db.close();
  }
});
