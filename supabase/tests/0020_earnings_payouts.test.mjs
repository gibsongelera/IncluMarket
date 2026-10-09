// 0020: earnings availability, balance, payout requests, categories.
export default async function ({ q, runSql, asUser, check }) {
  await runSql(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('00000000-0000-0000-0000-0000000020a1','s20@test.invalid','{"role":"seller","name":"Seller 20"}'),
      ('00000000-0000-0000-0000-0000000020b1','b20@test.invalid','{"name":"Buyer 20"}');
  `);
  const [s] = await q(`select id from im_profiles where email='s20@test.invalid'`);
  const [b] = await q(`select id from im_profiles where email='b20@test.invalid'`);
  const order = async (id, provider, pay, subtotal, ship, path) => {
    await runSql(`insert into im_orders (id, buyer_id, seller_id, total_amount, subtotal, shipping_fee, payment_status, payment_provider)
                  values (${id}, ${b.id}, ${s.id}, ${subtotal + ship}, ${subtotal}, ${ship}, '${pay}', '${provider}')`);
    for (const to of path) await q(`select public.im_transition_order(${id}, '${to}', null, 'admin', null, '{"reason":"t"}'::jsonb)`);
  };
  await order(2001, "paymongo", "paid", 1000, 60, ["processing", "shipped", "delivered"]); // old delivery → available
  await order(2002, "paymongo", "paid", 500, 60, ["processing", "shipped", "delivered"]);  // recent → pending
  await order(2003, "cod", "unpaid", 300, 60, ["processing", "shipped", "delivered"]);     // collected
  await order(2004, "paymongo", "paid", 700, 60, ["processing", "cancelled"]);             // not earned
  await runSql(`select set_config('im.transition','on',false);
                update im_orders set delivered_at = now() - interval '10 days' where id = 2001;
                select set_config('im.transition','off',false);`);

  const e = Object.fromEntries((await q(`select order_id, availability, net from im_seller_earnings where seller_id=${s.id}`))
    .map((r) => [Number(r.order_id), r]));
  check("paid online + delivered + past the return window → available", e[2001].availability === "available" && Number(e[2001].net) === 1060);
  check("inside the return window → pending", e[2002].availability === "pending");
  check("cash on delivery is collected by the seller, never paid out", e[2003].availability === "collected");
  check("a cancelled order earns nothing", e[2004].availability === "not_earned");

  const bal = async () => (await q(`select * from public.im_seller_balance(${s.id})`))[0];
  check("balance", Number((await bal()).available) === 1060 && Number((await bal()).pending) === 560 && Number((await bal()).collected) === 360);

  const pay = async (amount) => {
    try { return { id: (await q(`select public.im_request_payout(${s.id}, ${amount}, 'gcash', '09171234567') as id`))[0].id }; }
    catch (e) { return { error: e.message }; }
  };
  check("a payout below the minimum is refused", /below_minimum/.test((await pay(50)).error || ""));
  check("a payout above the balance is refused", /insufficient_balance/.test((await pay(2000)).error || ""));
  const first = await pay(800);
  check("a payout within the balance is accepted", first.id != null, first.error);
  check("requested money is reserved", Number((await bal()).available) === 260);
  check("a second request cannot spend the same money", /insufficient_balance/.test((await pay(800)).error || ""));

  // A return request moves the money back out of "available".
  await q(`select public.im_transition_order(2001, 'return_requested', null, 'admin', null, '{"reason":"broken"}'::jsonb)`);
  check("a return request stops the order counting as available",
    (await q(`select availability from im_seller_earnings where order_id = 2001`))[0].availability === "pending");

  const direct = await asUser("00000000-0000-0000-0000-0000000020a1", "authenticated", `select * from im_seller_earnings`);
  check("earnings are not readable through the API", !direct.ok);

  const cats = await q(`select id, position, icon, is_active from im_categories where id = 'bags'`);
  check("categories gain position, icon and active flag", cats.length === 0 || (cats[0].is_active === true && cats[0].icon != null));
}
