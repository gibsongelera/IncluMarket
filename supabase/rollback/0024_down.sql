-- ROLLBACK for 0024_flash_sale_rules.sql. DEV only.
begin;
drop trigger if exists trg_im_flash_sale_guard on public.im_flash_sales;
drop function if exists public.im_flash_sale_guard();
commit;
