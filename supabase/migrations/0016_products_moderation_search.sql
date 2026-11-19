-- InclusiveMarket — product moderation, pre-computed stats, search, storefront view.
--
-- 1. Moderation in the database (B-12). Editing what buyers see on an
--    approved listing sends it back to `pending`, enforced by a trigger, not
--    only by the server action. An admin's edit counts as a moderation act
--    because it also stamps moderated_at in the same UPDATE; a seller's edit
--    never does. New statuses: `archived` (seller unpublished it; replaces
--    hard delete, which erased the product from order history — N-19).
--    Moderation reason/actor/time are kept so a flagged seller knows why.
--
-- 2. Pre-computed columns (B-16). /home loaded every product, variant,
--    review and order line on each request and aggregated in the browser,
--    silently truncated at PostgREST's 1,000-row cap. rating_avg,
--    rating_count, sold_count and stock_total are now maintained by triggers,
--    so the storefront sorts and filters in SQL and pages with LIMIT/OFFSET.
--
-- 3. Search. A generated tsvector (config `simple`: listings mix English and
--    Filipino, so no English stemming) for full-text matches, plus pg_trgm
--    word_similarity on the title for typos ("bayng" → "Bayong Market Bag":
--    the query is compared with the closest part of the title, not all of it).
--
-- 4. Adaptive / PWD-friendly tags buyers can filter by (client default Q14).
--
-- 5. im_storefront_products: approved listings from active sellers, with
--    stats, the running flash sale, the first photo and the seller's name.
--    Sorting key `effective_price` is the sale price when one runs. (Prices a
--    buyer is CHARGED are always computed by the application's pricing
--    engine; this column is for ordering and filtering only.)
--
-- Rollback: supabase/rollback/0016_down.sql

begin;

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.im_products drop constraint if exists im_products_status_check;
alter table public.im_products add constraint im_products_status_check
  check (status in ('pending','approved','flagged','archived'));

alter table public.im_products
  add column if not exists moderation_reason text,
  add column if not exists moderated_by      bigint references public.im_profiles(id) on delete set null,
  add column if not exists moderated_at      timestamptz,
  add column if not exists submitted_at      timestamptz,
  add column if not exists adaptive_tags     text[] not null default '{}',
  add column if not exists rating_avg        numeric(3,2) not null default 0,
  add column if not exists rating_count      integer not null default 0,
  add column if not exists sold_count        integer not null default 0,
  add column if not exists stock_total       integer not null default 0;

alter table public.im_products drop constraint if exists im_products_adaptive_tags_check;
alter table public.im_products add constraint im_products_adaptive_tags_check
  check (adaptive_tags <@ array['one_handed','braille_large_print','sensory_friendly',
                                'seated_fit','easy_grip','easy_closure']::text[]);

alter table public.im_products
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  ) stored;

create index if not exists idx_im_products_search on public.im_products using gin (search_tsv);
create index if not exists idx_im_products_title_trgm
  on public.im_products using gin (lower(title) extensions.gin_trgm_ops);
