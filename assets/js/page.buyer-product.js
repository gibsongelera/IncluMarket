/* Buyer product detail + variant selector + reviews */
(function () {
  'use strict';
  if (!auth.require(['buyer'])) return;

  var params = new URLSearchParams(location.search);
  var productId = Number(params.get('id'));
  var product = store.findById('products', productId);
  var detailEl = document.getElementById('product-detail');
  var reviewsEl = document.getElementById('reviews-list');

  if (!product) {
    detailEl.innerHTML = '<p class="empty">Product not found. <a href="home.html">Back to shop.</a></p>';
    reviewsEl.innerHTML = '';
    return;
  }

  document.title = product.title + ' — InkluMarket';
  document.getElementById('crumb-title').textContent = product.title;

  var variants = store.query('product_variants', function (v) { return v.product_id === productId; });
  var seller = store.findById('users', product.seller_id);

  var colors = [];
  var sizes  = [];
  variants.forEach(function (v) {
    if (colors.indexOf(v.color_name) < 0) colors.push(v.color_name);
    if (sizes.indexOf(v.size) < 0) sizes.push(v.size);
  });

  var state = {
    color: colors[0] || null,
    size:  sizes[0]  || null,
    qty:   1,
    gallery: 0
  };

  function activeVariant() {
    for (var i = 0; i < variants.length; i++) {
      if (variants[i].color_name === state.color && variants[i].size === state.size) return variants[i];
    }
    return null;
  }

  function isColorAvailable(color) {
    return variants.some(function (v) { return v.color_name === color && v.stock_qty > 0; });
  }

  function isSizeAvailableForColor(size, color) {
    var v = variants.find(function (x) { return x.color_name === color && x.size === size; });
    return !!(v && v.stock_qty > 0);
  }

  function stockNoteHtml(v) {
    if (!v) return '<p class="stock-note stock-note--out">This combination is not available.</p>';
    if (v.stock_qty <= 0) return '<p class="stock-note stock-note--out">Out of stock.</p>';
    if (v.stock_qty <= 5) return '<p class="stock-note stock-note--low">Only ' + v.stock_qty + ' left (SKU ' + ui.escapeHtml(v.sku_code) + ')</p>';
    return '<p class="stock-note stock-note--ok">' + v.stock_qty + ' in stock (SKU ' + ui.escapeHtml(v.sku_code) + ')</p>';
  }

  function galleryHtml() {
    var imgs = Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : [ui.productImageSrc(product, 0)];
    var mainSrc = imgs[state.gallery] || imgs[0];
    var thumbs = imgs.map(function (src, i) {
      return '<button type="button" class="pd__thumb ' + (i === state.gallery ? 'is-active' : '') + '" data-gi="' + i + '" aria-label="Show image ' + (i + 1) + '">' +
        '<img src="' + src + '" alt="" />' +
      '</button>';
    }).join('');
    return '<div class="pd__gallery">' +
      '<div class="pd__main"><img src="' + mainSrc + '" alt="' + ui.escapeHtml(product.title) + '" /></div>' +
      (imgs.length > 1 ? '<div class="pd__thumbs" role="tablist">' + thumbs + '</div>' : '') +
    '</div>';
  }

  function render() {
    var v = activeVariant();
    detailEl.innerHTML = '' +
      galleryHtml() +
      '<div class="pd__body">' +
        '<h1 class="pd__title">' + ui.escapeHtml(product.title) + '</h1>' +
        '<p class="muted">Sold by <strong>' + ui.escapeHtml(seller ? seller.name : 'PWD Seller') + '</strong></p>' +
        '<p class="pd__price">' + ui.money(product.base_price) + '</p>' +
        '<p class="pd__desc">' + ui.escapeHtml(product.description) + '</p>' +

        '<div class="pd__section">' +
          '<h3>Color: <span id="color-lbl">' + ui.escapeHtml(state.color || '') + '</span></h3>' +
          '<div class="variant-list" role="group" aria-label="Color">' +
            colors.map(function (c) {
              var enabled = isColorAvailable(c);
              return '<button type="button" class="variant-btn" data-color="' + ui.escapeHtml(c) + '"' +
                     ' aria-pressed="' + (state.color === c) + '"' +
                     (enabled ? '' : ' disabled aria-disabled="true"') + '>' + ui.escapeHtml(c) + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +

        '<div class="pd__section">' +
          '<h3>Size: <span id="size-lbl">' + ui.escapeHtml(state.size || '') + '</span></h3>' +
          '<div class="size-list" role="group" aria-label="Size">' +
            sizes.map(function (s) {
              var enabled = isSizeAvailableForColor(s, state.color);
              return '<button type="button" class="variant-btn" data-size="' + ui.escapeHtml(s) + '"' +
                     ' aria-pressed="' + (state.size === s) + '"' +
                     (enabled ? '' : ' disabled aria-disabled="true"') + '>' + ui.escapeHtml(s) + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +

        '<div class="pd__section" id="stock-note">' + stockNoteHtml(v) + '</div>' +

        '<div class="pd__section">' +
          '<label for="qty" class="sr-only">Quantity</label>' +
          '<div class="qty-row">' +
            '<span>Quantity:</span>' +
            '<div class="qty-ctrl">' +
              '<button type="button" aria-label="Decrease quantity" data-qty="-1">-</button>' +
              '<input id="qty" type="number" min="1" value="' + state.qty + '" />' +
              '<button type="button" aria-label="Increase quantity" data-qty="+1">+</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="pd__actions">' +
          '<button type="button" class="btn btn--primary" id="add-to-cart"' + (!v || v.stock_qty <= 0 ? ' disabled aria-disabled="true"' : '') + '>Add to cart</button>' +
          '<button type="button" class="btn btn--danger" id="buy-now"' + (!v || v.stock_qty <= 0 ? ' disabled aria-disabled="true"' : '') + '>Buy now</button>' +
          '<a href="home.html" class="btn btn--ghost">Continue shopping</a>' +
        '</div>' +
      '</div>';

    /* Wire gallery thumbs */
    detailEl.querySelectorAll('[data-gi]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.gallery = Number(b.getAttribute('data-gi'));
        render();
      });
    });
    /* Wire variant buttons */
    detailEl.querySelectorAll('[data-color]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        state.color = b.getAttribute('data-color');
        /* If current size is unavailable for this color, switch to first available */
        if (!isSizeAvailableForColor(state.size, state.color)) {
          var firstAvail = sizes.find(function (s) { return isSizeAvailableForColor(s, state.color); });
          state.size = firstAvail || state.size;
        }
        render();
      });
    });
    detailEl.querySelectorAll('[data-size]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        state.size = b.getAttribute('data-size');
        render();
      });
    });
    detailEl.querySelectorAll('[data-qty]').forEach(function (b) {
      b.addEventListener('click', function () {
        var input = detailEl.querySelector('#qty');
        var delta = Number(b.getAttribute('data-qty'));
        var next = Math.max(1, (Number(input.value) || 1) + delta);
        var vc = activeVariant();
        if (vc) next = Math.min(next, vc.stock_qty);
        input.value = next;
        state.qty = next;
      });
    });
    var qtyIn = detailEl.querySelector('#qty');
    if (qtyIn) qtyIn.addEventListener('input', function () {
      var vc = activeVariant();
      var n = Math.max(1, Number(qtyIn.value) || 1);
      if (vc) n = Math.min(n, vc.stock_qty);
      qtyIn.value = n; state.qty = n;
    });

    var addBtn = detailEl.querySelector('#add-to-cart');
    if (addBtn) addBtn.addEventListener('click', function () {
      var vc = activeVariant();
      if (!vc || vc.stock_qty <= 0) return;
      cart.addItem(product.id, vc.id, state.qty, product.base_price);
      ui.toast('Added to cart.', 'success');
    });
    var buyBtn = detailEl.querySelector('#buy-now');
    if (buyBtn) buyBtn.addEventListener('click', function () {
      var vc = activeVariant();
      if (!vc || vc.stock_qty <= 0) return;
      cart.addItem(product.id, vc.id, state.qty, product.base_price);
      location.href = 'checkout.html';
    });
  }

  function renderReviews() {
    var rs = store.query('product_reviews', function (r) { return r.product_id === productId; })
                 .sort(function (a, b) { return b.created_at.localeCompare(a.created_at); });
    if (rs.length === 0) {
      reviewsEl.innerHTML = '<p class="empty">No reviews yet.</p>';
      return;
    }
    reviewsEl.innerHTML = rs.map(function (r) {
      var buyer = store.findById('users', r.buyer_id);
      return '<article class="review">' +
        '<header><strong>' + ui.escapeHtml(buyer ? buyer.name.split(' ')[0] + ' ' + (buyer.name.split(' ')[1] || '').charAt(0) + '.' : 'Buyer') + '</strong>' +
        '<span class="muted small">' + ui.formatDate(r.created_at) + '</span></header>' +
        ui.starHtml(r.rating_score) +
        '<p>' + ui.escapeHtml(r.comment_text) + '</p>' +
      '</article>';
    }).join('');
  }

  render();
  renderReviews();
})();
