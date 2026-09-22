-- 0092_shop.sql
-- Disband Shop: cosmetics you buy once and wear everywhere.
--
-- Three slots, one per category, so the effects can never fight each other:
-- a name animation, an avatar ring, and an overlay that plays on your profile.
-- The catalogue is seeded from src/lib/shop.ts; that file and this table must
-- agree on ids, which is why the ids are slugs rather than generated keys.
--
-- Ownership is permanent and per-user. `stripe_session_id` carries the
-- idempotency: a webhook retry upserts onto the same row instead of granting
-- the item twice.

create table if not exists public.shop_items (
  id           text primary key,
  name         text not null,
  description  text not null,
  category     text not null
    constraint shop_items_category_check check (category in ('name', 'ring', 'overlay')),
  price_cents  integer not null
    constraint shop_items_price_check check (price_cents >= 200),
  class_name   text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.user_shop_items (
  user_id           uuid not null references public.profiles (id) on delete cascade,
  item_id           text not null references public.shop_items (id) on delete cascade,
  acquired_at       timestamptz not null default now(),
  stripe_session_id text,
  primary key (user_id, item_id)
);

create unique index if not exists user_shop_items_session_idx
  on public.user_shop_items (stripe_session_id, item_id)
  where stripe_session_id is not null;

-- What each person is currently wearing. Null means nothing equipped.
alter table public.profiles
  add column if not exists equipped_name_effect text references public.shop_items (id) on delete set null,
  add column if not exists equipped_ring_effect text references public.shop_items (id) on delete set null,
  add column if not exists equipped_overlay_effect text references public.shop_items (id) on delete set null;

-- The catalogue is public: everyone browses the shop, signed in or not.
alter table public.shop_items enable row level security;

drop policy if exists "shop items are public" on public.shop_items;
create policy "shop items are public"
  on public.shop_items for select
  using (active);

-- Your inventory is yours. Writes only ever come from the webhook, which runs
-- as the service role and bypasses this.
alter table public.user_shop_items enable row level security;

drop policy if exists "own inventory" on public.user_shop_items;
create policy "own inventory"
  on public.user_shop_items for select
  using (auth.uid() = user_id);

-- Equipping is a profile update, and the existing profile policy already
-- restricts that to the owner. This trigger is what stops someone equipping an
-- item they never bought by PATCHing their own row.
create or replace function public.enforce_equipped_ownership()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  slot text;
  chosen text;
begin
  foreach slot in array array['equipped_name_effect', 'equipped_ring_effect', 'equipped_overlay_effect'] loop
    execute format('select ($1).%I', slot) into chosen using new;
    if chosen is not null and not exists (
      select 1 from public.user_shop_items u
       where u.user_id = new.id and u.item_id = chosen
    ) then
      raise exception 'You do not own %', chosen using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists enforce_equipped_ownership on public.profiles;
create trigger enforce_equipped_ownership
  before update of equipped_name_effect, equipped_ring_effect, equipped_overlay_effect
  on public.profiles
  for each row execute function public.enforce_equipped_ownership();

insert into public.shop_items (id, name, description, category, price_cents, class_name) values
  ('fx-hydro', 'Hydro Bloom', 'Water gathers below and rises in heavy blobs that stretch and burst.', 'overlay', 800, 'fx-overlay-plain'),
  ('fx-starfall', 'Starfall', 'A turning field of stars, with meteors that streak across on their own time.', 'overlay', 750, 'fx-overlay-plain'),
  ('fx-tempest', 'Tempest', 'Rain on a hard slant, lit every so often by a forked bolt.', 'overlay', 900, 'fx-overlay-plain'),
  ('fx-rune', 'Arcane Circle', 'Two rune rings turning against each other around a breathing sigil.', 'overlay', 900, 'fx-overlay-plain'),
  ('name-shimmer', 'Shimmer', 'A slow band of light travelling across the letters.', 'name', 200, 'fx-name-shimmer'),
  ('name-rainbow', 'Rainbow', 'The full spectrum, cycling gently.', 'name', 250, 'fx-name-rainbow'),
  ('name-aurora', 'Aurora', 'Green and violet drifting like northern lights.', 'name', 300, 'fx-name-aurora'),
  ('name-ember', 'Ember', 'Warm coals fading from amber to red.', 'name', 250, 'fx-name-ember'),
  ('name-frost', 'Frost', 'Pale blue with a cold glint.', 'name', 250, 'fx-name-frost'),
  ('name-neon', 'Neon', 'A tube sign with an honest flicker.', 'name', 300, 'fx-name-neon'),
  ('name-glitch', 'Glitch', 'Channel-split judder, once every few seconds.', 'name', 350, 'fx-name-glitch'),
  ('name-chrome', 'Chrome', 'Polished metal with a moving highlight.', 'name', 300, 'fx-name-chrome'),
  ('name-wave', 'Wave', 'Letters rising and falling in sequence.', 'name', 300, 'fx-name-wave'),
  ('name-pulse', 'Pulse', 'A steady breath of brightness.', 'name', 200, 'fx-name-pulse'),
  ('name-gold', 'Gold leaf', 'Struck gold with a slow sheen.', 'name', 350, 'fx-name-gold'),
  ('name-toxic', 'Toxic', 'Acid green with a faint radioactive glow.', 'name', 250, 'fx-name-toxic'),
  ('name-sunset', 'Sunset', 'Orange into pink into deep blue.', 'name', 250, 'fx-name-sunset'),
  ('name-vhs', 'VHS', 'Tracking lines and a red/blue fringe.', 'name', 350, 'fx-name-vhs'),
  ('name-starlight', 'Starlight', 'Cool white with points of light passing through.', 'name', 300, 'fx-name-starlight'),
  ('ring-orbit', 'Orbit', 'A single point circling your avatar.', 'ring', 400, 'fx-ring-orbit'),
  ('ring-conic', 'Prism', 'A conic sweep of colour, turning faster on hover.', 'ring', 450, 'fx-ring-conic'),
  ('ring-pulse', 'Sonar', 'Rings that expand outward and fade.', 'ring', 400, 'fx-ring-pulse'),
  ('ring-flame', 'Flame', 'A flickering edge of fire.', 'ring', 500, 'fx-ring-flame'),
  ('ring-frost', 'Glacier', 'Cold blue with a crystalline shimmer.', 'ring', 450, 'fx-ring-frost'),
  ('ring-dashed', 'Rotary', 'A dashed ring that spins up when hovered.', 'ring', 300, 'fx-ring-dashed'),
  ('ring-glow', 'Halo', 'A soft bloom in your accent colour.', 'ring', 300, 'fx-ring-glow'),
  ('ring-aurora', 'Aurora ring', 'Slow green and violet curtains.', 'ring', 500, 'fx-ring-aurora'),
  ('ring-sparkle', 'Sparkle', 'Small lights that catch at the edge.', 'ring', 450, 'fx-ring-sparkle'),
  ('ring-gold', 'Laurel', 'A heavy gold band with a travelling sheen.', 'ring', 550, 'fx-ring-gold'),
  ('ring-void', 'Void', 'Deep purple that drinks the light around it.', 'ring', 500, 'fx-ring-void'),
  ('ring-circuit', 'Circuit', 'Traces of current running the circumference.', 'ring', 550, 'fx-ring-circuit'),
  ('ring-bubble', 'Soap', 'An iridescent film, like a bubble''s surface.', 'ring', 450, 'fx-ring-bubble'),
  ('ring-static', 'Static', 'A restless, noisy border.', 'ring', 350, 'fx-ring-static'),
  ('fx-snow', 'Snowfall', 'Flakes drifting down the card.', 'overlay', 500, 'fx-overlay-snow'),
  ('fx-embers', 'Embers', 'Sparks rising from the bottom edge.', 'overlay', 550, 'fx-overlay-embers'),
  ('fx-stars', 'Stardust', 'A slow field of turning stars.', 'overlay', 500, 'fx-overlay-stars'),
  ('fx-rain', 'Rain', 'Fine rain across the whole card.', 'overlay', 500, 'fx-overlay-rain'),
  ('fx-petals', 'Petals', 'Blossom falling and turning.', 'overlay', 600, 'fx-overlay-petals'),
  ('fx-matrix', 'Cascade', 'Green characters running down.', 'overlay', 650, 'fx-overlay-matrix'),
  ('fx-bubbles', 'Bubbles', 'Bubbles rising and wobbling.', 'overlay', 500, 'fx-overlay-bubbles'),
  ('fx-fireflies', 'Fireflies', 'Lights wandering and blinking out.', 'overlay', 600, 'fx-overlay-fireflies'),
  ('fx-aurora', 'Aurora veil', 'Curtains of light across the top.', 'overlay', 700, 'fx-overlay-aurora'),
  ('fx-confetti', 'Confetti', 'Paper falling and tumbling.', 'overlay', 550, 'fx-overlay-confetti'),
  ('fx-scanline', 'Scanlines', 'A CRT roll passing down the card.', 'overlay', 450, 'fx-overlay-scanline'),
  ('fx-sakura-night', 'Night bloom', 'Petals and fireflies together, after dark.', 'overlay', 800, 'fx-overlay-sakura-night')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  price_cents = excluded.price_cents,
  class_name = excluded.class_name;
