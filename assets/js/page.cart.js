/* Cart page — grouped by seller (Shopee-style) */
(function () {
  'use strict';
  if (!auth.require(['buyer'])) return;

  var body    = document.getElementById('cart-body');
  var empty   = document.getElementById('cart-empty');
  var actions = document.getElementById('cart-actions');

  function render() {
    var items = cart.getItems();
    if (items.length === 0) {
      body.innerHTML = '';
      empty.hidden = false;
      actions.hidden = true;
      cart.updateBadge();
      return;
    }
    empty.hidden = true;
    actions.hidden = false;

    /* Group items by seller (via product.seller_id) */
    var groups = {};
    var subtotal = 0;
    items.forEach(function (it) {
      var p = store.findById('products', it.product_id);
      var sellerId = p ? p.seller_id : 0;
      if (!groups[sellerId]) groups[sellerId] = { seller: store.findById('users', sellerId), rows: [] };
      groups[sellerId].rows.push({ it: it, p: p });
      subtotal += it.unit_price * it.quantity;
    });

    body.innerHTML = Object.keys(groups).map(function (sid) {
      var g = groups[sid];
      var groupTotal = g.rows.reduce(function (n, r) { return n + r.it.unit_price * r.it.quantity; }, 0);
      var rowsHtml = g.rows.map(function (r) {
        var it = r.it, p = r.p;
        var v = store.findById('product_variants', it.variant_id);
        var meta = v ? (v.color_name + ' &middot; ' + v.size + ' &middot; SKU ' + ui.escapeHtml(v.sku_code)) : '';
        var stockCap = v ? v.stock_qty : it.quantity;
        return '<div class="cart-item" data-pid="' + it.product_id + '" data-vid="' + it.variant_id + '">' +
          '<div class="cart-item__thumb"><img src="' + ui.productImageSrc(p, 0) + '" alt="" /></div>' +
          '<div>' +
            '<div class="cart-item__title">' + ui.escapeHtml(p ? p.title : 'Item') + '</div>' +
            '<div class="cart-item__meta">' + meta + '</div>' +
          '</div>' +
          '<div class="cart-item__price">' + ui.money(it.unit_price) + '</div>' +
          '<div class="qty-ctrl">' +
            '<button type="button" data-act="dec" aria-label="Decrease quantity">-</button>' +
            '<input type="number" min="1" max="' + stockCap + '" value="' + it.quantity + '" aria-label="Quantity" />' +
            '<button type="button" data-act="inc" aria-label="Increase quantity">+</button>' +
          '</div>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-act="remove" aria-label="Remove item">Remove</button>' +
        '</div>';
      }).join('');

      return '<section class="cart-group" aria-label="Items from ' + ui.escapeHtml(g.seller ? g.seller.name : 'Seller') + '">' +
        '<header class="cart-group__head">' +
          '<span>' + ui.icon('box', 18) + '</span>' +
          '<strong>' + ui.escapeHtml(g.seller ? g.seller.name : 'PWD Seller') + '</strong>' +
          '<span class="badge">' + g.rows.length + ' item' + (g.rows.length > 1 ? 's' : '') + '</span>' +
        '</header>' +
        '<div class="cart-group__body">' + rowsHtml + '</div>' +
        '<footer class="cart-group__foot">Subtotal for this shop: <strong>' + ui.money(groupTotal) + '</strong></footer>' +
      '</section>';
    }).join('') +
    '<div class="cart-summary--sticky">' +
      '<span class="muted">' + items.length + ' item' + (items.length > 1 ? 's' : '') + ' in cart</span>' +
      '<span class="total">Total: ' + ui.money(subtotal) + '</span>' +
      '<a href="checkout.html" class="btn btn--danger">Checkout &rarr;</a>' +
    '</div>';

    body.querySelectorAll('.cart-item').forEach(function (row) {
      var pid = Number(row.getAttribute('data-pid'));
      var vid = Number(row.getAttribute('data-vid'));
      var input = row.querySelector('input');
      row.querySelector('[data-act="inc"]').addEventListener('click', function () {
        cart.setQuantity(pid, vid, Number(input.value) + 1);
        render();
      });
      row.querySelector('[data-act="dec"]').addEventListener('click', function () {
        cart.setQuantity(pid, vid, Number(input.value) - 1);
        render();
      });
      row.querySelector('[data-act="remove"]').addEventListener('click', function () {
        cart.removeItem(pid, vid);
        ui.toast('Item removed.', 'success');
        render();
      });
      input.addEventListener('change', function () {
        cart.setQuantity(pid, vid, Number(input.value));
        render();
      });
    });

    cart.updateBadge();
  }

  render();
})();
