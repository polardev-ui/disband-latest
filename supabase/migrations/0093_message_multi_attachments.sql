-- 0093_message_multi_attachments.sql
-- Up to 10 attachments on one message, instead of one message per file.
--
-- A jsonb array rather than a join table: attachments are always read with
-- their message, never queried on their own, and this keeps every existing
-- select working untouched.
--
-- The legacy attachment_* columns stay, and hold the FIRST attachment. The iOS
-- and Android clients read those and know nothing about this column, so they
-- keep rendering something sensible instead of an empty message.

alter table public.messages add column if not exists attachments jsonb;
alter table public.dm_messages add column if not exists attachments jsonb;
alter table public.group_messages add column if not exists attachments jsonb;

-- Ten is the ceiling the composer enforces; this is the backstop for anything
-- writing to the table directly.
alter table public.messages drop constraint if exists messages_attachments_len_check;
alter table public.messages add constraint messages_attachments_len_check
  check (attachments is null or jsonb_array_length(attachments) <= 10);

alter table public.dm_messages drop constraint if exists dm_messages_attachments_len_check;
alter table public.dm_messages add constraint dm_messages_attachments_len_check
  check (attachments is null or jsonb_array_length(attachments) <= 10);

alter table public.group_messages drop constraint if exists group_messages_attachments_len_check;
alter table public.group_messages add constraint group_messages_attachments_len_check
  check (attachments is null or jsonb_array_length(attachments) <= 10);
