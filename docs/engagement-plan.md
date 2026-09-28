# Engagement Plan for Disband (Revised)

Disband is already much closer to supporting this than a from-scratch plan assumes. The foundations exist: badges, referrals, shop cosmetics, Catalyst/server progression, push notifications, device tokens, voice-minute tracking, and media posts. So rather than bolting on nine unrelated engagement features, the move is to connect those systems into one progression loop (diagram at the end).

Honest framing stands: name the psychology plainly; no punishment mechanics, no fake urgency, nothing that monetizes compulsion. No algorithmic feed, no loot boxes, no surveillance-bait, no fake scarcity.

## Phase 0 — Measurement (before any mechanics)

```text
DAU
WAU
D1
D7
D30

Messages / DAU
DMs / DAU
Voice minutes / DAU
Servers joined / user
Friends / user

Notification → open
Notification → meaningful action

Invite → signup
Signup → verified
Verified → active
```

And especially **D7 retention by acquisition source** — need to know whether people return because they actually have relationships on Disband.

## Phase 1 — Social retention

### 1. Friend streaks

The product is fundamentally about people talking to each other, so the loop is:

> Message each other → streak increases → streak becomes a visible piece of the relationship → cosmetic/status rewards at milestones.

Social, not punitive. Milestones like:

* 3 days → small badge
* 7 days → profile accent
* 14 days → exclusive cosmetic
* 30 days → special animated cosmetic
* 100 days → permanent "100-day connection" badge

### 2. Streak repair (not endless buyouts)

**1 free repair per month + additional repairs for Aero** — rather than letting users endlessly buy their way out of losing streaks. Repairable streaks breed attachment; unlosable ones breed indifference.

### 3. Daily activity reward (not daily check-in)

Opening an app just to press "Claim" is artificial behavior. Disband has a better natural daily action: **talk to somebody.** So the reward is activity-gated:

> Send a message, join a voice channel, or participate in a server → earn today's reward.

The reward reinforces the actual product instead of reinforcing opening the app.

No generic currency is introduced for this (the old generic `account_credits` system is gone; Catalyst credits are Aero/Catalyst-scoped). Instead:

**Activity → XP + cosmetic unlock progress**, and optionally **daily activity → small shop coupon**.

### 4. Notification orchestration (biggest immediate opportunity)

The push infrastructure already exists (device tokens, APNs/FCM, targeting, DND, foreground suppression, badges). The missing piece is orchestration — a central Notification Intelligence layer every candidate notification passes through:

```text
Event
 ↓
Should this user receive it?
 ↓
Are they already active?
 ↓
DND?
 ↓
Quiet hours?
 ↓
Notification category enabled?
 ↓
Daily limit?
 ↓
Deduplicate?
 ↓
Send
```

Categories: Messages, Mentions, Calls, Friends, Streaks, Servers, Events, Digest, Product.

Hard limits, nuanced (not a flat ~2/day):

* unlimited **direct messages/calls** when relevant
* max 1–2 **re-engagement**/day
* max 1 **digest**/day
* streak warning only when genuinely relevant
* no notification if the user opened Disband recently

Privacy-preserving copy only — never *"Josh, Maya and Alex are in voice"*. Instead: **"3 friends are hanging out on Disband right now."** Tap → show the server/channel if permitted. Matches the privacy positioning.

## Phase 2 — Identity

### 5. XP / user levels → cosmetic unlocks (never purchasable)

The shop already has animated profile effects, avatar rings, name effects, collections, and illustrated cosmetics — so no reward economy needs inventing:

```text
Activity
   ↓
XP
   ↓
Level
   ↓
Cosmetic unlocks
   ↓
Profile identity
```

Example ladder:

| Level | Unlock                    |
| ----: | ------------------------- |
|     2 | Name effect               |
|     5 | Avatar ring               |
|    10 | Profile effect            |
|    15 | Exclusive badge           |
|    20 | Animated profile cosmetic |
|    30 | Seasonal cosmetic         |
|    50 | Legendary profile badge   |

The important rule: **don't make XP purchasable**, or progression becomes "how much money did you spend?" instead of "how long have I been part of Disband?"

### 6. Badge catalogue expansion (easy win — infra is mature)

Badge definitions, awards, metadata, refresh, visibility, and UI already exist. Expand the catalogue before building new systems:

