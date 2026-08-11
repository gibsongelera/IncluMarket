-- IncluMarket — Row Level Security for the growth-rebuild tables (0005).
-- Same model as 0002_rls.sql: RLS is defence-in-depth — the real gate is the
-- server action's role check before it uses the service-role client. Tables
-- with no client-facing insert/update policy below are written exclusively
-- through server actions (service-role), mirroring im_audit_logs.

begin;

alter table public.im_wishlists              enable row level security;
alter table public.im_order_status_history   enable row level security;
alter table public.im_flash_sales            enable row level security;
alter table public.im_notifications          enable row level security;
alter table public.im_newsletter_subscribers enable row level security;
alter table public.im_conversations          enable row level security;
alter table public.im_messages               enable row level security;
alter table public.im_chat_sessions          enable row level security;
alter table public.im_chat_messages          enable row level security;

-- ---- im_wishlists: own only -------------------------------------------------
drop policy if exists im_wishlists_own on public.im_wishlists;
create policy im_wishlists_own on public.im_wishlists for all
  using (user_id = public.im_current_profile_id())
  with check (user_id = public.im_current_profile_id());

-- ---- im_order_status_history: read via order access; write by the order's
--      seller(s) or admin (mirrors im_order_items' seller-of-product check) --
drop policy if exists im_order_history_read on public.im_order_status_history;
create policy im_order_history_read on public.im_order_status_history for select
  using (exists (select 1 from public.im_orders o
                 where o.id = order_id
                   and (o.buyer_id = public.im_current_profile_id()
                        or public.im_current_profile_role() = 'admin'))
         or exists (select 1 from public.im_order_items oi
                    join public.im_products p on p.id = oi.product_id
                    where oi.order_id = im_order_status_history.order_id
                      and p.seller_id = public.im_current_profile_id()));
drop policy if exists im_order_history_write on public.im_order_status_history;
create policy im_order_history_write on public.im_order_status_history for insert
  with check (public.im_current_profile_role() = 'admin'
              or exists (select 1 from public.im_order_items oi
                         join public.im_products p on p.id = oi.product_id
                         where oi.order_id = im_order_status_history.order_id
                           and p.seller_id = public.im_current_profile_id()));

-- ---- im_flash_sales: public read (storefront needs it); seller/admin write -
drop policy if exists im_flash_sales_public_read on public.im_flash_sales;
create policy im_flash_sales_public_read on public.im_flash_sales for select using (true);
drop policy if exists im_flash_sales_seller_write on public.im_flash_sales;
create policy im_flash_sales_seller_write on public.im_flash_sales for all
  using (exists (select 1 from public.im_products p
                 where p.id = product_id
                   and (p.seller_id = public.im_current_profile_id()
                        or public.im_current_profile_role() = 'admin')))
  with check (exists (select 1 from public.im_products p
                 where p.id = product_id
                   and (p.seller_id = public.im_current_profile_id()
                        or public.im_current_profile_role() = 'admin')));

-- ---- im_notifications: own read/update/delete; inserts are system-generated
--      (service-role only, no client insert policy) -------------------------
drop policy if exists im_notifications_own on public.im_notifications;
create policy im_notifications_own on public.im_notifications for select
  using (user_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin');
drop policy if exists im_notifications_own_update on public.im_notifications;
create policy im_notifications_own_update on public.im_notifications for update
  using (user_id = public.im_current_profile_id())
  with check (user_id = public.im_current_profile_id());
drop policy if exists im_notifications_own_delete on public.im_notifications;
create policy im_notifications_own_delete on public.im_notifications for delete
  using (user_id = public.im_current_profile_id());

-- ---- im_newsletter_subscribers: anyone may subscribe (pre-auth footer form
--      included); only admin may read/manage the list -----------------------
drop policy if exists im_newsletter_insert on public.im_newsletter_subscribers;
create policy im_newsletter_insert on public.im_newsletter_subscribers for insert
  with check (true);
drop policy if exists im_newsletter_admin_read on public.im_newsletter_subscribers;
create policy im_newsletter_admin_read on public.im_newsletter_subscribers for select
  using (public.im_current_profile_role() = 'admin');
drop policy if exists im_newsletter_admin_manage on public.im_newsletter_subscribers;
create policy im_newsletter_admin_manage on public.im_newsletter_subscribers for update
  using (public.im_current_profile_role() = 'admin')
  with check (public.im_current_profile_role() = 'admin');

-- ---- im_conversations: participants (buyer or seller) + admin -------------
drop policy if exists im_conversations_access on public.im_conversations;
create policy im_conversations_access on public.im_conversations for all
  using (buyer_id = public.im_current_profile_id()
         or seller_id = public.im_current_profile_id()
         or public.im_current_profile_role() = 'admin')
  with check (buyer_id = public.im_current_profile_id()
              or seller_id = public.im_current_profile_id()
              or public.im_current_profile_role() = 'admin');

-- ---- im_messages: read/write via parent conversation participation --------
drop policy if exists im_messages_access on public.im_messages;
create policy im_messages_access on public.im_messages for select
  using (exists (select 1 from public.im_conversations c
                 where c.id = conversation_id
                   and (c.buyer_id = public.im_current_profile_id()
                        or c.seller_id = public.im_current_profile_id()
                        or public.im_current_profile_role() = 'admin')));
drop policy if exists im_messages_insert on public.im_messages;
create policy im_messages_insert on public.im_messages for insert
  with check (sender_id = public.im_current_profile_id()
              and exists (select 1 from public.im_conversations c
                          where c.id = conversation_id
                            and (c.buyer_id = public.im_current_profile_id()
                                 or c.seller_id = public.im_current_profile_id())));

-- ---- im_chat_sessions / im_chat_messages: own (signed-in) or admin; guest
--      sessions (user_id null) are only reachable via the service-role
--      client from the chat server action, matching im_audit_logs' pattern -
drop policy if exists im_chat_sessions_own on public.im_chat_sessions;
create policy im_chat_sessions_own on public.im_chat_sessions for select
  using (user_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin');
drop policy if exists im_chat_sessions_own_update on public.im_chat_sessions;
create policy im_chat_sessions_own_update on public.im_chat_sessions for update
  using (user_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')
  with check (user_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin');

drop policy if exists im_chat_messages_own on public.im_chat_messages;
create policy im_chat_messages_own on public.im_chat_messages for select
  using (exists (select 1 from public.im_chat_sessions s
                 where s.id = session_id
                   and (s.user_id = public.im_current_profile_id()
                        or public.im_current_profile_role() = 'admin')));

commit;
