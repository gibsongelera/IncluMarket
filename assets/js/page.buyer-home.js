/* Buyer home — product discovery grid + filters */
(function () {
  'use strict';
  if (!auth.require(['buyer'])) return;

  var products = store.getAll('products').filter(function (p) { return p.status === 'approved'; });
  var variants = store.getAll('product_variants');
  var reviews  = store.getAll('product_reviews');
  var categories = store.getAll('categories');

  var byProductStock = {};
  var byProductRating = {};
  variants.forEach(function (v) {
    byProductStock[v.product_id] = (byProductStock[v.product_id] || 0) + v.stock_qty;
  });
  var ratingSum = {}, ratingCount = {};
  reviews.forEach(function (r) {
    ratingSum[r.product_id] = (ratingSum[r.product_id] || 0) + r.rating_score;
    ratingCount[r.product_id] = (ratingCount[r.product_id] || 0) + 1;
  });
  Object.keys(ratingSum).forEach(function (pid) {
    byProductRating[pid] = ratingSum[pid] / ratingCount[pid];
  });

  var params = new URLSearchParams(location.search);
  var state = {
    q: params.get('q') || '',
    category: params.get('cat') || '',
    min: '',
    max: '',
    rating: 0
  };

  var catSel = document.getElementById('filter-category');
  categories.forEach(function (c) {
    var opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.label;
    if (state.category === c.id) opt.selected = true;
    catSel.appendChild(opt);
  });

  var CAT_ICONS = {
    bags: '👜', apparel: '🧣', crafts: '🧺', food: '🥭',
    accessories: '💎', wellness: '🕯️', services: '🎨'
  };
  var chipsEl = document.getElementById('category-chips');
  if (chipsEl) {
    var chipHtml = '<button type="button" class="category-chip ' + (state.category === '' ? 'is-active' : '') + '" data-cat="" aria-pressed="' + (state.category === '') + '">' +
      '<span class="chip-emoji" aria-hidden="true">🛍️</span> All folders' +
      '<span class="chip-count">' + products.length + '</span>' +
    '</button>';
    categories.forEach(function (c) {
      var count = products.filter(function (p) { return p.category === c.id; }).length;
      var active = state.category === c.id;
      var folder = c.folder || c.label;
      chipHtml += '<button type="button" class="category-chip ' + (active ? 'is-active' : '') + '" data-cat="' + c.id + '" aria-pressed="' + active + '" title="Open ' + ui.escapeHtml(folder) + ' folder">' +
        '<span class="chip-emoji" aria-hidden="true">' + (CAT_ICONS[c.id] || '📦') + '</span> ' +
        ui.escapeHtml(folder) +
        '<span class="chip-count">' + count + '</span>' +
      '</button>';
    });
    chipsEl.innerHTML = chipHtml;
    chipsEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]');
      if (!b) return;
      var val = b.getAttribute('data-cat');
      catSel.value = val;
      chipsEl.querySelectorAll('.category-chip').forEach(function (x) {
        var active = x.getAttribute('data-cat') === val;
        x.classList.toggle('is-active', active);
        x.setAttribute('aria-pressed', String(active));
      });
      render();
      document.getElementById('product-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  var searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = state.q;

  function currentFilters() {
    return {
      q: (document.getElementById('search-input') && document.getElementById('search-input').value || '').trim().toLowerCase(),
      category: catSel.value,
      min: Number(document.getElementById('filter-min').value) || 0,
      max: Number(document.getElementById('filter-max').value) || Infinity,
      rating: Number((document.querySelector('input[name="rating"]:checked') || {}).value || 0)
    };
  }

  function render() {
    var f = currentFilters();
    var results = products.filter(function (p) {
      if (f.q && p.title.toLowerCase().indexOf(f.q) < 0 && (p.description || '').toLowerCase().indexOf(f.q) < 0) return false;
      if (f.category && p.category !== f.category) return false;
      if (p.base_price < f.min || p.base_price > f.max) return false;
      if (f.rating && (byProductRating[p.id] || 0) < f.rating) return false;
      return true;
    });

    var grid = document.getElementById('product-grid');
    var empty = document.getElementById('empty-state');
    document.getElementById('result-count').textContent = results.length + ' result' + (results.length === 1 ? '' : 's');

    if (results.length === 0) {
      grid.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    grid.innerHTML = results.map(cardHtml).join('');
  }

  function categoryLabel(id) {
    var c = categories.filter(function (x) { return x.id === id; })[0];
    return c ? (c.folder || c.label) : (id || 'Uncategorized');
  }

  function cardHtml(p) {
    var stock = byProductStock[p.id] || 0;
    var rating = byProductRating[p.id] || 0;
    var ratingCountVal = ratingCount[p.id] || 0;
    var isNew = (Date.now() - new Date(p.created_at).getTime()) < 1000 * 60 * 60 * 24 * 45;
    var hasPhoto = Array.isArray(p.images) && p.images.length > 0;
    return '' +
      '<a class="product-card" href="product.html?id=' + p.id + '">' +
        '<div class="product-card__thumb">' +
          '<img src="' + ui.productImageSrc(p, 0) + '" alt="' + ui.escapeHtml(p.title) + '" loading="lazy" />' +
          (isNew ? '<span class="tag--new">New</span>' : '') +
          (hasPhoto ? '' : '<span class="tag--placeholder" aria-hidden="true">Illustration</span>') +
        '</div>' +
        '<div class="product-card__body">' +
          '<span class="product-card__cat">' + ui.escapeHtml(categoryLabel(p.category)) + '</span>' +
          '<div class="product-card__title">' + ui.escapeHtml(p.title) + '</div>' +
          '<div class="product-card__price">' + ui.money(p.base_price) + '</div>' +
          '<div class="product-card__meta">' +
            '<span>' + ui.starHtml(rating) + ' <small>(' + ratingCountVal + ')</small></span>' +
            '<span>' + (stock > 0 ? stock + ' in stock' : '<em>Sold out</em>') + '</span>' +
          '</div>' +
        '</div>' +
      '</a>';
  }

  document.getElementById('apply-filters').addEventListener('click', render);
  document.getElementById('clear-filters').addEventListener('click', function () {
    document.getElementById('search-input').value = '';
    catSel.value = '';
    document.getElementById('filter-min').value = '';
    document.getElementById('filter-max').value = '';
    var any = document.querySelector('input[name="rating"][value="0"]');
    if (any) any.checked = true;
    render();
  });
  document.getElementById('search-form').addEventListener('submit', function (e) {
    e.preventDefault();
    render();
  });
  catSel.addEventListener('change', render);

  render();
})();
