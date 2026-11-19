-- 0025: self sign-up creates buyers only.
--
-- Only buyers create their own accounts. Sellers are PWD trainees whom AVRC
-- staff onboard: an administrator creates the account (Admin > Users, which
-- invites the person and then sets the role through the service-role client)
-- or changes an existing buyer's role.
--
-- The sign-up form no longer offers a role, but that alone would not enforce
-- it: raw_user_meta_data is whatever the caller sends, and anyone can
--   POST /auth/v1/signup  {"email":…, "password":…, "data":{"role":"seller"}}
-- with the publishable key that ships in the browser bundle. Before this
-- migration that produced a seller profile (0009 mapped 'seller' through).
-- Now every profile this trigger creates is a buyer, whatever the metadata
-- says. Only the name is still read from it.
--
-- Unchanged: a NEW profile only, never adopting an existing one
-- (`on conflict (email) do nothing`, 0009), and security definer with an
-- empty search_path (0012; every relation below is schema-qualified, the rest
-- are pg_catalog built-ins). `create or replace` keeps 0012's setting only if
-- it is restated, so it is. Existing sellers keep their role; nothing is
-- backfilled.

create or replace function public.im_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  meta_name text;
begin
  -- The caller sets the metadata, so its name is bounded like the form's.
  meta_name := left(nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), ''), 120);

  insert into public.im_profiles (auth_user_id, name, email, role)
  values (
    new.id,
    coalesce(meta_name, split_part(new.email, '@', 1)),
    lower(new.email),
    'buyer'
  )
  on conflict (email) do nothing;

  return new;
end;
$fn$;
