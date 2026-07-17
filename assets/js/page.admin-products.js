/* Admin — product verification */
(function () {
  'use strict';
  if (!auth.require(['admin'])) return;

  var tabs = document.querySelectorAll('#prod-tabs .tab');
  var filter = 'pending';
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('tab--active'); x.setAttribute('aria-selected', 'false'); });
      t.classList.add('tab--active'); t.setAttribute('aria-selected', 'true');
      filter = t.getAttribute('data-status');
      render();
    });
  });

  function categoryLabel(id) {
    var c = store.query('categories', function (x) { return x.id === id; })[0];
    return c ? c.label : (id || 'Uncategorized');
  }

  function render() {
    var list = store.getAll('products').sort(function (a, b) { return b.created_at.localeCompare(a.created_at); });
    if (filter !== 'all') list = list.filter(function (p) { return (p.status || 'pending') === filter; });

    var body = document.getElementById('verify-rows');
    var empty = document.getElementById('verify-empty');
    if (list.length === 0) { body.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;

    body.innerHTML = list.map(function (p) {
      var seller = store.findById('users', p.seller_id);
      var actions = '';
      if ((p.status || 'pending') === 'pending') {
        actions =
          '<button class="btn btn--primary btn--sm" data-approve="' + p.id + '">Approve</button> ' +
          '<button class="btn btn--danger btn--sm" data-flag="' + p.id + '">Flag</button>';
      } else if (p.status === 'flagged') {
        actions =
          '<button class="btn btn--primary btn--sm" data-approve="' + p.id + '">Approve</button> ' +
          '<button class="btn btn--ghost btn--sm" data-pend="' + p.id + '">Re-queue</button>';
      } else {
        actions =
          '<button class="btn btn--danger btn--sm" data-flag="' + p.id + '">Flag</button> ' +
          '<button class="btn btn--ghost btn--sm" data-pend="' + p.id + '">Re-queue</button>';
      }
      return '<tr>' +
        '<td>' +
          '<div class="cell-product">' +
            '<img class="cell-thumb" src="' + ui.productImageSrc(p, 0) + '" alt="" />' +
            '<div>' +
              '<strong>' + ui.escapeHtml(p.title) + '</strong>' +
              '<div class="muted small">' + ui.escapeHtml((p.description || '').slice(0, 90)) + (p.description && p.description.length > 90 ? '…' : '') + '</div>' +
              (Array.isArray(p.images) && p.images.length > 0
                ? '<div class="cell-thumb-strip">' + p.images.slice(0, 3).map(function (src) { return '<img src="' + src + '" alt="" />'; }).join('') + '</div>'
                : '<small class="muted">Illustration fallback</small>') +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td>' + ui.escapeHtml(seller ? seller.name : 'Seller') + '<br><small class="muted">' + ui.escapeHtml(ui.maskEmail(seller ? seller.email : '')) + '</small></td>' +
        '<td>' + ui.escapeHtml(categoryLabel(p.category)) + '</td>' +
        '<td>' + ui.money(p.base_price) + '</td>' +
        '<td>' + ui.pillFor(p.status || 'pending') + '</td>' +
        '<td>' + actions + '</td>' +
      '</tr>';
    }).join('');

    body.querySelectorAll('[data-approve]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-approve'));
        store.update('products', id, { status: 'approved', updated_at: new Date().toISOString() });
        store.appendAudit({ actor_id: auth.currentUser().id, actor_role: 'admin', action: 'approved_product', target: 'product:' + id });
        ui.toast('Product approved.', 'success');
        render();
      });
    });
    body.querySelectorAll('[data-flag]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-flag'));
        store.update('products', id, { status: 'flagged', updated_at: new Date().toISOString() });
        store.appendAudit({ actor_id: auth.currentUser().id, actor_role: 'admin', action: 'flagged_product', target: 'product:' + id });
        ui.toast('Product flagged.', 'warning');
        render();
      });
    });
    body.querySelectorAll('[data-pend]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-pend'));
        store.update('products', id, { status: 'pending', updated_at: new Date().toISOString() });
        store.appendAudit({ actor_id: auth.currentUser().id, actor_role: 'admin', action: 'requeued_product', target: 'product:' + id });
        ui.toast('Re-queued for review.', 'success');
        render();
      });
    });
  }

  render();
})();
