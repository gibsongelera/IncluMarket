// 0017: PWD verification — uniqueness, "verified", selling gate, private bucket.
const SA = "00000000-0000-0000-0000-0000000017a1";
const SB = "00000000-0000-0000-0000-0000000017a2";
const BX = "00000000-0000-0000-0000-0000000017b1";

export default async function ({ q, runSql, asUser, check }) {
  await runSql(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${SA}','sa17@test.invalid','{"role":"seller","name":"Seller Verified"}'),
      ('${SB}','sb17@test.invalid','{"role":"seller","name":"Seller New"}'),
      ('${BX}','bx17@test.invalid','{"name":"Buyer X"}');
  `);
  const [a] = await q(`select id, pwd_grace_until from im_profiles where email='sa17@test.invalid'`);
  const [b] = await q(`select id from im_profiles where email='sb17@test.invalid'`);
  const [x] = await q(`select id from im_profiles where email='bx17@test.invalid'`);
  check("a seller who signs up after 0017 gets no grace period", a.pwd_grace_until === null);

  const ins = (pid, hash, status = "submitted", extra = "") =>
    runSql(`insert into im_pwd_verifications (profile_id, id_number_hash, id_number_last4, expires_on, status ${extra ? "," + extra.split("=")[0] : ""})
            values (${pid}, '${hash}', '1234', current_date + 365, '${status}' ${extra ? "," + extra.split("=")[1] : ""})`);

  await ins(a.id, "HASH-ONE");
  let err = null;
  try { await ins(b.id, "HASH-ONE"); } catch (e) { err = e.message; }
  check("the same ID number cannot be under review on two accounts", /duplicate key|unique|another account/.test(err || ""), err);

  err = null;
  try { await ins(a.id, "HASH-OTHER"); } catch (e) { err = e.message; }
  check("one open submission per person", /duplicate key|unique/.test(err || ""), err);

  err = null;
  try { await runSql(`insert into im_pwd_verifications (profile_id, method, status) values (${x.id}, 'id_scan', 'submitted')`); } catch (e) { err = e.message; }
  check("an ID scan must carry its number and expiry", /scan_complete|check constraint/.test(err || ""), err);

  // Approve A; B's attempt with the same number still fails (approved is active).
  await runSql(`update im_pwd_verifications set status='approved', reviewed_at=now() where id_number_hash='HASH-ONE'`);
  err = null;
  try { await ins(b.id, "HASH-ONE"); } catch (e) { err = e.message; }
  check("an approved number stays bound to its account", /duplicate key|unique|another account/.test(err || ""), err);

  const verified = async (pid) => (await q(`select count(*)::int as n from im_verified_pwd where profile_id=${pid}`))[0].n === 1;
  check("approved and unexpired → verified", await verified(a.id));

  // Renewal: the owner may resubmit the same number while still verified.
  err = null;
  try { await ins(a.id, "HASH-ONE"); } catch (e) { err = e.message; }
  check("the owner can submit a renewal with the same number while verified", err === null, err);
  const [renewal] = await q(`select id from im_pwd_verifications where profile_id=${a.id} and status='submitted'`);
  const decide = async (id, decision, code = null) =>
    (await q(`select public.im_decide_pwd_verification(${id}, '${decision}', ${x.id}, ${code ? `'${code}'` : "null"}, null, 'found', 'Listed in the registry') as r`))[0].r;
  check("approving the renewal retires the old approval in the same step", (await decide(renewal.id, "approved")) === "ok");
  const rows = await q(`select status from im_pwd_verifications where profile_id=${a.id} order by id`);
  check("…leaving exactly one approval",
    rows.filter((r) => r.status === "approved").length === 1 && rows.some((r) => r.status === "expired"), JSON.stringify(rows));
  check("…and the person stays verified throughout", await verified(a.id));
  check("a decision cannot be made twice", (await decide(renewal.id, "rejected", "other")) === "not_submitted");
  const rpc = await asUser(BX, "authenticated", `select public.im_decide_pwd_verification(${renewal.id}, 'approved', ${x.id})`);
  check("clients cannot call the decision function", !rpc.ok, rpc.error);

  // Selling gate + badge.
  await runSql(`
    insert into im_products (id, seller_id, title, base_price, status) values
      (1701, ${a.id}, 'Verified seller item', 100, 'approved'),
      (1702, ${b.id}, 'Unverified seller item', 100, 'approved');
  `);
  const shelf = await q(`select id, seller_verified from im_storefront_products where id in (1701, 1702)`);
  check("only verified (or grace-period) sellers' listings go live (B-15)",
    shelf.length === 1 && Number(shelf[0].id) === 1701 && shelf[0].seller_verified === true, JSON.stringify(shelf));
  check("im_seller_can_sell agrees", (await q(`select public.im_seller_can_sell(${b.id}) as ok`))[0].ok === false);
  await runSql(`update im_profiles set pwd_grace_until = now() + interval '30 days' where id = ${b.id}`);
  check("an existing seller in their grace period can still sell, without the badge",
    (await q(`select seller_verified from im_storefront_products where id=1702`))[0]?.seller_verified === false);

  // Expiry and revocation take effect immediately — no job needed.
  await runSql(`update im_pwd_verifications set expires_on = current_date - 1 where profile_id=${a.id}`);
  check("an expired ID is no longer verified", !(await verified(a.id)));
  await runSql(`update im_pwd_verifications set expires_on = current_date + 365, status='revoked' where profile_id=${a.id}`);
  check("a revoked verification is no longer verified", !(await verified(a.id)));
  check("…and its seller's listings leave the shop at once",
    (await q(`select count(*)::int as n from im_storefront_products where id=1701`))[0].n === 0);
  await ins(b.id, "HASH-ONE");
  check("a revoked number can be used again by its rightful owner after review", true);

  // Rejection needs a reason, and wipes the full number either way.
  const [bRow] = await q(`select id from im_pwd_verifications where profile_id=${b.id} and status='submitted'`);
  await runSql(`update im_pwd_verifications set id_number_encrypted='v1.sealed' where id=${bRow.id}`);
  check("a rejection without a reason is refused", (await decide(bRow.id, "rejected")) === "reason_required");
  check("a rejection with a reason is recorded", (await decide(bRow.id, "rejected", "unreadable")) === "ok");
  const [bAfter] = await q(`select status, reason_code, id_number_encrypted, registry_result from im_pwd_verifications where id=${bRow.id}`);
  check("…and the full number is wiped at the decision",
    bAfter.status === "rejected" && bAfter.reason_code === "unreadable" && bAfter.id_number_encrypted === null && bAfter.registry_result === "found",
    JSON.stringify(bAfter));
  await runSql(`insert into im_pwd_verifications (profile_id, id_number_hash, id_number_last4, expires_on, status)
                values (${b.id}, 'HASH-OLD', '9999', current_date - 3, 'submitted')`);
  const [old] = await q(`select id from im_pwd_verifications where id_number_hash='HASH-OLD'`);
  check("an ID that expired while waiting cannot be approved", (await decide(old.id, "approved")) === "expired_id");

  // Client access.
  const own = await asUser(BX, "authenticated", `select id from im_pwd_verifications`);
  check("a user sees only their own verification rows", own.ok && own.res.rows.length === 0, own.error);
  const write = await asUser(BX, "authenticated", `insert into im_pwd_verifications (profile_id, method, status) values (${x.id}, 'avrc_in_person', 'approved') returning id`);
  check("nobody can approve themselves through the API", !write.ok, write.error);
  const view = await asUser(BX, "authenticated", `select * from im_verified_pwd`);
  check("the verified view is not readable by clients", !view.ok, view.error);

  // Private bucket, even next to a careless permissive policy from another app.
  await runSql(`
    insert into storage.buckets (id, name, public) values ('public-media', 'public-media', true) on conflict do nothing;
    create policy careless_allow_all on storage.objects for all to authenticated using (true) with check (true);
    insert into storage.objects (bucket_id, name) values ('pwd-ids', '${a.id}/front.jpg');
  `);
  const bucket = (await q(`select public, file_size_limit from storage.buckets where id='pwd-ids'`))[0];
  check("pwd-ids is private with a 2 MB limit", bucket.public === false && Number(bucket.file_size_limit) === 2097152);
  const read = await asUser(BX, "authenticated", `select name from storage.objects where bucket_id='pwd-ids'`);
  check("a signed-in user cannot list or read ID images", read.ok && read.res.rows.length === 0, read.error);
  const anonRead = await asUser(null, "anon", `select name from storage.objects where bucket_id='pwd-ids'`);
  check("anon cannot read ID images", !anonRead.ok || anonRead.res.rows.length === 0, anonRead.error);
  const up = await asUser(BX, "authenticated", `insert into storage.objects (bucket_id, name) values ('pwd-ids', 'x/evil.jpg')`);
  check("nobody can upload into pwd-ids directly", !up.ok, up.error);
  const other = await asUser(BX, "authenticated", `insert into storage.objects (bucket_id, name) values ('public-media', 'ok.jpg')`);
  check("the restrictive rule touches only pwd-ids", other.ok, other.error);
  await runSql(`drop policy careless_allow_all on storage.objects`);
}
