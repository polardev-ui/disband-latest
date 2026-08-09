-- Add Discord-style snowflake display IDs to message tables.
-- Uses a proper bigint sequence to guarantee uniqueness, with the high bits
-- encoding the Discord-epoch timestamp for authentic-looking IDs.

create sequence if not exists public.snowflake_seq start 1 increment 1;

create or replace function public.generate_snowflake()
returns bigint
language plpgsql
as $$
declare
  discord_epoch_ms constant bigint := 1420070400000; -- 2015-01-01T00:00:00Z
  now_ms         bigint;
  seq            bigint;
begin
  now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint - discord_epoch_ms;
  seq := nextval('public.snowflake_seq') % 1024;

  -- 42 bits timestamp | 10 bits sequence -> 52 bits, safe for JS (max 2^53).
  return (now_ms << 10) | seq;
end;
$$;

-- messages
alter table public.messages
  add column if not exists display_id bigint not null default public.generate_snowflake();

-- Drop duplicate-ridden rows before enforcing unique constraint.
-- (The initial default may have produced collisions from the old function.)
delete from public.messages a using public.messages b
  where a.display_id = b.display_id and a.ctid > b.ctid;

alter table public.messages add constraint messages_display_id_key unique (display_id);

-- dm_messages
alter table public.dm_messages
  add column if not exists display_id bigint not null default public.generate_snowflake();

delete from public.dm_messages a using public.dm_messages b
  where a.display_id = b.display_id and a.ctid > b.ctid;

alter table public.dm_messages add constraint dm_messages_display_id_key unique (display_id);

-- group_messages
alter table public.group_messages
  add column if not exists display_id bigint not null default public.generate_snowflake();

delete from public.group_messages a using public.group_messages b
  where a.display_id = b.display_id and a.ctid > b.ctid;

alter table public.group_messages add constraint group_messages_display_id_key unique (display_id);
