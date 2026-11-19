// 0018: discount rules — legal shapes, sign-off before enabling, weekly usage.
export default async function ({ q, runSql, asUser, check }) {
  await runSql(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('00000000-0000-0000-0000-0000000018a1','ad18@test.invalid','{"name":"Admin"}'),
      ('00000000-0000-0000-0000-0000000018b1','b18@test.invalid','{"name":"Buyer"}');
    update im_profiles set role = 'admin' where email = 'ad18@test.invalid';
    insert into im_categories (id, label, folder) values ('food','Food','Food') on conflict do nothing;
  `);
  const [admin] = await q(`select id from im_profiles where email='ad18@test.invalid'`);
  const [buyer] = await q(`select id from im_profiles where email='b18@test.invalid'`);

  const tryIns = async (cols, vals) => {
    try {
      await runSql(`insert into im_discount_rules (${cols}) values (${vals})`);
      return null;
    } catch (e) {
      return e.message;
    }
  };

  check("a statutory rule must be exactly 20%",
    (await tryIns("name, rule_type, rate_percent, category_id, legal_basis", "'Stat', 'statutory_20', 15, 'food', 'RA 10754'")) != null);
  check("a BNPC rule must be 5% with a weekly purchase cap",
    (await tryIns("name, rule_type, rate_percent, category_id, legal_basis", "'BNPC', 'bnpc_5', 5, 'food', 'JMC 01-2022'")) != null);
  check("VAT exemption only on the statutory rule",
    (await tryIns("name, rule_type, rate_percent, vat_exempt, category_id, legal_basis", "'Promo', 'voluntary', 10, true, 'food', 'Promo'")) != null);
  check("a rule targets one category or one product, not both or neither",
    (await tryIns("name, rule_type, rate_percent, legal_basis", "'None', 'voluntary', 10, 'Promo'")) != null);

  const ok = await tryIns("name, rule_type, rate_percent, weekly_purchase_cap, category_id, legal_basis",
    "'BNPC food', 'bnpc_5', 5, 1300, 'food', 'DTI-DA JMC 01-2022'");
  check("a valid rule can be created", ok == null, ok);
  const [rule] = await q(`select id, enabled from im_discount_rules where name='BNPC food'`);
  check("it is created disabled", rule.enabled === false);

  let err = null;
  try { await runSql(`update im_discount_rules set enabled = true where id = ${rule.id}`); } catch (e) { err = e.message; }
  check("it cannot be enabled without a recorded legal sign-off", /signoff_before_enable/.test(err || ""), err);
  err = null;
  try {
    await runSql(`update im_discount_rules set enabled = true, legal_signoff_by = ${admin.id}, legal_signoff_at = now(),
                  legal_signoff_note = 'Atty. Reyes confirmed food items are BNPC, email of 2026-10-12' where id = ${rule.id}`);
  } catch (e) { err = e.message; }
  check("with a sign-off it can be enabled", err == null, err);

  const dup = await tryIns("name, rule_type, rate_percent, category_id, legal_basis, enabled, legal_signoff_by, legal_signoff_at, legal_signoff_note",
    `'Second', 'voluntary', 10, 'food', 'Promo', true, ${admin.id}, now(), 'second rule note'`);
  check("only one enabled rule per category", dup != null && /unique|duplicate/.test(dup), dup);

  // Weekly usage: two orders this week, one cancelled; one from last week.
  await runSql(`
    insert into im_orders (id, buyer_id, total_amount, payment_status, payment_provider) values
      (1801, ${buyer.id}, 500, 'unpaid', 'cod'), (1802, ${buyer.id}, 500, 'unpaid', 'cod'), (1803, ${buyer.id}, 500, 'unpaid', 'cod');
    insert into im_order_items (order_id, quantity, unit_price, pwd_rule_id, pwd_eligible_amount, pwd_discount_amount) values
      (1801, 1, 475, ${rule.id}, 500, 25), (1802, 1, 475, ${rule.id}, 400, 20), (1803, 1, 475, ${rule.id}, 300, 15);
    select public.im_transition_order(1802, 'cancelled', null, 'buyer', null, '{"reason":"test"}'::jsonb);
  `);
  await runSql(`select set_config('im.transition','on',false); update im_orders set created_at = now() - interval '8 days' where id = 1803; select set_config('im.transition','off',false);`);
  const usage = await q(`select rule_id, used from public.im_pwd_weekly_usage(${buyer.id})`);
  check("weekly usage counts this week's not-cancelled orders only",
    usage.length === 1 && Number(usage[0].used) === 500, JSON.stringify(usage));

  const read = await asUser("00000000-0000-0000-0000-0000000018b1", "authenticated", `select id from im_discount_rules`);
  check("buyers cannot read the rules table directly", read.ok && read.res.rows.length === 0, read.error);
  const write = await asUser("00000000-0000-0000-0000-0000000018a1", "authenticated",
    `update im_discount_rules set enabled = true where id = ${rule.id} returning id`);
  check("not even an admin JWT can switch a rule on through the API", !write.ok || write.res.rows.length === 0, write.error);
}
