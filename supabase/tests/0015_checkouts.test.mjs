// 0015: checkouts, order split, atomic placement.
const B = "00000000-0000-0000-0000-0000000015b1";
const S1 = "00000000-0000-0000-0000-0000000015a1";
const S2 = "00000000-0000-0000-0000-0000000015a2";

export const seedBefore = "0015";
export async function seed({ runSql, q }) {
  await runSql(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${B}','b15@test.invalid','{"name":"Buyer Fifteen"}'),
      ('${S1}','s151@test.invalid','{"role":"seller","name":"Seller A"}'),
      ('${S2}','s152@test.invalid','{"role":"seller","name":"Seller B"}');
  `);
  const [b] = await q(`select id from im_profiles where email='b15@test.invalid'`);
  const [s1] = await q(`select id from im_profiles where email='s151@test.invalid'`);
  const [s2] = await q(`select id from im_profiles where email='s152@test.invalid'`);
  // A legacy multi-seller order: 2×100 from A, 1×300 from B, ₱60 shipping.
  await runSql(`
    insert into im_products (id, seller_id, title, base_price, status) values
      (1501, ${s1.id}, 'A item', 100, 'approved'), (1502, ${s2.id}, 'B item', 300, 'approved');
    insert into im_product_variants (id, product_id, color_name, stock_qty, sku_code) values
      (15010, 1501, 'Std', 10, 'A-1'), (15020, 1502, 'Std', 1, 'B-1');
    insert into im_orders (id, buyer_id, total_amount, order_status, payment_status, payment_provider, payment_reference)
      values (1500, ${b.id}, 560, 'pending', 'unpaid', 'cod', null);
    insert into im_order_items (order_id, product_id, variant_id, quantity, unit_price)
      values (1500, 1501, 15010, 2, 100), (1500, 1502, 15020, 1, 300);
    insert into im_order_status_history (order_id, status) values (1500, 'pending');
  `);
}

export default async function ({ q, runSql, asUser, check }) {
  const [b] = await q(`select id from im_profiles where email='b15@test.invalid'`);
  const [s1] = await q(`select id from im_profiles where email='s151@test.invalid'`);
  const [s2] = await q(`select id from im_profiles where email='s152@test.invalid'`);

  // ---- backfill ----
  const legacy = await q(`select id, seller_id, subtotal, shipping_fee, total_amount, checkout_id from im_orders where buyer_id=${b.id} order by id`);
  check("legacy multi-seller order was split into one order per seller", legacy.length === 2 &&
    new Set(legacy.map((o) => o.seller_id)).size === 2, JSON.stringify(legacy));
  const a = legacy.find((o) => o.seller_id === s1.id);
  const bb = legacy.find((o) => o.seller_id === s2.id);
  check("each part carries only its own lines' subtotal", Number(a.subtotal) === 200 && Number(bb.subtotal) === 300, JSON.stringify(legacy));
  check("shipping stays once, with the first part", Number(a.shipping_fee) + Number(bb.shipping_fee) === 60 &&
    Number(a.total_amount) + Number(bb.total_amount) === 560, JSON.stringify(legacy));
  check("both parts share one checkout", a.checkout_id && a.checkout_id === bb.checkout_id);
  const [ck] = await q(`select grand_total from im_checkouts where id=${a.checkout_id}`);
  check("checkout total equals the original order total", Number(ck.grand_total) === 560, JSON.stringify(ck));
  const histB = await q(`select note from im_order_status_history where order_id=${bb.id}`);
  check("the split part kept the history", histB.length >= 1 && /split from order #1500/.test(histB[0].note || ""), JSON.stringify(histB));

  // ---- atomic placement ----
  await runSql(`insert into im_cart_items (id, user_id, product_id, variant_id, quantity) values (77, ${b.id}, 1501, 15010, 1)`);
  const place = (payload) => q(`select public.im_place_checkout($1::jsonb) as r`, [JSON.stringify(payload)]);
  const ship = { name: "Bea", address: "1 Street", city: "Zamboanga", phone: "09171234567" };
  const r = (await place({
    buyer_id: b.id, payment_provider: "cod", shipping: ship, cart_item_ids: [77],
    groups: [
      { seller_id: s1.id, shipping_fee: 60, lines: [{ product_id: 1501, variant_id: 15010, quantity: 1, unit_price: 80, base_unit_price: 100, sale_discount_pct: 20 }] },
      { seller_id: s2.id, shipping_fee: 60, lines: [{ product_id: 1502, variant_id: 15020, quantity: 1, unit_price: 300, base_unit_price: 300 }] },
    ],
  }))[0].r;
  check("a two-seller checkout makes two orders", r.order_ids.length === 2 && Number(r.grand_total) === 500, JSON.stringify(r));
  const placed = await q(`select seller_id, subtotal, shipping_fee, total_amount, order_status from im_orders where checkout_id=${r.checkout_id} order by seller_id`);
  check("each order is one seller's parcel with its own shipping",
    placed.length === 2 && placed.every((o) => Number(o.shipping_fee) === 60 && o.order_status === "pending"), JSON.stringify(placed));
  const [line] = await q(`select base_unit_price, sale_discount_pct, unit_price from im_order_items where order_id=${r.order_ids[0]}`);
  check("the pricing breakdown is stored on the line", Number(line.base_unit_price) === 100 && Number(line.sale_discount_pct) === 20 && Number(line.unit_price) === 80);
  check("COD removes the ordered cart lines in the same transaction",
    (await q(`select count(*)::int as n from im_cart_items where id=77`))[0].n === 0);
  check("stock was decremented", (await q(`select stock_qty from im_product_variants where id=15020`))[0].stock_qty === 0);

  // Out of stock: B item is now 0. Nothing at all may be written.
  const before = (await q(`select (select count(*) from im_orders)::int as o, (select count(*) from im_checkouts)::int as c, (select stock_qty from im_product_variants where id=15010) as s`))[0];
  let err = null;
  try {
    await place({
      buyer_id: b.id, payment_provider: "paymongo", shipping: ship,
      groups: [
        { seller_id: s1.id, shipping_fee: 60, lines: [{ product_id: 1501, variant_id: 15010, quantity: 1, unit_price: 100 }] },
        { seller_id: s2.id, shipping_fee: 60, lines: [{ product_id: 1502, variant_id: 15020, quantity: 1, unit_price: 300 }] },
      ],
    });
  } catch (e) { err = e.message; }
  const after = (await q(`select (select count(*) from im_orders)::int as o, (select count(*) from im_checkouts)::int as c, (select stock_qty from im_product_variants where id=15010) as s`))[0];
  check("a sold-out line rolls back the whole checkout (B-07)",
    /out_of_stock:1502/.test(err || "") && JSON.stringify(before) === JSON.stringify(after), `${err} ${JSON.stringify([before, after])}`);

  err = null;
  try {
    await place({ buyer_id: b.id, payment_provider: "cod", shipping: ship,
      groups: [{ seller_id: s1.id, shipping_fee: 0, lines: [{ product_id: 1501, variant_id: 15020, quantity: 1, unit_price: 1 }] }] });
  } catch (e) { err = e.message; }
  check("a variant from another product cannot be ordered (N-01, at the database)", /unavailable|out_of_stock/.test(err || ""), err);

  err = null;
  try {
    await place({ buyer_id: b.id, payment_provider: "cod", shipping: ship,
      groups: [{ seller_id: s2.id, shipping_fee: 0, lines: [{ product_id: 1501, variant_id: 15010, quantity: 1, unit_price: 1 }] }] });
  } catch (e) { err = e.message; }
  check("a line cannot be filed under the wrong seller", err != null, err);

  // ---- access ----
  const sellerSees = await asUser(S2, "authenticated", `select id from im_orders where checkout_id=${r.checkout_id}`);
  check("a seller sees only their own order of a shared checkout", sellerSees.ok && sellerSees.res.rows.length === 1, sellerSees.error || JSON.stringify(sellerSees.res?.rows));
  const fn = await q(`select has_function_privilege('authenticated','public.im_place_checkout(jsonb)','execute') as can`);
  check("clients cannot call im_place_checkout", fn[0].can === false);
}
