-- Six permanent cosmetics. Run after 0092_shop.sql and 0111_shop_sale_prices.sql.
-- Existing catalogue RLS, ownership checks, and Stripe fulfillment still apply.
begin;

insert into public.shop_items (id, name, description, category, price_cents, class_name, active)
values
  ('ring-aurelian', 'Aurelian', 'Ivory feathers open in a slow wingbeat. An opal pendant swings beneath a gold frame.', 'ring', 499, 'fx-ring-art', true),
  ('fx-aurelian', 'Aurelian · Profile skin', 'Ivory feathers open in a slow wingbeat. An opal pendant swings beneath a gold frame.', 'overlay', 649, 'fx-overlay-art', true),
  ('ring-nightflight', 'Nightflight', 'Violet bat wings fold and unfurl, with a swinging crescent and scattered starlight.', 'ring', 449, 'fx-ring-art', true),
  ('fx-nightflight', 'Nightflight · Profile skin', 'Violet bat wings fold and unfurl, with a swinging crescent and scattered starlight.', 'overlay', 599, 'fx-overlay-art', true),
  ('ring-roseling', 'Roseling', 'Rose butterfly wings flutter in pairs. A little heart charm sways among drifting petals.', 'ring', 399, 'fx-ring-art', true),
  ('fx-roseling', 'Roseling · Profile skin', 'Rose butterfly wings flutter in pairs. A little heart charm sways among drifting petals.', 'overlay', 549, 'fx-overlay-art', true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  class_name = excluded.class_name;
-- On reruns, retain any operator changes to live pricing, sales, or availability.

commit;
