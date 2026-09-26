/**
 * Official @disband broadcast + expiring restriction enforcement.
 *
 * Runs against a real Postgres (PGlite) with 0041, 0099 and 0100 applied,
 * because what is worth verifying here is the SQL semantics: who a broadcast
 * actually reaches, and whether a timed restriction is enforced by the
 * database or only by the browser.
 *
 * The enforcement tests matter most. Until 0100, every account restriction
 * except the mascot path was checked in client code, so "you cannot type for a
 * week" was a string in the UI that a modified client walks straight past. The
 * RLS tests below deliberately SET ROLE to a non-superuser, because running
 * them as the table owner would bypass RLS and prove nothing.
 */

import { readFile } from "node:fs/promises";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

let db;

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const OFFICIAL = uuid(1);
const ALICE = uuid(2);
const BOB = uuid(3);
const CARA = uuid(4);
const BOT = uuid(5);
const STAFF = uuid(6);
const SQUATTER = uuid(7);

/**
 * Run fn as a client role, then hand the connection back to the owner.
 *
 * Both JWT claims are set, not just the role: PostgREST populates
 * `request.jwt.claim.role` from the token alongside `sub`, and 0100's official
 * identity guard reads the role claim to tell an end-user session from a
 * migration or cron tick.
 */
async function asRole(role, sub, fn) {
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

async function tryAsRole(role, sub, fn) {
  try {
    await asRole(role, sub, fn);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String(error.message ?? error) };
  }
}

