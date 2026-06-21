-- Second accent color for profile gradients (both required for custom; null = default style)

alter table public.profiles
  add column if not exists accent_color_2 text;

alter table public.profiles
  alter column accent_color drop default;

alter table public.profiles
  alter column accent_color set default null;

-- Legacy custom single colors become solid (same color twice)
update public.profiles
set accent_color_2 = accent_color
where accent_color is not null
  and accent_color_2 is null
  and lower(trim(accent_color)) <> '#5865f2';

-- Default blue rows use the built-in default style (both null)
update public.profiles
set accent_color = null,
    accent_color_2 = null
where accent_color is not null
  and lower(trim(accent_color)) = '#5865f2';
