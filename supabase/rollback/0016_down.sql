-- ROLLBACK for 0016_products_moderation_search.sql. DEV only.
--
-- Drops the search functions, storefront view, moderation and stats triggers
-- and their helpers. Columns are kept (they hold data; nothing old reads
-- them). The status check is restored as NOT VALID because rows may already
-- be `archived`. The application falls back to its pre-0016 reads.

begin;

drop function if exists public.im_suggest_products(text, integer);
drop function if exists public.im_search_products(text, text, numeric, numeric, numeric, text[], bigint, text, integer, integer);
drop view if exists public.im_storefront_products;

drop trigger if exists im_variants_stats on public.im_product_variants;
drop trigger if exists im_orders_stats on public.im_orders;
drop trigger if exists im_order_items_stats on public.im_order_items;
drop trigger if exists im_reviews_stats on public.im_product_reviews;
drop trigger if exists im_product_images_moderation on public.im_product_images;
drop trigger if exists im_products_moderation on public.im_products;

drop function if exists public.im_variants_stats();
drop function if exists public.im_orders_stats();
drop function if exists public.im_order_items_stats();
drop function if exists public.im_reviews_stats();
drop function if exists public.im_refresh_product_stock(bigint);
drop function if exists public.im_refresh_product_sold(bigint);
drop function if exists public.im_refresh_product_rating(bigint);
drop function if exists public.im_product_images_moderation();
drop function if exists public.im_products_moderation();

drop index if exists public.idx_im_products_title_trgm;
drop index if exists public.idx_im_products_search;

alter table public.im_products drop constraint if exists im_products_adaptive_tags_check;
alter table public.im_products drop constraint if exists im_products_status_check;
alter table public.im_products add constraint im_products_status_check
  check (status in ('pending','approved','flagged')) not valid;

commit;