before(async () => {
  db = new PGlite();

  // The Supabase roles are created because the migrations' REVOKE statements
  // name them, and because the RLS tests need to SET ROLE to them.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema if not exists auth;

    create or replace function auth.uid() returns uuid
    language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      encrypted_password text,
      updated_at timestamptz default now()
    );

    create table public.profiles (
      id uuid primary key,
      username text unique,
      display_name text,
      bio text,
      is_bot boolean not null default false,
      show_staff_badge boolean not null default false,
      show_owner_badge boolean not null default false
    );

    create table public.notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles (id) on delete cascade,
      type text not null,
      title text not null,
      body text,
      link text,
      read boolean not null default false,
      created_at timestamptz not null default now()
    );

    -- 0100's automated notices read and write this.
    create table public.moderation_actions (
      id uuid primary key default gen_random_uuid(),
      action text not null,
      src_table text,
      src_id text,
      owner_id uuid references public.profiles (id) on delete set null,
      category text,
      reason text,
      detail jsonb,
      actor text not null default 'sentinel',
      created_at timestamptz not null default now()
    );

    -- Push sink. Counts what the dispatcher handed over, so the dispatch tests
    -- can tell "marked dispatched" from "actually called notify_push".
    create table public.push_calls (user_id uuid, title text, body text, source text);
    create or replace function public.notify_push(
      p_user_id uuid, p_title text, p_body text, p_source text default null
    )
    returns void language plpgsql as $$
    begin
      insert into public.push_calls values (p_user_id, p_title, p_body, p_source);
    end;
    $$;

    -- Minimal stand-ins for the write policies 0100 rewrites. The policies
    -- parse their function references at CREATE time, so these must exist even
    -- though only the DM and reaction paths are exercised.
    create table public.channels (id uuid primary key, server_id uuid, read_only boolean not null default false);
    create table public.server_members (server_id uuid, user_id uuid);
    create table public.messages (
      id uuid primary key default gen_random_uuid(),
      channel_id uuid not null,
      author_id uuid not null,
      content text not null default '',
      attachment_url text,
      mentions uuid[] not null default '{}'
    );
    create table public.dm_threads (id uuid primary key, user_a uuid not null, user_b uuid not null);
    create table public.dm_messages (
      id uuid primary key default gen_random_uuid(),
      thread_id uuid not null,
      author_id uuid not null,
      content text not null default '',
      mentions uuid[] not null default '{}'
    );
    create table public.group_chats (id uuid primary key);
    create table public.group_chat_members (group_id uuid, user_id uuid);
    create table public.group_messages (
      id uuid primary key default gen_random_uuid(),
      group_id uuid not null,
      author_id uuid,
      content text not null default '',
      mentions uuid[] not null default '{}'
    );
    create table public.message_reactions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      message_id uuid not null,
      emoji text not null,
      context_type text not null default 'dm'
    );

    create or replace function public.channel_user_can_post(uuid) returns boolean
      language sql stable as $$ select true $$;
    create or replace function public.channel_user_can_attach(uuid) returns boolean
      language sql stable as $$ select true $$;
    create or replace function public.member_has_server_permission(uuid, uuid, text)
      returns boolean language sql stable as $$ select true $$;
    create or replace function public.is_server_timed_out(uuid, uuid) returns boolean
      language sql stable as $$ select false $$;
    create or replace function public.is_group_member(uuid) returns boolean
      language sql stable as $$ select true $$;
    create or replace function public.can_view_message_reaction(text, uuid) returns boolean
      language sql stable as $$ select true $$;

    -- RLS has to be switched on for the enforcement tests to mean anything. A
    -- permissive INSERT policy on a table with RLS disabled is a silent no-op:
    -- without this line every "the database refuses the write" assertion below
    -- would pass for the wrong reason. 0002_full_app.sql does this for real.
    alter table public.messages enable row level security;
    alter table public.dm_messages enable row level security;
    alter table public.group_messages enable row level security;
    alter table public.message_reactions enable row level security;

    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to service_role;
    grant usage on schema public to authenticated, service_role;
    -- auth.uid() is granted in a real Supabase project; the policies call it, so
    -- without these the enforcement tests would fail on "permission denied for
    -- schema auth" instead of on the restriction.
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);

  // db.exec takes no parameters, so these go through db.query. The rows have to
  // exist before the migrations run: 0100's bio update and its
  // official_broadcasts foreign key both need the @disband profile to be there.
  await db.query(
    `insert into public.profiles (id, username, display_name) values
      ($1, 'disband', 'Disband'),
      ($2, 'alice', 'Alice'),
      ($3, 'bob', 'Bob'),
      ($4, 'cara', 'Cara'),
      ($5, 'helperbot', 'Helper'),
      ($6, 'staffy', 'Staffy'),
      ($7, 'squatter', 'Squatter')`,
    [OFFICIAL, ALICE, BOB, CARA, BOT, STAFF, SQUATTER],
  );
  await db.query(`update public.profiles set is_bot = true where id = any($1)`, [[OFFICIAL, BOT]]);
  await db.query(`update public.profiles set show_staff_badge = true where id = $1`, [STAFF]);

  // The official account starts out exactly as it was in production: a bot
  // profile sitting on top of a real, sign-in-able human login. 0101 is what
  // changes that, so the starting state has to be the vulnerable one.
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, encrypted_password)
     values ($1, 'nullifybusiness1@gmail.com', now(), '$2argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$aGFzaA')`,
    [OFFICIAL],
  );

  await db.exec(await readFile("supabase/migrations/0041_account_restrictions.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/0099_restriction_expiry.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/0100_official_broadcast.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/0101_official_account_lockdown.sql", "utf8"));

  await db.query(
    `insert into public.dm_threads (id, user_a, user_b)
     values ('11111111-1111-4111-8111-111111111111', $1, $2)`,
    [ALICE, BOB],
  );
});

after(async () => {
  await db?.close();
});

/** Titles of official notifications for one user, oldest first. */
async function officialTitles(userId) {
  const { rows } = await db.query(
    `select title from public.notifications where user_id = $1 and type = 'official' order by created_at, id`,
    [userId],
  );
  return rows.map((r) => r.title);
}

/**
 * Official notifications for one user, newest first.
 *
 * Every test in this file shares one database, so assertions look a notice up by
 * title rather than counting rows — a count would silently depend on which
 * tests ran before it.
 */
async function officialNotifs(userId) {
  const { rows } = await db.query(
    `select title, body, link from public.notifications where user_id = $1 and type = 'official' order by created_at desc, id desc`,
    [userId],
  );
  return rows;
}

async function send(args) {
  return db.query(
    `select * from public.broadcast_send($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      args.audience ?? "everyone",
      args.target ?? null,
      args.kind ?? "announcement",
      args.title ?? "Heads up",
      args.body ?? "Something happened.",
      args.link ?? null,
      args.email ?? false,
      args.actor ?? null,
      args.origin ?? "admin",
    ],
  );
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

test("a broadcast to everyone reaches every human and no bots", async () => {
  const { rows } = await send({ title: "Scheduled maintenance" });
  // alice, bob, cara, staffy, squatter. Not @disband, not helperbot.
  assert.equal(rows[0].sent_recipient_count, 5);

  const got = await officialNotifs(ALICE);
  assert.equal(got.length, 1);
  assert.equal(got[0].title, "Scheduled maintenance");

  assert.equal((await officialNotifs(BOT)).length, 0, "a bot must not be notified");
  assert.equal((await officialNotifs(OFFICIAL)).length, 0, "the official account must not notify itself");
});

