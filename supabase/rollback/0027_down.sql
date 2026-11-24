-- ROLLBACK for 0027_sold_out_audit.sql. DEV only.
-- Drops the triggers and functions, so nothing new is recorded and photos
-- are deleted the old way. The two tables are KEPT: they are the audit
-- record, and the listings and photos they describe may no longer exist
-- anywhere else.

begin;

drop trigger if exists im_products_stock_events  on public.im_products;
drop trigger if exists im_products_history       on public.im_products;
drop trigger if exists im_product_images_history on public.im_product_images;

drop function if exists public.im_products_stock_events();
drop function if exists public.im_products_history();
drop function if exists public.im_product_images_history();
drop function if exists public.im_remove_product_photos(bigint, bigint[], bigint, text);

commit;
