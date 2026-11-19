// 0025: self sign-up creates buyers only, whatever the metadata asks for.
export default async function ({ q, runSql, check }) {
  await runSql(`insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000025a1','Want.Seller25@test.invalid','{"role":"seller","name":"Would-be Seller"}'),
    ('00000000-0000-0000-0000-0000000025a2','want.admin25@test.invalid','{"role":"admin","name":"Would-be Admin"}'),
    ('00000000-0000-0000-0000-0000000025a3','plain25@test.invalid','{}');`);
  const rows = await q(`select email, role, name from im_profiles where email like '%25@test.invalid' order by email`);
  const by = (e) => rows.find((r) => r.email === e);

  check("a sign-up asking for 'seller' becomes a buyer", by("want.seller25@test.invalid")?.role === "buyer",
    `role=${by("want.seller25@test.invalid")?.role}`);
  check("a sign-up asking for 'admin' becomes a buyer", by("want.admin25@test.invalid")?.role === "buyer");
  check("the name still comes from the metadata", by("want.seller25@test.invalid")?.name === "Would-be Seller");
  check("no name falls back to the address's local part", by("plain25@test.invalid")?.name === "plain25");

  await runSql(`insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000025a5','long25@test.invalid', jsonb_build_object('name', repeat('x', 5000)));`);
  const [long] = await q(`select length(name) as n from im_profiles where email = 'long25@test.invalid'`);
  check("a name from metadata is cut to 120 characters", Number(long.n) === 120, `length=${long.n}`);

  // An existing profile is never adopted (0009, unchanged).
  await runSql(`insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000025a4','plain25@test.invalid','{"name":"Second Claim"}');`);
  const [kept] = await q(`select auth_user_id, name from im_profiles where email = 'plain25@test.invalid'`);
  check("a second sign-up with the same email does not take over the profile",
    kept.auth_user_id === "00000000-0000-0000-0000-0000000025a3" && kept.name === "plain25");

  const [cfg] = await q(`select proconfig from pg_proc where oid = 'public.im_handle_new_auth_user()'::regprocedure`);
  check("the function keeps 0012's empty search_path",
    (cfg.proconfig || []).some((c) => c === 'search_path=""' || c === "search_path=''"), JSON.stringify(cfg.proconfig));

  // Sellers are provisioned: the role is set afterwards by the service role.
  await runSql(`update im_profiles set role = 'seller' where email = 'want.seller25@test.invalid'`);
  const [seller] = await q(`select role from im_profiles where email = 'want.seller25@test.invalid'`);
  check("an administrator can still make the account a seller", seller.role === "seller");
}