test("a targeted broadcast reaches exactly one person", async () => {
  const { rows } = await send({ audience: "user", target: BOB, title: "Only for you" });
  assert.equal(rows[0].sent_recipient_count, 1);

  assert.ok((await officialTitles(BOB)).includes("Only for you"));
  assert.ok(
    !(await officialTitles(CARA)).includes("Only for you"),
    "nobody else may be reached",
  );
});

test("a targeted broadcast records who it was aimed at, even by username", async () => {
  await send({ audience: "user", target: CARA, kind: "account_action", title: "Violation notice" });
  const { rows } = await db.query(
    `select target_username, kind, audience, origin from public.official_broadcasts
      where title = 'Violation notice'`,
  );
  assert.equal(rows[0].target_username, "cara");
  assert.equal(rows[0].kind, "account_action");
  assert.equal(rows[0].audience, "user");
});

test("targeted sends refuse a missing, unknown or bot recipient", async () => {
  await assert.rejects(() => send({ audience: "user", target: null }), /target user is required/);
  await assert.rejects(() => send({ audience: "user", target: uuid(999) }), /No such user/);
  await assert.rejects(() => send({ audience: "user", target: BOT }), /No such user/);
  await assert.rejects(
    () => send({ audience: "user", target: OFFICIAL }),
    /Cannot send an official notice to the official account/,
  );
});

// ---------------------------------------------------------------------------
// Content validation
// ---------------------------------------------------------------------------

test("an empty title or body is refused", async () => {
  await assert.rejects(() => send({ title: "   " }), /title is required/);
  await assert.rejects(() => send({ body: "" }), /body is required/);
});

test("a link that is not an in-app route or a disband.dev URL is refused", async () => {
  // The client renders this as a navigation target, so a javascript: URL here
  // would be planted in every user's notification drawer.
  await assert.rejects(() => send({ link: "javascript:alert(1)" }), /Link must be/);
  await assert.rejects(() => send({ link: "https://evil.example.com" }), /Link must be/);
  await assert.rejects(() => send({ link: "data:text/html,<script>" }), /Link must be/);

  for (const ok of [
    "/settings",
    "channel:11111111-1111-4111-8111-111111111111",
    "https://disband.dev/",
  ]) {
    const { rows } = await send({ title: "Link check", link: ok });
    const { rows: check } = await db.query(
      `select link from public.official_broadcasts where id = $1`, [rows[0].sent_broadcast_id],
    );
    assert.equal(check[0].link, ok);
  }
});

test("title and body are capped so a broadcast cannot blow up the drawer", async () => {
  await send({ title: "T".repeat(400), body: "B".repeat(4000) });
  const { rows } = await db.query(
    `select title, body from public.official_broadcasts where title like 'TTT%'`,
  );
  assert.equal(rows[0].title.length, 120);
  assert.equal(rows[0].body.length, 1000);
});

test("an unknown kind or origin is refused", async () => {
  await assert.rejects(() => send({ kind: "something_else" }), /unsupported broadcast kind/);
  await assert.rejects(() => send({ origin: "a_coworker" }), /unsupported origin/);
});

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

test("clients can neither read the broadcast tables nor call broadcast_send", async () => {
  for (const role of ["anon", "authenticated"]) {
    const read = await tryAsRole(role, ALICE, () =>
      db.query(`select count(*)::int as n from public.official_broadcasts`),
    );
    assert.equal(read.ok, false, `${role} must not read official_broadcasts`);

    const deliveries = await tryAsRole(role, ALICE, () =>
      db.query(`select count(*)::int as n from public.broadcast_deliveries`),
    );
    assert.equal(deliveries.ok, false, `${role} must not read broadcast_deliveries`);

    const call = await tryAsRole(role, ALICE, () =>
      db.query(`select * from public.broadcast_send('everyone',null,'announcement','x','y')`),
    );
    assert.equal(call.ok, false, `${role} must not call broadcast_send`);
  }
});

test("the delivery tables carry no client policies at all", async () => {
  const { rows } = await db.query(
    `select tablename, count(*)::int as policies
       from pg_policies
      where tablename in ('official_broadcasts','broadcast_deliveries')
      group by 1 order by 1`,
  );
  assert.deepEqual(rows, []);
});

// ---------------------------------------------------------------------------
// The official account
// ---------------------------------------------------------------------------

test("the migration gave the official account the anti-phishing bio", async () => {
  const { rows } = await db.query(`select bio, display_name, is_bot from public.profiles where id = $1`, [OFFICIAL]);
  assert.equal(rows[0].bio, "Official Disband account. We will never ask you for your password.");
  assert.equal(rows[0].is_bot, true);
  assert.equal(rows[0].display_name, "Disband");
});

