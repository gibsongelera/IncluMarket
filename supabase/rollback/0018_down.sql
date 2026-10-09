-- ROLLBACK for 0018_pwd_discount_rules.sql. DEV only.
-- Drops the weekly-usage function and the order-line foreign key. The rules
-- table is kept (it records legal sign-offs); with its FK gone the app's
-- pricing engine stops finding rules only if the table itself is dropped by hand.

begin;

drop function if exists public.im_pwd_weekly_usage(bigint);
alter table public.im_order_items drop constraint if exists im_order_items_pwd_rule_fk;

commit;
