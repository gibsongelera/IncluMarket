-- InkluMarket — Row Level Security (tables are `im_`-prefixed; shared project).
--
-- Security model
-- --------------
-- * The public marketplace catalog (categories, approved products, variants,
--   images, reviews) is world-readable so the storefront renders for anyone.
-- * Helper functions map the authenticated auth.uid() to its InkluMarket profile
--   role/id. Buyers, sellers and admins get scoped access through them.
-- * All privileged writes in the app are additionally funnelled through server
--   actions that use the service-role key (which bypasses RLS) AFTER a
--   server-side role check, so these policies are defence-in-depth.

begin;

create or replace function public.im_current_profile_role()
returns text language sql stable security definer set search_path = public as $$
  select p.role from public.im_profiles p where p.auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.im_current_profile_id()
returns bigint language sql stable security definer set search_path = public as $$
  select p.id from public.im_profiles p where p.auth_user_id = auth.uid() limit 1;
$$;

alter table public.im_profiles          enable row level security;
alter table public.im_categories        enable row level security;
alter table public.im_products          enable row level security;
alter table public.im_product_variants  enable row level security;
alter table public.im_product_images    enable row level security;
alter table public.im_orders            enable row level security;
alter table public.im_order_items       enable row level security;
alter table public.im_product_reviews   enable row level security;
alter table public.im_support_tickets   enable row level security;
alter table public.im_ticket_responses  enable row level security;
alter table public.im_consent_logs      enable row level security;
alter table public.im_audit_logs        enable row level security;
alter table public.im_theme_settings    enable row level security;
alter table public.im_ui_prefs          enable row level security;

-- ---- im_categories: public read, admin write ------------------------------
drop policy if exists im_categories_read on public.im_categories;
create policy im_categories_read on public.im_categories for select using (true);
drop policy if exists im_categories_admin on public.im_categories;
create policy im_categories_admin on public.im_categories for all
  using (public.im_current_profile_role() = 'admin')
  with check (public.im_current_profile_role() = 'admin');

-- ---- im_profiles -----------------------------------------------------------
drop policy if exists im_profiles_read on public.im_profiles;
create policy im_profiles_read on public.im_profiles for select
  using (auth.role() = 'authenticated');
drop policy if exists im_profiles_self_update on public.im_profiles;
create policy im_profiles_self_update on public.im_profiles for update
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
drop policy if exists im_profiles_admin on public.im_profiles;
create policy im_profiles_admin on public.im_profiles for all
  using (public.im_current_profile_role() = 'admin')
  with check (public.im_current_profile_role() = 'admin');

-- ---- im_products -----------------------------------------------------------
drop policy if exists im_products_public_read on public.im_products;
create policy im_products_public_read on public.im_products for select
  using (status = 'approved' or seller_id = public.im_current_profile_id()
         or public.im_current_profile_role() = 'admin');
