// 0019: addresses, review moderation, notifications, banners, newsletter,
// privacy requests, contact inbox, product-media bucket.
const U = "00000000-0000-0000-0000-0000000019b1";
const V = "00000000-0000-0000-0000-0000000019b2";

export default async function ({ q, runSql, asUser, check }) {
  await runSql(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${U}','u19@test.invalid','{"name":"Uno"}'),
      ('${V}','v19@test.invalid','{"name":"Vic"}'),
      ('00000000-0000-0000-0000-0000000019a1','s19@test.invalid','{"role":"seller","name":"Seller 19"}');
  `);
  const [u] = await q(`select id from im_profiles where email='u19@test.invalid'`);
  const [v] = await q(`select id from im_profiles where email='v19@test.invalid'`);
  const [s] = await q(`select id from im_profiles where email='s19@test.invalid'`);
  const fails = async (sql) => {
    try { await runSql(sql); return null; } catch (e) { return e.message; }
  };

  // Addresses
  check("an address needs a valid PH phone",
    (await fails(`insert into im_addresses (profile_id, recipient, phone, line1, city) values (${u.id}, 'Uno', '12345', '1 Main St', 'Zamboanga')`)) != null);
  await runSql(`insert into im_addresses (profile_id, recipient, phone, line1, city, is_default) values (${u.id}, 'Uno', '09171234567', '1 Main St', 'Zamboanga', true)`);
  check("only one default address per person",
    (await fails(`insert into im_addresses (profile_id, recipient, phone, line1, city, is_default) values (${u.id}, 'Uno', '09171234567', '2 Side St', 'Zamboanga', true)`)) != null);
  const others = await asUser(V, "authenticated", `select id from im_addresses`);
  check("addresses are private to their owner", others.ok && others.res.rows.length === 0, others.error);

  // Reviews: hidden ones leave the rating and the public catalogue
  await runSql(`
    insert into im_products (id, seller_id, title, base_price, status) values (1901, ${s.id}, 'Mat', 100, 'approved');
    insert into im_product_reviews (product_id, buyer_id, rating_score, comment_text) values (1901, ${u.id}, 5, 'great'), (1901, ${v.id}, 1, 'abusive');
  `);
  const avg = async () => (await q(`select rating_avg, rating_count from im_products where id=1901`))[0];
  check("rating before moderation", Number((await avg()).rating_avg) === 3 && (await avg()).rating_count === 2);
  await runSql(`update im_product_reviews set status = 'hidden', hidden_reason = 'Abusive language' where buyer_id = ${v.id}`);
  await runSql(`select public.im_refresh_product_rating(1901)`);
  check("a hidden review leaves the rating", Number((await avg()).rating_avg) === 5 && (await avg()).rating_count === 1);
  const pub = await asUser(null, "anon", `select comment_text from im_product_reviews where product_id = 1901`);
  check("a hidden review is not public", pub.ok && pub.res.rows.length === 1 && pub.res.rows[0].comment_text === "great", pub.error);
  const mine = await asUser(V, "authenticated", `select comment_text from im_product_reviews where product_id = 1901 and buyer_id = ${v.id}`);
  check("its author still sees it", mine.ok && mine.res.rows.length === 1, mine.error);

  // Notifications
  check("new notification types are accepted",
    (await fails(`insert into im_notifications (user_id, type, title) values (${u.id}, 'pwd_verification', 'Approved')`)) == null);
  check("unknown types are still refused",
    (await fails(`insert into im_notifications (user_id, type, title) values (${u.id}, 'spam', 'x')`)) != null);

  // Banners: internal links only
  check("a banner cannot link off-site",
    (await fails(`insert into im_banners (title, alt_text, image_url, link_url) values ('Sale', 'Sale banner', 'https://x/y.jpg', 'https://evil.example/login')`)) != null);
  check("a banner can link inside the shop",
    (await fails(`insert into im_banners (title, alt_text, image_url, link_url) values ('Sale', 'Sale banner', 'https://x/y.jpg', '/search?cat=bags')`)) == null);

  // Newsletter tokens
  await runSql(`insert into im_newsletter_subscribers (email) values ('a19@test.invalid'), ('b19@test.invalid')`);
  const tok = await q(`select unsubscribe_token from im_newsletter_subscribers where email like '%19@test.invalid'`);
  check("each subscriber gets a distinct unsubscribe token",
    tok.length === 2 && tok[0].unsubscribe_token.length === 32 && tok[0].unsubscribe_token !== tok[1].unsubscribe_token);

  // Privacy requests and contact inbox
  await runSql(`insert into im_privacy_requests (profile_id, kind) values (${u.id}, 'access')`);
  const pr = await asUser(V, "authenticated", `select id from im_privacy_requests`);
  check("privacy requests are private to their owner", pr.ok && pr.res.rows.length === 0, pr.error);
  check("contact messages need a real-looking email",
    (await fails(`insert into im_contact_messages (name, email, topic, message) values ('Guest', 'not-an-email', 'question', 'Hello there')`)) != null);
  await runSql(`insert into im_contact_messages (name, email, topic, message) values ('Guest', 'g@test.invalid', 'question', 'Hello there')`);
  const inbox = await asUser(U, "authenticated", `select id from im_contact_messages`);
  check("the contact inbox is admin-only", inbox.ok && inbox.res.rows.length === 0, inbox.error);
  const anonContact = await asUser(null, "anon", `insert into im_contact_messages (name, email, topic, message) values ('X', 'x@test.invalid', 'other', 'spam spam')`);
  check("no direct contact-form inserts past the app's rate limit", !anonContact.ok, anonContact.error);

  // Public seller projection
  const ps = await asUser(null, "anon", `select id, shop_name from im_public_sellers`);
  check("the public seller view gains shop fields, still no email", ps.ok, ps.error);
  const leak = await asUser(null, "anon", `select email from im_public_sellers`);
  check("…and no email column", !leak.ok);

  // product-media bucket
  const bucket = (await q(`select public from storage.buckets where id='product-media'`))[0];
  check("product-media is a public bucket", bucket?.public === true);
  const up = await asUser(U, "authenticated", `insert into storage.objects (bucket_id, name) values ('product-media', 'x.jpg')`);
  check("clients cannot upload into product-media directly", !up.ok, up.error);
}
