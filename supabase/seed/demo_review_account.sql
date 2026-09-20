-- ============================================================================
-- Disband — App Store review demo data
--
-- Seeds a self-contained sandbox for the App Review demo account:
--     disband@apple.com / AppleDev123!
--
-- Everything created here uses deterministic ids in the de00.../5e00.../a000...
-- ranges, so the script is safe to re-run: it tears down its own previous
-- output first and never touches real user data. The demo account is joined
-- only to synthetic servers, friends and chats — no production content is
-- exposed to the reviewer.
--
-- Addresses App Review submission 72bb5e00-6b3c-410c-a5de-3c6da66166ee
-- (Guideline 2.1 / 2.1(a) — demo account must exist and be pre-populated with
-- friends, servers, messages and an invite code).
-- ============================================================================

begin;

do $$
declare
  demo uuid := '24372793-2090-4e03-97aa-490b0d39be75';

  -- Synthetic companion accounts
  u_nova uuid := 'de000000-0000-4000-8000-000000000001';
  u_kai  uuid := 'de000000-0000-4000-8000-000000000002';
  u_mila uuid := 'de000000-0000-4000-8000-000000000003';
  u_theo uuid := 'de000000-0000-4000-8000-000000000004';
  u_iris uuid := 'de000000-0000-4000-8000-000000000005';
  u_sam  uuid := 'de000000-0000-4000-8000-000000000006';
  u_leo  uuid := 'de000000-0000-4000-8000-000000000007';
  u_ada  uuid := 'de000000-0000-4000-8000-000000000008';

  -- Servers
  s_hq   uuid := '5e000000-0000-4000-8000-000000000001';
  s_lab  uuid := '5e000000-0000-4000-8000-000000000002';

  -- Categories
  cat_hq_text  uuid := 'c0000000-0000-4000-8000-000000000001';
  cat_hq_voice uuid := 'c0000000-0000-4000-8000-000000000002';
  cat_lab_text uuid := 'c0000000-0000-4000-8000-000000000003';
  cat_lab_voice uuid := 'c0000000-0000-4000-8000-000000000004';

  -- Channels
  ch_welcome  uuid := 'cc000000-0000-4000-8000-000000000001';
  ch_general  uuid := 'cc000000-0000-4000-8000-000000000002';
  ch_random   uuid := 'cc000000-0000-4000-8000-000000000003';
  ch_support  uuid := 'cc000000-0000-4000-8000-000000000004';
  ch_lounge   uuid := 'cc000000-0000-4000-8000-000000000005';
  ch_lab_gen  uuid := 'cc000000-0000-4000-8000-000000000006';
  ch_lab_vc   uuid := 'cc000000-0000-4000-8000-000000000007';

  -- Roles
  r_hq_everyone uuid := 'a1000000-0000-4000-8000-000000000001';
  r_hq_admin    uuid := 'a1000000-0000-4000-8000-000000000002';
  r_hq_mod      uuid := 'a1000000-0000-4000-8000-000000000003';
  r_lab_everyone uuid := 'a1000000-0000-4000-8000-000000000004';

  -- Group chat
  g_weekend uuid := '61000000-0000-4000-8000-000000000001';

  -- DM threads
  t_nova uuid := '7d000000-0000-4000-8000-000000000001';
  t_kai  uuid := '7d000000-0000-4000-8000-000000000002';
  t_mila uuid := '7d000000-0000-4000-8000-000000000003';

  -- Reference message ids (needed for replies + reactions)
  m_welcome1 uuid := 'a0000000-0000-4000-8000-000000000001';
  m_gen3     uuid := 'a0000000-0000-4000-8000-000000000013';
  m_gen5     uuid := 'a0000000-0000-4000-8000-000000000015';

  now_ts timestamptz := now();
