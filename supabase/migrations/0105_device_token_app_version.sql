-- Record which build registered each push token.
--
-- Roughly a quarter of the iOS devices that were active in the last week have
-- an APNs alert token and no PushKit VoIP token, which is why a call rings
-- through as a plain banner instead of the system call UI for those people.
-- The table could not say why: "old build that never asked for a VoIP token"
-- and "current build whose VoIP registration failed" look identical in it,
-- and they are fixed in completely different places.
--
-- The version makes that one query instead of guesswork, and it costs a
-- nullable text column. Old rows stay null until the device checks in again.

alter table public.device_tokens
  add column if not exists app_version text;

comment on column public.device_tokens.app_version is
  'Client build that last registered this token. Null for rows written before 0105, or by clients that do not send one.';

-- Same upsert, now carrying the version. The parameter is optional and last,
-- so every existing caller — including shipped app builds that will never be
-- updated — keeps working unchanged.
create or replace function public.register_device_token(
  p_token text,
  p_platform text default 'ios',
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.device_tokens (user_id, token, platform, app_version, updated_at)
    values (auth.uid(), p_token, p_platform, p_app_version, now())
  on conflict (user_id, token)
    do update set
      updated_at = now(),
      platform = excluded.platform,
      -- Never overwrite a known version with null: a client that does not
      -- send one must not erase what another registration already told us.
      app_version = coalesce(excluded.app_version, public.device_tokens.app_version);
end;
$$;
