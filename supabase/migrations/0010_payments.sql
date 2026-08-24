-- IncluMarket — real payments (PayMongo)
--
-- Turns the payment scaffold into something that can actually settle money:
--   * order-level payment state, so an order knows whether it has been paid
--   * an idempotency key on im_transactions, so a replayed webhook is a no-op
--   * an atomic stock decrement, replacing a read-then-write race in placeOrder
--   * collapses five configured "providers" down to PayMongo
--
-- im_transactions and im_payouts have existed since 0007 with zero writes from
-- application code. This migration is what finally gives im_transactions rows.

begin;

-- ---------------------------------------------------------------------------
-- im_orders — payment state and shipping destination
--
-- 0007 added payment_provider, shipping_name, shipping_address and
-- shipping_phone. placeOrder() took no arguments and wrote none of them, so
-- every column has been null on every order ever placed, and the admin Excel
-- export has been emitting permanently blank columns.
-- ---------------------------------------------------------------------------
alter table public.im_orders
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded'));

-- Provider-side identifier (a PayMongo checkout session or payment id).
alter table public.im_orders
  add column if not exists payment_reference text;

alter table public.im_orders
  add column if not exists shipping_city text;

create unique index if not exists idx_im_orders_payment_ref
  on public.im_orders(payment_reference)
  where payment_reference is not null;

create index if not exists idx_im_orders_payment_status
  on public.im_orders(payment_status);

-- ---------------------------------------------------------------------------
-- im_transactions — webhook idempotency
--
-- Payment providers guarantee at-least-once delivery, so the same event WILL
-- arrive more than once. A unique constraint on the provider's event id turns
-- "have I already processed this?" into an insert that either succeeds or
-- conflicts — no read-then-decide race.
-- ---------------------------------------------------------------------------
alter table public.im_transactions
  add column if not exists external_event_id text;

create unique index if not exists idx_im_transactions_event
  on public.im_transactions(external_event_id)
  where external_event_id is not null;

-- ---------------------------------------------------------------------------
-- Atomic stock decrement.
--
-- placeOrder() did: select stock_qty -> compute Math.max(0, stock - qty) ->
-- update. That is a read-then-write race under concurrency (two buyers both
-- read 1, both write 0, two units sold), and the Math.max floor meant an order
-- for 500 units of a 3-stock item silently succeeded and set stock to 0.
--
-- The `and stock_qty >= p_qty` predicate makes the check and the write a single
-- statement: it either decrements or affects zero rows, and reports which.
-- ---------------------------------------------------------------------------
create or replace function public.im_decrement_variant_stock(
  p_variant_id bigint,
  p_qty        integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_updated integer;
begin
  if p_qty is null or p_qty < 1 then
    return false;
  end if;

  update public.im_product_variants
     set stock_qty = stock_qty - p_qty
   where id = p_variant_id
     and stock_qty >= p_qty;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$fn$;

-- Compensating action, used to unwind a partially-decremented order when a
-- later line fails or the payment session cannot be created.
create or replace function public.im_restore_variant_stock(
  p_variant_id bigint,
  p_qty        integer
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_qty is null or p_qty < 1 then
    return;
  end if;
  update public.im_product_variants
     set stock_qty = stock_qty + p_qty
   where id = p_variant_id;
end;
$fn$;

revoke all on function public.im_decrement_variant_stock(bigint, integer)
  from public, anon, authenticated;
revoke all on function public.im_restore_variant_stock(bigint, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Providers: PayMongo only.
--
-- The other four rows were never more than an admin toggle and a text box —
-- no SDK, no charge, no webhook. PayMongo Checkout Sessions expose GCash,
-- Maya, GrabPay and cards as payment *methods*, so a separate "GCash provider"
-- was a category error: one integration already covers every method Filipino
-- buyers actually use.
--
-- The rows are kept rather than deleted because im_transactions.provider_id
-- references them; they are disabled and relabelled instead.
-- ---------------------------------------------------------------------------
update public.im_payment_providers
   set enabled = false,
       is_configured = false,
       public_key = null,
       secret_key_hint = null,
       display_name = case id
         when 'gcash'  then 'GCash (via PayMongo)'
         when 'maya'   then 'Maya (via PayMongo)'
         when 'stripe' then 'Stripe (not enabled)'
         when 'paypal' then 'PayPal (not enabled)'
         else display_name
       end,
       updated_at = now()
 where id <> 'paymongo';

update public.im_payment_providers
   set display_name = 'PayMongo (GCash, Maya, GrabPay, card)',
       dashboard_url = 'https://dashboard.paymongo.com/developers',
       updated_at = now()
 where id = 'paymongo';

-- Cash on delivery is a real settlement method here and needs a provider row so
-- im_orders.payment_provider can reference it. The 0007 CHECK constraint only
-- allowed the five gateway ids, so it has to be widened first.
alter table public.im_payment_providers
  drop constraint if exists im_payment_providers_id_check;
alter table public.im_payment_providers
  add constraint im_payment_providers_id_check
  check (id in ('paymongo', 'stripe', 'paypal', 'maya', 'gcash', 'cod'));

insert into public.im_payment_providers (id, display_name, enabled, is_configured, dashboard_url)
values ('cod', 'Cash on delivery', true, true, null)
on conflict (id) do nothing;

commit;
