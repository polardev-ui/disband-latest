# Disband Sentinel — illegal content detection and removal

Automated scanning of every user-content surface for CSAM, bestiality and
gore. Runs every 5 hours, removes what it finds, holds the account behind it,
preserves evidence, and emails a summary to **beluga7133@gmail.com**.

Status as of the last deployment:

| Piece | State |
|---|---|
| Schema, views, enforcement functions | **Live** (migration `0090`) |
| Scanner (`content-sentinel` edge function) | **Live**, deployed |
| 5-hourly schedule (pg_cron → edge function) | **Live**, verified end to end |
| Text rules over all 75,000 rows | **Backfilled**, 100% covered |
| Media hashing | **Live** (~250 files per run) |
| Image/video classification | **NOT ACTIVE** — needs a provider key, see §3 |
| Upload-time hash blocking (CDN worker) | **Written and tested, NOT deployed** — see §6 |
| NCMEC reporting | **Manual** — see §2 |

---

## 1. What it covers

Two views define every surface. Adding a column to either is all that is
needed to bring a new surface into scope.

`safety_media_refs` — avatars, profile banners, space icons and banners, group
chat icons, message attachments (channels, DMs, groups), notes attachments,
custom emoji, bot avatars, media posts.

`safety_text_refs` — usernames, display names, bios, status notes, space names
and descriptions, channel names, group names, custom emoji names, and message
content in channels, DMs, groups and notes.

Current scale: ~6,800 distinct media files, ~75,000 text rows.

## 2. Legal duties — read before changing anything

**Do not make the system delete CSAM on sight.** In the US, providers must
report apparent CSAM to NCMEC's CyberTipline and then *preserve* the material
for 90 days (18 U.S.C. § 2258A). Deleting it destroys evidence and breaks that
duty. The system therefore:

* moves the object to `quarantine/<sha256>` in R2, where it cannot be served
  (`serve()` rejects any key containing `/`);
* writes a `moderation_evidence` row with `preserved_until = now() + 90 days`;
* refuses early deletion of that row with a trigger.

**Reports never contain imagery.** The email carries ids, hashes and counts
only. Mailing the material would itself distribute it.

**You still have to file the CyberTipline reports.** This cannot be automated
without registering as an Electronic Service Provider with NCMEC. Until that is
done, someone must review `moderation_evidence where reported_at is null` and
file manually. Register at <https://report.cybertip.org/espregistration>.

## 3. Turning on image classification (the important gap)

Right now media is hashed and checked against `banned_media_hashes`, which
catches *known* material and anything you have seen before. It cannot
recognise **new** imagery — that needs a classifier.

```bash
supabase secrets set --project-ref mjqbrcabargylrimlafw \
  MODERATION_PROVIDER=sightengine \
  SIGHTENGINE_USER=... SIGHTENGINE_SECRET=...
# or
supabase secrets set --project-ref mjqbrcabargylrimlafw \
  MODERATION_PROVIDER=hive HIVE_API_KEY=...
```

Adapters for both are in `index.ts` (`classifySightengine`, `classifyHive`).
Thresholds live there too. Sightengine is cheaper and has a minor/nudity
combination signal; Hive has an explicit CSAM class and is what most platforms
of this size use.

Also worth doing, and free: Cloudflare's **CSAM Scanning Tool**, enabled in the
Cloudflare dashboard for the zone serving `cdn.disband.dev`. It hash-matches
against NCMEC and PhotoDNA lists and files reports for you.

After adding a key, backfill the existing library (see §5) — otherwise only
newly-seen files get classified.

## 4. What happens on a hit

| Finding | Action |
|---|---|
| Media matching a banned hash | Quarantined, all references removed, **uploader suspended**, hash recorded, evidence preserved |
| Media classified CSAM / bestiality | Same |
| Media classified gore | Quarantined; account held unless `SUSPEND_ON_GORE=false` |
| Media classified adult nudity | Flagged for review only — legal content, not removed |
| Text matching a `block` rule | Redacted to `[removed by Disband Safety]`, flag opened |
| Text matching a `review` rule | Flag opened, nothing changed |

