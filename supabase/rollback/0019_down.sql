-- ROLLBACK for 0019_buyer_seller_support.sql. DEV only.
-- Restores the previous review read rule, rating function, notification type
-- check (NOT VALID: newer rows may use the added types) and public seller
-- view. New tables and columns are kept — they hold user data.

begin;

drop policy if exists im_product_media_no_client_writes on storage.objects;

drop policy if exists im_reviews_public_read on public.im_product_reviews;
create policy im_reviews_public_read on public.im_product_reviews for select using (true);

create or replace function public.im_refresh_product_rating(p_product_id bigint)
returns void language sql security definer set search_path = '' as $fn$
  update public.im_products p
     set rating_avg = coalesce((select round(avg(r.rating_score)::numeric, 2) from public.im_product_reviews r where r.product_id = p_product_id), 0),
         rating_count = (select count(*) from public.im_product_reviews r where r.product_id = p_product_id)
   where p.id = p_product_id;
$fn$;

alter table public.im_notifications drop constraint if exists im_notifications_type_check;
alter table public.im_notifications add constraint im_notifications_type_check
  check (type in ('low_stock','new_order','shipping_update','new_review','flash_sale',
                  'order_status','message','chat_escalation','system')) not valid;

drop view if exists public.im_public_sellers;
create view public.im_public_sellers with (security_invoker = false) as
  select p.id, p.name, p.seller_story, p.is_featured_seller
    from public.im_profiles p
   where p.role = 'seller' and p.account_status = 'active';
grant select on public.im_public_sellers to anon, authenticated;

commit;
