-- 0224: Make the sign-up captcha impossible to skip.
--
-- Turnstile was checked in /api/auth/signup-check, but the account itself is
-- created by the client calling Supabase's /auth/v1/signup with the public
-- anon key. Anyone could skip signup-check (and its captcha, rate limits, ban
-- and VPN checks) by calling /auth/v1/signup directly, and the iOS and
-- Android apps did exactly that.
--
-- Now signup-check issues a single-use ticket for the email once every check
-- (including a mandatory Turnstile token) has passed, and a before-user-created
-- auth hook refuses any new account that has no unexpired ticket.
--
-- Accounts the server creates itself (bots, Tether, webhook identities) carry
-- app_metadata.created_by = 'server', which clients cannot set, and are let
-- through.
--
-- After applying, turn the hook on in the dashboard:
--   Authentication -> Hooks -> Before User Created -> Postgres ->
--   public.hook_before_user_created

create table if not exists public.signup_tickets (
  email text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.signup_tickets enable row level security;
revoke all on table public.signup_tickets from public, anon, authenticated;
grant select, insert, update, delete on table public.signup_tickets to service_role;

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text := lower(trim(coalesce(event->'user'->>'email', '')));
  v_ticket text;
begin
  -- Created by our own server code with the service role.
  if coalesce(event->'user'->'app_metadata'->>'created_by', '') = 'server' then
    return '{}'::jsonb;
  end if;

  -- Housekeeping: drop tickets that expired more than a day ago.
  delete from public.signup_tickets where expires_at < now() - interval '1 day';

  if v_email <> '' then
    delete from public.signup_tickets
     where email = v_email and expires_at > now()
    returning email into v_ticket;
    if v_ticket is not null then
      return '{}'::jsonb;
    end if;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Please complete the verification check and try again.'
    )
  );
end;
$$;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