test("a non-bot cannot claim the reserved @disband name", async () => {
  const attempt = await tryAsRole("authenticated", SQUATTER, () =>
    db.query(`update public.profiles set username = 'disband' where id = $1`, [SQUATTER]),
  );
  assert.equal(attempt.ok, false);
  assert.match(attempt.message, /reserved for official Disband use/);
  const { rows } = await db.query(`select username from public.profiles where id = $1`, [SQUATTER]);
  assert.equal(rows[0].username, "squatter", "the name is still held by the official account");
});

test("an ordinary session cannot edit or delete the official account", async () => {
  // The official account is a real auth login, so this is the guard that stops
  // anyone who still holds its credentials from turning it back into a person.
  const { rows } = await db.query(`select id from public.profiles where lower(username) = 'disband'`);
  const id = rows[0].id;

  const edit = await tryAsRole("authenticated", id, () =>
    db.query(`update public.profiles set bio = 'trust me' where id = $1`, [id]),
  );
  assert.equal(edit.ok, false);
  assert.match(edit.message, /cannot be modified/);

  const remove = await tryAsRole("authenticated", id, () =>
    db.query(`delete from public.profiles where id = $1`, [id]),
  );
  assert.equal(remove.ok, false);
});

test("service role can still maintain the official account", async () => {
  const { rows } = await db.query(`select id from public.profiles where lower(username) = 'disband'`);
  const ok = await tryAsRole("service_role", null, () =>
    db.query(`update public.profiles set bio = 'Official Disband account. We will never ask you for your password.' where id = $1`, [rows[0].id]),
  );
  assert.equal(ok.ok, true, ok.message);
});

test("the official account is no longer a sign-in-able human login", async () => {
  // The profile always had is_bot, but its auth user was a real Gmail with a
  // usable password until 0101. This is the assertion that would have caught it.
  const { rows: profileRows } = await db.query(
    `select id from public.profiles where lower(username) = 'disband'`,
  );
  const { rows } = await db.query(
    `select email, encrypted_password, email_confirmed_at from auth.users where id = $1`,
    [profileRows[0].id],
  );
  assert.equal(rows[0].email, "no-reply@disband.dev", "moved to a reserved, unreachable address");
  assert.ok(rows[0].email_confirmed_at, "confirmed, so nothing depends on a verification email");
  assert.equal(
    rows[0].encrypted_password,
    "",
    "the stored password was cleared, which is what makes sign-in impossible",
  );
});

test("the lockdown is idempotent and reports rather than fails on a second run", async () => {
  const before = (await db.query(`select email from auth.users where id = (select id from public.profiles where username = 'disband')`)).rows[0].email;
  await db.exec(await readFile("supabase/migrations/0101_official_account_lockdown.sql", "utf8"));
  const after = (await db.query(`select email from auth.users where id = (select id from public.profiles where username = 'disband')`)).rows[0].email;
  assert.equal(after, before, "re-running must not re-randomise or error");
});

// ---------------------------------------------------------------------------
// Restriction semantics
// ---------------------------------------------------------------------------

async function restrict(userId, kind, expiresInDays = null) {
  const expiry = expiresInDays === null ? null : `now() + interval '${expiresInDays} days'`;
  return asRole("authenticated", STAFF, () =>
    db.query(
      expiresInDays === null
        ? `select public.apply_restriction_temporary($1,$2,'testing',null)`
        : `select public.apply_restriction_temporary($1,$2,'testing',${expiry})`,
      [userId, kind],
    ),
  );
}

async function unrestrict(userId, kind) {
  return asRole("authenticated", STAFF, () =>
    db.query(`select public.remove_restriction($1,$2)`, [userId, kind]),
  );
}

test("a restriction is active while it is permanent or unexpired, and dead once past", async () => {
  await restrict(CARA, "send_messages", null);
  assert.equal(await active(CARA, "send_messages"), true, "permanent restriction is always active");

  await restrict(CARA, "send_messages", 7);
  assert.equal(await active(CARA, "send_messages"), true, "a week-long restriction is active now");

  // Backdate it past the end of the window.
  await db.query(`update public.account_restrictions set expires_at = now() - interval '1 second' where user_id = $1`, [CARA]);
  assert.equal(await active(CARA, "send_messages"), false, "a lapsed restriction must not apply");

  await unrestrict(CARA, "send_messages");
});

async function active(userId, kind) {
  const { rows } = await db.query(
    `select public.has_active_restriction($1, $2::public.account_restriction) as active`,
    [userId, kind],
  );
  return rows[0].active;
}

