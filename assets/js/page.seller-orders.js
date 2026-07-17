/* Seller order fulfillment */
(function () {
  'use strict';
  var session = auth.require(['seller']);
  if (!session) return;

  var NEXT = { pending: 'processing', processing: 'shipped', shipped: 'delivered' };
  var tabs = document.querySelectorAll('#order-tabs .tab');
  var filter = 'all';

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('tab--active'); x.setAttribute('aria-selected', 'false'); });
      t.classList.add('tab--active'); t.setAttribute('aria-selected', 'true');
      filter = t.getAttribute('data-status');
      render();
    });
  });

  function sellerOrders() {
    var myProdIds = store.query('products', function (p) { return p.seller_id === session.user_id; }).map(function (p) { return p.id; });
    var itemsForMe = store.getAll('order_items').filter(function (it) { return myProdIds.indexOf(it.product_id) >= 0; });
    var orderIdSet = new Set(itemsForMe.map(function (it) { return it.order_id; }));
    return store.getAll('orders').filter(function (o) { return orderIdSet.has(o.id); })
                .sort(function (a, b) { return b.created_at.localeCompare(a.created_at); });
  }

  function render() {
    var orders = sellerOrders();
    if (filter !== 'all') orders = orders.filter(function (o) { return o.order_status === filter; });

    var body = document.getElementById('order-rows');
    var empty = document.getElementById('orders-empty');
    if (orders.length === 0) { body.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;

    body.innerHTML = orders.map(function (o) {
      var buyer = store.findById('users', o.buyer_id);
      var items = store.query('order_items', function (it) { return it.order_id === o.id; });
      var lines = items.map(function (it) {
        var p = store.findById('products', it.product_id);
        var v = store.findById('product_variants', it.variant_id);
        return (p ? ui.escapeHtml(p.title) : 'Item') + ' <small class="muted">x' + it.quantity +
               (v ? ' &middot; ' + ui.escapeHtml(v.color_name) + '/' + ui.escapeHtml(v.size) : '') + '</small>';
      }).join('<br>');
      var next = NEXT[o.order_status];
      var advBtn = next
        ? '<button class="btn btn--primary btn--sm" data-adv="' + o.id + '">Mark ' + next + '</button>'
        : (o.order_status === 'delivered' ? '<span class="muted small">Complete</span>' : '<span class="muted small">Closed</span>');
      var returnBtn = (o.order_status === 'delivered')
        ? ' <button class="btn btn--ghost btn--sm" data-return="' + o.id + '">Mark returned</button>' : '';
      return '<tr>' +
        '<td><strong>#' + o.id + '</strong><br><small class="muted">' + ui.formatDate(o.created_at) + '</small></td>' +
        '<td>' + ui.escapeHtml(buyer ? buyer.name : 'Buyer') + '<br><small class="muted">' + ui.escapeHtml(ui.maskEmail(buyer ? buyer.email : '')) + '</small></td>' +
        '<td>' + lines + '</td>' +
        '<td>' + ui.money(o.total_amount) + '</td>' +
        '<td>' + ui.pillFor(o.order_status) + '</td>' +
        '<td>' + advBtn + returnBtn + '</td>' +
      '</tr>';
    }).join('');

    body.querySelectorAll('[data-adv]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-adv'));
        var o = store.findById('orders', id);
        var next = NEXT[o.order_status];
        if (!next) return;
        store.update('orders', id, { order_status: next });
        store.appendAudit({ actor_id: session.user_id, actor_role: 'seller', action: 'advanced_order_to_' + next, target: 'order:' + id });
        ui.toast('Order #' + id + ' → ' + next, 'success');
        render();
      });
    });
    body.querySelectorAll('[data-return]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-return'));
        if (!confirm('Mark this order as returned?')) return;
        store.update('orders', id, { order_status: 'returned' });
        store.appendAudit({ actor_id: session.user_id, actor_role: 'seller', action: 'marked_returned', target: 'order:' + id });
        ui.toast('Order #' + id + ' marked returned.', 'warning');
        render();
      });
    });
  }

  render();
})();
