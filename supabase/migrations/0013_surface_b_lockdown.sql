-- InclusiveMarket — Surface B lockdown: no client writes to im_ tables.
--
-- Context. The application performs EVERY write with the service-role key
-- after its own session, role and ownership checks (lib/actions/*). The
-- browser Supabase client (lib/supabase/client.ts) has no importers, and the
-- per-request server client is used only for Auth calls. So no application
-- path needs a write policy for `anon` or `authenticated`.
--
-- But the policies existed, and the publishable key that ships in every
-- browser bundle reaches PostgREST directly ("Surface B"). Reading 0002, 0004,
-- 0006 and 0008 against that surface:
--
--   * im_orders_buyer_write / im_order_items_buyer_write (`for all`): a buyer
--     could PATCH their own order to payment_status='paid', change
--     total_amount, or rewrite unit_price on their lines.            (N-03)
--   * im_products_seller_write (`for all`): a seller could set their own
--     listing to status='approved' and is_featured=true, skipping moderation
--     and the admin-only featured flag.                              (N-04)
--   * reviews by anyone for anything, ticket status/assignee by the owner,
--     history rows by a seller, unlimited newsletter inserts past the IP rate
--     limit, payout rows of any amount, conversations with arbitrary
--     counterparts.                                                   (N-05)
--
-- Fix: drop every client-facing INSERT/UPDATE/DELETE/ALL policy on im_
-- tables. Where an ALL policy was also the only READ rule, replace it with a
-- SELECT policy using the same predicate, so direct reads behave as before.
-- Then revoke write privileges from anon/authenticated on every im_ table as
-- a second, independent layer: even a policy added by mistake later cannot
-- grant a write the role has no privilege for.
--
-- RLS stays ENABLED on every table; service_role bypasses RLS and keeps full
-- access, so the application is unaffected.
--
-- Shared project note: this touches only tables named im_*. Other InkluTrack
-- apps' tables and the schema's default privileges are left alone.
--
-- Rollback: supabase/rollback/0013_down.sql (restores the 0002–0008 policies).

begin;

-- ---------------------------------------------------------------------------
-- 1. Drop write policies (idempotent).
-- ---------------------------------------------------------------------------
drop policy if exists im_categories_admin            on public.im_categories;
drop policy if exists im_profiles_self_update        on public.im_profiles;
drop policy if exists im_profiles_admin              on public.im_profiles;
drop policy if exists im_products_seller_write       on public.im_products;
drop policy if exists im_variants_seller_write       on public.im_product_variants;
drop policy if exists im_images_seller_write         on public.im_product_images;
drop policy if exists im_reviews_buyer_write         on public.im_product_reviews;
drop policy if exists im_orders_buyer_write          on public.im_orders;
drop policy if exists im_order_items_buyer_write     on public.im_order_items;
drop policy if exists im_tickets_owner_insert        on public.im_support_tickets;
drop policy if exists im_tickets_update              on public.im_support_tickets;
drop policy if exists im_responses_insert            on public.im_ticket_responses;
drop policy if exists im_consent_insert              on public.im_consent_logs;
drop policy if exists im_theme_admin                 on public.im_theme_settings;
drop policy if exists im_order_history_write         on public.im_order_status_history;
drop policy if exists im_flash_sales_seller_write    on public.im_flash_sales;
drop policy if exists im_notifications_own_update    on public.im_notifications;
drop policy if exists im_notifications_own_delete    on public.im_notifications;
drop policy if exists im_newsletter_insert           on public.im_newsletter_subscribers;
drop policy if exists im_newsletter_admin_manage     on public.im_newsletter_subscribers;
drop policy if exists im_messages_insert             on public.im_messages;
drop policy if exists im_chat_sessions_own_update    on public.im_chat_sessions;
drop policy if exists im_payment_providers_admin_write on public.im_payment_providers;
drop policy if exists im_payouts_seller_insert       on public.im_payouts;
drop policy if exists im_payouts_admin_update        on public.im_payouts;

-- ---------------------------------------------------------------------------
-- 2. `for all` policies that were also the only read rule → SELECT only,
--    same predicate.
-- ---------------------------------------------------------------------------
drop policy if exists im_cart_own on public.im_cart_items;
create policy im_cart_own_read on public.im_cart_items for select
  using (user_id = public.im_current_profile_id());

drop policy if exists im_ui_prefs_self on public.im_ui_prefs;
create policy im_ui_prefs_self_read on public.im_ui_prefs for select
  using (user_id = public.im_current_profile_id());

drop policy if exists im_wishlists_own on public.im_wishlists;
create policy im_wishlists_own_read on public.im_wishlists for select
  using (user_id = public.im_current_profile_id());

drop policy if exists im_conversations_access on public.im_conversations;
create policy im_conversations_read on public.im_conversations for select
  using (buyer_id = public.im_current_profile_id()
         or seller_id = public.im_current_profile_id()
         or public.im_current_profile_role() = 'admin');

-- ---------------------------------------------------------------------------
-- 2b. Order read policies without infinite recursion.
--
-- im_orders_access (0002) looks into im_order_items, whose policy looks back
-- into im_orders: Postgres raises "infinite recursion detected in policy for
-- relation im_orders" for EVERY direct read or filtered write of orders by a
-- signed-in user. Verified on Postgres 16 (PGlite) with 0001–0012 applied.
-- That error is also why a filtered PATCH of payment_status failed — while an
-- UNFILTERED `PATCH /rest/v1/im_orders {"payment_status":"paid"}` succeeded on
-- the caller's own orders (N-03). Section 1 removes the write; this makes the
-- reads work as 0002 intended.
--
-- One SECURITY DEFINER predicate answers "may the caller see this order?"
-- without re-entering RLS. It only ever reveals a boolean about the caller's
-- own access, like im_current_profile_id(), and must stay executable by
-- `authenticated` because policy expressions run as the querying role.
-- ---------------------------------------------------------------------------
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
comment on function public.im_can_see_order(bigint) is
  'RLS helper: true when the caller is the order''s buyer, a seller with a line in it, or an admin. EXECUTE must stay granted to authenticated (used inside policies). Reveals nothing beyond the caller''s own access.';
revoke all on function public.im_can_see_order(bigint) from public, anon;
grant execute on function public.im_can_see_order(bigint) to authenticated;

drop policy if exists im_orders_access on public.im_orders;
create policy im_orders_access on public.im_orders for select
  using (public.im_can_see_order(id));

drop policy if exists im_order_items_access on public.im_order_items;
create policy im_order_items_access on public.im_order_items for select
  using (public.im_can_see_order(order_id));

drop policy if exists im_order_history_read on public.im_order_status_history;
create policy im_order_history_read on public.im_order_status_history for select
  using (public.im_can_see_order(order_id));

-- ---------------------------------------------------------------------------
-- 3. Revoke write privileges on every im_ table from the client roles.
-- ---------------------------------------------------------------------------
do $lock$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relname like 'im\_%'
  loop
    execute format(
      'revoke insert, update, delete, truncate on table public.%I from anon, authenticated',
      t.relname
    );
  end loop;
end
$lock$;

-- ---------------------------------------------------------------------------
-- 4. Data: every product has at least one variant (stock lives on variants;
--    a variantless product had no stock limit — B-05). Zero stock, so nothing
--    becomes sellable by accident; sellers are prompted to set it.
-- ---------------------------------------------------------------------------
insert into public.im_product_variants (product_id, color_name, size, stock_qty, sku_code)
select p.id, 'Standard', null, 0, 'IM-' || p.id || '-STD'
  from public.im_products p
 where not exists (select 1 from public.im_product_variants v where v.product_id = p.id)
on conflict (sku_code) do nothing;

commit;
