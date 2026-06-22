-- Prevent duplicate friendships in both directions (A→B and B→A).

-- Drop duplicate accepted pairs (keep the older row).
delete from public.friendships a
using public.friendships b
where a.id > b.id
  and a.status = 'accepted'
  and b.status = 'accepted'
  and a.requester_id = b.addressee_id
  and a.addressee_id = b.requester_id;

-- Drop reverse pending when an accepted friendship already exists.
delete from public.friendships pending
using public.friendships accepted
where pending.status = 'pending'
  and accepted.status = 'accepted'
  and pending.requester_id = accepted.addressee_id
  and pending.addressee_id = accepted.requester_id;

-- Drop newer reverse pending (keep the first request).
delete from public.friendships newer
using public.friendships older
where newer.id > older.id
  and newer.status = 'pending'
  and older.status = 'pending'
  and newer.requester_id = older.addressee_id
  and newer.addressee_id = older.requester_id;

-- One friendship row per unordered user pair.
create unique index if not exists friendships_pair_unique
  on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );
