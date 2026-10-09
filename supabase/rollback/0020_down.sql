-- ROLLBACK for 0020_earnings_payouts_categories.sql. DEV only.
-- Drops the earnings view and payout functions. Payout rows, new payout
-- columns and category columns are kept (they hold records).

begin;

drop function if exists public.im_request_payout(bigint, numeric, text, text, text);
drop function if exists public.im_seller_balance(bigint);
drop view if exists public.im_seller_earnings;

commit;