test("apply_restriction_temporary refuses a past expiry and a non-staff caller", async () => {
  const past = await tryAsRole("authenticated", STAFF, () =>
    db.query(`select public.apply_restriction_temporary($1,'send_messages','x',now() - interval '1 day')`, [CARA]),
  );
  assert.equal(past.ok, false);
  assert.match(past.message, /must be in the future/);

  const notStaff = await tryAsRole("authenticated", ALICE, () =>
    db.query(`select public.apply_restriction_temporary($1,'send_messages','x',null)`, [CARA]),
  );
  assert.equal(notStaff.ok, false);
  assert.match(notStaff.message, /Only staff members/);
});

test("re-applying extends the expiry instead of being ignored", async () => {
  await restrict(BOB, "send_messages", 7);
  let { rows } = await db.query(`select expires_at from public.account_restrictions where user_id = $1`, [BOB]);
  const first = rows[0].expires_at;
  await restrict(BOB, "send_messages", 30);
  ({ rows } = await db.query(`select expires_at from public.account_restrictions where user_id = $1`, [BOB]));
  assert.ok(new Date(rows[0].expires_at) > new Date(first), "expiry must move forward");
  await unrestrict(BOB, "send_messages");
});

test("the legacy three-argument apply_restriction does not strip an existing expiry", async () => {
  // The old form and "make it permanent" are both NULL to SQL but must not be
  // the same thing to a caller, or re-applying from the old panel would quietly
  // turn a week-long restriction into a permanent one.
  await restrict(ALICE, "send_messages", 7);
  const { rows: before } = await db.query(
    `select expires_at from public.account_restrictions where user_id = $1`, [ALICE],
  );
  await asRole("authenticated", STAFF, () =>
    db.query(`select public.apply_restriction($1,'send_messages','again')`, [ALICE]),
  );
  const { rows: afterRows } = await db.query(
    `select expires_at from public.account_restrictions where user_id = $1`, [ALICE],
  );
  assert.equal(new Date(afterRows[0].expires_at).getTime(), new Date(before[0].expires_at).getTime());
  await unrestrict(ALICE, "send_messages");
});

// ---------------------------------------------------------------------------
// Enforcement at the data layer
// ---------------------------------------------------------------------------

test("a send_messages restriction blocks the database write, not just the UI", async () => {
  const thread = "11111111-1111-4111-8111-111111111111";
  const sendDm = (who) =>
    db.query(`insert into public.dm_messages (thread_id, author_id, content) values ($1,$2,'hi')`, [thread, who]);

  const before_ = await tryAsRole("authenticated", ALICE, () => sendDm(ALICE));
  assert.equal(before_.ok, true, "an unrestricted user can send");

  await restrict(ALICE, "send_messages", 7);

  const during = await tryAsRole("authenticated", ALICE, () => sendDm(ALICE));
  assert.equal(during.ok, false, "the database must refuse the insert");
  assert.match(during.message, /row-level security/i);

  // It is that user's restriction, not a blanket one.
  const other = await tryAsRole("authenticated", BOB, () => sendDm(BOB));
  assert.equal(other.ok, true, "another member of the same thread is unaffected");

  await unrestrict(ALICE, "send_messages");
  const after_ = await tryAsRole("authenticated", ALICE, () => sendDm(ALICE));
  assert.equal(after_.ok, true, "removing the restriction restores posting");
});

test("a pre-existing restricted_users_no_write policy also honours the expiry", async () => {
  // Production already had this policy, created outside the migration history,
  // and it calls has_active_restriction(). If 0100 replaced that function with
  // one that ignored expires_at, this policy would enforce "one week" as
  // "forever" without anything visibly breaking. The test is the reason the
  // expiry comparison lives in the function and not only in the new policies.
  await db.query(
    `insert into public.moderation_actions (action, src_table, src_id, owner_id)
     values ('redact_text','messages','m-pre',$1)`,
    [STAFF],
  );
  const already = await db.query(`select public.has_active_restriction($1,'send_messages') as a`, [STAFF]);
  assert.equal(already.rows[0].a, false, "starts unrestricted");

  await restrict(STAFF, "send_messages", 7);
  const during = await db.query(`select public.has_active_restriction($1,'send_messages') as a`, [STAFF]);
  assert.equal(during.rows[0].a, true, "live inside the window");

  await db.query(`update public.account_restrictions set expires_at = now() - interval '1 second'
                  where user_id = $1 and restriction = 'send_messages'`, [STAFF]);
  const after = await db.query(`select public.has_active_restriction($1,'send_messages') as a`, [STAFF]);
  assert.equal(after.rows[0].a, false, "the function itself is expiry-aware, not just the new policies");
});

