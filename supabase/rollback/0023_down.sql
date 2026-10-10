-- ROLLBACK for 0023_product_media_backfill.sql. DEV only.
begin;
drop function if exists public.im_move_product_image_to_storage(bigint, text);
commit;
