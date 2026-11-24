// 0026: photos in buyer–seller messages, in a private bucket.
const B = "00000000-0000-0000-0000-0000000026b1";
const S = "00000000-0000-0000-0000-0000000026a1";
const X = "00000000-0000-0000-0000-0000000026c1";
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

export default async function ({ q, runSql, asUser, check }) {
  await runSql(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${B}','b26@test.invalid','{"name":"Buyer 26"}'),
      ('${S}','s26@test.invalid','{"name":"Seller 26"}'),
      ('${X}','x26@test.invalid','{"name":"Outsider 26"}');
    update im_profiles set role = 'seller' where email = 's26@test.invalid';
  `);
  const [b] = await q(`select id from im_profiles where email='b26@test.invalid'`);
  const [s] = await q(`select id from im_profiles where email='s26@test.invalid'`);
  const [c] = await q(`insert into im_conversations (buyer_id, seller_id) values (${b.id}, ${s.id}) returning id`);
  const fails = async (sql) => {
    try { await runSql(sql); return null; } catch (e) { return e.message; }
  };

  const okPhoto = await fails(`insert into im_messages (conversation_id, sender_id, sender_role, image_path, image_alt)
    values (${c.id}, ${b.id}, 'buyer', '${c.id}/${UUID}.jpg', 'A torn strap on the bag')`);
  check("a message can be a photo with no text", okPhoto === null, okPhoto);
  check("an empty message with no photo is refused",
    (await fails(`insert into im_messages (conversation_id, sender_id, sender_role, body) values (${c.id}, ${b.id}, 'buyer', '   ')`)) != null);
  check("a photo path a browser chose is refused",
    (await fails(`insert into im_messages (conversation_id, sender_id, sender_role, image_path)
      values (${c.id}, ${b.id}, 'buyer', '../pwd-ids/1/front.jpg')`)) != null);
  check("a description over 300 characters is refused",
    (await fails(`insert into im_messages (conversation_id, sender_id, sender_role, image_path, image_alt)
      values (${c.id}, ${b.id}, 'buyer', '${c.id}/${UUID}.png', repeat('x', 301))`)) != null);
  check("text messages still work",
    (await fails(`insert into im_messages (conversation_id, sender_id, sender_role, body) values (${c.id}, ${s.id}, 'seller', 'Thanks!')`)) === null);

  const [bucket] = await q(`select public, file_size_limit from storage.buckets where id = 'message-media'`);
  check("message-media is a private 1 MB bucket", bucket && bucket.public === false && Number(bucket.file_size_limit) === 1048576,
    JSON.stringify(bucket));

  // Even with a careless permissive policy in place, the client roles cannot
  // touch the bucket: the restrictive deny wins.
  await runSql(`
    insert into storage.buckets (id, name, public) values ('open26', 'open26', true) on conflict do nothing;
    create policy careless_allow_all_26 on storage.objects for all to authenticated using (true) with check (true);
    insert into storage.objects (bucket_id, name) values ('message-media', '${c.id}/${UUID}.jpg');
  `);
  const read = await asUser(B, "authenticated", `select name from storage.objects where bucket_id = 'message-media'`);
  check("a signed-in browser cannot list message photos", read.ok && read.res.rows.length === 0, read.error);
  const anon = await asUser(null, "anon", `select name from storage.objects where bucket_id = 'message-media'`);
  check("an anonymous browser cannot list message photos", anon.ok && anon.res.rows.length === 0, anon.error);
  const up = await asUser(B, "authenticated", `insert into storage.objects (bucket_id, name) values ('message-media', 'x/evil.jpg')`);
  check("a browser cannot upload into message-media", !up.ok);
  const other = await asUser(B, "authenticated", `insert into storage.objects (bucket_id, name) values ('open26', 'ok.jpg')`);
  check("the deny is scoped to message-media", other.ok, other.error);
  await runSql(`drop policy careless_allow_all_26 on storage.objects`);

  // The 0006 read rule still scopes the rows (and their paths) to the two people.
  const outsider = await asUser(X, "authenticated", `select id from im_messages where conversation_id = ${c.id}`);
  check("someone outside the conversation sees none of its messages", outsider.ok && outsider.res.rows.length === 0, outsider.error);
  const own = await asUser(B, "authenticated", `select image_path from im_messages where conversation_id = ${c.id} and image_path is not null`);
  check("the buyer in the conversation can read its photo row", own.ok && own.res.rows.length === 1, own.error);
  const write = await asUser(B, "authenticated", `insert into im_messages (conversation_id, sender_id, sender_role, body) values (${c.id}, ${b.id}, 'buyer', 'direct')`);
  check("browsers still cannot write messages directly (0013)", !write.ok);
}
