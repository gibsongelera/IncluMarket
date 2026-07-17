/* Buyer orders + review modal */
(function () {
  'use strict';
  var session = auth.require(['buyer']);
  if (!session) return;

  var listEl  = document.getElementById('orders-list');
  var emptyEl = document.getElementById('orders-empty');
  var tabs    = document.querySelectorAll('#order-tabs .tab');
  var filter  = 'all';

  var modal    = document.getElementById('review-modal');
  var reviewForm = document.getElementById('review-form');
  var starHost   = document.getElementById('review-rating');
  var starCtrl   = ui.starInput(starHost, 5, function () {});

  function render() {
    var orders = store.query('orders', function (o) { return o.buyer_id === session.user_id; })
                      .sort(function (a, b) { return b.created_at.localeCompare(a.created_at); });
    if (filter !== 'all') orders = orders.filter(function (o) { return o.order_status === filter; });

    if (orders.length === 0) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    listEl.innerHTML = orders.map(function (o) {
      var items = store.query('order_items', function (x) { return x.order_id === o.id; });
      var lines = items.map(function (it) {
        var p = store.findById('products', it.product_id);
        var v = store.findById('product_variants', it.variant_id);
        var already = !!store.query('product_reviews', function (r) { return r.product_id === it.product_id && r.buyer_id === session.user_id; })[0];
        return '<div class="order-card__line">' +
          '<div class="order-card__thumb"><img src="' + ui.productImageSrc(p, 0) + '" alt="" /></div>' +
          '<div>' +
            '<strong>' + ui.escapeHtml(p ? p.title : 'Item') + '</strong>' +
            (v ? '<div class="muted small">' + ui.escapeHtml(v.color_name) + ' &middot; ' + ui.escapeHtml(v.size) + '</div>' : '') +
            '<div class="muted small">Qty ' + it.quantity + ' &middot; ' + ui.money(it.unit_price) + '</div>' +
          '</div>' +
          '<div>' + ui.money(it.quantity * it.unit_price) + '</div>' +
          '<div>' + (o.order_status === 'delivered'
            ? (already ? '<span class="badge badge--success">Reviewed</span>' :
                '<button class="btn btn--ghost btn--sm" data-review="' + it.product_id + '" data-order="' + o.id + '">Write review</button>')
            : '') + '</div>' +
        '</div>';
      }).join('');

      return '<article class="order-card">' +
        '<header class="order-card__head">' +
          '<div>' +
            '<strong>Order #' + o.id + '</strong> &middot; ' +
            '<span class="muted small">' + ui.formatDateTime(o.created_at) + '</span>' +
          '</div>' +
          '<div>' + ui.pillFor(o.order_status) + '</div>' +
        '</header>' +
        '<div class="order-card__body">' + lines + '</div>' +
        '<div class="order-card__foot"><strong>Total: ' + ui.money(o.total_amount) + '</strong></div>' +
      '</article>';
    }).join('');

    listEl.querySelectorAll('[data-review]').forEach(function (b) {
      b.addEventListener('click', function () {
        openReviewModal(Number(b.getAttribute('data-review')), Number(b.getAttribute('data-order')));
      });
    });
  }

  function openReviewModal(productId, orderId) {
    reviewForm.querySelector('input[name="product_id"]').value = productId;
    reviewForm.querySelector('input[name="order_id"]').value = orderId;
    reviewForm.querySelector('#review-comment').value = '';
    starCtrl.setValue(5);
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
  }

  reviewForm.addEventListener('submit', function () {
    /* handled via dialog's default; capture below */
  });
  reviewForm.addEventListener('close', function () {});

  document.getElementById('review-submit').addEventListener('click', function (e) {
    e.preventDefault();
    var pid = Number(reviewForm.querySelector('input[name="product_id"]').value);
    var oid = Number(reviewForm.querySelector('input[name="order_id"]').value);
    var comment = reviewForm.querySelector('#review-comment').value.trim();
    var score = starCtrl.getValue();
    if (!comment) { ui.toast('Please write a comment.', 'warning'); return; }
    try {
      store.insert('product_reviews', {
        product_id: pid,
        buyer_id: session.user_id,
        rating_score: score,
        comment_text: comment,
        created_at: new Date().toISOString()
      });
      store.appendAudit({
        actor_id: session.user_id, actor_role: 'buyer',
        action: 'left_review', target: 'product:' + pid + '/order:' + oid
      });
      ui.toast('Review submitted. Thank you!', 'success');
      modal.close();
      render();
    } catch (err) {
      ui.toast(err.message, 'error');
    }
  });

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('tab--active'); x.setAttribute('aria-selected', 'false'); });
      t.classList.add('tab--active'); t.setAttribute('aria-selected', 'true');
      filter = t.getAttribute('data-status');
      render();
    });
  });

  render();
})();
