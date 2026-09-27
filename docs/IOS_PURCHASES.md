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

`APPSTORE_ENVIRONMENT` is a real switch, not a formality: a Sandbox
transaction is recorded but never granted when it is set to `Production`, so
a tester cannot hand themselves Aero on the live database.

### 4. Deploy

```bash
supabase functions deploy appstore --no-verify-jwt
```

`--no-verify-jwt` is required. Apple calls `/appstore/notifications` with no
Supabase token; `/appstore/verify` checks the caller's token itself.

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

Create a sandbox tester in *Users and Access → Sandbox*, sign into it on the
device under *Settings → Developer → Sandbox Apple Account*, and set
`APPSTORE_ENVIRONMENT=Sandbox` on a **non-production** project — never on the
live one, or sandbox purchases start granting real entitlements.

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