test("the migration reproduces the ad-hoc policies that were missing from the repo", async () => {
  // If someone rebuilds the database from these migrations, these three policies
  // have to come back or the rebuilt site is weaker than the live one.
  const { rows } = await db.query(
    `select tablename, policyname, cmd, permissive, roles::text as roles, with_check
       from pg_policies
      where schemaname = 'public' and policyname = 'restricted_users_no_write'
      order by tablename`,
  );
  assert.deepEqual(
    rows.map((r) => r.tablename),
    ["dm_messages", "group_messages", "messages"],
  );
  for (const row of rows) {
    assert.equal(row.cmd, "INSERT", row.tablename);
    assert.match(row.roles, /authenticated/, row.tablename);
    assert.match(row.with_check, /has_active_restriction/, row.tablename);
    // RESTRICTIVE, not the PERMISSIVE default. Postgres ORs the WITH CHECK of
    // every permissive INSERT policy together, so a permissive policy whose only
    // question is "is this user restricted?" passes for every unrestricted user
    // and would grant write access to any DM thread, group or channel. This
    // assertion is the whole reason the bug is caught here rather than in
    // production, where it would look like a working app.
    assert.equal(
      row.permissive,
      "RESTRICTIVE",
      `${row.tablename}.restricted_users_no_write must be RESTRICTIVE, not ${row.permissive}`,
    );
  }
});

test("an unrestricted user still cannot write into a DM thread they are not in", async () => {
  // The direct consequence of the classification above, stated on its own so a
  // failure points at the actual security property rather than at whichever
  // policy happens to break first.
  const attempt = await tryAsRole("authenticated", CARA, () =>
    db.query(
      `insert into public.dm_messages (thread_id, author_id, content)
       values ('11111111-1111-4111-8111-111111111111', $1, 'not my thread')`,
      [CARA],
    ),
  );
  assert.equal(attempt.ok, false, "CARA is not a member of that thread and must not be able to post in it");
  assert.match(attempt.message, /row-level security/i);
});

test("a lapsed restriction does not block a message written after it expired", async () => {
  await restrict(CARA, "send_messages", 7);
  await db.query(
    `update public.account_restrictions set expires_at = now() - interval '1 second'
     where user_id = $1 and restriction = 'send_messages'`,
    [CARA],
  );
  const attempt = await tryAsRole("authenticated", CARA, () =>
    db.query(
      `insert into public.group_messages (group_id, author_id, content) values ($1,$2,'back')`,
      [uuid(20), CARA],
    ),
  );
  assert.equal(attempt.ok, true, "the write is allowed again with no sweeper having run");
});

test("send_reactions blocks likes and does not block typing, and vice versa", async () => {
  const react = (who) =>
    db.query(`insert into public.message_reactions (user_id, message_id, emoji) values ($1,'22222222-2222-4222-8222-222222222222','👍')`, [who]);

  await assert.equal((await tryAsRole("authenticated", CARA, () => react(CARA))).ok, true);

  await restrict(CARA, "send_reactions", 7);

  const liked = await tryAsRole("authenticated", CARA, () => react(CARA));
  assert.equal(liked.ok, false, "a reaction restriction must block the reaction write");
  assert.match(liked.message, /row-level security/i);

  // "Cannot like" must not also mean "cannot type".
  const typed = await tryAsRole("authenticated", CARA, () =>
    db.query(`insert into public.dm_messages (thread_id, author_id, content) values ('11111111-1111-4111-8111-111111111111',$1,'hi')`, [CARA]),
  );
  assert.equal(typed.ok, false, "CARA is not in that thread, so this is the membership guard, not the restriction");
  assert.match(typed.message, /row-level security/i);

  await unrestrict(CARA, "send_reactions");
  assert.equal((await tryAsRole("authenticated", CARA, () => react(CARA))).ok, true);
});

test("a lapsed restriction stops blocking without any sweeper having run", async () => {
  await restrict(BOB, "send_messages", 7);
  const thread = "11111111-1111-4111-8111-111111111111";
  assert.equal(
    (await tryAsRole("authenticated", BOB, () =>
      db.query(`insert into public.dm_messages (thread_id, author_id, content) values ($1,$2,'hi')`, [thread, BOB]))).ok,
    false,
  );

  await db.query(`update public.account_restrictions set expires_at = now() - interval '1 second' where user_id = $1`, [BOB]);

  assert.equal(
    (await tryAsRole("authenticated", BOB, () =>
      db.query(`insert into public.dm_messages (thread_id, author_id, content) values ($1,$2,'hi')`, [thread, BOB]))).ok,
    true,
    "the second it lapses, posting works again with no cleanup job involved",
  );
  await unrestrict(BOB, "send_messages");
});

