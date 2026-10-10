// 0021: featured order and window.
export default async function ({ q, runSql, asUser, check }) {
  await runSql(`insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000021a1','s21@test.invalid','{"role":"seller","name":"Seller 21"}');`);
  const [s] = await q(`select id from im_profiles where email='s21@test.invalid'`);
  await runSql(`insert into im_products (id, seller_id, title, base_price, status, is_featured)
                values (2101, ${s.id}, 'Featured thing', 100, 'approved', true)`);

  let err = null;
  try {
    await runSql(`update im_products set featured_from = now(), featured_until = now() - interval '1 day' where id = 2101`);
  } catch (e) { err = e.message; }
  check("a feature cannot end before it starts", /featured_window|check constraint/.test(err || ""), err);

  await runSql(`update im_products set featured_position = 1, featured_from = now() - interval '1 day',
                featured_until = now() + interval '7 days' where id = 2101`);
  const [p] = await q(`select status, featured_position from im_products where id = 2101`);
  check("setting a feature never sends the listing back to review", p.status === "approved" && p.featured_position === 1, JSON.stringify(p));

  const seller = await asUser("00000000-0000-0000-0000-0000000021a1", "authenticated",
    `update im_products set featured_position = 0, is_featured = true where id = 2101`);
  check("a seller cannot feature their own listing through the API", !seller.ok || seller.res.affectedRows === 0, seller.error);
}
