# In-app purchases on iOS

Aero and Catalysts on iOS go through Apple's In-App Purchase, not Stripe.
This is not a choice: App Store Review Guideline 3.1.1 requires digital
content unlocked inside an iOS app to be sold with IAP, and an app that sends
users to a Stripe checkout for it is rejected.

**Where the money goes.** Apple collects it and pays it out monthly to the
bank account on the App Store Connect *Agreements, Tax, and Banking* page —
it cannot be routed to Stripe. Apple keeps 15% under the Small Business
Program (under $1M/year, which applies here) or 30% above it. So Disband ends
up with two revenue pots: Stripe for web and desktop, App Store Connect for
iOS. Both are yours; they just reconcile separately.

The one exception worth knowing about: on the **US storefront** apps may link
out to an external web purchase without Apple taking a commission. It is US
only, the link has to leave the app, and the rules around it have moved more
than once — so IAP is what is built here, and a US link-out would be an
addition on top rather than a replacement.

## What the code does

| Piece | Where |
| --- | --- |
| StoreKit 2 client | `ios/DisbandiOS/Services/Store/StoreService.swift` |
| Verification + entitlements | `supabase/functions/appstore/index.ts` |
| Ledger, product map, consumable grants | `supabase/migrations/0106_apple_iap.sql` |
| Subscription columns | `supabase/migrations/0045_apple_subscription_provider.sql` |

The client never grants anything. Every transaction is posted to
`appstore/verify`, which re-reads it from Apple's App Store Server API and
writes `subscriptions` / `server_catalysts` itself — the same tables the
Stripe webhook writes, so the rest of the app needs no changes to honour an
iOS purchase. A transaction is only `finish()`ed once the server has accepted
it, so a crash or a dropped connection between Apple taking the money and our
server hearing about it is retried on the next launch instead of losing the
purchase.

Signatures are deliberately **not** verified locally. Apple signs its payloads
as a JWS with an X.509 chain up to the Apple Root CA G3, and validating that
chain correctly is a lot of security-critical code that neither Deno nor
workerd hands us. Instead every inbound payload is treated as an untrusted
hint — "something happened to transaction X" — and the facts are then fetched
from Apple over an authenticated App Store Server API call. A forged
notification can at worst make the server re-check something it would have
re-checked anyway. The reasoning is written out at the top of the function.

## What still has to be set up

None of this can be done from the repo.

### 1. App Store Connect products

Create them under *Monetization → In-App Purchases*:

| Product ID | Type | Grants |
| --- | --- | --- |
| `dev.disband.aero.monthly` | Auto-Renewable Subscription | Aero |
| `dev.disband.catalyst.single` | Consumable | 1 Catalyst |

The ids must match the `apple_products` rows exactly — StoreKit returns
*nothing at all* for an id that does not exist in App Store Connect, and does
so without an error, which shows up as an empty paywall. `StoreService`
logs the missing ids when that happens.

To use different ids, change the rows rather than the app:

```sql
update apple_products set product_id = '<new id>' where product_id = 'dev.disband.aero.monthly';
```

The subscription also needs a Subscription Group, a price, and a localised
display name before it will load at all.

### 2. An In-App Purchase key

*Users and Access → Integrations → In-App Purchase*. Download the `.p8` once
— Apple will not show it again.

### 3. Function secrets

```bash
supabase secrets set \
  APPSTORE_KEY_ID=<key id> \
  APPSTORE_ISSUER_ID=<issuer id> \
  APPSTORE_BUNDLE_ID=com.wsgpolar.disband \
  APPSTORE_ENVIRONMENT=Production \
  APPSTORE_PRIVATE_KEY="$(cat AuthKey_XXXXXX.p8)"
```

`APPSTORE_ENVIRONMENT` is only a ledger fallback for a transaction that omits
its environment. Verification tries production first, then sandbox, and
subscription status uses the environment Apple returned. Sandbox purchases
must work against the live backend during App Review; they are recorded as
`Sandbox` so they can be distinguished from paid production transactions.

### 4. Deploy

```bash
supabase functions deploy appstore --no-verify-jwt
```

`--no-verify-jwt` is required and is also recorded in `supabase/config.toml`.
Apple calls `/appstore/notifications` with no Supabase token;
`/appstore/verify` checks the caller's token itself.

