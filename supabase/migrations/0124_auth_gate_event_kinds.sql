-- Extend the auth_gate_events.kind allow-list.
--
-- 0093 froze `kind` to six values, but the gates have since emitted
-- `login_vpn_detection_unavailable` / `signup_vpn_detection_unavailable`, so
-- those inserts were being rejected by the CHECK constraint and dropped
-- silently (logGateEvent swallows the error). That erased exactly the signal we
-- needed to see when the third-party VPN detectors degrade — the outage window
-- was invisible.
--
-- Also adds the new login Turnstile step-up kinds (flagged, non-TOR egress):
-- challenge_required → the member was asked for a challenge, challenge_passed /
-- challenge_failed → the outcome.

alter table public.auth_gate_events
  drop constraint if exists auth_gate_events_kind_check;

alter table public.auth_gate_events
  add constraint auth_gate_events_kind_check check (kind in (
    'login_allowed',
    'login_rate_limited',
    'login_vpn_blocked',
    'login_banned',
    'login_vpn_detection_unavailable',
    'login_vpn_challenge_required',
    'login_vpn_challenge_failed',
    'login_vpn_challenge_passed',
    'signup_rate_limited',
    'signup_vpn_blocked',
    'signup_vpn_detection_unavailable'
  ));
