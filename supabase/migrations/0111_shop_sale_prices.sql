-- ---------------------------------------------------------------------------
-- 0111: Shop sale prices (25% off everything over $5)
--
-- Adds an optional per-item sale price. The checkout charges
-- sale_price_cents when set, otherwise the regular price — the client never
-- prices anything, it only displays what the database says.
--
-- Backfill: every item strictly over $5 (price_cents > 500) goes 25% off,
-- rounded down to the cent. The guard keeps a sale below the regular price
-- so a bad edit can never raise a price through this column, and NULL means
-- "no sale" rather than overloading zero.
-- ---------------------------------------------------------------------------

alter table public.shop_items
  add column if not exists sale_price_cents integer;

alter table public.shop_items
  drop constraint if exists shop_items_sale_check;

alter table public.shop_items
  add constraint shop_items_sale_check
  check (sale_price_cents is null or (sale_price_cents > 0 and sale_price_cents < price_cents));

update public.shop_items
  set sale_price_cents = floor(price_cents * 0.75)::integer
  where price_cents > 500
    and sale_price_cents is null;
