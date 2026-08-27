-- IncluMarket — lock down SECURITY DEFINER helper functions
--
-- Every function in `public` gets EXECUTE granted to PUBLIC by default, and
-- PostgREST exposes any non-trigger function as POST /rest/v1/rpc/<name>. So a
-- SECURITY DEFINER helper is a privileged endpoint reachable with the
-- publishable key unless the grant is revoked.
--
-- Verified against the live project before writing this. Empirically, with the
-- publishable key:
--
--   im_requesting_role                    CALLABLE      <- closed here
--   im_current_profile_role               CALLABLE      <- must stay, see below
--   im_current_profile_id                 CALLABLE      <- must stay, see below
--   im_rate_limit_hit                     blocked (revoked in 0009)
--   im_decrement_variant_stock            blocked (revoked in 0010)
--   im_restore_variant_stock              blocked (revoked in 0010)
--   im_handle_new_auth_user               not exposed
--   im_profiles_guard_privileged_columns  not exposed
--
-- The last two return `trigger`, and PostgREST does not expose trigger
-- functions at all — so despite being SECURITY DEFINER they were never
-- reachable as RPC.

begin;

-- ---------------------------------------------------------------------------
-- im_requesting_role() — revoke.
--
-- Its only caller is im_profiles_guard_privileged_columns(), which is itself
-- SECURITY DEFINER and therefore executes as the function owner. The owner
-- keeps EXECUTE, so the trigger is unaffected; only the RPC surface closes.
--
-- The disclosure was small — it returns the CALLER's own JWT role — but it is
-- a ready-made privileged endpoint, and the next person to extend it would
-- inherit that exposure silently.
-- ---------------------------------------------------------------------------
revoke all on function public.im_requesting_role() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- im_current_profile_role() and im_current_profile_id() — DELIBERATELY LEFT
-- EXECUTABLE. Do not "harden" these.
--
-- They are called from inside RLS policy expressions (im_profiles_read,
-- im_profiles_admin, im_categories_admin and others from 0002). PostgreSQL
-- evaluates a policy expression with the privileges of the QUERYING role, so
-- revoking EXECUTE from `authenticated` does not tighten anything — it makes
-- every policy that calls them raise "permission denied for function", which
-- fails the query outright. The result is a broken app, not a safer one.
--
-- Leaving them callable is safe on its own terms: both resolve strictly from
-- auth.uid(), so a caller only ever learns their own role or their own profile
-- id, and an anonymous caller gets null. There is no cross-user read and no
-- escalation path.
-- ---------------------------------------------------------------------------
comment on function public.im_current_profile_role() is
  'Used inside RLS policies. EXECUTE must remain granted to authenticated: policy expressions run with the querying role''s privileges, so revoking it breaks every policy that calls it. Safe as-is — resolves only from auth.uid().';

comment on function public.im_current_profile_id() is
  'Used inside RLS policies. EXECUTE must remain granted to authenticated — see im_current_profile_role. Safe as-is — resolves only from auth.uid().';

-- ---------------------------------------------------------------------------
-- Tighten search_path from `public` to `''` on the SECURITY DEFINER functions.
--
-- Each one already schema-qualifies every relation it touches, and otherwise
-- uses only pg_catalog built-ins, so an empty search_path changes no behaviour
-- while removing the possibility of an object in `public` shadowing something
-- these functions resolve.
-- ---------------------------------------------------------------------------
alter function public.im_requesting_role() set search_path = '';
alter function public.im_handle_new_auth_user() set search_path = '';
alter function public.im_profiles_guard_privileged_columns() set search_path = '';
alter function public.im_rate_limit_hit(text, text, integer, integer) set search_path = '';
alter function public.im_decrement_variant_stock(bigint, integer) set search_path = '';
alter function public.im_restore_variant_stock(bigint, integer) set search_path = '';

-- ---------------------------------------------------------------------------
-- Rate-limit cleanup: bounded per call instead of a 1% dice roll.
--
-- The previous version swept the whole table on ~1% of calls. Under sustained
-- abuse — the exact case the table exists for — that is both unreliable (it may
-- not fire for a long stretch) and spiky (when it does, it scans everything).
--
-- Now each call clears only the expired rows for the identifier it is already
-- touching, which is indexed, constant-ish work and keeps a caller's own
-- history bounded. A small global sweep still runs occasionally for identifiers
-- that stopped calling entirely and would otherwise linger.
-- ---------------------------------------------------------------------------
create or replace function public.im_rate_limit_hit(
  p_bucket         text,
  p_identifier     text,
  p_window_seconds integer,
  p_max_hits       integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  if p_window_seconds is null or p_window_seconds < 1 then
    p_window_seconds := 60;
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.im_rate_limits (bucket, identifier, window_start, hits)
  values (p_bucket, p_identifier, v_window, 1)
  on conflict (bucket, identifier, window_start)
    do update set hits = public.im_rate_limits.hits + 1
  returning hits into v_hits;

  -- Bounded: only this caller's own expired windows, hit by the primary key.
  delete from public.im_rate_limits
   where bucket = p_bucket
     and identifier = p_identifier
     and window_start < v_window;

  -- Occasional sweep for identifiers that went quiet and stopped self-cleaning.
  if random() < 0.005 then
    delete from public.im_rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_hits <= p_max_hits;
end;
$fn$;

revoke all on function public.im_rate_limit_hit(text, text, integer, integer)
  from public, anon, authenticated;

commit;
