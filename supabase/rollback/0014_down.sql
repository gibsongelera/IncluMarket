-- ROLLBACK for 0014_order_state_machine.sql. DEV only.
--
-- Removes the guard trigger and the transition function, so order_status is
-- a free column again (re-opening B-10). Lifecycle columns and im_settings are
-- kept: they hold data and nothing old reads them. The widened status check
-- stays, because rows may already be cancelled / return_requested; the old
-- five-value check is re-added only as NOT VALID so it applies to new writes.

begin;

drop trigger if exists im_orders_guard_status on public.im_orders;
drop function if exists public.im_orders_guard_status();
drop function if exists public.im_transition_order(bigint, text, bigint, text, text, jsonb);
drop function if exists public.im_setting_int(text, integer);

alter table public.im_orders drop constraint if exists im_orders_order_status_check;
alter table public.im_orders add constraint im_orders_order_status_check
  check (order_status in ('pending','processing','shipped','delivered','returned')) not valid;

commit;
