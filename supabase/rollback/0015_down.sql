-- ROLLBACK for 0015_checkouts_order_split.sql. DEV only.
--
-- Removes im_place_checkout() so the application falls back to its legacy
-- single-order path (lib/actions/shop.ts placeLegacyOrder), and restores the
-- 0013 visibility predicate. Columns, im_checkouts and the split of legacy
-- orders are KEPT: undoing a split would merge different sellers' parcels
-- back into one order, which is the bug 0015 fixed (B-09).

begin;

drop function if exists public.im_place_checkout(jsonb);

create or replace function public.im_can_see_order(p_order_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    public.im_current_profile_role() = 'admin'
    or exists (
      select 1 from public.im_orders o
       where o.id = p_order_id and o.buyer_id = public.im_current_profile_id()
    )
    or exists (
      select 1
        from public.im_order_items oi
        join public.im_products p on p.id = oi.product_id
       where oi.order_id = p_order_id and p.seller_id = public.im_current_profile_id()
    );
$fn$;

commit;
