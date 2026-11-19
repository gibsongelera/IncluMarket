-- InclusiveMarket — seller earnings, payouts, manageable categories.
--
-- Payouts (UC-14, FR-20) had a table since 0007 and no code at all. What a
-- seller can be paid depends on who holds the money:
--   * Cash on delivery — the seller (or their courier) collects the cash at
--     the door. The platform never holds it, so it is never paid out; it is
--     shown as "collected".
--   * Online (PayMongo) — the platform holds it. It becomes AVAILABLE once the
--     order is delivered and the return window has passed without a return
--     request; before that it is PENDING. Platform fee: setting
--     platform_fee_percent, default 0 (client Q20).
-- A payout request can never exceed the available balance: im_request_payout()
-- locks the seller's row, so two simultaneous requests cannot both pass.
--
-- Categories existed only as seed rows. They gain an order, an icon key, a
-- description and an active flag so admins can create, reorder and retire
-- them without deleting (retiring keeps products and history).
--
-- Rollback: supabase/rollback/0020_down.sql

begin;

insert into public.im_settings (key, value, note) values
  ('platform_fee_percent', '0',   'Platform commission on online sales, percent (client Q20).'),
  ('payout_min_amount',    '100', 'Smallest payout a seller can request, in pesos.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Earnings per order
-- ---------------------------------------------------------------------------
create or replace view public.im_seller_earnings
with (security_invoker = false) as
select
  o.id                                         as order_id,
  o.seller_id,
  o.created_at,
  o.delivered_at,
  o.order_status,
  o.payment_provider,
  o.payment_status,
  coalesce(o.subtotal, 0)                      as subtotal,
  coalesce(o.shipping_fee, 0)                  as shipping_fee,
  round(coalesce(o.subtotal, 0) * public.im_setting_int('platform_fee_percent', 0) / 100.0, 2) as fee,
  round(coalesce(o.subtotal, 0) + coalesce(o.shipping_fee, 0)
        - coalesce(o.subtotal, 0) * public.im_setting_int('platform_fee_percent', 0) / 100.0, 2) as net,
  case
    when o.order_status in ('cancelled', 'returned') then 'not_earned'
    when o.payment_provider = 'cod' then
      case when o.order_status = 'delivered' then 'collected' else 'not_earned' end
    when o.payment_status <> 'paid' or o.refund_due then 'not_earned'
    when o.order_status = 'delivered'
         and o.delivered_at < now() - make_interval(days => public.im_setting_int('return_window_days', 7))
      then 'available'
    else 'pending'
  end                                          as availability
from public.im_orders o
where o.seller_id is not null;
revoke all on public.im_seller_earnings from anon, authenticated;

alter table public.im_payouts
  add column if not exists decided_at timestamptz,
  add column if not exists paid_at    timestamptz,
  add column if not exists reference  text;

create or replace function public.im_seller_balance(p_seller bigint)
returns table (available numeric, pending numeric, collected numeric, reserved numeric, paid_out numeric)
language sql
stable
security definer
set search_path = ''
as $fn$
  with e as (
    select availability, net from public.im_seller_earnings where seller_id = p_seller
  ), p as (
    select status, amount from public.im_payouts where seller_id = p_seller
  )
  select
    greatest(0,
      coalesce((select sum(net) from e where availability = 'available'), 0)
      - coalesce((select sum(amount) from p where status in ('requested', 'approved', 'paid')), 0)
    )                                                                         as available,
    coalesce((select sum(net) from e where availability = 'pending'), 0)      as pending,
    coalesce((select sum(net) from e where availability = 'collected'), 0)    as collected,
    coalesce((select sum(amount) from p where status in ('requested', 'approved')), 0) as reserved,
    coalesce((select sum(amount) from p where status = 'paid'), 0)            as paid_out;
$fn$;
revoke all on function public.im_seller_balance(bigint) from public, anon, authenticated;

-- Returns the new payout id, or raises 'insufficient_balance' / 'below_minimum'.
create or replace function public.im_request_payout(
  p_seller  bigint,
  p_amount  numeric,
  p_method  text,
  p_account text,
  p_note    text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_available numeric;
  v_id        bigint;
begin
  -- Serialise this seller's requests.
  perform 1 from public.im_profiles where id = p_seller and role = 'seller' for update;
  if not found then raise exception 'not_a_seller' using errcode = 'P0001'; end if;

  if p_amount < public.im_setting_int('payout_min_amount', 100) then
    raise exception 'below_minimum' using errcode = 'P0001';
  end if;
  select available into v_available from public.im_seller_balance(p_seller);
  if p_amount > v_available then
    raise exception 'insufficient_balance' using errcode = 'P0001';
  end if;

  insert into public.im_payouts (seller_id, amount, method, account_number, status, note)
  values (p_seller, round(p_amount, 2), p_method, p_account, 'requested', p_note)
  returning id into v_id;
  return v_id;
end;
$fn$;
revoke all on function public.im_request_payout(bigint, numeric, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
alter table public.im_categories
  add column if not exists position    integer not null default 0,
  add column if not exists icon        text,
  add column if not exists description text check (description is null or length(description) <= 300),
  add column if not exists is_active   boolean not null default true;

update public.im_categories c
   set position = sub.rn
  from (select id, row_number() over (order by label) as rn from public.im_categories) sub
 where sub.id = c.id and c.position = 0;

update public.im_categories set icon = case id
    when 'bags' then 'bag-shopping' when 'apparel' then 'shirt' when 'crafts' then 'scissors'
    when 'food' then 'bowl-food' when 'accessories' then 'gem' when 'wellness' then 'spa'
    when 'services' then 'palette' else icon end
 where icon is null;

commit;
