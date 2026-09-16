-- 0071_remove_mascots.sql
-- Retire the mascots feature end to end.
--
-- The marketplace never launched and the Mascot Pass has zero subscribers, so
-- the whole surface goes: RPCs first (they reference the tables), then tables
-- in FK-dependency order, then the archived-art storage bucket.
--
-- Kept on purpose (created in the mixed 0064 migration):
--   * public.subscription_tenure_invoices
--   * public.accrue_tenure_invoice(uuid, text)
-- and every security/badge/bot object from 0065-0067.

begin;

-- 1. Plain functions (0062/0064/0068/0069/0070). Grants go with them.
--    The trigger function is not here; see step 3.
drop function if exists public.mascot_market_history(uuid);
drop function if exists public.mascot_account_activity(uuid, integer);
drop function if exists public.wallet_snapshot(uuid);
drop function if exists public.wallet_confirm_transfer(uuid, text, text, integer);
drop function if exists public.wallet_review_payment(text);
drop function if exists public.wallet_reserve_withdrawal(uuid, integer, uuid);
drop function if exists public.wallet_buy(uuid, uuid, integer, uuid);
drop function if exists public.wallet_mint(uuid, uuid, integer);
drop function if exists public.wallet_credit_deposit(uuid, text, text, integer);
drop function if exists public.wallet_debit(uuid, integer);
drop function if exists public.wallet_prepare(uuid);
drop function if exists public.fulfill_mascot_sale(uuid, text, integer);
drop function if exists public.fulfill_mascot_purchase(uuid, text, integer);
drop function if exists public.mascot_send_message(uuid, uuid, text);
drop function if exists public.remove_mascot_grant(uuid);
drop function if exists public.add_mascot_grant(uuid, uuid, uuid, boolean, boolean, jsonb);
drop function if exists public.train_mascot(uuid, integer);
drop function if exists public.rename_mascot(uuid, text);
drop function if exists public.unlist_mascot(uuid);
drop function if exists public.list_mascot(uuid, integer);
drop function if exists public.credit_user(uuid, integer, text, uuid, integer);

-- 2. Tables, dependents first. Policies and indexes drop with them.
drop table if exists public.mascot_wallet_earnings;
drop table if exists public.mascot_wallet_payment_reviews;
drop table if exists public.mascot_wallet_withdrawals;
drop table if exists public.mascot_wallet_deposits;
drop table if exists public.mascot_wallet_entries;
drop table if exists public.mascot_wallet_trades;
-- The wallets themselves, after everything that references them.
drop table if exists public.mascot_wallets;
drop table if exists public.mascot_art_drafts;
drop table if exists public.mascot_messages;
drop table if exists public.mascot_grants;
drop table if exists public.mascot_sales;
drop table if exists public.mascot_purchases;
drop table if exists public.mascots;
drop table if exists public.mascot_species;
drop table if exists public.account_credits;
drop table if exists public.credit_ledger;

-- 3. The trigger function, last.
--
-- It backs a trigger on mascot_wallet_trades, and a plain DROP FUNCTION is
-- refused while that trigger still references it — which aborts the whole
-- migration. Dropping the table above took the trigger with it, so by here
-- there is nothing left depending on this.
drop function if exists public.mascot_trade_name_snapshot();

-- The archived-art bucket (0068) is NOT dropped here.
--
-- Supabase guards its storage tables with a protect_delete() trigger, so a
-- plain DELETE raises and takes the whole migration down with it. The bucket
-- has to go through the Storage API instead:
--
--   curl -X DELETE "$SUPABASE_URL/storage/v1/bucket/mascot-art" \
--        -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
--
-- It held no objects, so nothing is lost by the bucket outliving this
-- migration by a few seconds.

commit;
