-- InclusiveMarket — move product photos out of Postgres (ADR-4), safely.
--
-- New photos go to the public product-media bucket (0019) and the image rows
-- hold their URLs. Old rows still hold base64 data URLs; the one-off script
-- scripts/backfill-product-images.mjs uploads each to the bucket and swaps the
-- URL. Swapping a URL is an UPDATE on im_product_images, which the 0016
-- moderation trigger treats as a seller changing photos: it would hide every
-- approved listing for re-review. This function swaps one URL with the
-- trigger's documented bypass set for that transaction only. It accepts only a
-- product-media URL (never an arbitrary address) and only replaces a data URL.
-- Service role only.
--
-- Rollback: supabase/rollback/0023_down.sql

begin;

create or replace function public.im_move_product_image_to_storage(p_image_id bigint, p_url text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_url is null or p_url !~ '/storage/v1/object/public/product-media/[0-9]+/[0-9a-f-]{36}\.(jpg|png)$' then
    raise exception 'not a product-media URL';
  end if;
  perform set_config('im.moderation_bypass', 'on', true);
  update public.im_product_images
     set url = p_url
   where id = p_image_id
     and url like 'data:%';
  return found;
end;
$fn$;
revoke all on function public.im_move_product_image_to_storage(bigint, text) from public, anon, authenticated;

commit;