drop policy if exists im_products_seller_write on public.im_products;
create policy im_products_seller_write on public.im_products for all
  using (seller_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')
  with check (seller_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin');

-- ---- im_product_variants ---------------------------------------------------
drop policy if exists im_variants_public_read on public.im_product_variants;
create policy im_variants_public_read on public.im_product_variants for select using (true);
drop policy if exists im_variants_seller_write on public.im_product_variants;
create policy im_variants_seller_write on public.im_product_variants for all
  using (exists (select 1 from public.im_products p
                 where p.id = product_id
                   and (p.seller_id = public.im_current_profile_id()
                        or public.im_current_profile_role() = 'admin')))
  with check (exists (select 1 from public.im_products p
                 where p.id = product_id
                   and (p.seller_id = public.im_current_profile_id()
                        or public.im_current_profile_role() = 'admin')));

-- ---- im_product_images -----------------------------------------------------
drop policy if exists im_images_public_read on public.im_product_images;
create policy im_images_public_read on public.im_product_images for select using (true);
drop policy if exists im_images_seller_write on public.im_product_images;
create policy im_images_seller_write on public.im_product_images for all
  using (exists (select 1 from public.im_products p
                 where p.id = product_id
                   and (p.seller_id = public.im_current_profile_id()
                        or public.im_current_profile_role() = 'admin')))
  with check (exists (select 1 from public.im_products p
                 where p.id = product_id
                   and (p.seller_id = public.im_current_profile_id()
                        or public.im_current_profile_role() = 'admin')));

-- ---- im_product_reviews: public read; buyer writes own; admin all ---------
drop policy if exists im_reviews_public_read on public.im_product_reviews;
create policy im_reviews_public_read on public.im_product_reviews for select using (true);
drop policy if exists im_reviews_buyer_write on public.im_product_reviews;
create policy im_reviews_buyer_write on public.im_product_reviews for all
  using (buyer_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')
  with check (buyer_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin');

-- ---- im_orders: buyer own, seller of contained products, admin all --------
drop policy if exists im_orders_access on public.im_orders;
create policy im_orders_access on public.im_orders for select
  using (buyer_id = public.im_current_profile_id()
         or public.im_current_profile_role() = 'admin'
         or exists (select 1 from public.im_order_items oi
                    join public.im_products p on p.id = oi.product_id
                    where oi.order_id = im_orders.id
                      and p.seller_id = public.im_current_profile_id()));
drop policy if exists im_orders_buyer_write on public.im_orders;
create policy im_orders_buyer_write on public.im_orders for all
  using (buyer_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin')
  with check (buyer_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin');

-- ---- im_order_items --------------------------------------------------------
drop policy if exists im_order_items_access on public.im_order_items;
create policy im_order_items_access on public.im_order_items for select
  using (exists (select 1 from public.im_orders o
                 where o.id = order_id
                   and (o.buyer_id = public.im_current_profile_id()
                        or public.im_current_profile_role() = 'admin'))
         or exists (select 1 from public.im_products p
                    where p.id = product_id
                      and p.seller_id = public.im_current_profile_id()));
drop policy if exists im_order_items_buyer_write on public.im_order_items;
create policy im_order_items_buyer_write on public.im_order_items for all
  using (exists (select 1 from public.im_orders o
                 where o.id = order_id
                   and (o.buyer_id = public.im_current_profile_id()
                        or public.im_current_profile_role() = 'admin')))
  with check (exists (select 1 from public.im_orders o
                 where o.id = order_id
                   and (o.buyer_id = public.im_current_profile_id()
                        or public.im_current_profile_role() = 'admin')));

-- ---- im_support_tickets: owner, assigned admin, admin all -----------------
drop policy if exists im_tickets_access on public.im_support_tickets;
create policy im_tickets_access on public.im_support_tickets for select
  using (user_id = public.im_current_profile_id()
         or assigned_to = public.im_current_profile_id()
         or public.im_current_profile_role() = 'admin');
drop policy if exists im_tickets_owner_insert on public.im_support_tickets;
create policy im_tickets_owner_insert on public.im_support_tickets for insert
  with check (user_id = public.im_current_profile_id());
drop policy if exists im_tickets_update on public.im_support_tickets;
create policy im_tickets_update on public.im_support_tickets for update
  using (public.im_current_profile_role() = 'admin' or user_id = public.im_current_profile_id())
  with check (public.im_current_profile_role() = 'admin' or user_id = public.im_current_profile_id());

-- ---- im_ticket_responses ---------------------------------------------------
drop policy if exists im_responses_access on public.im_ticket_responses;
create policy im_responses_access on public.im_ticket_responses for select
  using (exists (select 1 from public.im_support_tickets t
                 where t.id = ticket_id
                   and (t.user_id = public.im_current_profile_id()
                        or t.assigned_to = public.im_current_profile_id()
                        or public.im_current_profile_role() = 'admin')));
drop policy if exists im_responses_insert on public.im_ticket_responses;
create policy im_responses_insert on public.im_ticket_responses for insert
  with check (author_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin');

-- ---- im_consent_logs / im_audit_logs --------------------------------------
drop policy if exists im_consent_read on public.im_consent_logs;
create policy im_consent_read on public.im_consent_logs for select
  using (user_id = public.im_current_profile_id() or public.im_current_profile_role() = 'admin');
drop policy if exists im_consent_insert on public.im_consent_logs;
create policy im_consent_insert on public.im_consent_logs for insert
  with check (user_id = public.im_current_profile_id());

drop policy if exists im_audit_read on public.im_audit_logs;
create policy im_audit_read on public.im_audit_logs for select
  using (public.im_current_profile_role() = 'admin');

-- ---- im_theme_settings: public read, admin write --------------------------
drop policy if exists im_theme_read on public.im_theme_settings;
create policy im_theme_read on public.im_theme_settings for select using (true);
drop policy if exists im_theme_admin on public.im_theme_settings;
create policy im_theme_admin on public.im_theme_settings for all
  using (public.im_current_profile_role() = 'admin')
  with check (public.im_current_profile_role() = 'admin');

-- ---- im_ui_prefs: own only -------------------------------------------------
drop policy if exists im_ui_prefs_self on public.im_ui_prefs;
create policy im_ui_prefs_self on public.im_ui_prefs for all
  using (user_id = public.im_current_profile_id())
  with check (user_id = public.im_current_profile_id());

commit;
