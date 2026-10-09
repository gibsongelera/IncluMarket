-- ROLLBACK for 0013_surface_b_lockdown.sql — restores the client write
-- policies from 0002/0004/0006/0008 exactly as they were, and the default
-- table privileges. Run by hand on a DEV project only; this re-opens the
-- Surface B writes described in 0013 (N-03, N-04, N-05).
-- The "Standard" variant data fix is not reverted (it removes no data).

begin;

do $grant$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p') and c.relname like 'im\_%'
  loop
    execute format('grant insert, update, delete, truncate on table public.%I to anon, authenticated', t.relname);
  end loop;
end
$grant$;

-- Order read policies as 0002/0006 wrote them (these recurse — see 0013 §2b).
drop policy if exists im_orders_access on public.im_orders;
create policy im_orders_access on public.im_orders for select
  using (buyer_id = public.im_current_profile_id()
         or public.im_current_profile_role() = 'admin'
         or exists (select 1 from public.im_order_items oi join public.im_products p on p.id = oi.product_id
                    where oi.order_id = im_orders.id and p.seller_id = public.im_current_profile_id()));
drop policy if exists im_order_items_access on public.im_order_items;
create policy im_order_items_access on public.im_order_items for select
  using (exists (select 1 from public.im_orders o where o.id = order_id
                 and (o.buyer_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin'))
         or exists (select 1 from public.im_products p where p.id = product_id
                    and p.seller_id = public.im_current_profile_id()));
drop policy if exists im_order_history_read on public.im_order_status_history;
create policy im_order_history_read on public.im_order_status_history for select
  using (exists (select 1 from public.im_orders o where o.id = order_id
                 and (o.buyer_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin'))
         or exists (select 1 from public.im_order_items oi join public.im_products p on p.id = oi.product_id
                    where oi.order_id = im_order_status_history.order_id
                      and p.seller_id = public.im_current_profile_id()));
drop function if exists public.im_can_see_order(bigint);

drop policy if exists im_cart_own_read on public.im_cart_items;
create policy im_cart_own on public.im_cart_items for all
  using (user_id = public.im_current_profile_id())
  with check (user_id = public.im_current_profile_id());

drop policy if exists im_ui_prefs_self_read on public.im_ui_prefs;
create policy im_ui_prefs_self on public.im_ui_prefs for all
  using (user_id = public.im_current_profile_id())
  with check (user_id = public.im_current_profile_id());

drop policy if exists im_wishlists_own_read on public.im_wishlists;
create policy im_wishlists_own on public.im_wishlists for all
  using (user_id = public.im_current_profile_id())
  with check (user_id = public.im_current_profile_id());

drop policy if exists im_conversations_read on public.im_conversations;
create policy im_conversations_access on public.im_conversations for all
  using (buyer_id = public.im_current_profile_id() or seller_id = public.im_current_profile_id()
         or public.im_current_profile_role() = 'admin')
  with check (buyer_id = public.im_current_profile_id() or seller_id = public.im_current_profile_id()
              or public.im_current_profile_role() = 'admin');

create policy im_categories_admin on public.im_categories for all
  using (public.im_current_profile_role() = 'admin') with check (public.im_current_profile_role() = 'admin');
create policy im_profiles_self_update on public.im_profiles for update
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy im_profiles_admin on public.im_profiles for all
  using (public.im_current_profile_role() = 'admin') with check (public.im_current_profile_role() = 'admin');
create policy im_products_seller_write on public.im_products for all
  using (seller_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')
  with check (seller_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin');
create policy im_variants_seller_write on public.im_product_variants for all
  using (exists (select 1 from public.im_products p where p.id = product_id
                 and (p.seller_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')))
  with check (exists (select 1 from public.im_products p where p.id = product_id
                 and (p.seller_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')));
create policy im_images_seller_write on public.im_product_images for all
  using (exists (select 1 from public.im_products p where p.id = product_id
                 and (p.seller_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')))
  with check (exists (select 1 from public.im_products p where p.id = product_id
                 and (p.seller_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')));
create policy im_reviews_buyer_write on public.im_product_reviews for all
  using (buyer_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')
  with check (buyer_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin');
create policy im_orders_buyer_write on public.im_orders for all
  using (buyer_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')
  with check (buyer_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin');
create policy im_order_items_buyer_write on public.im_order_items for all
  using (exists (select 1 from public.im_orders o where o.id = order_id
                 and (o.buyer_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')))
  with check (exists (select 1 from public.im_orders o where o.id = order_id
                 and (o.buyer_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')));
create policy im_tickets_owner_insert on public.im_support_tickets for insert
  with check (user_id = public.im_current_profile_id());
create policy im_tickets_update on public.im_support_tickets for update
  using (public.im_current_profile_role() = 'admin' or user_id = public.im_current_profile_id())
  with check (public.im_current_profile_role() = 'admin' or user_id = public.im_current_profile_id());
create policy im_responses_insert on public.im_ticket_responses for insert
  with check (author_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin');
create policy im_consent_insert on public.im_consent_logs for insert
  with check (user_id = public.im_current_profile_id());
create policy im_theme_admin on public.im_theme_settings for all
  using (public.im_current_profile_role() = 'admin') with check (public.im_current_profile_role() = 'admin');
create policy im_order_history_write on public.im_order_status_history for insert
  with check (public.im_current_profile_role() = 'admin'
              or exists (select 1 from public.im_order_items oi join public.im_products p on p.id = oi.product_id
                         where oi.order_id = im_order_status_history.order_id
                           and p.seller_id = public.im_current_profile_id()));
create policy im_flash_sales_seller_write on public.im_flash_sales for all
  using (exists (select 1 from public.im_products p where p.id = product_id
                 and (p.seller_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')))
  with check (exists (select 1 from public.im_products p where p.id = product_id
                 and (p.seller_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')));
create policy im_notifications_own_update on public.im_notifications for update
  using (user_id = public.im_current_profile_id()) with check (user_id = public.im_current_profile_id());
create policy im_notifications_own_delete on public.im_notifications for delete
  using (user_id = public.im_current_profile_id());
create policy im_newsletter_insert on public.im_newsletter_subscribers for insert with check (true);
create policy im_newsletter_admin_manage on public.im_newsletter_subscribers for update
  using (public.im_current_profile_role() = 'admin') with check (public.im_current_profile_role() = 'admin');
create policy im_messages_insert on public.im_messages for insert
  with check (sender_id = public.im_current_profile_id()
              and exists (select 1 from public.im_conversations c where c.id = conversation_id
                          and (c.buyer_id = public.im_current_profile_id() or c.seller_id = public.im_current_profile_id())));
create policy im_chat_sessions_own_update on public.im_chat_sessions for update
  using (user_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')
  with check (user_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin');
create policy im_payment_providers_admin_write on public.im_payment_providers for all
  using (public.im_current_profile_role() = 'admin') with check (public.im_current_profile_role() = 'admin');
create policy im_payouts_seller_insert on public.im_payouts for insert
  with check (seller_id = public.im_current_profile_id() and public.im_current_profile_role() = 'seller');
create policy im_payouts_admin_update on public.im_payouts for update
  using (public.im_current_profile_role() = 'admin') with check (public.im_current_profile_role() = 'admin');

commit;
