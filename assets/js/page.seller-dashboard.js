/* Seller dashboard — KPIs, charts, recent orders */
(function () {
  'use strict';
  var session = auth.require(['seller']);
  if (!session) return;

  function sellerProducts() {
    return store.query('products', function (p) { return p.seller_id === session.user_id; });
  }

  function draw() {
    var products = sellerProducts();
    var productIds = products.map(function (p) { return p.id; });
    var allItems = store.getAll('order_items').filter(function (it) { return productIds.indexOf(it.product_id) >= 0; });
    var allOrders = store.getAll('orders');
    var ordersById = {};
    allOrders.forEach(function (o) { ordersById[o.id] = o; });
    var variants = store.getAll('product_variants');

    var now = Date.now();
    var monthAgo = now - 30 * 24 * 3600 * 1000;
    var revenue30 = 0, orders30 = new Set(), items30 = 0;
    allItems.forEach(function (it) {
      var o = ordersById[it.order_id];
      if (!o) return;
      var t = new Date(o.created_at).getTime();
      if (t >= monthAgo && ['processing', 'shipped', 'delivered'].indexOf(o.order_status) >= 0) {
        revenue30 += it.unit_price * it.quantity;
        orders30.add(o.id);
        items30 += it.quantity;
      }
    });
    var lowStock = variants.filter(function (v) {
      return productIds.indexOf(v.product_id) >= 0 && v.stock_qty > 0 && v.stock_qty <= 5;
    }).length;

    document.getElementById('kpi-revenue').textContent = ui.money(revenue30);
    document.getElementById('kpi-orders').textContent = String(orders30.size);
    document.getElementById('kpi-items').textContent = String(items30);
    document.getElementById('kpi-lowstock').textContent = String(lowStock);

    /* Sales by ISO week for the last 12 weeks */
    var weeks = 12;
    var buckets = [];
    for (var i = weeks - 1; i >= 0; i--) {
      var start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate() - i * 7 - 6);
      var end   = new Date(); end.setHours(23,59,59,999); end.setDate(end.getDate() - i * 7);
      buckets.push({ label: (weeks - i) + 'w', start: start.getTime(), end: end.getTime(), value: 0 });
    }
    allItems.forEach(function (it) {
      var o = ordersById[it.order_id];
      if (!o) return;
      if (['processing','shipped','delivered'].indexOf(o.order_status) < 0) return;
      var t = new Date(o.created_at).getTime();
      for (var b = 0; b < buckets.length; b++) {
        if (t >= buckets[b].start && t <= buckets[b].end) {
          buckets[b].value += it.unit_price * it.quantity;
          break;
        }
      }
    });
    charts.line(document.getElementById('chart-sales'), [{
      points: buckets.map(function (b) { return { label: b.label, value: b.value }; })
    }], { currency: true });

    /* Turnover: units sold per product (30d) */
    var perProduct = {};
    products.forEach(function (p) { perProduct[p.id] = { label: p.title.slice(0, 12) + (p.title.length > 12 ? '…' : ''), value: 0 }; });
    allItems.forEach(function (it) {
      var o = ordersById[it.order_id];
      if (!o) return;
      var t = new Date(o.created_at).getTime();
      if (t >= monthAgo && perProduct[it.product_id]) {
        perProduct[it.product_id].value += it.quantity;
      }
    });
    var turnover = Object.values(perProduct)
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 8);
    charts.bar(document.getElementById('chart-turnover'), turnover, { color: getComputedStyle(document.documentElement).getPropertyValue('--brand-red').trim() });

    /* Recent orders */
    var mine = [];
    allItems.forEach(function (it) {
      var o = ordersById[it.order_id];
      if (o && mine.indexOf(o) < 0) mine.push(o);
    });
    mine.sort(function (a, b) { return b.created_at.localeCompare(a.created_at); });
    var top = mine.slice(0, 8);
    document.getElementById('recent-orders').innerHTML = top.length ? '<div class="table-wrap"><table class="data-table" aria-label="Recent orders"><thead><tr><th>Order</th><th>Buyer</th><th>Placed</th><th>Total</th><th>Status</th></tr></thead><tbody>' +
      top.map(function (o) {
        var buyer = store.findById('users', o.buyer_id);
        return '<tr><td>#' + o.id + '</td><td>' + ui.escapeHtml(buyer ? buyer.name : 'Buyer') + '</td>' +
               '<td>' + ui.formatDate(o.created_at) + '</td>' +
               '<td>' + ui.money(o.total_amount) + '</td>' +
               '<td>' + ui.pillFor(o.order_status) + '</td></tr>';
      }).join('') + '</tbody></table></div>'
      : '<p class="empty">No recent orders.</p>';
  }

  draw();
  document.addEventListener('charts:redraw', draw);
})();
