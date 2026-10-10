// 0022: accessibility preferences — complete columns, own-row read, no client writes.
export default async function ({ q, runSql, asUser, check }) {
  const A = "00000000-0000-0000-0000-0000000022a1";
  const B = "00000000-0000-0000-0000-0000000022b1";
  await runSql(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${A}','a22@test.invalid','{"name":"Buyer A"}'),
    ('${B}','b22@test.invalid','{"name":"Buyer B"}');`);
  const [a] = await q(`select id from im_profiles where email='a22@test.invalid'`);
  await runSql(`insert into im_ui_prefs (user_id, font_size_px, contrast, large_cursors, visual_alerts)
                values (${a.id}, 22, 'high', true, true)`);
  const [row] = await q(`select font_size_px, large_cursors, visual_alerts from im_ui_prefs where user_id=${a.id}`);
  check("every toolbar option has a column", row.font_size_px === 22 && row.large_cursors === true && row.visual_alerts === true, JSON.stringify(row));

  let err = null;
  try { await runSql(`update im_ui_prefs set font_size_px = 40 where user_id=${a.id}`); } catch (e) { err = e.message; }
  check("font size stays within the toolbar's 12–24 px", /check constraint|font_size_px/.test(err || ""), err);

  const own = await asUser(A, "authenticated", `select font_size_px from im_ui_prefs`);
  check("a user reads their own preferences", own.ok && own.res.rows.length === 1, own.error);
  const other = await asUser(B, "authenticated", `select font_size_px from im_ui_prefs`);
  check("…and nobody else's", other.ok && other.res.rows.length === 0, other.error);
  const write = await asUser(A, "authenticated", `update im_ui_prefs set font_size_px = 12`);
  check("clients cannot write preferences directly", !write.ok || write.res.affectedRows === 0, write.error);
}
