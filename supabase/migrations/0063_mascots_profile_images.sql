-- 0063_mascots_profile_images.sql
-- Two follow-ups to 0062:
--   1) SECURITY DEFINER RPCs were created with the default PUBLIC EXECUTE
--      (functions are PUBLIC-granted by default), which leaks them to the
--      anon role even though we only intended authenticated/service_role.
--      Revoking from PUBLIC makes the explicit grants authoritative.
--   2) Minted mascots get a persistent profile image from pollinations.ai,
--      derived deterministically from (species, seed, rarity, traits) at mint
--      time so a mascot's face never changes.

revoke execute on function public.list_mascot(uuid, integer) from public;
revoke execute on function public.unlist_mascot(uuid) from public;
revoke execute on function public.rename_mascot(uuid, text) from public;
revoke execute on function public.train_mascot(uuid, integer) from public;
revoke execute on function public.add_mascot_grant(uuid, uuid, uuid, boolean, boolean, jsonb) from public;
revoke execute on function public.remove_mascot_grant(uuid) from public;
revoke execute on function public.mascot_send_message(uuid, uuid, text) from public;
revoke execute on function public.credit_user(uuid, integer, text, uuid, integer) from public;

-- Supabase's own default privileges re-grant EXECUTE to anon/authenticated on
-- newly created functions, so revoke anon explicitly as well.
revoke execute on function public.list_mascot(uuid, integer) from anon;
revoke execute on function public.unlist_mascot(uuid) from anon;
revoke execute on function public.rename_mascot(uuid, text) from anon;
revoke execute on function public.train_mascot(uuid, integer) from anon;
revoke execute on function public.add_mascot_grant(uuid, uuid, uuid, boolean, boolean, jsonb) from anon;
revoke execute on function public.remove_mascot_grant(uuid) from anon;
revoke execute on function public.mascot_send_message(uuid, uuid, text) from anon;

alter table public.mascot_purchases add column if not exists profile_image text;
alter table public.mascots add column if not exists profile_image text;