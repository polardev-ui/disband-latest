# Individual member channel permissions — backend implementation requirements

Status: UI prototype exists; **not safe to enable as a real access-control feature** until the backend is implemented and tested.

## Desired behavior

- A server moderator with channel-management permission can assign View, Post, React, and Attach overrides to a specific server member.
- Overrides are tri-state: `null` = inherit existing role result, `true` = allow, `false` = deny.
- Example: @everyone cannot view a private channel, but a member explicitly allowed View can see it, subject to server administrator exemptions.
- The server must check permissions for each request. Hiding a channel in React is not a security boundary.

## Existing integration points

- `src/components/modals/ChannelSettingsModal.tsx` loads role rows using `get_channel_permissions` and saves role rows using `set_channel_role_permission`.
- `src/contexts/AppContext.tsx` calls `my_channel_effects` and uses the resulting View/Post/React/Attach flags.
- `src/lib/supabase/types.ts` describes those RPC signatures, but does not currently declare member-permission RPCs.
- This repository copy does not expose the SQL definitions of the existing permission RPCs, so their actual authorization rules cannot be verified from TypeScript alone.

## Required backend changes

1. Add a channel/member permission table keyed by `(channel_id, user_id)` with nullable `can_view`, `can_post`, `can_react`, `can_attach`; validate that the member belongs to the channel's server.
2. Implement a read RPC that returns only channel-specific member overrides to authorized channel managers.
3. Implement a write/delete RPC that checks the caller's channel-management privileges on the server, validates member/server association, and does not allow privilege escalation.
4. Update `my_channel_effects` to combine role and individual member overrides using a documented precedence rule; preserve administrator bypass behavior.
5. Update database RLS and any SQL functions that retrieve channels, messages, attachments, search results, unread counts, and realtime subscriptions so unauthorized users cannot read private-channel content even if they call Supabase directly.
6. Add corresponding RPC typings, then wire the modal to load, save, and delete overrides; show save errors and avoid claiming success when writes fail.
7. Test: denied @everyone; specifically allowed member; unrelated member; explicit deny; role conflicts; removed member; unauthenticated caller; unauthorized writes; realtime; attachments.

## Deployment prerequisite

A maintainer with access to the authoritative Supabase schema and migrations must review and deploy the SQL. **Do not assume a frontend-only implementation grants access or protects messages.**
