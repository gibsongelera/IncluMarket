-- ROLLBACK for 0021_featured_windows.sql. DEV only.
begin;
drop index if exists public.idx_im_products_featured;
alter table public.im_products drop constraint if exists im_products_featured_window;
alter table public.im_products
  drop column if exists featured_position,
  drop column if exists featured_from,
  drop column if exists featured_until;
commit;