**Text never suspends an account.** The first dry run over real data had five
of six blocking hits turn out to be users *reporting* abuse ("they have a child
porn channel", "sites on the dark web advertise child pornography") and one
crude insult. Auto-banning on wording would have removed the reporters.
Suspension requires media evidence — a hash match or a classifier verdict on an
actual image. Those five strings are now regression tests in `rules_test.ts`.

Suspension writes to `platform_bans`, which `is_platform_banned()` already
enforces in RLS across the whole product.

## 5. Running it by hand

The scheduled job needs no credentials from you. For manual runs use the
operator key stored as the `SENTINEL_KEY` function secret.

```bash
URL=https://mjqbrcabargylrimlafw.supabase.co/functions/v1/content-sentinel

# See what it would do, change nothing
curl -X POST "$URL" -H "Authorization: Bearer $SENTINEL_KEY" \
  -H 'Content-Type: application/json' -d '{"mode":"text","dryRun":true,"full":true}'

# Media only, bigger batch
curl -X POST "$URL" -H "Authorization: Bearer $SENTINEL_KEY" \
  -H 'Content-Type: application/json' -d '{"mode":"media","limit":250}'
```

A full backfill is more than one invocation's CPU budget, so drive it in
chunks: each call returns `nextOffset`, feed it back until it is `null`. About
6,000 text rows per call works; the scheduled incremental pass is only what
changed since the last good run and is far smaller (~150 rows).

Seed known-bad hashes from a takedown:

```sql
insert into public.banned_media_hashes (sha256, category, source, notes)
values ('<sha256>', 'csam', 'takedown', 'seized space 2026-09');
```

Any file matching is refused at upload (once §6 ships) and quarantined on the
next sweep.

## 6. Pending: upload-time blocking

`cloudflare/cdn-worker/src/index.js` has been changed to hash every upload as
it streams to R2 (`tee()` + `DigestStream`, so a 500 MB video never enters
memory), refuse anything on the denylist with HTTP 451, register the asset for
scanning, and expose `POST /v1/admin/quarantine`.

This was verified locally end to end — 6 MB upload hashed and stored intact, a
banned hash refused with 451, quarantine requiring the admin secret, and the
quarantined key unreachable afterwards.

**It is not deployed.** `wrangler deploy` refuses:

```
New version of script does not export class 'MediaQuota' which is depended on
by existing Durable Objects.
```

The deployed worker contains a Durable Object class `MediaQuota` that does not
exist anywhere in this repository — production has drifted from source.
Deploying from the repo would delete that class and its stored state, which is
why Cloudflare blocked it. Resolve before deploying:

1. Recover the deployed source (Cloudflare dashboard → Workers & Pages →
   `disband-cdn` → Deployments → view the active version), commit it here, then
   re-apply the safety changes on top; **or**
2. re-add the `MediaQuota` class and its `[[durable_objects]]` binding to
   `wrangler.toml` if you still want that feature.

The secrets it needs (`SUPABASE_SERVICE_KEY`, `ADMIN_SECRET`) are already set
on `disband-cdn`.

## 7. Where things are recorded

| Table | Holds |
|---|---|
| `media_assets` | Every media URL, its hash, and its verdict |
| `banned_media_hashes` | Known-bad hashes; blocks uploads and sweeps |
| `content_flags` | Findings needing a human, and the audit trail |
| `moderation_actions` | Every removal, redaction and suspension |
| `moderation_evidence` | Preserved material, retention hold, NCMEC report id |
| `safety_runs` | One row per sweep with counts and status |

All are service-role only: RLS on with no policies, `execute` revoked from
`anon`/`authenticated`. Nothing here is reachable from a client session.

Useful queries:

```sql
-- What needs a person
select * from public.content_flags where state = 'open' order by created_at desc;

-- What the system did
select * from public.moderation_actions order by created_at desc limit 50;

-- Evidence still awaiting a CyberTipline report
select id, sha256, category, created_at, preserved_until
from public.moderation_evidence where reported_at is null;

-- Sweep health
select * from public.safety_runs order by started_at desc limit 10;
```
