// 0027: when listings sell out, and the photos and listings that are removed.
const S = "00000000-0000-0000-0000-0000000027a1";
const B = "00000000-0000-0000-0000-0000000027b1";
const A = "00000000-0000-0000-0000-0000000027c1";
const MEDIA = "https://example.supabase.co/storage/v1/object/public/product-media/27";

// A listing that sold out before 0027 existed: the backfill dates it from
// its last sale.
export const seedBefore = "0027";
export async function seed({ runSql, q }) {
  await runSql(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${S}','s27@test.invalid','{"name":"Seller 27"}'),
      ('${B}','b27@test.invalid','{"name":"Buyer 27"}'),
      ('${A}','a27@test.invalid','{"name":"Admin 27"}');
    update im_profiles set role = 'seller' where email = 's27@test.invalid';
    update im_profiles set role = 'admin'  where email = 'a27@test.invalid';
  `);
  const [s] = await q(`select id from im_profiles where email='s27@test.invalid'`);
  const [b] = await q(`select id from im_profiles where email='b27@test.invalid'`);
  await runSql(`
    insert into im_products (id, seller_id, title, base_price, status) values (2701, ${s.id}, 'Woven bayong', 450, 'approved');
    insert into im_product_variants (product_id, color_name, stock_qty, sku_code) values (2701, 'Natural', 1, 'IM27-1');
    insert into im_orders (id, buyer_id, total_amount, payment_status, payment_provider, created_at)
      values (2750, ${b.id}, 450, 'unpaid', 'cod', '2026-01-15 10:00:00+00');
    insert into im_order_items (order_id, product_id, variant_id, quantity, unit_price)
      select 2750, 2701, id, 1, 450 from im_product_variants where sku_code = 'IM27-1';
    update im_product_variants set stock_qty = 0 where sku_code = 'IM27-1';
  `);
}

export default async function ({ q, runSql, asUser, check }) {
  const [s] = await q(`select id from im_profiles where email='s27@test.invalid'`);
  const events = (pid) => q(`select kind, stock_before, stock_after, approximate, occurred_at from im_stock_events where product_id = ${pid} order by id`);
  const history = (pid) => q(`select * from im_item_history where product_id = ${pid} order by id`);
  const fails = async (sql) => {
    try { await runSql(sql); return null; } catch (e) { return e.message; }
  };

  // ---- backfill ----
  const old = await events(2701);
  check("a listing already sold out gets one approximate event",
    old.length === 1 && old[0].kind === "sold_out" && old[0].approximate === true && old[0].stock_before === null,
    JSON.stringify(old));
  check("…dated from its last sale",
    old[0] && new Date(old[0].occurred_at).toISOString() === "2026-01-15T10:00:00.000Z", old[0] && String(old[0].occurred_at));

  // ---- live events ----
  await runSql(`
    insert into im_products (id, seller_id, title, base_price, status) values (2702, ${s.id}, 'Abaca coasters', 120, 'approved');
    insert into im_product_variants (product_id, color_name, stock_qty, sku_code) values (2702, 'Set of 4', 2, 'IM27-2');
  `);
  check("a new listing coming into stock records nothing", (await events(2702)).length === 0);

  await runSql(`update im_product_variants set stock_qty = 0 where sku_code = 'IM27-2'`);
  let e = await events(2702);
  check("selling the last unit records a sell-out",
    e.length === 1 && e[0].kind === "sold_out" && e[0].stock_before === 2 && e[0].stock_after === 0 && e[0].approximate === false,
    JSON.stringify(e));

  await runSql(`update im_product_variants set stock_qty = 3 where sku_code = 'IM27-2'`);
  check("back in stock within two minutes: the sell-out was a form save, and is dropped", (await events(2702)).length === 0,
    JSON.stringify(await events(2702)));

  await runSql(`update im_product_variants set stock_qty = 0 where sku_code = 'IM27-2'`);
  await runSql(`update im_stock_events set occurred_at = now() - interval '1 hour' where product_id = 2702`);
  await runSql(`update im_product_variants set stock_qty = 4 where sku_code = 'IM27-2'`);
  e = await events(2702);
  check("a real sell-out is kept and answered with back in stock",
    e.length === 2 && e[0].kind === "sold_out" && e[1].kind === "restocked" && e[1].stock_after === 4,
    JSON.stringify(e));

  // ---- photos ----
  const imgs = await q(`
    insert into im_product_images (product_id, url, position) values
      (2702, '${MEDIA}/a.jpg', 0), (2702, 'data:image/png;base64,AAAA', 1), (2702, '${MEDIA}/c.jpg', 2)
    returning id, url`);
  const id = (u) => imgs.find((i) => i.url.endsWith(u)).id;
  await runSql(`
    insert into im_products (id, seller_id, title, base_price, status) values (2703, ${s.id}, 'Other listing', 90, 'pending');
    insert into im_product_variants (product_id, color_name, stock_qty, sku_code) values (2703, 'Standard', 1, 'IM27-3');
  `);
  const [other] = await q(`insert into im_product_images (product_id, url, position) values (2703, '${MEDIA}/z.jpg', 0) returning id`);

  const [removed] = await q(`select public.im_remove_product_photos(2702, array[${id("a.jpg")}, ${id("AAAA")}]::bigint[], ${s.id}, 'seller') as n`);
  check("the app's photo removal deletes the photos asked for", Number(removed.n) === 2);
  let h = await history(2702);
  const kept = h.find((r) => r.photos.length === 1);
  check("a removed photo is kept with its URL, the listing and who removed it",
    kept && kept.kind === "photo_removed" && kept.photos[0] === `${MEDIA}/a.jpg` && kept.title === "Abaca coasters" &&
      Number(kept.actor_id) === Number(s.id) && kept.actor_role === "seller" && kept.seller_name === "Seller 27" &&
      Number(kept.base_price) === 120 && kept.stock_total === 4,
    JSON.stringify(kept));
  const inline = h.find((r) => r.photos.length === 0);
  check("an inline (data:) photo is counted, not copied", inline && inline.inline_photos === 1, JSON.stringify(inline));
  const [guc] = await q(`select coalesce(current_setting('im.history_actor_id', true), '') as v`);
  check("the actor does not outlive the call", guc.v === "");

  const [none] = await q(`select public.im_remove_product_photos(2702, array[${other.id}]::bigint[], ${s.id}, 'seller') as n`);
  const [still] = await q(`select count(*)::int as n from im_product_images where id = ${other.id}`);
  check("a photo id from another listing is left alone", Number(none.n) === 0 && still.n === 1);

  await runSql(`delete from im_product_images where id = ${id("c.jpg")}`);
  h = await history(2702);
  const outside = h[h.length - 1];
  check("a photo deleted outside the app is kept too, with no actor",
    h.length === 3 && outside.photos[0] === `${MEDIA}/c.jpg` && outside.actor_id === null, JSON.stringify(outside));

  // ---- whole listings ----
  await runSql(`
    insert into im_products (id, seller_id, title, base_price, status, description) values (2704, ${s.id}, 'Braille cards', 75, 'approved', 'Deck of cards');
    insert into im_product_variants (product_id, color_name, size, stock_qty, sku_code) values (2704, 'Blue', 'Standard', 5, 'IM27-4');
    insert into im_product_images (product_id, url, position) values (2704, '${MEDIA}/second.jpg', 1), (2704, '${MEDIA}/first.jpg', 0);
    delete from im_products where id = 2704;
  `);
  h = await history(2704);
  check("a deleted listing is kept once, photos in order, with its options",
    h.length === 1 && h[0].kind === "item_deleted" && h[0].photos.join(",") === `${MEDIA}/first.jpg,${MEDIA}/second.jpg` &&
      h[0].details.options.length === 1 && h[0].details.options[0].sku === "IM27-4" && h[0].details.description === "Deck of cards" &&
      h[0].stock_total === 5,
    JSON.stringify(h));

  await runSql(`
    insert into im_products (id, seller_id, title, base_price, status) values (2705, ${s.id}, 'Half-made', 10, 'pending');
    delete from im_products where id = 2705;
  `);
  check("a listing removed while it was being created (no options, no photos) leaves nothing", (await history(2705)).length === 0);

  // ---- Surface B ----
  const buyerRead = await asUser(B, "authenticated", `select id from im_item_history`);
  check("a signed-in buyer reads no item history", buyerRead.ok && buyerRead.res.rows.length === 0, buyerRead.error);
  const sellerRead = await asUser(S, "authenticated", `select id from im_stock_events`);
  check("a seller reads no stock events directly", sellerRead.ok && sellerRead.res.rows.length === 0, sellerRead.error);
  const anonRead = await asUser(null, "anon", `select id from im_item_history`);
  check("an anonymous browser reads no item history", anonRead.ok && anonRead.res.rows.length === 0, anonRead.error);
  const adminRead = await asUser(A, "authenticated", `select id from im_item_history`);
  check("an admin can read the item history", adminRead.ok && adminRead.res.rows.length >= 4, adminRead.error);
  const write = await asUser(S, "authenticated", `insert into im_item_history (product_id, kind, title) values (1, 'item_deleted', 'fake')`);
  check("a browser cannot write history", !write.ok);
  const wipe = await asUser(A, "authenticated", `delete from im_stock_events`);
  check("not even an admin's browser can delete stock events", !wipe.ok || wipe.res.affectedRows === 0, wipe.error);
  const rpc = await asUser(S, "authenticated", `select public.im_remove_product_photos(2703, array[${other.id}]::bigint[], 1, 'admin')`);
  check("a browser cannot call the photo removal function", !rpc.ok);
  const svc = await asUser(null, "service_role", `select public.im_remove_product_photos(2703, array[]::bigint[], null, null) as n`);
  check("the server (service role) can", svc.ok, svc.error);

  check("a call with no photo ids does nothing and does not fail",
    (await fails(`select public.im_remove_product_photos(2703, null, null, null)`)) === null);
}
