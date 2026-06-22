-- Require AAL2 for users who enrolled verified MFA factors (opt-in enforcement).

create or replace function public.auth_aal_allows_access()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select array[
    coalesce((select auth.jwt()->>'aal'), 'aal1')
  ] <@ (
    select
      case
        when count(*) > 0 then array['aal2']::text[]
        else array['aal1', 'aal2']::text[]
      end
    from auth.mfa_factors
    where user_id = (select auth.uid())
      and status = 'verified'
  );
$$;

grant execute on function public.auth_aal_allows_access() to authenticated;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'profiles',
    'friendships',
    'servers',
    'server_members',
    'server_roles',
    'server_bans',
    'channel_categories',
    'channels',
    'messages',
    'dm_threads',
    'dm_messages',
    'voice_presence',
    'notifications',
    'group_chats',
    'group_chat_members',
    'group_messages',
    'group_call_presence',
    'message_reactions'
  ]
  loop
    execute format('drop policy if exists mfa_aal_required on public.%I', tbl);
    execute format(
      'create policy mfa_aal_required on public.%I as restrictive to authenticated using (public.auth_aal_allows_access())',
      tbl
    );
  end loop;
end $$;
