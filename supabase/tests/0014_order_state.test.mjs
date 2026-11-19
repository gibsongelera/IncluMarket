// 0014: the order state machine in the database.
export default async function ({ q, runSql, check }) {
  await runSql(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('00000000-0000-0000-0000-0000000000b1','b1@test.invalid','{"name":"Buyer One"}'),
      ('00000000-0000-0000-0000-0000000000a1','s1@test.invalid','{"role":"seller","name":"Seller One"}'); update im_profiles set role = 'seller' where auth_user_id in (select id from auth.users where raw_user_meta_data->>'role' = 'seller');
  `);
  const [buyer] = await q(`select id from im_profiles where email='b1@test.invalid'`);
  const [seller] = await q(`select id from im_profiles where email='s1@test.invalid'`);
  await runSql(`
    insert into im_products (id, seller_id, title, base_price, status) values (700, ${seller.id}, 'Mat', 100, 'approved');
    insert into im_product_variants (id, product_id, color_name, stock_qty, sku_code) values (7000, 700, 'Std', 3, 'M-1');
    insert into im_orders (id, buyer_id, total_amount, payment_status, payment_provider)
      values (800, ${buyer.id}, 260, 'unpaid', 'cod'),
             (801, ${buyer.id}, 160, 'pending', 'paymongo'),
             (802, ${buyer.id}, 160, 'failed', 'paymongo');
    insert into im_order_items (order_id, product_id, variant_id, quantity, unit_price)
      values (800, 700, 7000, 2, 100), (801, 700, 7000, 1, 100), (802, 700, 7000, 1, 100);
  `);
  const t = async (id, to, role, meta = "{}", actor = null) =>
    (await q(`select public.im_transition_order($1, $2, $3, $4, null, $5::jsonb) as r`, [id, to, actor, role, meta]))[0].r;
  const status = async (id) => (await q(`select order_status from im_orders where id=$1`, [id]))[0].order_status;
  const stock = async () => (await q(`select stock_qty from im_product_variants where id=7000`))[0].stock_qty;

  let err = null;
  try { await runSql(`update im_orders set order_status='delivered' where id=800`); } catch (e) { err = e.message; }
  check("direct status update is refused, even as the database owner", /only change through/.test(err || ""), err);

  err = null;
  try { await runSql(`insert into im_orders (buyer_id, total_amount, order_status) values (${buyer.id}, 1, 'shipped')`); } catch (e) { err = e.message; }
  check("a new order cannot start past pending", /must start as pending/.test(err || ""), err);

  check("pending → delivered is illegal", (await t(800, "delivered", "seller")) === "illegal");
  check("a buyer cannot accept their own order", (await t(800, "processing", "buyer")) === "forbidden");
  check("seller accepts a COD order", (await t(800, "processing", "seller", "{}", seller.id)) === "ok" && (await status(800)) === "processing");
  check("an unpaid online order cannot be prepared", (await t(801, "processing", "seller")) === "not_paid");

  check("shipping records courier and tracking",
    (await t(800, "shipped", "seller", JSON.stringify({ courier: "LBC", tracking_number: "123" }))) === "ok" &&
    (await q(`select courier, tracking_number, shipped_at is not null as s from im_orders where id=800`))[0].tracking_number === "123");
  check("buyer confirms receipt", (await t(800, "delivered", "buyer", "{}", buyer.id)) === "ok" &&
    (await q(`select delivered_at is not null as d from im_orders where id=800`))[0].d === true);
  check("a return needs a reason", (await t(800, "return_requested", "buyer")) === "reason_required");
  check("buyer requests a return inside the window", (await t(800, "return_requested", "buyer", JSON.stringify({ reason: "Wrong size" }))) === "ok");
  check("seller accepts the return", (await t(800, "returned", "seller")) === "ok" && (await status(800)) === "returned");
  check("returned is terminal", (await t(800, "delivered", "admin")) === "illegal");

  const hist = await q(`select status, actor_role, note from im_order_status_history where order_id=800 order by id`);
  check("every step wrote history with its actor",
    hist.map((h) => h.status).join(",") === "processing,shipped,delivered,return_requested,returned" &&
    hist.find((h) => h.status === "return_requested").note === "Wrong size", JSON.stringify(hist));

  // Cancellation and stock (stock 3 is "what is left after both orders held theirs").
  const before = await stock();
  check("a cancel needs a reason", (await t(801, "cancelled", "buyer")) === "reason_required");
  check("buyer cancels an unpaid online order and its stock comes back",
    (await t(801, "cancelled", "buyer", JSON.stringify({ reason: "Changed my mind" }))) === "ok" && (await stock()) === before + 1);
  const before2 = await stock();
  check("cancelling an order whose payment failed does not restock twice",
    (await t(802, "cancelled", "system", JSON.stringify({ reason: "Payment not completed" }))) === "ok" && (await stock()) === before2);

  await runSql(`
    insert into im_orders (id, buyer_id, total_amount, payment_status, payment_provider) values (803, ${buyer.id}, 10, 'paid', 'paymongo');
    select public.im_transition_order(803, 'processing', null, 'system');
    select public.im_transition_order(803, 'shipped', null, 'seller');
    select public.im_transition_order(803, 'delivered', null, 'seller');
  `);
  await runSql(`select set_config('im.transition','on',false); update im_orders set delivered_at = now() - interval '10 days' where id=803; select set_config('im.transition','off',false);`);
  check("return window closes after 7 days",
    (await t(803, "return_requested", "buyer", JSON.stringify({ reason: "late" }))) === "return_window_closed");

  await runSql(`insert into im_orders (id, buyer_id, total_amount, payment_status, payment_provider) values (804, ${buyer.id}, 10, 'paid', 'paymongo');`);
  await t(804, "processing", "system");
  await t(804, "cancelled", "seller", JSON.stringify({ reason: "Out of material" }));
  check("cancelling a paid order flags a refund", (await q(`select refund_due from im_orders where id=804`))[0].refund_due === true);

  await runSql(`insert into im_orders (id, buyer_id, total_amount, payment_status, payment_provider) values (805, ${buyer.id}, 10, 'pending', 'paymongo');`);
  check("a seller cannot cancel an online order whose payment may still arrive",
    (await t(805, "cancelled", "seller", JSON.stringify({ reason: "No stock" }))) === "forbidden");
  check("the buyer can, and nothing is recorded as charged",
    (await t(805, "cancelled", "buyer", JSON.stringify({ reason: "Changed my mind" }))) === "ok" &&
    (await q(`select payment_status from im_orders where id=805`))[0].payment_status === "failed");

  const fn = await q(`select has_function_privilege('authenticated', 'public.im_transition_order(bigint,text,bigint,text,text,jsonb)', 'execute') as can`);
  check("clients cannot call im_transition_order directly", fn[0].can === false);
}
