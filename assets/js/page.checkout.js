/* Checkout page */
(function () {
  'use strict';
  var session = auth.require(['buyer']);
  if (!session) return;

  var items = cart.getItems();
  if (items.length === 0) {
    location.href = 'cart.html';
    return;
  }

  var user = auth.currentUser();
  var nameEl = document.getElementById('ck-name');
  if (user && !nameEl.value) nameEl.value = user.name;

  var itemsEl = document.getElementById('checkout-items');
  var subEl = document.getElementById('ck-subtotal');
  var shipEl = document.getElementById('ck-shipping');
  var totalEl = document.getElementById('ck-total');

  var shipping = 60;

  function renderSummary() {
    var sub = 0;
    itemsEl.innerHTML = items.map(function (it) {
      var p = store.findById('products', it.product_id);
      var v = store.findById('product_variants', it.variant_id);
      var line = it.unit_price * it.quantity;
      sub += line;
      return '<div style="display:flex;justify-content:space-between;gap:.5rem;padding:.5rem 0;border-bottom:1px solid var(--border);align-items:center;">' +
        '<img src="' + ui.productImageSrc(p, 0) + '" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex-shrink:0;" />' +
        '<div style="flex:1;">' + ui.escapeHtml(p ? p.title : 'Item') + ' <small class="muted">x' + it.quantity + '</small>' +
        (v ? '<div class="muted small">' + ui.escapeHtml(v.color_name) + ' &middot; ' + ui.escapeHtml(v.size) + '</div>' : '') +
        '</div>' +
        '<div style="font-weight:700;">' + ui.money(line) + '</div>' +
      '</div>';
    }).join('');
    subEl.textContent = ui.money(sub);
    shipEl.textContent = ui.money(shipping);
    totalEl.textContent = ui.money(sub + shipping);
  }
  renderSummary();

  document.getElementById('checkout-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    if (!form.checkValidity()) { form.reportValidity(); return; }

    var sub = items.reduce(function (n, it) { return n + it.unit_price * it.quantity; }, 0);
    var total = sub + shipping;

    /* Insert order */
    var order = store.insert('orders', {
      buyer_id: session.user_id,
      total_amount: total,
      order_status: 'pending',
      created_at: new Date().toISOString()
    });
    /* Insert items + decrement stock */
    items.forEach(function (it) {
      store.insert('order_items', {
        order_id: order.id,
        product_id: it.product_id,
        variant_id: it.variant_id,
        quantity: it.quantity,
        unit_price: it.unit_price
      });
      var v = store.findById('product_variants', it.variant_id);
      if (v) {
        var remaining = Math.max(0, v.stock_qty - it.quantity);
        store.update('product_variants', v.id, { stock_qty: remaining });
      }
    });
    store.appendAudit({
      actor_id: session.user_id, actor_role: 'buyer',
      action: 'placed_order', target: 'order:' + order.id
    });

    cart.clear();
    ui.toast('Order ' + order.id + ' placed. Thank you!', 'success');
    setTimeout(function () { location.href = 'orders.html'; }, 500);
  });
})();
