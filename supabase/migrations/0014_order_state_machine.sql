-- InclusiveMarket — the order state machine, enforced by the database.
--
-- Before: im_orders.order_status was a plain column any code path could set
-- to any of five values. A seller could jump pending → delivered or back,
-- mark `returned` on their own, and ship an online order that was never paid
-- (B-10). There was no `cancelled` status at all, so buyers could not cancel,
-- and nobody could request a return.
--
-- After:
--   pending ─┬─> processing ─┬─> shipped ──> delivered ──> return_requested ─┬─> returned
--            │               │                    ▲                          │
--            └─> cancelled <─┘                    └──────── (rejected) ──────┘
--
--   * Every status change goes through im_transition_order(), which checks
--     who may make it, records timestamps, restocks on cancellation, and
--     writes the history row itself — the history can no longer drift from
--     the status.
--   * A BEFORE UPDATE trigger refuses any order_status change that did not
--     come through that function, for every role INCLUDING the service role.
--     No code path, old or new, can skip a step.
--   * im_settings holds tunables the client has not confirmed yet
--     (return window, payment hold), editable later without a deploy.
--
-- Deploy order: the application calls im_transition_order() and falls back
-- to its own checks only while the function does not exist yet
-- (lib/orders/transition.ts), so code can ship before or after this file.
--
-- Rollback: supabase/rollback/0014_down.sql

begin;

-- ---------------------------------------------------------------------------
-- Settings (key/value). Service-role only: RLS on, no policies.
-- ---------------------------------------------------------------------------
create table if not exists public.im_settings (
  key        text primary key,
  value      jsonb not null,
  note       text,
  updated_by bigint references public.im_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.im_settings enable row level security;
revoke insert, update, delete, truncate on public.im_settings from anon, authenticated;

insert into public.im_settings (key, value, note) values
  ('return_window_days',   '7',  'Days after delivery a buyer may request a return (client default; Q8).'),
  ('payment_hold_minutes', '60', 'Minutes an unpaid online order keeps its stock reserved.')
on conflict (key) do nothing;

create or replace function public.im_setting_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(
    (select (s.value #>> '{}')::integer from public.im_settings s where s.key = p_key),
    p_default
  );
$fn$;
revoke all on function public.im_setting_int(text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Statuses and lifecycle columns.
-- ---------------------------------------------------------------------------
alter table public.im_orders drop constraint if exists im_orders_order_status_check;
alter table public.im_orders add constraint im_orders_order_status_check
  check (order_status in ('pending','processing','shipped','delivered',
                          'cancelled','return_requested','returned'));

alter table public.im_order_status_history drop constraint if exists im_order_status_history_status_check;
alter table public.im_order_status_history add constraint im_order_status_history_status_check
  check (status in ('pending','processing','shipped','delivered',
                    'cancelled','return_requested','returned'));

alter table public.im_order_status_history
  add column if not exists actor_role text;

alter table public.im_orders
  add column if not exists courier             text,
  add column if not exists tracking_number     text,
  add column if not exists shipped_at          timestamptz,
  add column if not exists delivered_at        timestamptz,
  add column if not exists cancelled_at        timestamptz,
  add column if not exists cancel_reason       text,
  add column if not exists cancelled_by_role   text,
  add column if not exists return_reason       text,
  add column if not exists return_requested_at timestamptz,
  add column if not exists return_decided_at   timestamptz,
  add column if not exists returned_at         timestamptz,
  add column if not exists refund_due          boolean not null default false;

create index if not exists idx_im_orders_status on public.im_orders(order_status);

-- ---------------------------------------------------------------------------
-- The only way to change order_status.
--
-- Returns a code instead of raising, so the application can show a plain
-- message: 'ok', 'not_found', 'illegal', 'forbidden', 'not_paid',
-- 'return_window_closed', 'reason_required'.
--
-- p_meta keys: courier, tracking_number (shipping); reason (cancel/return).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- The guard: status changes outside im_transition_order() are refused, for
-- every role. New orders always start at 'pending'.
-- ---------------------------------------------------------------------------
create or replace function public.im_orders_guard_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    if new.order_status <> 'pending' then
      raise exception 'A new order must start as pending' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.order_status is distinct from old.order_status
     and coalesce(current_setting('im.transition', true), 'off') <> 'on' then
    raise exception 'order_status may only change through im_transition_order()'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

drop trigger if exists im_orders_guard_status on public.im_orders;
create trigger im_orders_guard_status
  before insert or update on public.im_orders
  for each row execute function public.im_orders_guard_status();

-- ---------------------------------------------------------------------------
-- Backfill: an online order whose payment failed or was abandoned before this
-- migration was effectively cancelled; say so. Its stock was already released.
-- ---------------------------------------------------------------------------
do $backfill$
declare r record;
begin
  perform set_config('im.transition', 'on', true);
  for r in
    select id from public.im_orders
     where order_status = 'pending' and payment_provider = 'paymongo' and payment_status = 'failed'
  loop
    update public.im_orders
       set order_status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'system',
           cancel_reason = 'Payment was not completed.'
     where id = r.id;
    insert into public.im_order_status_history (order_id, status, note, actor_role)
    values (r.id, 'cancelled', 'Payment was not completed. (backfilled by migration 0014)', 'system');
  end loop;
  perform set_config('im.transition', 'off', true);
end
$backfill$;

commit;
