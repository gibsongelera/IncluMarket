// 0028: paying the Workshop over the counter (GCash, Maribank, LBP).
const B = "00000000-0000-0000-0000-0000000028b1";
const X = "00000000-0000-0000-0000-0000000028b2";
const S = "00000000-0000-0000-0000-0000000028a1";
const A = "00000000-0000-0000-0000-0000000028c1";
const UUID = "6f1c1a2e-3b4d-4c5e-8f90-a1b2c3d4e5f6";

export default async function ({ q, runSql, asUser, check }) {
  await runSql(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${B}','b28@test.invalid','{"name":"Buyer 28"}'),
      ('${X}','x28@test.invalid','{"name":"Other Buyer 28"}'),
      ('${S}','s28@test.invalid','{"name":"Seller 28"}'),
      ('${A}','a28@test.invalid','{"name":"Admin 28"}');
    update im_profiles set role = 'seller' where email = 's28@test.invalid';
    update im_profiles set role = 'admin'  where email = 'a28@test.invalid';
  `);
  const id = async (email) => (await q(`select id from im_profiles where email = $1`, [email]))[0].id;
  const b = await id("b28@test.invalid");
  const s = await id("s28@test.invalid");
  const fails = async (sql, params) => {
    try { await q(sql, params); return null; } catch (e) { return e.message; }
  };

  // ---- the provider ----
  const [prov] = await q(`select enabled from im_payment_providers where id = 'otc'`);
  check("the counter-payment provider exists and is on", prov && prov.enabled === true, JSON.stringify(prov));

  // ---- placing a checkout ----
  await runSql(`
    insert into im_products (id, seller_id, title, base_price, status) values (2801, ${s}, 'Abaca coin purse', 150, 'approved');
    insert into im_product_variants (id, product_id, color_name, stock_qty, sku_code) values (28010, 2801, 'Natural', 5, 'IM28-1');
    insert into im_cart_items (id, user_id, product_id, variant_id, quantity) values (2881, ${b}, 2801, 28010, 2);
  `);
  const place = async (provider, cart) =>
    (await q(`select public.im_place_checkout($1::jsonb) as r`, [JSON.stringify({
      buyer_id: b, payment_provider: provider, cart_item_ids: cart,
      shipping: { name: "Bea", address: "1 Street", city: "Zamboanga", phone: "09171234567" },
      groups: [{ seller_id: s, shipping_fee: 50, lines: [{ product_id: 2801, variant_id: 28010, quantity: 2, unit_price: 150 }] }],
    })]))[0].r;
  const stock = async () => (await q(`select stock_qty from im_product_variants where id = 28010`))[0].stock_qty;
  const sold = async () => (await q(`select sold_count from im_products where id = 2801`))[0].sold_count;

  const r = await place("otc", [2881]);
  const [o] = await q(`select id, order_status, payment_status, payment_provider from im_orders where checkout_id = ${r.checkout_id}`);
  const [ck] = await q(`select payment_status from im_checkouts where id = ${r.checkout_id}`);
  check("a checkout can be paid at the counter, and waits for the payment",
    o && o.payment_provider === "otc" && o.payment_status === "pending" && o.order_status === "pending" &&
      ck.payment_status === "pending" && Number(r.grand_total) === 350,
    JSON.stringify([r, o, ck]));
  check("the ordered lines leave the cart at once, as with cash on delivery",
    (await q(`select count(*)::int as n from im_cart_items where id = 2881`))[0].n === 0);
  check("the items are held for the buyer", (await stock()) === 3);
  check("an unpaid counter order does not count as sold", (await sold()) === 0);
  check("a made-up provider is still refused",
    /bad_provider/.test((await fails(`select public.im_place_checkout($1::jsonb)`, [JSON.stringify({ buyer_id: b, payment_provider: "cash", groups: [] })])) || ""));

  // ---- the order's moves ----
  const move = async (orderId, to, role, actor, meta = {}) =>
    (await q(`select public.im_transition_order($1, $2, $3, $4, null, $5::jsonb) as r`, [orderId, to, actor, role, JSON.stringify(meta)]))[0].r;
  check("the seller cannot prepare it before the payment is confirmed", (await move(o.id, "processing", "seller", s)) === "not_paid");
  check("the seller cannot cancel it while the buyer may still pay",
    (await move(o.id, "cancelled", "seller", s, { reason: "Out of thread" })) === "forbidden");

  // What lib/payments/apply.ts does when an admin confirms the proof.
  await runSql(`update im_orders set payment_status = 'paid' where id = ${o.id};
                update im_checkouts set payment_status = 'paid' where id = ${r.checkout_id};`);
  check("once paid it counts as sold", (await sold()) === 2);
  check("once paid the seller can prepare it", (await move(o.id, "processing", "seller", s)) === "ok");

  const r2 = await place("otc", []);
  const [o2] = await q(`select id from im_orders where checkout_id = ${r2.checkout_id}`);
  const cancelled = await move(o2.id, "cancelled", "buyer", b, { reason: "Changed my mind" });
  const [after] = await q(`select payment_status from im_orders where id = ${o2.id}`);
  check("the buyer can cancel an unpaid counter order, and its items go back on sale",
    cancelled === "ok" && after.payment_status === "failed" && (await stock()) === 3, JSON.stringify([cancelled, after]));

  // ---- the Workshop's accounts ----
  const account = (channel, number) =>
    fails(`insert into im_payment_accounts (channel, account_name, account_number, active) values ($1, 'Rehabilitation Sheltered Workshop', $2, true)`, [channel, number]);
  check("an account must be GCash, Maribank or LBP", (await account("paypal", "0917 123 4567")) != null);
  check("an account number is digits, letters, spaces or dashes", (await account("gcash", "<b>0917</b>")) != null);
  const saved = await account("gcash", "0917 123 4567");
  check("the Workshop's GCash account can be saved", saved === null, saved);

  // ---- what buyers send ----
  const proof = (checkout, reference, opts = {}) =>
    fails(
      `insert into im_payment_proofs (checkout_id, buyer_id, channel, reference, amount, receipt_path, status)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [checkout, b, opts.channel ?? "gcash", reference, opts.amount ?? 350, opts.path ?? null, opts.status ?? "submitted"]
    );
  const first = await proof(r.checkout_id, "GC-1234567890", { path: `${r.checkout_id}/${UUID}.jpg` });
  check("a reference number and a receipt photo can be kept", first === null, first);
  check("a checkout has one proof waiting at a time", (await proof(r.checkout_id, "GC-5555555555")) != null);
  check("a reference number pays once per channel, in any letter case", (await proof(r2.checkout_id, "gc-1234567890")) != null);
  check("a receipt path the browser chose is refused",
    (await proof(r2.checkout_id, "LBP-0001", { channel: "lbp", path: "../pwd-ids/1/front.jpg" })) != null);
  check("a reference with other characters is refused", (await proof(r2.checkout_id, "1234; drop", { channel: "lbp" })) != null);
  check("an amount of zero is refused", (await proof(r2.checkout_id, "LBP-0002", { channel: "lbp", amount: 0 })) != null);
  const mb = await proof(r2.checkout_id, "MB-77001", { channel: "maribank" });
  check("another checkout can send its own reference", mb === null, mb);
  await runSql(`update im_payment_proofs set status = 'rejected' where reference = 'MB-77001'`);
  const again = await proof(r2.checkout_id, "MB-77001", { channel: "maribank" });
  check("a refused proof frees its reference and its checkout", again === null, again);

  // ---- Surface B ----
  const rows = async (who, role, sql) => {
    const res = await asUser(who, role, sql);
    return res.ok ? res.res.rows.length : `error: ${res.error}`;
  };
  check("the buyer's browser reads their own proofs", (await rows(B, "authenticated", `select id from im_payment_proofs`)) === 3);
  check("another buyer reads none of them", (await rows(X, "authenticated", `select id from im_payment_proofs`)) === 0);
  check("a seller reads none of them", (await rows(S, "authenticated", `select id from im_payment_proofs`)) === 0);
  check("an anonymous browser reads none of them", (await rows(null, "anon", `select id from im_payment_proofs`)) === 0);
  check("an admin reads every proof", (await rows(A, "authenticated", `select id from im_payment_proofs`)) === 3);
  const forged = await asUser(B, "authenticated",
    `insert into im_payment_proofs (checkout_id, buyer_id, channel, reference, amount) values (${r2.checkout_id}, ${b}, 'lbp', 'LBP-9999', 1)`);
  check("a browser cannot send a proof directly", !forged.ok);
  const approved = await asUser(A, "authenticated", `update im_payment_proofs set status = 'approved'`);
  check("not even an admin's browser can approve a proof directly", !approved.ok);

  check("a buyer's browser cannot read the accounts table (the server shows the active ones)",
    (await rows(B, "authenticated", `select account_number from im_payment_accounts`)) === 0);
  check("an anonymous browser cannot read it either", (await rows(null, "anon", `select account_number from im_payment_accounts`)) === 0);
  check("an admin's browser can read it", (await rows(A, "authenticated", `select channel from im_payment_accounts`)) === 1);
  const repoint = await asUser(A, "authenticated", `update im_payment_accounts set account_number = '0000 000 0000'`);
  check("no browser can change where buyers send money", !repoint.ok);

  // ---- receipt photos ----
  const [bucket] = await q(`select public, file_size_limit, array_to_string(allowed_mime_types, ',') as types
                              from storage.buckets where id = 'payment-proofs'`);
  check("payment-proofs is a private 1 MB bucket for JPEG and PNG",
    bucket && bucket.public === false && Number(bucket.file_size_limit) === 1048576 && bucket.types === "image/jpeg,image/png",
    JSON.stringify(bucket));
  await runSql(`
    create policy careless_allow_all_28 on storage.objects for all to authenticated using (true) with check (true);
    insert into storage.objects (bucket_id, name) values ('payment-proofs', '${r.checkout_id}/${UUID}.jpg');
  `);
  check("even the buyer's own browser cannot list receipt photos",
    (await rows(B, "authenticated", `select name from storage.objects where bucket_id = 'payment-proofs'`)) === 0);
  check("an anonymous browser cannot list them",
    (await rows(null, "anon", `select name from storage.objects where bucket_id = 'payment-proofs'`)) === 0);
  const up = await asUser(B, "authenticated", `insert into storage.objects (bucket_id, name) values ('payment-proofs', 'x/evil.jpg')`);
  check("a browser cannot upload into payment-proofs", !up.ok);
  await runSql(`drop policy careless_allow_all_28 on storage.objects`);

  // ---- the rest ----
  const [hold] = await q(`select value::text as v from im_settings where key = 'otc_hold_hours'`);
  check("an unpaid counter order is held 48 hours by default", hold && hold.v.replace(/"/g, "") === "48", JSON.stringify(hold));
  const defs = await q(`select proname, prosrc from pg_proc
                          where pronamespace = 'public'::regnamespace
                            and proname in ('im_transition_order', 'im_place_checkout', 'im_refresh_product_sold', 'im_pwd_weekly_usage')`);
  check("the four replaced functions treat 'otc' as paid in advance",
    defs.length === 4 && defs.every((d) => d.prosrc.includes("'otc'")), defs.map((d) => d.proname).join());
  const [p] = await q(`select
      has_function_privilege('authenticated', 'public.im_place_checkout(jsonb)', 'execute') as place,
      has_function_privilege('anon', 'public.im_transition_order(bigint, text, bigint, text, text, jsonb)', 'execute') as move,
      has_function_privilege('authenticated', 'public.im_refresh_product_sold(bigint)', 'execute') as sold,
      has_function_privilege('authenticated', 'public.im_pwd_weekly_usage(bigint)', 'execute') as pwd,
      has_function_privilege('service_role', 'public.im_place_checkout(jsonb)', 'execute') as server`);
  check("browsers still cannot call the replaced functions", !p.place && !p.move && !p.sold && !p.pwd, JSON.stringify(p));
  check("the server still can", p.server === true, JSON.stringify(p));
}
