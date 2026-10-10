-- InclusiveMarket — flash sale rules (C-34, N-20).
--
-- A flash sale could be started on a pending or flagged listing, overlap
-- another sale on the same product (which price wins?), and run for a year.
-- The database now refuses those, so no caller — the seller action, an admin
-- tool, a future API — can get it wrong:
--   * at most 7 days;
--   * no two sales on one product overlap in time (checked under a lock on
--     the product, so two requests at once cannot both pass);
--   * only an approved listing can get a new sale.
-- Ending a sale early (moving ends_at to now) stays allowed.
--
-- Rollback: supabase/rollback/0024_down.sql

begin;

create or replace function public.im_flash_sale_guard()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  v_status text;
begin
  if new.ends_at - new.starts_at > interval '7 days' then
    raise exception 'A flash sale can run for at most 7 days' using errcode = 'check_violation';
  end if;

  -- Serialise sales on the same product.
  perform pg_advisory_xact_lock(hashtextextended('flash_sale:' || new.product_id::text, 0));

  if tg_op = 'INSERT' then
    select status into v_status from public.im_products where id = new.product_id;
    if v_status is distinct from 'approved' then
      raise exception 'Only an approved listing can have a flash sale' using errcode = 'check_violation';
    end if;
  end if;

  if exists (
    select 1 from public.im_flash_sales f
     where f.product_id = new.product_id
       and f.id is distinct from new.id
       and tstzrange(f.starts_at, f.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'This product already has a flash sale at that time' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_im_flash_sale_guard on public.im_flash_sales;
create trigger trg_im_flash_sale_guard
  before insert or update of product_id, starts_at, ends_at on public.im_flash_sales
  for each row execute function public.im_flash_sale_guard();

commit;