// ---------------------------------------------------------------------------
// Automatic notices
// ---------------------------------------------------------------------------

test("applying a restriction automatically tells the user, with the end date", async () => {
  await restrict(CARA, "send_messages", 7);
  const notifs = await officialNotifs(CARA);
  // Matched on the body as well as the title: several tests in this file
  // restrict CARA, and every one of those notices shares this exact title. A
  // lookup on title alone can pick up an earlier test's notice and pass or fail
  // for the wrong reason.
  const notice = notifs.find(
    (n) => n.title === "Your account has been restricted" && /cannot send messages/.test(n.body),
  );
  assert.ok(notice, "the user is told without anyone composing a message");
  assert.match(notice.body, /cannot send messages/);
  assert.match(notice.body, /This lasts until/);

  await unrestrict(CARA, "send_messages");
});

test("a permanent restriction says so instead of inventing an end date", async () => {
  await restrict(CARA, "send_reactions", null);
  const notice = (await officialNotifs(CARA)).find((n) => n.title === "Your account has been restricted");
  assert.match(notice.body, /no end date/);
  await unrestrict(CARA, "send_reactions");
});

test("the sweeper lifts a lapsed restriction and words it as ended, not lifted", async () => {
  await restrict(CARA, "send_messages", 7);
  await db.query(`update public.account_restrictions set expires_at = now() - interval '1 second' where user_id = $1`, [CARA]);

  const { rows } = await db.query(`select public.expire_restrictions() as n`);
  assert.ok(rows[0].n >= 1, "the sweeper removed the lapsed row");

  const notifs = await officialNotifs(CARA);
  assert.ok(
    notifs.some((n) => n.title === "Your restriction has ended"),
    "a restriction that ran out is reported as ended, not as lifted by staff",
  );
  assert.ok(
    notifs.some((n) => n.title === "Your restriction has been lifted"),
    "the earlier manual removal was reported as lifted",
  );
});

test("a Sentinel suspension notifies the account, and a redaction says content was removed", async () => {
  await db.query(
    `insert into public.moderation_actions (action, src_table, src_id, owner_id, category, reason)
     values ('suspend_user','profiles','p1',$1,'csam','policy')`,
    [ALICE],
  );
  const suspended = await officialNotifs(ALICE);
  assert.ok(suspended.some((n) => n.title === "Your account has been suspended"));

  await db.query(
    `insert into public.moderation_actions (action, src_table, src_id, owner_id, category, reason, detail)
     values ('redact_text','messages','m1',$1,'gore','policy','{}'::jsonb)`,
    [ALICE],
  );
  const redacted = await officialNotifs(ALICE);
  assert.ok(redacted.some((n) => n.title === "Some of your content was removed"));
});

test("a notice never quotes the material that triggered it", async () => {
  await db.query(
    `insert into public.moderation_actions (action, src_table, src_id, owner_id, category, reason, detail)
     values ('suspend_user','profiles','p2',$1,'csam','rule: csam.solicit_minor','{"excerpt":"sensitive text"}'::jsonb)`,
    [BOB],
  );
  const notifs = await officialNotifs(BOB);
  const body = notifs.map((n) => `${n.title} ${n.body}`).join(" ");
  for (const leak of ["csam", "solicit", "excerpt", "sensitive text", "rule:"]) {
    assert.ok(!body.includes(leak), `the notice must not contain "${leak}"`);
  }
});

test("quarantine_media does not double-notify the first owner", async () => {
  // sentinel_quarantine_media records one row for the first owner but suspends
  // every owner through sentinel_suspend, which writes its own row each.
  const before_ = (await officialTitles(CARA)).length;
  await db.query(
    `insert into public.moderation_actions (action, src_table, src_id, owner_id, category)
     values ('quarantine_media','media','https://x/y.png',$1,'csam')`,
    [CARA],
  );
  assert.equal((await officialTitles(CARA)).length, before_, "no extra notice for the first owner");
});

test("an action with no owner notifies nobody", async () => {
  const before_ = (await officialTitles(ALICE)).length;
  await db.query(
    `insert into public.moderation_actions (action, src_table, src_id, owner_id) values ('redact_text','messages','m9',null)`,
  );
  assert.equal((await officialTitles(ALICE)).length, before_);
});

// ---------------------------------------------------------------------------
// Push dispatch
// ---------------------------------------------------------------------------

