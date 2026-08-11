-- RLS for Inclusive Market extension tables (0007).

begin;

alter table public.im_payment_providers enable row level security;
alter table public.im_payouts           enable row level security;
alter table public.im_transactions      enable row level security;
alter table public.im_activity_logs     enable row level security;

-- Payment providers: public may read enabled ones (checkout); admin manages all
drop policy if exists im_payment_providers_public_read on public.im_payment_providers;
create policy im_payment_providers_public_read on public.im_payment_providers for select
  using (enabled = true or public.im_current_profile_role() = 'admin');
drop policy if exists im_payment_providers_admin_write on public.im_payment_providers;
create policy im_payment_providers_admin_write on public.im_payment_providers for all
  using (public.im_current_profile_role() = 'admin')
  with check (public.im_current_profile_role() = 'admin');

-- Payouts: seller owns own rows; admin all
drop policy if exists im_payouts_access on public.im_payouts;
create policy im_payouts_access on public.im_payouts for select
  using (seller_id = public.im_current_profile_id()
         or public.im_current_profile_role() = 'admin');
drop policy if exists im_payouts_seller_insert on public.im_payouts;
create policy im_payouts_seller_insert on public.im_payouts for insert
  with check (seller_id = public.im_current_profile_id()
              and public.im_current_profile_role() = 'seller');
drop policy if exists im_payouts_admin_update on public.im_payouts;
create policy im_payouts_admin_update on public.im_payouts for update
  using (public.im_current_profile_role() = 'admin')
  with check (public.im_current_profile_role() = 'admin');

-- Transactions: buyer of record or admin
drop policy if exists im_transactions_read on public.im_transactions;
create policy im_transactions_read on public.im_transactions for select
  using (buyer_id = public.im_current_profile_id()
         or public.im_current_profile_role() = 'admin');

-- Activity logs: admin only (writes via service-role server actions)
drop policy if exists im_activity_logs_admin_read on public.im_activity_logs;
create policy im_activity_logs_admin_read on public.im_activity_logs for select
  using (public.im_current_profile_role() = 'admin');

-- Low-stock view: sellers see own; admin sees all
-- (security_invoker so underlying RLS on products/variants applies when available)
alter view public.im_low_stock_alerts set (security_invoker = true);

commit;
