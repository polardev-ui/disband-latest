-- 0176: drawn avatar decorations
--
-- Inserts the six new drawn decorations, upgrades ring-graphite's description,
-- and retires the old sketch/flight/illustrated rings (active = false). Rows
-- are never deleted, so existing owners keep what they own.

-- Insert / update the six new drawn decorations.
insert into public.shop_items (id, name, description, category, price_cents, class_name, active)
values
  ('ring-round-the-world', '''Round The World', 'A little race car doing laps of your picture. Hover and it puts its foot down.', 'ring', 499, 'fx-ring-art', true),
  ('ring-angelic', 'Angelic', 'A gold halo that floats over your head and glows brighter when someone hovers.', 'ring', 449, 'fx-ring-art', true),
  ('ring-treat-no-trick', 'Treat, No Trick', 'A dark skull holding your picture in its jaws. Hover and it bites, twice.', 'ring', 549, 'fx-ring-art', true),
  ('ring-devils-demise', 'Devil''s Demise', 'Two red horns. Hover and they catch fire.', 'ring', 399, 'fx-ring-art', true),
  ('ring-love-you-forever', 'Love You Forever', 'Three hearts up the side of your picture that beat in turn on hover.', 'ring', 349, 'fx-ring-art', true),
  ('ring-on-guard', 'On Guard!', 'Crossed cutlasses that rise and duel when someone hovers.', 'ring', 549, 'fx-ring-art', true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  price_cents = excluded.price_cents,
  class_name = excluded.class_name,
  active = excluded.active;

-- Upgrade ring-graphite's artwork + description (keeps its id and owners).
update public.shop_items
set description = 'Pencil circles that won''t sit still, and the pencil that drew them. Hover and it draws another.'
where id = 'ring-graphite';

-- Retire the older rings. Never delete rows; existing owners keep them.
update public.shop_items
set active = false
where category = 'ring'
  and id not in (
    'ring-graphite',
    'ring-round-the-world',
    'ring-angelic',
    'ring-treat-no-trick',
    'ring-devils-demise',
    'ring-love-you-forever',
    'ring-on-guard'
  );