**Social:** First Friend, First DM, 7-Day Connection, 30-Day Connection, 100-Day Connection, Group Regular, Voice Regular
**Community:** Server Founder, Early Member, Recruiter, Event Host, Community Builder
**Platform:** Day One, Beta Tester, Aero Member, Catalyst, Creator
**Seasonal:** Halloween 2026, Winter 2026, Summer 2027, etc.

Let badges become part of identity, not just an achievement screen.

### 7. Seasonal shop drops

Weekly scheduled drops (e.g. Fridays), announced in advance. Real scarcity only.

## Phase 3 — Community

### 8. Server events + RSVP + reminders (liked more than Stories)

The community structure already exists (servers → channels → members → voice → Tether). Add:

```text
Events
 ├── title
 ├── description
 ├── start_time
 ├── server_id
 ├── channel_id
 ├── creator_id
 ├── attendees
 └── reminder settings
```

Then Tether becomes genuinely useful: *"Tether, remind everyone about movie night Friday at 8"* → event created → 30-min and live reminders. Real utility, not a gimmick. The recurring weekly event is Discord's best retention mechanic.

### 9. Evolve Catalyst progression (don't duplicate it)

`server_catalysts` already determines server level and unlocks server-wide perks — that's the server half of the XP system. Keep two progression identities instead of inventing "server XP":

```text
Individual → XP / Level ("I've been here 8 months, Level 27")
Server     → Catalysts / Server Level ("We've built this to Level 4")
```

### 10. Double-sided referrals (infra already ahead — change the reward model)

Referral codes, verified tracking, and leaderboard exist. Change reward → both sides:

**A (inviter) gets:** XP, referral badge progress, cosmetic progress
**B (new user) gets:** starter cosmetic, small shop discount, first-week XP boost

Plus leaderboard seasons with cosmetic prizes. Frame: *"I brought my friend into my community"*, not *"manufacture another signup."*

## Phase 4 — Growth & creators

### 11. Creator/Catalyst economics

Creators who earn don't leave. If Catalysts flow value back to server owners (revenue share, perks, status), every owner becomes a retention agent for their own members.

## Phase 5 — Stories (last, if ever)

The repo has `media_posts`, but they're user-owned media rows, not a story system. Real Stories need audience rules, expiration, ordering, viewed state, privacy controls, media processing, moderation, reporting, notifications, and storage cleanup — and every ephemeral-media surface must go through the Sentinel safety architecture. Only after prior loops prove themselves.

## Addition: "Moments" (return dashboard, not a feed)

When someone returns after 8–24 hours, show one screen:

```text
While you were away

3 messages from friends
12 new messages in your servers
Maya is online
2 friends are in voice
Friday's Movie Night is tomorrow
Your 18-day streak is active
```

Personalized, finite, never an infinite feed. The biggest reason to return is *"what did my people do while I was gone?"* — defensible retention, native to a communications app.

## The loop (what makes this Disband's system, not tricks)

```text
                    ┌──────────────┐
                    │   FRIENDS    │
                    └──────┬───────┘
                           │
                    talk / hang out
                           │
              ┌────────────▼────────────┐
              │       ACTIVITY          │
              └──────┬─────────┬───────┘
                     │         │
                    XP       STREAK
                     │         │
              ┌──────▼───┐ ┌───▼────────┐
              │  LEVEL   │ │ RELATIONSHIP│
              └─────┬────┘ │   HISTORY   │
                    │      └──────┬───────┘
                    ▼             │
               COSMETICS          │
                    │             │
                    └──────┬──────┘
                           ▼
                    PROFILE IDENTITY
                           │
                           ▼
                    COMMUNITY / SERVER
                           │
                           ▼
                     EVENTS + TETHER
                           │
                           ▼
                       RETURN
```

## Explicitly not built

- Infinite algorithmic feed (chronological + opt-in highlights only)
- Loot boxes / gacha with real money
- Read-receipt pressure, presence surveillance, "viewed your profile" bait
- Fake scarcity of any kind

## Measurement per phase

North star: **D7/D30 retention** and **messages per daily active**, not signups. Instrument each loop (streak-saves via push, activity-reward claim rate, RSVP→attendance, referral double-side conversion) before building the next — if Phase 1 doesn't move D7, later phases won't save it.