begin

  -- guard_server_member_role() rejects privileged role assignments unless
  -- auth.uid() owns the server. Present as the demo account (which does own
  -- both seeded servers) rather than disabling the trigger.
  perform set_config('request.jwt.claims', json_build_object('sub', demo)::text, true);

  -- --------------------------------------------------------------------------
  -- 0. Tear down anything this script created previously (idempotent re-run)
  -- --------------------------------------------------------------------------
  delete from public.servers    where id in (s_hq, s_lab);
  delete from public.group_chats where id = g_weekend;
  delete from public.dm_threads where id in (t_nova, t_kai, t_mila);
  delete from public.notifications where user_id = demo;
  delete from public.friendships
    where (requester_id = demo or addressee_id = demo)
      and (requester_id::text like 'de000000%' or addressee_id::text like 'de000000%');
  -- cascades to profiles + all authored content
  delete from auth.users where id in (u_nova, u_kai, u_mila, u_theo, u_iris, u_sam, u_leo, u_ada);

  -- --------------------------------------------------------------------------
  -- 1. Demo account profile
  -- --------------------------------------------------------------------------
  update public.profiles set
    username         = 'apple',
    display_name     = 'Apple Review',
    bio              = 'App Review demo account. Everything here is sample data.',
    status           = 'online',
    preferred_status = 'online',
    accent_color     = '#5865f2',
    accent_color_2   = '#8b5cf6',
    theme            = 'dark',
    updated_at       = now_ts
  where id = demo;

  -- Full-tier subscription so every premium surface is reachable in review
  delete from public.subscriptions where user_id = demo;
  insert into public.subscriptions
    (user_id, plan, status, current_period_start, current_period_end)
  values
    (demo, 'super', 'active', now_ts - interval '10 days', now_ts + interval '355 days');

  -- --------------------------------------------------------------------------
  -- 2. Synthetic companion accounts
  -- --------------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  select
    '00000000-0000-0000-0000-000000000000',
    v.id, 'authenticated', 'authenticated', v.email,
    crypt('DisbandDemo123!', gen_salt('bf')),
    now_ts - interval '60 days',
    now_ts - interval '60 days',
    now_ts - interval '60 days',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('username', v.username, 'display_name', v.dn, 'email_verified', true)
  from (values
    (u_nova, 'nova.reyes@demo.disband.app',    'nova_reyes',  'Nova Reyes'),
    (u_kai,  'kai.tanaka@demo.disband.app',    'kai_tanaka',  'Kai Tanaka'),
    (u_mila, 'mila.oduya@demo.disband.app',    'mila_oduya',  'Mila Oduya'),
    (u_theo, 'theo.marsh@demo.disband.app',    'theo_marsh',  'Theo Marsh'),
    (u_iris, 'iris.bennet@demo.disband.app',   'iris_bennet', 'Iris Bennet'),
    (u_sam,  'sam.whitfield@demo.disband.app', 'sam_w',       'Sam Whitfield'),
    (u_leo,  'leo.park@demo.disband.app',      'leo_park',    'Leo Park'),
    (u_ada,  'ada.quinn@demo.disband.app',     'ada_quinn',   'Ada Quinn')
  ) as v(id, email, username, dn);

  -- handle_new_user() created bare profile rows; fill them in.
  update public.profiles p set
    username     = v.username,
    display_name = v.dn,
    bio          = v.bio,
    status       = v.st,
    preferred_status = v.st,
    accent_color = v.accent,
    updated_at   = now_ts
  from (values
    (u_nova, 'nova_reyes',  'Nova Reyes',    'Design lead. Mostly here for the voice channels.', 'online',  '#f472b6'),
    (u_kai,  'kai_tanaka',  'Kai Tanaka',    'Backend engineer. Ask me about latency.',          'online',  '#22d3ee'),
    (u_mila, 'mila_oduya',  'Mila Oduya',    'Community manager @ Demo HQ.',                     'idle',    '#a78bfa'),
    (u_theo, 'theo_marsh',  'Theo Marsh',    'Weekend gamer, weekday lurker.',                   'dnd',     '#fb923c'),
    (u_iris, 'iris_bennet', 'Iris Bennet',   'Illustrator. Sharing WIPs in #random.',            'online',  '#34d399'),
    (u_sam,  'sam_w',       'Sam Whitfield', 'QA. If it breaks, I found it first.',              'offline', '#facc15'),
    (u_leo,  'leo_park',    'Leo Park',      'New around here!',                                 'online',  '#60a5fa'),
    (u_ada,  'ada_quinn',   'Ada Quinn',     'Met you in the Design Lab server.',                'online',  '#f87171')
  ) as v(id, username, dn, bio, st, accent)
  where p.id = v.id;

  -- --------------------------------------------------------------------------
  -- 3. Friends — 6 accepted, 2 incoming requests (so the requests UI is testable)
  -- --------------------------------------------------------------------------
  insert into public.friendships (requester_id, addressee_id, status, created_at) values
    (demo,  u_nova, 'accepted', now_ts - interval '55 days'),
    (demo,  u_kai,  'accepted', now_ts - interval '48 days'),
    (u_mila, demo,  'accepted', now_ts - interval '40 days'),
    (demo,  u_theo, 'accepted', now_ts - interval '30 days'),
    (u_iris, demo,  'accepted', now_ts - interval '21 days'),
    (demo,  u_sam,  'accepted', now_ts - interval '14 days'),
    (u_leo,  demo,  'pending',  now_ts - interval '2 days'),
    (u_ada,  demo,  'pending',  now_ts - interval '6 hours')
  on conflict (requester_id, addressee_id) do update set status = excluded.status;

  -- --------------------------------------------------------------------------
  -- 4. Servers, roles, categories, channels
  -- --------------------------------------------------------------------------
  insert into public.servers (id, name, description, owner_id, invite_code, created_at) values
    (s_hq,  'Disband Demo HQ', 'Sample community for App Review — every feature is live here.', demo, 'APPLEHQ', now_ts - interval '58 days'),
    (s_lab, 'Design Lab',      'A second server so server switching can be reviewed.',          demo, 'DSGNLAB', now_ts - interval '26 days');

  insert into public.server_roles (id, server_id, name, color, permissions, position, is_default) values
    (r_hq_everyone,  s_hq,  '@everyone', '#949ba4', '{"kick":false,"ban":false,"manage_roles":false,"manage_server":false}'::jsonb, 0, true),
    (r_hq_admin,     s_hq,  'Admin',     '#f43f5e', '{"kick":true,"ban":true,"manage_roles":true,"manage_server":true}'::jsonb,     2, false),
    (r_hq_mod,       s_hq,  'Moderator', '#38bdf8', '{"kick":true,"ban":true,"manage_roles":false,"manage_server":false}'::jsonb,   1, false),
    (r_lab_everyone, s_lab, '@everyone', '#949ba4', '{"kick":false,"ban":false,"manage_roles":false,"manage_server":false}'::jsonb, 0, true);

  insert into public.server_members (server_id, user_id, role, role_id, joined_at) values
    (s_hq, demo,   'owner',     r_hq_admin,    now_ts - interval '58 days'),
    (s_hq, u_nova, 'admin',     r_hq_admin,    now_ts - interval '57 days'),
    (s_hq, u_kai,  'moderator', r_hq_mod,      now_ts - interval '52 days'),
    (s_hq, u_mila, 'moderator', r_hq_mod,      now_ts - interval '44 days'),
    (s_hq, u_theo, 'member',    r_hq_everyone, now_ts - interval '29 days'),
    (s_hq, u_iris, 'member',    r_hq_everyone, now_ts - interval '20 days'),
    (s_hq, u_sam,  'member',    r_hq_everyone, now_ts - interval '13 days'),
    (s_lab, demo,   'owner',  r_lab_everyone, now_ts - interval '26 days'),
    (s_lab, u_iris, 'member', r_lab_everyone, now_ts - interval '25 days'),
    (s_lab, u_ada,  'member', r_lab_everyone, now_ts - interval '24 days');

  insert into public.channel_categories (id, server_id, name, position) values
    (cat_hq_text,   s_hq,  'Text Channels',  0),
    (cat_hq_voice,  s_hq,  'Voice Channels', 1),
    (cat_lab_text,  s_lab, 'Text Channels',  0),
    (cat_lab_voice, s_lab, 'Voice Channels', 1);

  insert into public.channels (id, server_id, category_id, name, type, position, created_at) values
    (ch_welcome, s_hq,  cat_hq_text,   'welcome',   'text',  0, now_ts - interval '58 days'),
    (ch_general, s_hq,  cat_hq_text,   'general',   'text',  1, now_ts - interval '58 days'),
    (ch_random,  s_hq,  cat_hq_text,   'random',    'text',  2, now_ts - interval '50 days'),
    (ch_support, s_hq,  cat_hq_text,   'support',   'text',  3, now_ts - interval '45 days'),
    (ch_lounge,  s_hq,  cat_hq_voice,  'Lounge',    'voice', 0, now_ts - interval '58 days'),
    (ch_lab_gen, s_lab, cat_lab_text,  'general',   'text',  0, now_ts - interval '26 days'),
    (ch_lab_vc,  s_lab, cat_lab_voice, 'Critique',  'voice', 0, now_ts - interval '26 days');

  insert into public.server_boosts (server_id, user_id, created_at) values
    (s_hq, demo,   now_ts - interval '10 days'),
    (s_hq, u_nova, now_ts - interval '8 days');

  -- --------------------------------------------------------------------------
  -- 5. Channel messages
  -- --------------------------------------------------------------------------
  insert into public.messages (id, channel_id, author_id, content, mentions, reply_to_id, created_at, edited_at) values
    (m_welcome1, ch_welcome, demo,   'Welcome to Disband Demo HQ! Start in #general, hop into the Lounge voice channel, or invite someone with code APPLEHQ.', '{}', null, now_ts - interval '58 days', null),
    ('a0000000-0000-4000-8000-000000000002', ch_welcome, u_nova, 'Pinned the channel guide below. Shout if anything looks off.', '{}', null, now_ts - interval '57 days', null),
    ('a0000000-0000-4000-8000-000000000003', ch_welcome, u_mila, 'Reminder: be decent to each other. Full rules in #support.', '{}', null, now_ts - interval '44 days', null),

    ('a0000000-0000-4000-8000-000000000011', ch_general, u_kai,  'Morning all — pushed the latency fix, p95 is down to 84ms.', '{}', null, now_ts - interval '3 days', null),
    ('a0000000-0000-4000-8000-000000000012', ch_general, u_nova, 'That is a huge drop. Nice one.', '{}', null, now_ts - interval '3 days' + interval '4 minutes', null),
    (m_gen3, ch_general, u_mila, 'Are we still doing the community call on Friday?', '{}', null, now_ts - interval '2 days', null),
    ('a0000000-0000-4000-8000-000000000014', ch_general, demo,   'Yes — Friday 4pm in the Lounge. I will post a reminder.', '{}', m_gen3, now_ts - interval '2 days' + interval '11 minutes', null),
    (m_gen5, ch_general, u_theo, 'Can someone look at the mobile layout on iPad? Sidebar feels tight.', '{}', null, now_ts - interval '30 hours', null),
    ('a0000000-0000-4000-8000-000000000016', ch_general, u_nova, 'On it. Testing at 11-inch now.', '{}', m_gen5, now_ts - interval '29 hours', null),
    ('a0000000-0000-4000-8000-000000000017', ch_general, u_iris, 'New icon set is ready whenever you want to swap it in.', '{}', null, now_ts - interval '20 hours', null),
    ('a0000000-0000-4000-8000-000000000018', ch_general, u_sam,  'QA pass done on build 3. Two minor nits, nothing blocking.', '{}', null, now_ts - interval '9 hours', null),
    ('a0000000-0000-4000-8000-000000000019', ch_general, u_kai,  'Anyone free to pair on the notification batching later?', '{}', null, now_ts - interval '4 hours', null),
    ('a0000000-0000-4000-8000-00000000001a', ch_general, u_mila, 'Welcome aboard! Let me know if you need anything.', array[demo]::uuid[], null, now_ts - interval '2 hours', null),
    ('a0000000-0000-4000-8000-00000000001b', ch_general, u_nova, 'Sidebar fix is up — much better on the 11-inch.', '{}', null, now_ts - interval '45 minutes', now_ts - interval '40 minutes'),

    ('a0000000-0000-4000-8000-000000000021', ch_random, u_iris, 'Sketch dump from the weekend, ignore the rough edges.', '{}', null, now_ts - interval '5 days', null),
    ('a0000000-0000-4000-8000-000000000022', ch_random, u_theo, 'These are great. The second one especially.', '{}', null, now_ts - interval '5 days' + interval '20 minutes', null),
    ('a0000000-0000-4000-8000-000000000023', ch_random, u_sam,  'Coffee count today: four. Send help.', '{}', null, now_ts - interval '11 hours', null),
    ('a0000000-0000-4000-8000-000000000024', ch_random, demo,   'Four is a lifestyle, not a problem.', '{}', null, now_ts - interval '10 hours', null),

    ('a0000000-0000-4000-8000-000000000031', ch_support, u_mila, 'Server rules: no spam, no harassment, keep it friendly. Report anything with the message menu.', '{}', null, now_ts - interval '45 days', null),
    ('a0000000-0000-4000-8000-000000000032', ch_support, u_theo, 'How do I change my notification settings?', '{}', null, now_ts - interval '6 days', null),
    ('a0000000-0000-4000-8000-000000000033', ch_support, demo,   'Settings → Notifications. You can mute per-server there too.', '{}', 'a0000000-0000-4000-8000-000000000032', now_ts - interval '6 days' + interval '15 minutes', null),

    ('a0000000-0000-4000-8000-000000000041', ch_lab_gen, demo,   'Design Lab is for critique threads — drop work in progress here.', '{}', null, now_ts - interval '26 days', null),
    ('a0000000-0000-4000-8000-000000000042', ch_lab_gen, u_ada,  'Happy to be here. Starting on the empty states this week.', '{}', null, now_ts - interval '24 days', null),
    ('a0000000-0000-4000-8000-000000000043', ch_lab_gen, u_iris, 'Empty states are looking sharp. Left a few notes.', '{}', null, now_ts - interval '1 day', null);

  insert into public.message_reactions (context_type, message_id, user_id, emoji) values
    ('channel', m_welcome1, u_nova, '👋'),
    ('channel', m_welcome1, u_kai,  '👋'),
    ('channel', m_welcome1, u_mila, '🎉'),
    ('channel', 'a0000000-0000-4000-8000-000000000011', demo,   '🚀'),
    ('channel', 'a0000000-0000-4000-8000-000000000011', u_nova, '🚀'),
    ('channel', 'a0000000-0000-4000-8000-000000000011', u_sam,  '🔥'),
    ('channel', 'a0000000-0000-4000-8000-000000000018', demo,   '✅'),
    ('channel', 'a0000000-0000-4000-8000-000000000021', demo,   '😍'),
    ('channel', 'a0000000-0000-4000-8000-000000000021', u_theo, '😍');

  -- --------------------------------------------------------------------------
  -- 6. Direct messages (demo id sorts before every de000000... id)
  -- --------------------------------------------------------------------------
  insert into public.dm_threads (id, user_a, user_b, created_at) values
    (t_nova, demo, u_nova, now_ts - interval '55 days'),
    (t_kai,  demo, u_kai,  now_ts - interval '48 days'),
    (t_mila, demo, u_mila, now_ts - interval '40 days');

  insert into public.dm_messages (thread_id, author_id, content, created_at) values
    (t_nova, u_nova, 'Hey! Glad you made it over.',                                 now_ts - interval '55 days'),
    (t_nova, demo,   'Thanks — the server looks great.',                            now_ts - interval '55 days' + interval '6 minutes'),
    (t_nova, u_nova, 'Want me to walk you through the voice setup sometime?',       now_ts - interval '3 days'),
    (t_nova, demo,   'That would help, thanks.',                                    now_ts - interval '3 days' + interval '30 minutes'),
    (t_nova, u_nova, 'Cool — free tomorrow afternoon?',                             now_ts - interval '90 minutes'),

    (t_kai,  demo,   'Did the batching change land?',                               now_ts - interval '2 days'),
    (t_kai,  u_kai,  'Landed this morning. Numbers look good.',                     now_ts - interval '2 days' + interval '25 minutes'),
    (t_kai,  u_kai,  'I will write it up in #general later.',                        now_ts - interval '2 days' + interval '26 minutes'),
    (t_kai,  demo,   'Perfect.',                                                    now_ts - interval '47 hours'),

    (t_mila, u_mila, 'Adding you as a moderator on Demo HQ, hope that is ok.', now_ts - interval '40 days'),
    (t_mila, demo,   'All good, thanks!',                                           now_ts - interval '40 days' + interval '12 minutes'),
    (t_mila, u_mila, 'Community call is Friday, 4pm. Putting you on the agenda.',   now_ts - interval '5 hours');

  -- --------------------------------------------------------------------------
  -- 7. Group chat
  -- --------------------------------------------------------------------------
  insert into public.group_chats (id, name, owner_id, created_at) values
    (g_weekend, 'Weekend Crew', demo, now_ts - interval '18 days');

  insert into public.group_chat_members (group_id, user_id, joined_at) values
    (g_weekend, demo,   now_ts - interval '18 days'),
    (g_weekend, u_nova, now_ts - interval '18 days'),
    (g_weekend, u_theo, now_ts - interval '18 days'),
    (g_weekend, u_iris, now_ts - interval '17 days');

  insert into public.group_messages (group_id, author_id, content, mentions, created_at) values
    (g_weekend, demo,   'Made us a group so we stop losing plans in DMs.',   '{}',              now_ts - interval '18 days'),
    (g_weekend, u_theo, 'Finally.',                                          '{}',              now_ts - interval '18 days' + interval '3 minutes'),
    (g_weekend, u_nova, 'Saturday still works for me.',                      '{}',              now_ts - interval '2 days'),
    (g_weekend, u_iris, 'Same. I can bring the projector.',                  '{}',              now_ts - interval '2 days' + interval '18 minutes'),
    (g_weekend, u_theo, 'Are we starting at 7 or 8?',                        array[demo]::uuid[], now_ts - interval '3 hours'),
    (g_weekend, demo,   'Let us say 7:30 to be safe.',                       '{}',              now_ts - interval '2 hours');

  -- --------------------------------------------------------------------------
  -- 8. Notifications (mention triggers already added some; add the rest)
  -- --------------------------------------------------------------------------
  insert into public.notifications (user_id, type, title, body, link, read, created_at) values
    (demo, 'friend_request', 'Leo Park sent you a friend request', 'Tap to accept or decline.',        'friends',                        false, now_ts - interval '2 days'),
    (demo, 'friend_request', 'Ada Quinn sent you a friend request', 'Tap to accept or decline.',       'friends',                        false, now_ts - interval '6 hours'),
    (demo, 'dm',             'Mila Oduya sent you a message',      'Community call is Friday, 4pm.',   'dm:' || t_mila::text,            false, now_ts - interval '5 hours'),
    (demo, 'dm',             'Nova Reyes sent you a message',      'Cool — free tomorrow afternoon?',  'dm:' || t_nova::text,            false, now_ts - interval '90 minutes'),
    (demo, 'system',         'Welcome to Disband',                 'Your demo workspace is ready.',    'channel:' || ch_welcome::text,   true,  now_ts - interval '58 days');

end $$;

commit;
