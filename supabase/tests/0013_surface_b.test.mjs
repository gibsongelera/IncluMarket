// Surface B: what a signed-in user / anonymous caller can do with the
// publishable key, after migrations. Run with MIGRATE_UP_TO=0012 to see the
// exploits succeed before 0013.
const BUYER = "00000000-0000-0000-0000-000000000001";
const SELLER = "00000000-0000-0000-0000-000000000002";
const OTHER = "00000000-0000-0000-0000-000000000003";

export default async function ({ q, runSql, asUser, check }) {
  await runSql(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${BUYER}',  'buyer@test.invalid',  '{"role":"buyer","name":"Bea Buyer"}'),
      ('${SELLER}', 'seller@test.invalid', '{"role":"seller","name":"Sam Seller"}'),
      ('${OTHER}',  'other@test.invalid',  '{"role":"admin","name":"Would-be Admin"}');
  `);
  const prof = await q(`select id, role, auth_user_id from im_profiles order by id`);
  const buyer = prof.find((p) => p.auth_user_id === BUYER);
  const seller = prof.find((p) => p.auth_user_id === SELLER);
  const other = prof.find((p) => p.auth_user_id === OTHER);
  check("signup cannot mint an admin (0009 regression)", other?.role === "buyer", `role=${other?.role}`);

  await runSql(`
    insert into im_categories (id, label, folder) values ('bags','Bags','Bags') on conflict do nothing;
    insert into im_products (id, seller_id, title, base_price, category, status)
      values (100, ${seller.id}, 'Tote', 899, 'bags', 'pending'),
             (101, ${seller.id}, 'Sling', 650, 'bags', 'approved');
    insert into im_product_variants (id, product_id, color_name, stock_qty, sku_code)
      values (1000, 100, 'Natural', 5, 'T-1'), (1010, 101, 'Brown', 5, 'S-1');
    insert into im_orders (id, buyer_id, total_amount, order_status, payment_status, payment_provider)
      values (500, ${buyer.id}, 959, 'pending', 'pending', 'paymongo'),
             (501, ${other.id}, 100, 'pending', 'unpaid', 'cod');
    insert into im_order_items (id, order_id, product_id, variant_id, quantity, unit_price)
      values (900, 500, 101, 1010, 1, 899);
  `);

  // The unfiltered form is the one that worked before 0013 (the filtered one
  // hit the policy recursion).
  const pay = await asUser(BUYER, "authenticated", `update im_orders set payment_status='paid', total_amount=1`);
  const after = (await q(`select payment_status, total_amount from im_orders where id=500`))[0];
  check("buyer cannot mark own order paid, even unfiltered (N-03)", after.payment_status === "pending" && Number(after.total_amount) === 959, pay.error || JSON.stringify(after));

  const seller_reads = await asUser(SELLER, "authenticated", `select id from im_orders`);
  check("seller reads orders containing their products (no recursion)", seller_reads.ok && seller_reads.res.rows.length === 1, seller_reads.error);
  const history = await asUser(BUYER, "authenticated", `select id from im_order_status_history`);
  check("order history read works (no recursion)", history.ok, history.error);

  const price = await asUser(BUYER, "authenticated", `update im_order_items set unit_price=1 where id=900 returning id`);
  check("buyer cannot rewrite a line price (N-03)", !price.ok || price.res.rows.length === 0, price.error);

  const approve = await asUser(SELLER, "authenticated", `update im_products set status='approved', is_featured=true where id=100 returning id`);
  check("seller cannot self-approve or self-feature (N-04)", !approve.ok || approve.res.rows.length === 0, approve.error);

  const review = await asUser(OTHER, "authenticated", `insert into im_product_reviews (product_id, buyer_id, rating_score, comment_text) values (101, ${other.id}, 5, 'x') returning id`);
  check("no direct review inserts (N-05)", !review.ok, review.error);

  const news = await asUser(null, "anon", `insert into im_newsletter_subscribers (email) values ('spam@test.invalid') returning id`);
  check("anon cannot bypass the newsletter rate limit (N-05)", !news.ok, news.error);

  const payout = await asUser(SELLER, "authenticated", `insert into im_payouts (seller_id, amount, method, account_number) values (${seller.id}, 99999, 'gcash', '0917') returning id`);
  check("seller cannot insert a payout row directly (N-05)", !payout.ok, payout.error);

  const cart = await asUser(BUYER, "authenticated", `insert into im_cart_items (user_id, product_id, variant_id, quantity) values (${buyer.id}, 100, 1000, 1) returning id`);
  check("no direct cart inserts (pending product via PostgREST)", !cart.ok, cart.error);

  // Reads that must keep working.
  const ownOrder = await asUser(BUYER, "authenticated", `select id from im_orders`);
  check("buyer still reads own orders only", ownOrder.ok && ownOrder.res.rows.length === 1 && ownOrder.res.rows[0].id === 500, ownOrder.error || JSON.stringify(ownOrder.res?.rows));

  const catalog = await asUser(null, "anon", `select id from im_products`);
  const ids = (catalog.res?.rows ?? []).map((r) => r.id);
  check("anon reads only approved products", catalog.ok && ids.includes(101) && !ids.includes(100), catalog.error || JSON.stringify(ids));

  const ownCart = await asUser(BUYER, "authenticated", `select id from im_cart_items`);
  check("cart is still readable by its owner", ownCart.ok, ownCart.error);
}
