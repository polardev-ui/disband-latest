-- 0076_get_theme_aero_entitled.sql
-- Fix the Themes panel lockout after the Aero consolidation.
--
-- 0072_aero_plan.sql (live: consolidate_plans_into_aero) redefined
-- get_entitlement so every paid plan maps to 'aero' — but get_theme, which the
-- Themes tab reads for `entitled`, was missed and still compared against the
-- retired name 'super'. Since nothing returns 'super' anymore, entitled was
-- false for everyone, including Aero subscribers: the badge said Aero while
-- every skin sat locked.
--
-- Only the comparison changes; the rest of the body is the live definition,
-- reproduced verbatim so this migration is self-contained.

create or replace function public.get_theme()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_row user_themes%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('entitled', false, 'plan', 'free');
  end if;

  v_plan := coalesce(get_entitlement(v_user) ->> 'plan', 'free');
  select * into v_row from user_themes where user_id = v_user;

  return jsonb_build_object(
    'plan', v_plan,
    'entitled', v_plan = 'aero',
    'preset', v_row.preset,
    'custom_css', coalesce(v_row.custom_css, ''),
    'icons', coalesce(v_row.icons, '{}'::jsonb),
    'enabled', coalesce(v_row.enabled, true),
    'has_theme', v_row.user_id is not null
      and (v_row.preset is not null or coalesce(v_row.custom_css, '') <> '')
  );
end;
$$;

revoke all on function public.get_theme() from public, anon, authenticated;
grant execute on function public.get_theme() to authenticated;
