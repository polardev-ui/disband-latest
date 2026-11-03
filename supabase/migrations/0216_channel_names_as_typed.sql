-- Text channel names are saved as typed again, spaces and symbols included.
-- Links no longer need the name itself to be dash-only: the apps link a
-- channel by its link name (lower case, spaces as dashes, punctuation
-- dropped; channelLinkName in src/lib/utils.ts), worked out when a message
-- is shown, so "Hall of Fame!" is linked as #hall-of-fame. Undoes the
-- trigger from 0214/0215. Names those migrations already changed stay as
-- they are; nothing recorded the old ones.

drop trigger if exists trg_channels_text_name_dashes on public.channels;
drop function if exists public.channels_text_name_dashes();
drop function if exists public.channel_name_dashes(text);
