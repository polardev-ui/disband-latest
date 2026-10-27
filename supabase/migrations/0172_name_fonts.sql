-- Add optional display-name font and color customization.
alter table public.profiles
  add column if not exists name_font text,
  add column if not exists name_color text;