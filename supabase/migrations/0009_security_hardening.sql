-- IncluMarket — security hardening
--
-- Closes four privilege-escalation / data-exposure paths that were reachable
-- with nothing but the public publishable key, and adds the rate-limit
-- primitive the unauthenticated write actions need.
--
-- Threat context: the application performs ALL of its reads and writes with the
-- service-role key after its own role checks, so RLS never runs for app traffic.
-- That makes RLS and these triggers the only thing standing between a browser
-- and PostgREST — and the policies below were letting a signed-in user rewrite
-- their own role.

begin;

-- ---------------------------------------------------------------------------
-- Helper: which JWT role is making this request?
--
-- Returns 'anon' / 'authenticated' / 'service_role' for PostgREST requests and
-- NULL for direct SQL (migrations, psql, the Supabase SQL editor). Reads the
-- claims setting directly so it does not depend on the auth schema being in the
-- search_path, and swallows malformed claims rather than failing the statement.
-- ---------------------------------------------------------------------------
create or replace function public.im_requesting_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  return nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
exception when others then
  return null;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- FIX 1 (critical): signup could mint an admin.
--
-- The previous trigger copied raw_user_meta_data->>'role' straight into
-- im_profiles.role and explicitly whitelisted 'admin'. raw_user_meta_data is
-- entirely attacker-controlled — POST /auth/v1/signup with the publishable key
-- that ships in the browser bundle and {"data":{"role":"admin"}} — so anyone
-- could self-provision an administrator, confirm their own email, and sign in
-- with full access to every user's profile, role changes, deletion, and the
-- PII spreadsheet export.
--
-- FIX 2 (critical): signup could HIJACK an existing profile.
--
-- The previous trigger ended with
--     on conflict (email) do update set auth_user_id = excluded.auth_user_id
-- which re-points an existing profile at whoever most recently signed up with
-- that address. lib/actions/admin.ts createUser() inserts im_profiles rows with
-- NO auth user, at any role including 'admin'. Chain: an admin pre-creates an
-- admin profile for x@y.com -> an attacker self-signs-up as x@y.com -> the
-- trigger hands them that profile -> getSession() resolves them as admin.
-- Adopting an existing profile row on signup is now refused outright.
--
-- Self-service signup can now only produce 'buyer' or 'seller', and can only
-- ever create a NEW profile. Administrators are provisioned out-of-band via the
-- Admin API (scripts/provision-users.mjs).
-- ---------------------------------------------------------------------------
create or replace function public.im_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  meta_role text;
  meta_name text;
  clean_role text;
begin
  meta_role := lower(coalesce(new.raw_user_meta_data->>'role', 'buyer'));
  meta_name := nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), '');

  -- Deliberately NOT a whitelist containing 'admin'. Anything that is not an
  -- explicit 'seller' becomes a buyer, including 'admin' and any future role.
  if meta_role = 'seller' then
    clean_role := 'seller';
  else
    clean_role := 'buyer';
  end if;

  -- `do nothing`, NOT `do update`: never adopt or re-link a pre-existing
  -- profile. See FIX 2 above.
  insert into public.im_profiles (auth_user_id, name, email, role)
  values (
    new.id,
    coalesce(meta_name, split_part(new.email, '@', 1)),
    lower(new.email),
    clean_role
  )
  on conflict (email) do nothing;

  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.im_handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- FIX 3 (critical): a signed-in user could PATCH themselves to admin.
--
-- im_profiles_self_update allowed UPDATE on any column of one's own row, so
--   PATCH /rest/v1/im_profiles?auth_user_id=eq.<self>  {"role":"admin"}
-- with the publishable key and the user's own JWT granted instant admin — an
-- escalation path completely independent of FIX 1.
--
-- The self-update policy is kept (users must be able to edit their own name,
-- phone, story and assistive needs) and a BEFORE UPDATE trigger now rejects
-- changes to the privileged columns from any JWT-bearing client. The
-- service-role path used by the app's admin actions is unaffected, so admins
-- can still change roles through /admin/users.
-- ---------------------------------------------------------------------------
create or replace function public.im_profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_req_role text := public.im_requesting_role();
begin
  -- Direct SQL and the service-role key are trusted: the application always
  -- performs its own session + role check before reaching for that client.
  if v_req_role is null or v_req_role = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'im_profiles.role cannot be changed by this client'
      using errcode = '42501';
  end if;

  if new.account_status is distinct from old.account_status then
    raise exception 'im_profiles.account_status cannot be changed by this client'
      using errcode = '42501';
  end if;

  if new.is_featured_seller is distinct from old.is_featured_seller then
    raise exception 'im_profiles.is_featured_seller cannot be changed by this client'
      using errcode = '42501';
  end if;

  -- Verification state is admin-attested, never self-attested.
  if new.pwd_id_url is distinct from old.pwd_id_url then
    raise exception 'im_profiles.pwd_id_url cannot be changed by this client'
      using errcode = '42501';
  end if;

  -- Identity columns are structural, not user-editable. Letting email or
  -- auth_user_id move is another route to profile takeover.
  if new.id is distinct from old.id
     or new.auth_user_id is distinct from old.auth_user_id
     or new.email is distinct from old.email then
    raise exception 'im_profiles identity columns cannot be changed by this client'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

