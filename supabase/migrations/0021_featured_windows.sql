-- InclusiveMarket — featured products get an order and a start/end date (C-19).
--
-- "Featured" was a bare flag: no order on the homepage, and a feature for a
-- campaign stayed up until someone remembered to switch it off. Now an admin
-- sets a position and an optional window; the homepage shows only features
-- inside their window (and in stock), so an expired feature drops off on its
-- own. The flag stays the switch; the window narrows it.
--
-- Not added to the moderation trigger's content list: changing a feature is
-- an admin merchandising act, not a seller edit, and never re-queues review.
--
-- Rollback: supabase/rollback/0021_down.sql

begin;

alter table public.im_products
  add column if not exists featured_position integer check (featured_position is null or featured_position between 0 and 999),
  add column if not exists featured_from     timestamptz,
  add column if not exists featured_until    timestamptz;

alter table public.im_products drop constraint if exists im_products_featured_window;
alter table public.im_products add constraint im_products_featured_window
  check (featured_until is null or featured_from is null or featured_until > featured_from);

create index if not exists idx_im_products_featured
  on public.im_products(featured_position nulls last, id)
  where is_featured;

comment on column public.im_products.featured_until is
  'Feature ends here (exclusive). Null: until switched off.';

commit;
