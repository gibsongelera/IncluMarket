/* Seller reviews monitor */
(function () {
  'use strict';
  var session = auth.require(['seller']);
  if (!session) return;

  var myProducts = store.query('products', function (p) { return p.seller_id === session.user_id; });
  var myProdIds  = myProducts.map(function (p) { return p.id; });

  var productSel = document.getElementById('rv-product');
  myProducts.forEach(function (p) {
    var o = document.createElement('option');
    o.value = p.id; o.textContent = p.title;
    productSel.appendChild(o);
  });
  var minSel = document.getElementById('rv-min');

  function myReviews() {
    return store.getAll('product_reviews').filter(function (r) { return myProdIds.indexOf(r.product_id) >= 0; });
  }

  function render() {
    var all = myReviews();
    var f = { product: productSel.value, min: Number(minSel.value) || 0 };
    var filtered = all.filter(function (r) {
      if (f.product && String(r.product_id) !== f.product) return false;
      if (f.min && r.rating_score < f.min) return false;
      return true;
    }).sort(function (a, b) { return b.created_at.localeCompare(a.created_at); });

    var sum = all.reduce(function (n, r) { return n + r.rating_score; }, 0);
    var avg = all.length ? (sum / all.length) : 0;
    var fives = all.filter(function (r) { return r.rating_score === 5; }).length;
    document.getElementById('rv-avg').textContent   = avg.toFixed(2);
    document.getElementById('rv-count').textContent = String(all.length);
    document.getElementById('rv-five').textContent  = (all.length ? Math.round((fives / all.length) * 100) : 0) + '%';

    var feed = document.getElementById('review-feed');
    var empty = document.getElementById('reviews-empty');
    if (filtered.length === 0) {
      feed.innerHTML = ''; empty.hidden = false; return;
    }
    empty.hidden = true;
    feed.innerHTML = filtered.map(function (r) {
      var buyer   = store.findById('users', r.buyer_id);
      var product = store.findById('products', r.product_id);
      return '<article class="review">' +
        '<header>' +
          '<div><strong>' + ui.escapeHtml(buyer ? buyer.name : 'Buyer') + '</strong>' +
          ' &middot; <small class="muted">' + ui.escapeHtml(ui.maskEmail(buyer ? buyer.email : '')) + '</small></div>' +
          '<span class="muted small">' + ui.formatDate(r.created_at) + '</span>' +
        '</header>' +
        '<div class="muted small">Product: ' + ui.escapeHtml(product ? product.title : '(deleted)') + '</div>' +
        ui.starHtml(r.rating_score) +
        '<p>' + ui.escapeHtml(r.comment_text) + '</p>' +
      '</article>';
    }).join('');
  }

  productSel.addEventListener('change', render);
  minSel.addEventListener('change', render);
  render();
})();
