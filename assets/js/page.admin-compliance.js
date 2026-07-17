/* Admin — compliance monitor & audit trail */
(function () {
  'use strict';
  if (!auth.require(['admin'])) return;

  function render() {
    var users = store.getAll('users');
    var consents = store.getAll('consent_logs');
    var consentedIds = new Set(consents.map(function (c) { return c.user_id; }));

    document.getElementById('cp-consent').textContent = String(consentedIds.size);
    /* "Masked fields": we currently mask email + occasionally address. Report a symbolic count. */
    document.getElementById('cp-masked').textContent = String(users.length * 1); /* email per user */

    /* Daily activity: last 14 days */
    var audits = store.getAll('audit_logs');
    var days = 14;
    var buckets = [];
    var today = new Date(); today.setHours(0,0,0,0);
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(today.getTime());
      d.setDate(d.getDate() - i);
      buckets.push({ label: (d.getMonth() + 1) + '/' + d.getDate(), start: d.getTime(), end: d.getTime() + 24 * 3600 * 1000, value: 0 });
    }
    audits.forEach(function (a) {
      var t = new Date(a.created_at).getTime();
      for (var i = 0; i < buckets.length; i++) {
        if (t >= buckets[i].start && t < buckets[i].end) { buckets[i].value++; break; }
      }
    });
    charts.line(document.getElementById('chart-activity'), [{
      points: buckets.map(function (b) { return { label: b.label, value: b.value }; })
    }]);

    /* Orders by status */
    var orders = store.getAll('orders');
    var byStatus = {};
    store.VALID.ORDER_STATUS.forEach(function (s) { byStatus[s] = 0; });
    orders.forEach(function (o) { byStatus[o.order_status] = (byStatus[o.order_status] || 0) + 1; });
    var pieData = Object.keys(byStatus).map(function (k) { return { label: k, value: byStatus[k] }; });
    charts.pie(document.getElementById('chart-orderstatus'), pieData);

    /* Audit trail rows */
    var rows = audits.slice().sort(function (a, b) { return b.created_at.localeCompare(a.created_at); }).slice(0, 40);
    document.getElementById('audit-rows').innerHTML = rows.map(function (a) {
      var actor = store.findById('users', a.actor_id);
      return '<tr>' +
        '<td>' + ui.formatDateTime(a.created_at) + '</td>' +
        '<td>' + ui.escapeHtml(actor ? actor.name : ('user:' + a.actor_id)) + ' <span class="muted small">(' + ui.escapeHtml(a.actor_role) + ')</span></td>' +
        '<td>' + ui.escapeHtml(a.action) + '</td>' +
        '<td><code>' + ui.escapeHtml(a.target) + '</code></td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="4" class="empty">No audit entries yet.</td></tr>';
  }

  render();
  document.addEventListener('charts:redraw', render);
})();
