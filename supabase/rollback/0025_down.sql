-- ROLLBACK for 0025_buyer_only_signup.sql. DEV only.
-- Restores the trigger function as 0009 wrote it and 0012 pinned it (empty
-- search_path): self sign-up may again ask for 'seller'.
begin;
create or replace function public.im_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  meta_role text;
  meta_name text;
  clean_role text;
begin
  meta_role := lower(coalesce(new.raw_user_meta_data->>'role', 'buyer'));
  meta_name := nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), '');

  if meta_role = 'seller' then
    clean_role := 'seller';
  else
    clean_role := 'buyer';
  end if;

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
commit;