create index if not exists idx_im_products_tags on public.im_products using gin (adaptive_tags);
create index if not exists idx_im_products_storefront
  on public.im_products (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Moderation trigger
-- ---------------------------------------------------------------------------
create or replace function public.im_products_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    new.submitted_at := coalesce(new.submitted_at, now());
    return new;
  end if;

  -- Buyer-visible content changed on an approved listing, and this UPDATE is
  -- not itself a moderation decision (those stamp moderated_at) → re-review.
  if old.status = 'approved'
     and new.status = 'approved'
     and new.moderated_at is not distinct from old.moderated_at
     and (new.title is distinct from old.title
          or new.description is distinct from old.description
          or new.base_price is distinct from old.base_price
          or new.category is distinct from old.category
          or new.image is distinct from old.image
          or new.adaptive_tags is distinct from old.adaptive_tags) then
    new.status := 'pending';
    new.submitted_at := now();
    new.moderation_reason := null;
  end if;

  if new.status = 'pending' and old.status <> 'pending' then
    new.submitted_at := now();
  end if;
  return new;
end;
$fn$;

drop trigger if exists im_products_moderation on public.im_products;
create trigger im_products_moderation
  before insert or update on public.im_products
  for each row execute function public.im_products_moderation();

-- Photos are buyer-visible content too: changing them re-pends the listing.
create or replace function public.im_product_images_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_pid bigint := coalesce(new.product_id, old.product_id);
begin
  if coalesce(current_setting('im.moderation_bypass', true), 'off') <> 'on' then
    update public.im_products
       set status = 'pending', submitted_at = now(), moderation_reason = null
     where id = v_pid and status = 'approved';
  end if;
  return null;
end;
$fn$;
drop trigger if exists im_product_images_moderation on public.im_product_images;
create trigger im_product_images_moderation
  after insert or update or delete on public.im_product_images
  for each row execute function public.im_product_images_moderation();

-- ---------------------------------------------------------------------------
-- Stats maintenance
-- ---------------------------------------------------------------------------
create or replace function public.im_refresh_product_rating(p_product_id bigint)
returns void language sql security definer set search_path = '' as $fn$
  update public.im_products p
     set rating_avg = coalesce((select round(avg(r.rating_score)::numeric, 2) from public.im_product_reviews r where r.product_id = p_product_id), 0),
         rating_count = (select count(*) from public.im_product_reviews r where r.product_id = p_product_id)
   where p.id = p_product_id;
$fn$;

create or replace function public.im_refresh_product_sold(p_product_id bigint)
returns void language sql security definer set search_path = '' as $fn$
  update public.im_products p
     set sold_count = coalesce((
           select sum(oi.quantity)
             from public.im_order_items oi
             join public.im_orders o on o.id = oi.order_id
            where oi.product_id = p_product_id
              and o.order_status not in ('cancelled')
              and not (o.payment_provider = 'paymongo' and o.payment_status in ('pending','failed'))
         ), 0)
   where p.id = p_product_id;
$fn$;

create or replace function public.im_refresh_product_stock(p_product_id bigint)
returns void language sql security definer set search_path = '' as $fn$
  update public.im_products p
     set stock_total = coalesce((select sum(v.stock_qty) from public.im_product_variants v where v.product_id = p_product_id), 0)
   where p.id = p_product_id;
$fn$;

revoke all on function public.im_refresh_product_rating(bigint) from public, anon, authenticated;
revoke all on function public.im_refresh_product_sold(bigint)   from public, anon, authenticated;
revoke all on function public.im_refresh_product_stock(bigint)  from public, anon, authenticated;

create or replace function public.im_reviews_stats()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.im_refresh_product_rating(coalesce(new.product_id, old.product_id));
  if tg_op = 'UPDATE' and new.product_id is distinct from old.product_id then
    perform public.im_refresh_product_rating(old.product_id);
  end if;
  return null;
end;
$fn$;
drop trigger if exists im_reviews_stats on public.im_product_reviews;
create trigger im_reviews_stats after insert or update or delete on public.im_product_reviews
  for each row execute function public.im_reviews_stats();

create or replace function public.im_order_items_stats()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if coalesce(new.product_id, old.product_id) is not null then
    perform public.im_refresh_product_sold(coalesce(new.product_id, old.product_id));
  end if;
  return null;
end;
$fn$;
drop trigger if exists im_order_items_stats on public.im_order_items;
create trigger im_order_items_stats after insert or update or delete on public.im_order_items
  for each row execute function public.im_order_items_stats();

-- An order being cancelled or paid changes what counts as sold.
create or replace function public.im_orders_stats()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare r record;
begin
  if new.order_status is distinct from old.order_status
     or new.payment_status is distinct from old.payment_status then
    for r in select distinct product_id from public.im_order_items where order_id = new.id and product_id is not null loop
      perform public.im_refresh_product_sold(r.product_id);
    end loop;
  end if;
  return null;
end;
$fn$;
drop trigger if exists im_orders_stats on public.im_orders;
create trigger im_orders_stats after update on public.im_orders
  for each row execute function public.im_orders_stats();

create or replace function public.im_variants_stats()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.im_refresh_product_stock(coalesce(new.product_id, old.product_id));
  if tg_op = 'UPDATE' and new.product_id is distinct from old.product_id then
    perform public.im_refresh_product_stock(old.product_id);
  end if;
  return null;
end;
$fn$;
drop trigger if exists im_variants_stats on public.im_product_variants;
create trigger im_variants_stats after insert or update or delete on public.im_product_variants
  for each row execute function public.im_variants_stats();

-- Backfill every product once. Bypass the moderation trigger's "content
-- changed" rule: stats columns are not content, but be explicit anyway.
do $backfill$
declare r record;
begin
  for r in select id from public.im_products loop
    perform public.im_refresh_product_rating(r.id);
    perform public.im_refresh_product_sold(r.id);
    perform public.im_refresh_product_stock(r.id);
  end loop;
  update public.im_products set submitted_at = coalesce(submitted_at, created_at);
end
$backfill$;

-- ---------------------------------------------------------------------------
-- The storefront view (public, non-sensitive columns only)
-- ---------------------------------------------------------------------------
create or replace view public.im_storefront_products
with (security_invoker = false) as
select
  p.id,
  p.seller_id,
  s.name                                   as seller_name,
  p.title,
  p.category,
  p.base_price,
  fs.discount_percent                      as sale_percent,
  fs.ends_at                               as sale_ends_at,
  case when fs.discount_percent is null then p.base_price
       else round(p.base_price * (1 - fs.discount_percent / 100.0), 2) end as effective_price,
  p.rating_avg,
  p.rating_count,
  p.sold_count,
  p.stock_total,
  p.is_featured,
  p.adaptive_tags,
  p.image                                  as placeholder,
  img.url                                  as thumb,
  p.created_at,
  p.search_tsv
from public.im_products p
join public.im_profiles s on s.id = p.seller_id and s.account_status = 'active'
left join lateral (
  select f.discount_percent, f.ends_at
    from public.im_flash_sales f
   where f.product_id = p.id and now() between f.starts_at and f.ends_at
   order by f.starts_at desc
   limit 1
) fs on true
left join lateral (
  select i.url from public.im_product_images i where i.product_id = p.id order by i.position limit 1
) img on true
where p.status = 'approved';

comment on view public.im_storefront_products is
  'Approved listings from active sellers with stats, the running sale and first photo. Public data only; deliberately runs as the view owner so storefront reads need no access to im_profiles.';
grant select on public.im_storefront_products to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Search: full text + typo tolerance, relevance-ranked, paginated.
-- Service-role only (the app's read layer calls it).
-- ---------------------------------------------------------------------------
create or replace function public.im_search_products(
  p_q        text,
  p_category text    default null,
  p_min      numeric default null,
  p_max      numeric default null,
  p_rating   numeric default null,
  p_tags     text[]  default null,
  p_seller   bigint  default null,
  p_sort     text    default 'relevance',
  p_limit    integer default 24,
  p_offset   integer default 0
)
returns table (
  id bigint, seller_id bigint, seller_name text, title text, category text,
  base_price numeric, sale_percent numeric, sale_ends_at timestamptz, effective_price numeric,
  rating_avg numeric, rating_count integer, sold_count integer, stock_total integer,
  is_featured boolean, adaptive_tags text[], placeholder text, thumb text,
  created_at timestamptz, rank real, total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with q as (
    select nullif(trim(coalesce(p_q, '')), '') as text
  ),
  hits as (
    select sp.*,
           case
             when (select text from q) is null then 0::real
             else ts_rank(sp.search_tsv, websearch_to_tsquery('simple', (select text from q)))
                  + extensions.word_similarity(lower((select text from q)), lower(sp.title))
           end as rank
      from public.im_storefront_products sp
     where ((select text from q) is null
            or sp.search_tsv @@ websearch_to_tsquery('simple', (select text from q))
            or extensions.word_similarity(lower((select text from q)), lower(sp.title)) > 0.45
            or lower(sp.title) like '%' || lower((select text from q)) || '%')
       and (p_category is null or sp.category = p_category)
       and (p_min is null or sp.effective_price >= p_min)
       and (p_max is null or sp.effective_price <= p_max)
       and (p_rating is null or sp.rating_avg >= p_rating)
       and (p_tags is null or sp.adaptive_tags @> p_tags)
       and (p_seller is null or sp.seller_id = p_seller)
  )
  select h.id, h.seller_id, h.seller_name, h.title, h.category, h.base_price, h.sale_percent,
         h.sale_ends_at, h.effective_price, h.rating_avg, h.rating_count, h.sold_count,
         h.stock_total, h.is_featured, h.adaptive_tags, h.placeholder, h.thumb, h.created_at,
         h.rank, count(*) over () as total_count
    from hits h
   order by
     case when p_sort = 'price_asc'  then h.effective_price end asc nulls last,
     case when p_sort = 'price_desc' then h.effective_price end desc nulls last,
     case when p_sort = 'top_sales'  then h.sold_count end desc nulls last,
     case when p_sort = 'rating'     then h.rating_avg end desc nulls last,
     case when p_sort = 'relevance'  then h.rank end desc nulls last,
     h.created_at desc,
     h.id desc
   limit greatest(1, least(coalesce(p_limit, 24), 60))
  offset greatest(0, coalesce(p_offset, 0));
$fn$;
revoke all on function public.im_search_products(text, text, numeric, numeric, numeric, text[], bigint, text, integer, integer)
  from public, anon, authenticated;

-- Typeahead: products by fuzzy title, best first.
create or replace function public.im_suggest_products(p_q text, p_limit integer default 6)
returns table (id bigint, title text, category text, thumb text, placeholder text,
               base_price numeric, sale_percent numeric, effective_price numeric, score real)
language sql
stable
security definer
set search_path = ''
as $fn$
  select sp.id, sp.title, sp.category, sp.thumb, sp.placeholder, sp.base_price, sp.sale_percent,
         sp.effective_price,
         greatest(extensions.word_similarity(lower(p_q), lower(sp.title)),
                  case when lower(sp.title) like lower(p_q) || '%' then 1
                       when lower(sp.title) like '%' || lower(p_q) || '%' then 0.6
                       else 0 end)::real as score
    from public.im_storefront_products sp
   where length(trim(coalesce(p_q, ''))) >= 2
     and (extensions.word_similarity(lower(p_q), lower(sp.title)) > 0.45
          or lower(sp.title) like '%' || lower(p_q) || '%'
          or sp.search_tsv @@ websearch_to_tsquery('simple', p_q))
   order by score desc, sp.sold_count desc, sp.id
   limit greatest(1, least(coalesce(p_limit, 6), 12));
$fn$;
revoke all on function public.im_suggest_products(text, integer) from public, anon, authenticated;

commit;
