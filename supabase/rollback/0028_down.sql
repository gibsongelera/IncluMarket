-- ROLLBACK for 0028_counter_payments.sql. DEV only.
--
-- Restores im_transition_order (0014), im_place_checkout (0015),
-- im_refresh_product_sold (0016) and im_pwd_weekly_usage (0018) as those
-- migrations wrote them, so a new checkout can no longer choose 'otc', and
-- turns the 'otc' provider off. Generated from those migrations' own SQL so
-- the restored bodies cannot drift from them.
--
-- KEPT: the 'otc' provider row and its place in the provider check (orders
-- already placed reference it), the Workshop accounts, every payment proof
-- (they are payment records), and the payment-proofs bucket with its deny
-- policy (dropping the deny would leave receipt photos one careless storage
-- policy away from a browser).

begin;

update public.im_payment_providers set enabled = false where id = 'otc';
delete from public.im_settings where key = 'otc_hold_hours';

create or replace function public.im_transition_order(
  p_order_id   bigint,
  p_to         text,
  p_actor_id   bigint,
  p_actor_role text,
  p_note       text default null,
  p_meta       jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  o        public.im_orders%rowtype;
  v_from   text;
  v_ok     boolean := false;
  v_reason text := nullif(trim(coalesce(p_meta->>'reason', '')), '');
  v_window integer;
  line     record;
begin
  select * into o from public.im_orders where id = p_order_id for update;
  if not found then return 'not_found'; end if;
  v_from := o.order_status;

  -- Who may make which move. 'system' is the payment webhook and sweeps.
  v_ok := case
    when v_from = 'pending'          and p_to = 'processing'       then p_actor_role in ('seller','admin','system')
    when v_from = 'pending'          and p_to = 'cancelled'        then p_actor_role in ('buyer','seller','admin','system')
    when v_from = 'processing'       and p_to = 'shipped'          then p_actor_role in ('seller','admin')
    when v_from = 'processing'       and p_to = 'cancelled'        then p_actor_role in ('seller','admin')
    when v_from = 'shipped'          and p_to = 'delivered'        then p_actor_role in ('buyer','seller','admin')
    when v_from = 'delivered'        and p_to = 'return_requested' then p_actor_role in ('buyer','admin')
    when v_from = 'return_requested' and p_to = 'returned'         then p_actor_role in ('seller','admin')
    when v_from = 'return_requested' and p_to = 'delivered'        then p_actor_role in ('seller','admin')
    else null
  end;
  if v_ok is null then return 'illegal'; end if;
  if not v_ok then return 'forbidden'; end if;

  -- An online order cannot be prepared before it is paid.
  if p_to = 'processing' and o.payment_provider = 'paymongo' and o.payment_status <> 'paid' then
    return 'not_paid';
  end if;

  if p_to in ('cancelled', 'return_requested') and v_reason is null then
    return 'reason_required';
  end if;

  -- An unpaid online order shares one open PayMongo session with the rest of
  -- its checkout. A seller cancelling it while the buyer may still pay would
  -- leave money arriving for a cancelled order; the payment timeout (or the
  -- buyer) cancels it instead.
  if p_to = 'cancelled' and p_actor_role = 'seller'
     and o.payment_provider = 'paymongo' and o.payment_status = 'pending' then
    return 'forbidden';
  end if;

  if p_to = 'return_requested' and p_actor_role = 'buyer' then
    v_window := public.im_setting_int('return_window_days', 7);
    if o.delivered_at is null or o.delivered_at < now() - make_interval(days => v_window) then
      return 'return_window_closed';
    end if;
  end if;

  -- Cancelling gives back stock that is still held. An online order whose
  -- payment failed already released its stock (lib/payments/stock.ts).
  if p_to = 'cancelled' and not (o.payment_provider = 'paymongo' and o.payment_status = 'failed') then
    for line in
      select variant_id, quantity from public.im_order_items
       where order_id = o.id and variant_id is not null
    loop
      update public.im_product_variants
         set stock_qty = stock_qty + line.quantity
       where id = line.variant_id;
    end loop;
  end if;

  perform set_config('im.transition', 'on', true);
  update public.im_orders set
    order_status        = p_to,
    courier             = case when p_to = 'shipped' then nullif(trim(coalesce(p_meta->>'courier', '')), '') else courier end,
    tracking_number     = case when p_to = 'shipped' then nullif(trim(coalesce(p_meta->>'tracking_number', '')), '') else tracking_number end,
    shipped_at          = case when p_to = 'shipped' then now() else shipped_at end,
    delivered_at        = case when p_to = 'delivered' and v_from = 'shipped' then now() else delivered_at end,
    cancelled_at        = case when p_to = 'cancelled' then now() else cancelled_at end,
    cancel_reason       = case when p_to = 'cancelled' then v_reason else cancel_reason end,
    cancelled_by_role   = case when p_to = 'cancelled' then p_actor_role else cancelled_by_role end,
    return_reason       = case when p_to = 'return_requested' then v_reason else return_reason end,
    return_requested_at = case when p_to = 'return_requested' then now() else return_requested_at end,
    return_decided_at   = case when v_from = 'return_requested' then now() else return_decided_at end,
    returned_at         = case when p_to = 'returned' then now() else returned_at end,
    -- Cancelling before an online payment arrived: nothing was charged.
    payment_status      = case
                            when p_to = 'cancelled' and o.payment_status = 'pending' then 'failed'
                            else payment_status
                          end,
    -- Money already taken must go back on cancellation or an accepted return.
    refund_due          = case
                            when p_to in ('cancelled', 'returned') and o.payment_status = 'paid' then true
                            else refund_due
                          end
  where id = o.id;
  perform set_config('im.transition', 'off', true);

  insert into public.im_order_status_history (order_id, status, note, created_by, actor_role)
  values (o.id, p_to, coalesce(nullif(trim(coalesce(p_note, '')), ''), v_reason), p_actor_id, p_actor_role);

  return 'ok';
end;
$fn$;
revoke all on function public.im_transition_order(bigint, text, bigint, text, text, jsonb)
  from public, anon, authenticated;

create or replace function public.im_place_checkout(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_buyer     bigint := (p->>'buyer_id')::bigint;
  v_provider  text   := p->>'payment_provider';
  v_pay       text;
  v_checkout  bigint;
  v_order     bigint;
  v_grand     numeric(12,2) := 0;
  v_sub       numeric(12,2);
  v_fee       numeric(12,2);
  v_orders    bigint[] := '{}';
  g           jsonb;
  l           jsonb;
  v_updated   integer;
begin
  if v_provider not in ('cod', 'paymongo') then
    raise exception 'bad_provider' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.im_profiles where id = v_buyer and role = 'buyer' and account_status = 'active') then
    raise exception 'bad_buyer' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p->'groups', '[]'::jsonb)) = 0 then
    raise exception 'empty' using errcode = 'P0001';
  end if;
  v_pay := case when v_provider = 'cod' then 'unpaid' else 'pending' end;

  insert into public.im_checkouts (buyer_id, payment_provider, payment_status, grand_total)
  values (v_buyer, v_provider, v_pay, 0)
  returning id into v_checkout;

  for g in select * from jsonb_array_elements(p->'groups') loop
    v_fee := coalesce((g->>'shipping_fee')::numeric, 0);
    select coalesce(sum((x->>'unit_price')::numeric * (x->>'quantity')::integer), 0)
      into v_sub
      from jsonb_array_elements(g->'lines') x;

    insert into public.im_orders (buyer_id, seller_id, checkout_id, total_amount, subtotal, shipping_fee,
                                  order_status, payment_status, payment_provider,
                                  shipping_name, shipping_address, shipping_city, shipping_phone)
    values (v_buyer, (g->>'seller_id')::bigint, v_checkout, v_sub + v_fee, v_sub, v_fee,
            'pending', v_pay, v_provider,
            p->'shipping'->>'name', p->'shipping'->>'address', p->'shipping'->>'city', p->'shipping'->>'phone')
    returning id into v_order;
    v_orders := v_orders || v_order;
    v_grand := v_grand + v_sub + v_fee;

    insert into public.im_order_status_history (order_id, status, created_by, actor_role)
    values (v_order, 'pending', v_buyer, 'buyer');

    for l in select * from jsonb_array_elements(g->'lines') loop
      update public.im_product_variants v
         set stock_qty = v.stock_qty - (l->>'quantity')::integer
       where v.id = (l->>'variant_id')::bigint
         and v.product_id = (l->>'product_id')::bigint
         and v.stock_qty >= (l->>'quantity')::integer
         and exists (
           select 1 from public.im_products pr
            where pr.id = v.product_id
              and pr.status = 'approved'
              and pr.seller_id = (g->>'seller_id')::bigint
         );
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        if exists (select 1 from public.im_products pr
                    where pr.id = (l->>'product_id')::bigint and pr.status = 'approved') then
          raise exception 'out_of_stock:%', l->>'product_id' using errcode = 'P0001';
        end if;
        raise exception 'unavailable:%', l->>'product_id' using errcode = 'P0001';
      end if;

      insert into public.im_order_items (
        order_id, product_id, variant_id, quantity, unit_price,
        base_unit_price, flash_sale_id, sale_discount_pct,
        pwd_rule_id, pwd_rate, pwd_discount_amount, pwd_eligible_amount, vat_exempt_amount,
        legal_basis, verification_id)
      values (
        v_order, (l->>'product_id')::bigint, (l->>'variant_id')::bigint, (l->>'quantity')::integer,
        (l->>'unit_price')::numeric,
        nullif(l->>'base_unit_price', '')::numeric, nullif(l->>'flash_sale_id', '')::bigint,
        nullif(l->>'sale_discount_pct', '')::numeric,
        nullif(l->>'pwd_rule_id', '')::bigint, nullif(l->>'pwd_rate', '')::numeric,
        coalesce(nullif(l->>'pwd_discount_amount', '')::numeric, 0),
        coalesce(nullif(l->>'pwd_eligible_amount', '')::numeric, 0),
        coalesce(nullif(l->>'vat_exempt_amount', '')::numeric, 0),
        nullif(l->>'legal_basis', ''), nullif(l->>'verification_id', '')::bigint);
    end loop;
  end loop;

  update public.im_checkouts set grand_total = v_grand where id = v_checkout;

  -- Cash on delivery is final now: take the ordered lines out of the cart in
  -- the same transaction. Online payments keep them until the webhook.
  if v_provider = 'cod' and jsonb_typeof(p->'cart_item_ids') = 'array' then
    delete from public.im_cart_items
     where user_id = v_buyer
       and id in (select (x #>> '{}')::bigint from jsonb_array_elements(p->'cart_item_ids') x);
  end if;

  return jsonb_build_object('checkout_id', v_checkout, 'order_ids', to_jsonb(v_orders), 'grand_total', v_grand);
end;
$fn$;
revoke all on function public.im_place_checkout(jsonb) from public, anon, authenticated;

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
revoke all on function public.im_refresh_product_sold(bigint) from public, anon, authenticated;

create or replace function public.im_pwd_weekly_usage(p_buyer bigint)
returns table (rule_id bigint, used numeric)
language sql
stable
security definer
set search_path = ''
as $fn$
  select oi.pwd_rule_id, coalesce(sum(oi.pwd_eligible_amount), 0)
    from public.im_order_items oi
    join public.im_orders o on o.id = oi.order_id
   where o.buyer_id = p_buyer
     and oi.pwd_rule_id is not null
     and o.order_status <> 'cancelled'
     and not (o.payment_provider = 'paymongo' and o.payment_status = 'failed')
     and o.created_at >= (date_trunc('week', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')
   group by oi.pwd_rule_id;
$fn$;
revoke all on function public.im_pwd_weekly_usage(bigint) from public, anon, authenticated;

commit;
