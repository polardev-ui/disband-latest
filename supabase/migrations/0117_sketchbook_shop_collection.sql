-- Four lightweight, permanent avatar decorations. Existing shop RLS applies.
begin;

insert into public.shop_items (id, name, description, category, price_cents, class_name, active)
values
  ('ring-graphite', 'Graphite', 'Loose pencil circles with a quiet, hand-drawn flicker. Simple enough to wear every day.', 'ring', 200, 'fx-ring-art', true),
  ('ring-blue-note', 'Blue Note', 'A fine blue-ink loop, a little star, and a short underline that draws itself back in.', 'ring', 249, 'fx-ring-art', true),
  ('ring-margins', 'Margins', 'Four imperfect chalk brackets. Tiny registration marks appear one at a time around your picture.', 'ring', 249, 'fx-ring-art', true),
  ('ring-red-thread', 'Red Thread', 'A thin red sketch loop with a hand-tied knot. A short highlight slowly follows the thread.', 'ring', 299, 'fx-ring-art', true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  class_name = excluded.class_name;
-- Preserve operator pricing, sales and availability on reruns.

commit;
