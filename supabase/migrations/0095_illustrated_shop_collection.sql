-- Run after 0092_shop.sql. Updates catalogue presentation only: no ownership,
-- profile selections, prices, payment history, permissions, or RLS changes.
begin;

update public.shop_items as item
set name = artwork.name,
    description = artwork.description,
    class_name = artwork.class_name
from (values
  ('ring-bubble', 'Tideglass', 'Pearlescent waves, sea-glass blues, and a shell tucked into the tide.', 'fx-ring-art'),
  ('ring-gold', 'Moonmoth', 'Violet wings, tiny moon charms, and a garden that wakes up after dark.', 'fx-ring-art'),
  ('ring-flame', 'Emberwing', 'Copper feathers and sunstone details, with a quiet flicker of fire.', 'fx-ring-art'),
  ('fx-hydro', 'Tideglass · Profile skin', 'Pearlescent waves, sea-glass blues, and a shell tucked into the tide.', 'fx-overlay-art'),
  ('fx-sakura-night', 'Moonmoth · Profile skin', 'Violet wings, tiny moon charms, and a garden that wakes up after dark.', 'fx-overlay-art'),
  ('fx-embers', 'Emberwing · Profile skin', 'Copper feathers and sunstone details, with a quiet flicker of fire.', 'fx-overlay-art')
) as artwork(id, name, description, class_name)
where item.id = artwork.id;

-- Retire unfinished artwork from new sales. Existing owners can still equip
-- these IDs; the ownership trigger and equip API do not require active=true.
update public.shop_items set active = false
where id in (
  'ring-orbit', 'ring-conic', 'ring-pulse', 'ring-frost', 'ring-dashed',
  'ring-glow', 'ring-aurora', 'ring-sparkle', 'ring-void', 'ring-circuit', 'ring-static',
  'fx-starfall', 'fx-tempest', 'fx-rune', 'fx-snow', 'fx-stars', 'fx-rain',
  'fx-petals', 'fx-matrix', 'fx-bubbles', 'fx-fireflies', 'fx-aurora', 'fx-confetti', 'fx-scanline'
);

commit;
