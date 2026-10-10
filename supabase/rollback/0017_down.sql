-- ROLLBACK for 0017_pwd_verification.sql. DEV only.
--
-- Restores the 0016 storefront view and search functions (no verification
-- gate, no badge), and removes the verification helpers, the restrictive
-- storage policy and the order-line foreign key. The verification tables,
-- their rows and the private bucket are KEPT: they hold sensitive records
-- whose deletion must follow the retention rules, not a schema rollback.
-- (Images in pwd-ids are removed only by the retention sweep.)
-- Generated from 0016's own SQL so the restored view cannot drift from it.

begin;

drop policy if exists im_pwd_ids_deny_clients on storage.objects;
drop function if exists public.im_search_products(text, text, numeric, numeric, numeric, text[], bigint, text, integer, integer, boolean);
drop function if exists public.im_suggest_products(text, integer);
drop view if exists public.im_storefront_products;
drop function if exists public.im_seller_can_sell(bigint);
drop function if exists public.im_decide_pwd_verification(bigint, text, bigint, text, text, text, text);
drop trigger if exists trg_im_pwd_number_guard on public.im_pwd_verifications;
drop function if exists public.im_pwd_number_guard();
alter table public.im_order_items drop constraint if exists im_order_items_verification_fk;

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

drop view if exists public.im_verified_pwd;

commit;