Apply migration `0123_apple_catalyst_purchase_units.sql` before deploying.
It repairs the Apple Catalyst conflict index so PostgREST can deliver units
idempotently. Database read or write failures now return a retryable 503;
the server only acknowledges a purchase once its entitlement was written.

The live migration history differs from this checkout. To apply only this
repair without replaying unrelated migrations, use:

```bash
supabase db query --linked --file supabase/migrations/0123_apple_catalyst_purchase_units.sql
```

### 5. Point Apple at the notifications URL

*App Information → App Store Server Notifications*, V2, both URLs:

```
https://mjqbrcabargylrimlafw.supabase.co/functions/v1/appstore/notifications
```

This is what makes a cancellation actually cancel. Without it a subscription
is only ever re-checked when the app happens to open, so someone who stops
paying keeps Aero indefinitely. Use *Request a Test Notification* on that
page to confirm it is reachable — the function answers 200 to a test payload
with no transaction in it.

### 6. Sandbox testing

Create a sandbox tester in *Users and Access → Sandbox* and sign into it on
the device under *Settings → Developer → Sandbox Apple Account*. Test the
same backend used by the review build, leaving its environment setting in
place. Confirm a purchase and a restore both unlock Aero, and a Catalyst
purchase increases the chosen space's units exactly once.

Before deployment, run `pnpm test:appstore`. This type-checks the Edge Function
(the web type-check excludes it), exercises the HTTP purchase and notification
paths with simulated Apple responses, and tests Catalyst conflict handling in
Postgres. These tests do not replace a real TestFlight/sandbox purchase.

### October 10, 2026 review failure (1.13.0, build 57)

The deployed function referenced the removed `apiBase()` inside subscription
status lookup. Sandbox transactions reached the ledger, then verification
crashed before the subscription grant, producing the review screenshot's 500.
The fix routes status lookup to the environment confirmed by Apple. The
deployed function also had `verify_jwt=true`, blocking Apple's notifications.

Deployed October 10, 2026 as `appstore` version 3 with `verify_jwt=false`.
The targeted Catalyst index repair was applied and the live index definition
confirmed. Live smoke checks returned 401 for unauthenticated purchase
verification and 200 for a test notification. Replaying the previously failed
sandbox subscription through the deployed notification handler re-read the
transaction and status from Apple and wrote an active Apple Aero subscription.
Fresh device purchase and restore testing is still required.

After deployment, retest purchase and Restore Purchases on the submitted
build. This server fix requires no iOS binary changes. Confirm the Paid Apps
Agreement and product metadata in App Store Connect separately, then request
another review with the verified sandbox result.

## The buying screens

| Screen | Where | Opened from |
| --- | --- | --- |
| Aero paywall | `ios/DisbandiOS/Views/Subscription/AeroPaywallSheet.swift` | the plan card on the You tab |
| Catalysts | `ios/DisbandiOS/Views/Subscription/CatalystSheet.swift` | a space's ⋯ menu |

Both carry what App Review requires on a purchase screen and it is not
decoration: the product name, its length, StoreKit's own price string, a
plain statement of how renewal and cancellation work, working Terms of Use
and Privacy Policy links, and — on the subscription screen — **Restore
Purchases**. Dropping any one of them is a rejection.

The price is never formatted in our code. `Product.displayPrice` already
carries the storefront's currency, digit grouping and tax rules; writing
"$2.99" into the app would be wrong in most of the world.

Until the products exist in App Store Connect both screens show an
"isn't available right now" block rather than a spinner. That is deliberate:
StoreKit answers an unknown product id with silence, not an error, so without
that state a missing product looks like a hung screen to users and to us.
`StoreService` also logs the ids that came back empty.

## Still open

- **Aero bought on iOS is not yet excluded from the web billing page.** The
  iOS copy already routes those users to Apple (`Subscription.isApple`), but
  the web settings screen will still offer a Stripe portal that has no
  customer behind it.
- **Catalyst packs.** The server honours `quantity` on a consumable and the
  sheet has a 1–10 stepper, but each unit is a separate App Store purchase at
  the single-Catalyst price. Discounted packs would be extra `apple_products`
  rows with a higher `quantity` and their own product ids.
- **The monthly Aero Catalyst grant** (4/month) is not wired on iOS; only
  bought Catalysts are.
