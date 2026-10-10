// 0023: moving a photo to Storage does not hide an approved listing.
export default async function ({ q, runSql, asUser, check }) {
  await runSql(`insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000023a1','s23@test.invalid','{"role":"seller","name":"Seller 23"}');`);
  const [s] = await q(`select id from im_profiles where email='s23@test.invalid'`);
  await runSql(`insert into im_products (id, seller_id, title, base_price, status) values (2301, ${s.id}, 'Photo item', 100, 'approved');
                insert into im_product_images (id, product_id, url, position) values (23011, 2301, 'data:image/jpeg;base64,AAAA', 0);`);
  // Inserting the image row re-pended it (0016); approve again for the test.
  await runSql(`update im_products set status='approved', moderated_at=now() where id=2301`);
  const url = "https://x.supabase.co/storage/v1/object/public/product-media/" + s.id + "/0f8fad5b-d9cb-469f-a165-70867728950e.jpg";
  const [r] = await q(`select public.im_move_product_image_to_storage(23011, '${url}') as moved`);
  check("a data URL is swapped for its Storage URL", r.moved === true);
  const [p] = await q(`select status from im_products where id = 2301`);
  check("…without sending the approved listing back to review", p.status === "approved", JSON.stringify(p));
  const [again] = await q(`select public.im_move_product_image_to_storage(23011, '${url}') as moved`);
  check("an already-moved photo is left alone", again.moved === false);
  let err = null;
  try { await q(`select public.im_move_product_image_to_storage(23011, 'https://evil.example/x.jpg')`); } catch (e) { err = e.message; }
  check("only product-media URLs are accepted", /not a product-media URL/.test(err || ""), err);
  const client = await asUser("00000000-0000-0000-0000-0000000023a1", "authenticated", `select public.im_move_product_image_to_storage(23011, '${url}')`);
  check("clients cannot call it", !client.ok, client.error);
  // A normal photo change still re-pends (the bypass was transaction-local).
  await runSql(`update im_product_images set position = 1 where id = 23011`);
  const [after] = await q(`select status from im_products where id = 2301`);
  check("an ordinary photo change still goes to review", after.status === "pending", JSON.stringify(after));
}