test("dispatch hands pending pushes to the provider in bounded batches", async () => {
  const { rows } = await send({ title: "Push me" });
  const broadcastId = rows[0].sent_broadcast_id;

  await db.exec("truncate public.push_calls");
  const first = await db.query(`select public.broadcast_dispatch_push(2) as n`);
  assert.equal(first.rows[0].n, 2, "honours the batch limit");
  assert.equal((await db.query(`select count(*)::int as n from public.push_calls`)).rows[0].n, 2);

  const second = await db.query(`select public.broadcast_dispatch_push(1000) as n`);
  assert.ok(second.rows[0].n >= 2, "drains the rest");

  // A second pass must not re-send: the badge does not double.
  await db.exec("truncate public.push_calls");
  const third = await db.query(`select public.broadcast_dispatch_push(1000) as n`);
  assert.equal(third.rows[0].n, 0, "already dispatched rows are not sent twice");
  assert.equal((await db.query(`select count(*)::int as n from public.push_calls`)).rows[0].n, 0);

  const { rows: states } = await db.query(
    `select distinct push_state from public.broadcast_deliveries where broadcast_id = $1`, [broadcastId],
  );
  assert.deepEqual(states.map((s) => s.push_state), ["dispatched"]);
});

test("the push is attributed to Disband, not to a person", async () => {
  await db.exec("truncate public.push_calls");
  const { rows } = await send({ title: "Account action needed" });
  await db.query(`select public.broadcast_dispatch_push(1000)`);

  const { rows: calls } = await db.query(
    `select title, body from public.push_calls where body = 'Account action needed'`,
  );
  // One human recipient: bob, cara, staffy, squatter and alice are all in scope,
  // and every one of them is pushed to as "Disband".
  assert.equal(calls.length, rows[0].sent_recipient_count);
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.equal(call.title, "Disband", "the sender must be the account, never a user");
  }
});

test("nobody but service role can dispatch or sweep", async () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await tryAsRole(role, ALICE, () => db.query(`select public.broadcast_dispatch_push(10)`))).ok, false, role);
    assert.equal((await tryAsRole(role, ALICE, () => db.query(`select public.expire_restrictions()`))).ok, false, role);
  }
});

// ---------------------------------------------------------------------------
// Delivery reporting
// ---------------------------------------------------------------------------

test("the delivery summary counts each rail honestly", async () => {
  const { rows } = await send({ title: "Counted" });
  const id = rows[0].sent_broadcast_id;

  const before = (await db.query(`select public.broadcast_delivery_summary($1) as s`, [id])).rows[0].s;
  assert.equal(before.notified, rows[0].sent_recipient_count);
  assert.equal(before.pushPending, rows[0].sent_recipient_count, "nothing is pushed until the dispatcher runs");
  assert.equal(before.pushDispatched, 0);
  // 'none' is the honest label for a send that was not emailed at all.
  assert.deepEqual(before.emails, { none: rows[0].sent_recipient_count });

  await db.query(`select public.broadcast_dispatch_push(1000)`);
  const after = (await db.query(`select public.broadcast_delivery_summary($1) as s`, [id])).rows[0].s;
  assert.equal(after.pushPending, 0);
  assert.equal(after.pushDispatched, rows[0].sent_recipient_count);
});

test("recipient emails are read from auth.users, and a missing one is not invented", async () => {
  await db.query(
    `insert into auth.users (id, email) values ($1,'alice@example.com'),($2,null)`,
    [ALICE, BOB],
  );
  const { rows } = await send({ audience: "user", target: CARA, title: "With email" });
  const recipients = (await db.query(
    `select * from public.broadcast_recipient_emails($1)`, [rows[0].sent_broadcast_id],
  )).rows;
  assert.equal(recipients.length, 1);
  assert.equal(recipients[0].username, "cara");
  assert.equal(recipients[0].email, null, "Cara has no auth row, and that is reported as null not faked");

  const withAlice = (await db.query(
    `select * from public.broadcast_recipient_emails($1)`,
    [(await send({ audience: "user", target: ALICE, title: "Alice has mail" })).rows[0].sent_broadcast_id],
  )).rows;
  assert.equal(withAlice[0].email, "alice@example.com");
});

test("a client cannot read delivery counts or the recipient list", async () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal(
      (await tryAsRole(role, ALICE, () => db.query(`select public.broadcast_delivery_summary(gen_random_uuid())`))).ok,
      false,
      `${role} must not read the delivery summary`,
    );
    assert.equal(
      (await tryAsRole(role, ALICE, () => db.query(`select * from public.broadcast_recipient_emails(gen_random_uuid())`))).ok,
      false,
      `${role} must not read recipient emails`,
    );
  }
});
