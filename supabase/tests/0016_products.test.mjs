// 0016: moderation trigger, maintained stats, storefront view, search.
export default async function ({ q, runSql, asUser, check }) {
  await runSql(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('00000000-0000-0000-0000-0000000016a1','s161@test.invalid','{"role":"seller","name":"Maria Santos"}'),
      ('00000000-0000-0000-0000-0000000016a2','s162@test.invalid','{"role":"seller","name":"Suspended Seller"}'),
      ('00000000-0000-0000-0000-0000000016b1','b161@test.invalid','{"name":"Buyer"}');
  `);
  const [s1] = await q(`select id from im_profiles where email='s161@test.invalid'`);
  const [s2] = await q(`select id from im_profiles where email='s162@test.invalid'`);
  const [b] = await q(`select id from im_profiles where email='b161@test.invalid'`);
  await runSql(`
    insert into im_categories (id, label, folder) values ('bags','Bags','Bags'), ('crafts','Crafts','Crafts') on conflict do nothing;
    insert into im_products (id, seller_id, title, description, base_price, category, status, adaptive_tags) values
      (1601, ${s1.id}, 'Bayong Market Bag', 'Handwoven buri palm bag', 500, 'bags', 'approved', '{easy_grip}'),
      (1602, ${s1.id}, 'Loom Table Runner', 'Foot-loom woven runner', 300, 'crafts', 'approved', '{}'),
      (1603, ${s1.id}, 'Pending Pouch', 'Not yet reviewed', 100, 'bags', 'pending', '{}'),
      (1604, ${s2.id}, 'Hidden Tote', 'From a suspended seller', 200, 'bags', 'approved', '{}');
    insert into im_product_variants (product_id, color_name, stock_qty, sku_code) values
      (1601, 'Natural', 5, 'BY-1'), (1601, 'Brown', 3, 'BY-2'), (1602, 'Blue', 2, 'LR-1');
    update im_profiles set account_status = 'suspended' where id = ${s2.id};
    insert into im_flash_sales (product_id, discount_percent, starts_at, ends_at)
      values (1601, 50, now() - interval '1 hour', now() + interval '1 hour');
  `);

  const p = async (id) => (await q(`select * from im_products where id=$1`, [id]))[0];

  // ---- moderation ----
  await runSql(`update im_products set title = 'Bayong Market Bag (large)' where id = 1601`);
  check("a seller-style edit of an approved listing sends it back to review (B-12)", (await p(1601)).status === "pending");
  await runSql(`update im_products set status = 'approved', moderated_at = now() where id = 1601`);
  await runSql(`update im_products set title = 'Bayong Market Bag', moderated_at = now() where id = 1601`);
  check("an admin edit (stamps moderated_at) keeps it approved", (await p(1601)).status === "approved");
  await runSql(`update im_products set stock_total = stock_total where id = 1601`);
  check("non-content updates do not re-pend", (await p(1601)).status === "approved");
  await runSql(`insert into im_product_images (product_id, url, position) values (1602, 'data:x', 0)`);
  check("changing photos re-pends an approved listing", (await p(1602)).status === "pending");
  await runSql(`update im_products set status = 'approved', moderated_at = now() where id = 1602`);

  let err = null;
  try { await runSql(`update im_products set adaptive_tags = '{teleporting}' where id = 1601`); } catch (e) { err = e.message; }
  check("only known adaptive tags are accepted", err != null, err);
  err = null;
  try { await runSql(`update im_products set status = 'archived' where id = 1603`); } catch (e) { err = e.message; }
  check("archived is a valid status (unpublish instead of delete)", err == null, err);

  // ---- stats ----
  check("stock_total is maintained from variants", (await p(1601)).stock_total === 8);
  await runSql(`update im_product_variants set stock_qty = 1 where sku_code = 'BY-2'`);
  check("stock_total follows a variant change", (await p(1601)).stock_total === 6);

  await runSql(`insert into im_product_reviews (product_id, buyer_id, rating_score) values (1601, ${b.id}, 4)`);
  check("rating_avg / rating_count follow reviews", Number((await p(1601)).rating_avg) === 4 && (await p(1601)).rating_count === 1);

  await runSql(`
    insert into im_orders (id, buyer_id, total_amount, payment_status, payment_provider) values (1650, ${b.id}, 560, 'unpaid', 'cod');
    insert into im_order_items (order_id, product_id, variant_id, quantity, unit_price)
      select 1650, 1601, id, 2, 250 from im_product_variants where sku_code = 'BY-1';
  `);
  check("sold_count counts ordered units", (await p(1601)).sold_count === 2);
  await q(`select public.im_transition_order(1650, 'cancelled', null, 'buyer', null, '{"reason":"test"}'::jsonb)`);
  check("a cancelled order stops counting as sold", (await p(1601)).sold_count === 0);

  // ---- storefront view ----
  const view = await q(`select id, effective_price, sale_percent, seller_name from im_storefront_products order by id`);
  const ids = view.map((v) => Number(v.id));
  check("view: approved, active sellers only", ids.includes(1601) && ids.includes(1602) && !ids.includes(1603) && !ids.includes(1604), JSON.stringify(ids));
  const bag = view.find((v) => Number(v.id) === 1601);
  check("view: effective price reflects the running sale", Number(bag.effective_price) === 250 && Number(bag.sale_percent) === 50);
  check("view: seller name, never contact details", bag.seller_name === "Maria Santos");
  const anon = await asUser(null, "anon", `select id from im_storefront_products`);
  check("anon can read the storefront view", anon.ok && anon.res.rows.length >= 2, anon.error);
  const leak = await asUser(null, "anon", `select email from im_storefront_products`);
  check("the view exposes no email column", !leak.ok);

  // ---- search ----
  const s = async (args) =>
    q(`select id, total_count from public.im_search_products($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, args);
  const typo = await s(["bayng", null, null, null, null, null, null, "relevance", 24, 0]);
  check("search tolerates a typo (bayng → Bayong)", typo.some((r) => Number(r.id) === 1601), JSON.stringify(typo));
  const desc = await s(["buri palm", null, null, null, null, null, null, "relevance", 24, 0]);
  check("search matches the description", desc.some((r) => Number(r.id) === 1601));
  const cheap = await s([null, null, null, 260, null, null, null, "price_asc", 24, 0]);
  check("price filter uses the sale price", cheap.some((r) => Number(r.id) === 1601) && cheap.length >= 1, JSON.stringify(cheap));
  const tags = await s([null, null, null, null, null, ["easy_grip"], null, "relevance", 24, 0]);
  check("adaptive tag filter", tags.length === 1 && Number(tags[0].id) === 1601, JSON.stringify(tags));
  const page = await s([null, null, null, null, null, null, s1.id, "price_asc", 1, 0]);
  check("pagination returns the total count", page.length === 1 && Number(page[0].total_count) === 2 && Number(page[0].id) === 1601, JSON.stringify(page));
  const sug = await q(`select id from public.im_suggest_products('runner', 6)`);
  check("suggestions", sug.length === 1 && Number(sug[0].id) === 1602, JSON.stringify(sug));
  const fn = await q(`select has_function_privilege('anon','public.im_search_products(text,text,numeric,numeric,numeric,text[],bigint,text,integer,integer)','execute') as can`);
  check("clients cannot call the search function directly", fn[0].can === false);
}
