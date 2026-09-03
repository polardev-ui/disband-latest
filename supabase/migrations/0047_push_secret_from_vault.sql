-- notify_push read its shared secret from `current_setting('app.webhook_secret')`,
-- but Supabase's hosted Postgres denies `alter database ... set app.*` to the
-- postgres role: "permission denied to set parameter". The setting could
-- therefore never be populated, so every push request went out with an empty
-- x-webhook-secret header and would have been rejected 403 by the function —
-- had the function existed at all, which until now it did not.
--
-- Vault is the supported place for this. The secret is created out of band:
--   select vault.create_secret('<secret>', 'push_webhook_secret');
create or replace function public.notify_push(p_user_id uuid, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  secret text;
begin
  if p_user_id is null then return; end if;

  select decrypted_secret into secret
    from vault.decrypted_secrets
   where name = 'push_webhook_secret'
   limit 1;

  perform net.http_post(
    url := 'https://mjqbrcabargylrimlafw.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(secret, '')
    ),
    body := jsonb_build_object('user_id', p_user_id, 'title', p_title, 'body', p_body)
  );
exception when others then
  -- never block the insert on a push problem
  null;
end;
$$;