drop trigger if exists im_profiles_guard_privileged on public.im_profiles;
create trigger im_profiles_guard_privileged
  before update on public.im_profiles
  for each row execute function public.im_profiles_guard_privileged_columns();

-- ---------------------------------------------------------------------------
-- FIX 4 (high): every user's disability data was readable by any account.
--
-- im_profiles_read was `using (auth.role() = 'authenticated')`, so any
-- registered buyer could GET /rest/v1/im_profiles?select=* and walk away with
-- every user's email, phone, disability_type, assistive_needs and pwd_id_url.
-- Disability status is sensitive personal information under RA 10173, the same
-- Data Privacy Act this application writes consent logs about. The maskEmail()
-- helper in the UI is cosmetic — it masks at render time while the full rows
-- are already in the client payload.
--
-- Reads are now limited to your own row; admins keep full access through the
-- existing im_profiles_admin policy. Public seller info moves to a curated view.
--
-- Blast radius: none. lib/data.ts and every action use createAdminClient(),
-- which bypasses RLS, and lib/supabase/client.ts has zero importers — so no
-- application read path depends on this policy.
-- ---------------------------------------------------------------------------
drop policy if exists im_profiles_read on public.im_profiles;
create policy im_profiles_read on public.im_profiles for select
  using (
    auth_user_id = auth.uid()
    or public.im_current_profile_role() = 'admin'
  );

-- Curated public projection of seller profiles for the storefront: name, story
-- and featured flag only. Intentionally security_invoker = false so it runs as
-- the view owner and is NOT subject to the row policy above — that is the whole
-- point of the view. It exposes no contact details and no disability data, so
-- widening access to these four columns is safe.
drop view if exists public.im_public_sellers;
create view public.im_public_sellers
with (security_invoker = false) as
  select
    p.id,
    p.name,
    p.seller_story,
    p.is_featured_seller
  from public.im_profiles p
  where p.role = 'seller'
    and p.account_status = 'active';

comment on view public.im_public_sellers is
  'Public, non-sensitive projection of active seller profiles. Deliberately a security-definer view so the storefront can render seller cards without granting read access to im_profiles, which holds RA 10173 sensitive disability data.';

grant select on public.im_public_sellers to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rate limiting primitive.
--
-- Needed because two DB-writing server actions are fully unauthenticated
-- (subscribeNewsletter, sendChatMessage) and the auth actions have no throttle
-- of their own. Backed by Postgres rather than process memory because Vercel
-- serverless instances do not share memory — an in-memory counter resets on
-- every cold start and is per-instance even when warm, so it is trivially
-- bypassed by parallel requests.
--
-- Fixed-window counter: one round trip, atomic via ON CONFLICT, and adequate
-- for abuse control.
-- ---------------------------------------------------------------------------
create table if not exists public.im_rate_limits (
  bucket       text        not null,
  identifier   text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, identifier, window_start)
);

create index if not exists idx_im_rate_limits_window
  on public.im_rate_limits(window_start);

alter table public.im_rate_limits enable row level security;
-- No policies: service-role only. RLS with zero policies denies every
-- anon/authenticated request by default, which is exactly what we want.

create or replace function public.im_rate_limit_hit(
  p_bucket         text,
  p_identifier     text,
  p_window_seconds integer,
  p_max_hits       integer
)
returns boolean
language plpgsql
security definer
set search_path = public
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

  -- Opportunistic cleanup so the table cannot grow without bound. Runs on ~1%
  -- of calls rather than requiring a scheduled job.
  if random() < 0.01 then
    delete from public.im_rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_max_hits;
end;
$fn$;

revoke all on function public.im_rate_limit_hit(text, text, integer, integer)
  from public, anon, authenticated;

commit;
