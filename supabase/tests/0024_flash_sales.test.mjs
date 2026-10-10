// 0024: flash sale rules.
export default async function ({ q, runSql, check }) {
  await runSql(`insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000024a1','s24@test.invalid','{"role":"seller","name":"Seller 24"}');`);
  const [s] = await q(`select id from im_profiles where email='s24@test.invalid'`);
  await runSql(`insert into im_products (id, seller_id, title, base_price, status) values
    (2401, ${s.id}, 'Approved item', 100, 'approved'),
    (2402, ${s.id}, 'Pending item', 100, 'pending');`);
  const sale = (pid, from, to, pct = 20) =>
    runSql(`insert into im_flash_sales (product_id, discount_percent, starts_at, ends_at) values (${pid}, ${pct}, ${from}, ${to})`);
  const err = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

  check("a sale on an approved listing is accepted", (await err(() => sale(2401, "now()", "now() + interval '1 day'"))) === null);
  const overlap = await err(() => sale(2401, "now() + interval '12 hours'", "now() + interval '2 days'"));
  check("an overlapping sale is rejected", /already has a flash sale/.test(overlap || ""), overlap);
  check("a later sale that does not overlap is accepted",
    (await err(() => sale(2401, "now() + interval '1 day'", "now() + interval '2 days'"))) === null);
  const long = await err(() => sale(2401, "now() + interval '3 days'", "now() + interval '11 days'"));
  check("a sale longer than 7 days is rejected", /at most 7 days/.test(long || ""), long);
  const pending = await err(() => sale(2402, "now()", "now() + interval '1 day'"));
  check("a pending listing cannot get a sale", /approved listing/.test(pending || ""), pending);
  const [first] = await q(`select id from im_flash_sales where product_id = 2401 order by starts_at limit 1`);
  check("ending a sale early is allowed",
    (await err(() => runSql(`update im_flash_sales set ends_at = now() + interval '1 minute' where id = ${first.id}`))) === null);
}
