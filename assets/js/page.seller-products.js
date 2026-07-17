/* Seller product & variant CRUD */
(function () {
  'use strict';
  var session = auth.require(['seller']);
  if (!session) return;

  var modal    = document.getElementById('product-modal');
  var form     = document.getElementById('product-form');
  var catSel   = document.getElementById('pm-category');
  var vRowsEl  = document.getElementById('variant-rows');

  var thumbsEl = document.getElementById('pm-thumbs');
  var photosInput = document.getElementById('pm-photos');
  var MAX_IMAGES = 3;
  var MAX_BYTES  = 1 * 1024 * 1024;
  var uploaded   = [];

  store.getAll('categories').forEach(function (c) {
    var opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.label;
    catSel.appendChild(opt);
  });

  function resizeToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var max = 800;
          var w = img.width, h = img.height;
          if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
          else if (h >= w && h > max) { w = Math.round(w * max / h); h = max; }
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          try {
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          } catch (e) { reject(e); }
        };
        img.onerror = function () { reject(new Error('Could not read image.')); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error('Could not read file.')); };
      reader.readAsDataURL(file);
    });
  }

  function renderThumbs() {
    if (!thumbsEl) return;
    if (uploaded.length === 0) {
      thumbsEl.innerHTML = '<p class="muted small">No photos yet. A colored emoji card will be used as the thumbnail.</p>';
      return;
    }
    thumbsEl.innerHTML = uploaded.map(function (src, i) {
      return '<div class="image-thumb" role="listitem">' +
        '<img src="' + src + '" alt="Preview ' + (i + 1) + '" />' +
        '<button type="button" class="image-thumb__remove" data-rmv="' + i + '" aria-label="Remove photo ' + (i + 1) + '">' + ui.icon('x', 14) + '</button>' +
        (i === 0 ? '<span class="image-thumb__flag">Cover</span>' : '') +
      '</div>';
    }).join('');
    thumbsEl.querySelectorAll('[data-rmv]').forEach(function (b) {
      b.addEventListener('click', function () {
        uploaded.splice(Number(b.getAttribute('data-rmv')), 1);
        renderThumbs();
      });
    });
  }

  if (photosInput) {
    photosInput.addEventListener('change', async function (e) {
      var files = Array.from(e.target.files || []);
      if (!files.length) return;
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (uploaded.length >= MAX_IMAGES) {
          ui.toast('Maximum ' + MAX_IMAGES + ' photos per product.', 'warning');
          break;
        }
        if (!/^image\//.test(f.type)) {
          ui.toast('Not an image: ' + f.name, 'error');
          continue;
        }
        if (f.size > MAX_BYTES) {
          ui.toast(f.name + ' is over 1 MB.', 'error');
          continue;
        }
        try {
          var dataUrl = await resizeToDataUrl(f);
          uploaded.push(dataUrl);
        } catch (err) {
          ui.toast(err.message || 'Image failed to load.', 'error');
        }
      }
      renderThumbs();
      photosInput.value = '';
    });
  }

  function myProducts() {
    return store.query('products', function (p) { return p.seller_id === session.user_id; })
                .sort(function (a, b) { return b.created_at.localeCompare(a.created_at); });
  }

  function render() {
    var rows = myProducts().map(function (p) {
      var vs = store.query('product_variants', function (v) { return v.product_id === p.id; });
      var totalStock = vs.reduce(function (n, v) { return n + v.stock_qty; }, 0);
      var hasPhoto = Array.isArray(p.images) && p.images.length > 0;
      return '<tr>' +
        '<td>' +
          '<div class="cell-product">' +
            '<img class="cell-thumb" src="' + ui.productImageSrc(p, 0) + '" alt="" />' +
            '<div>' +
              '<strong>' + ui.escapeHtml(p.title) + '</strong>' +
              '<div class="muted small">' + ui.formatDate(p.created_at) +
              (hasPhoto ? ' &middot; <span class="badge badge--success">' + p.images.length + ' photo' + (p.images.length > 1 ? 's' : '') + '</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td>' + ui.escapeHtml(categoryLabel(p.category)) + '</td>' +
        '<td>' + ui.money(p.base_price) + '</td>' +
        '<td>' + ui.pillFor(p.status || 'pending') + '</td>' +
        '<td>' + vs.length + ' variants &middot; ' + totalStock + ' units</td>' +
        '<td>' +
          '<button class="btn btn--ghost btn--sm" data-edit="' + p.id + '">Edit</button> ' +
          '<button class="btn btn--danger btn--sm" data-del="' + p.id + '">Delete</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    document.getElementById('product-rows').innerHTML = rows || '<tr><td colspan="6" class="empty">You have no products yet.</td></tr>';

    document.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openModal(Number(b.getAttribute('data-edit'))); });
    });
    document.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-del'));
        if (!confirm('Delete this product and all its variants?')) return;
        store.query('product_variants', function (v) { return v.product_id === id; })
             .forEach(function (v) { store.remove('product_variants', v.id); });
        store.remove('products', id);
        store.appendAudit({ actor_id: session.user_id, actor_role: 'seller', action: 'deleted_product', target: 'product:' + id });
        ui.toast('Product deleted.', 'success');
        render();
      });
    });
  }

  function categoryLabel(id) {
    var c = store.query('categories', function (x) { return x.id === id; })[0];
    return c ? c.label : (id || 'Uncategorized');
  }

  function variantRowHtml(v, i) {
    return '<div class="variant-row" data-idx="' + i + '">' +
      '<div class="field"><label>Color</label><input name="color_' + i + '" value="' + ui.escapeHtml(v.color_name || '') + '" required></div>' +
      '<div class="field"><label>Size</label><input name="size_' + i + '" value="' + ui.escapeHtml(v.size || 'One size') + '" required></div>' +
      '<div class="field"><label>Stock</label><input name="stock_' + i + '" type="number" min="0" value="' + (v.stock_qty || 0) + '" required></div>' +
      '<div class="field"><label>SKU</label><input name="sku_' + i + '" value="' + ui.escapeHtml(v.sku_code || '') + '" required></div>' +
      '<div class="field"><label>&nbsp;</label><button type="button" class="btn btn--ghost btn--sm" data-rmv="' + i + '">Remove</button></div>' +
    '</div>';
  }

  var vBuffer = [];
  function renderVariants() {
    vRowsEl.innerHTML = vBuffer.map(variantRowHtml).join('');
    vRowsEl.querySelectorAll('[data-rmv]').forEach(function (b) {
      b.addEventListener('click', function () {
        vBuffer.splice(Number(b.getAttribute('data-rmv')), 1);
        renderVariants();
      });
    });
  }

  function openModal(productId) {
    if (productId) {
      var p = store.findById('products', productId);
      if (!p) return;
      form.querySelector('input[name="id"]').value = p.id;
      form.querySelector('#pm-title-inp').value = p.title;
      form.querySelector('#pm-price').value = p.base_price;
      form.querySelector('#pm-desc').value = p.description || '';
      form.querySelector('#pm-image').value = p.image || '';
      catSel.value = p.category || '';
      uploaded = Array.isArray(p.images) ? p.images.slice() : [];
      vBuffer = store.query('product_variants', function (v) { return v.product_id === p.id; })
                     .map(function (v) { return { id: v.id, color_name: v.color_name, size: v.size, stock_qty: v.stock_qty, sku_code: v.sku_code }; });
    } else {
      form.reset();
      form.querySelector('input[name="id"]').value = '';
      uploaded = [];
      vBuffer = [{ color_name: 'Natural', size: 'One size', stock_qty: 10, sku_code: 'SKU-NEW-' + Date.now() }];
    }
    renderThumbs();
    renderVariants();
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
  }

  document.getElementById('add-product').addEventListener('click', function () { openModal(null); });
  document.getElementById('add-variant').addEventListener('click', function () {
    vBuffer.push({ color_name: '', size: 'One size', stock_qty: 0, sku_code: 'SKU-' + Date.now() });
    renderVariants();
  });

  document.getElementById('pm-save').addEventListener('click', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }

    var id     = Number(form.querySelector('input[name="id"]').value) || null;
    var title  = form.querySelector('#pm-title-inp').value.trim();
    var price  = Number(form.querySelector('#pm-price').value);
    var desc   = form.querySelector('#pm-desc').value.trim();
    var image  = form.querySelector('#pm-image').value.trim() || '🛍️';
    var cat    = catSel.value;

    /* Collect variants */
    var variants = [];
    for (var i = 0; i < vBuffer.length; i++) {
      variants.push({
        id: vBuffer[i].id,
        color_name: form.querySelector('[name="color_' + i + '"]').value.trim(),
        size:       form.querySelector('[name="size_' + i + '"]').value.trim(),
        stock_qty:  Math.max(0, Number(form.querySelector('[name="stock_' + i + '"]').value) || 0),
        sku_code:   form.querySelector('[name="sku_' + i + '"]').value.trim()
      });
    }
    if (!variants.length) { ui.toast('Add at least one variant.', 'warning'); return; }

    /* Ensure unique SKU across the whole store */
    var allSkus = store.getAll('product_variants');
    for (var j = 0; j < variants.length; j++) {
      var conflict = allSkus.find(function (x) { return x.sku_code === variants[j].sku_code && x.id !== variants[j].id; });
      if (conflict) { ui.toast('SKU "' + variants[j].sku_code + '" already exists.', 'error'); return; }
    }

    try {
      var savedProduct;
      if (id) {
        savedProduct = store.update('products', id, {
          title: title, base_price: price, description: desc, image: image, category: cat,
          images: uploaded.slice(0, MAX_IMAGES),
          updated_at: new Date().toISOString()
        });
        /* Remove missing variants, upsert others */
        var existing = store.query('product_variants', function (v) { return v.product_id === id; });
        var keepIds = variants.filter(function (v) { return v.id; }).map(function (v) { return v.id; });
        existing.forEach(function (ev) {
          if (keepIds.indexOf(ev.id) < 0) store.remove('product_variants', ev.id);
        });
        variants.forEach(function (v) {
          if (v.id) {
            store.update('product_variants', v.id, {
              color_name: v.color_name, size: v.size, stock_qty: v.stock_qty, sku_code: v.sku_code
            });
          } else {
            store.insert('product_variants', {
              product_id: id, color_name: v.color_name, size: v.size, stock_qty: v.stock_qty, sku_code: v.sku_code
            });
          }
        });
        store.appendAudit({ actor_id: session.user_id, actor_role: 'seller', action: 'updated_product', target: 'product:' + id });
      } else {
        savedProduct = store.insert('products', {
          seller_id: session.user_id, title: title, base_price: price, description: desc,
          image: image, category: cat, status: 'pending',
          images: uploaded.slice(0, MAX_IMAGES),
          created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        });
        variants.forEach(function (v) {
          store.insert('product_variants', {
            product_id: savedProduct.id, color_name: v.color_name, size: v.size,
            stock_qty: v.stock_qty, sku_code: v.sku_code
          });
        });
        store.appendAudit({ actor_id: session.user_id, actor_role: 'seller', action: 'created_product', target: 'product:' + savedProduct.id });
      }
      ui.toast(id ? 'Product updated.' : 'Product submitted for verification.', 'success');
      modal.close();
      render();
    } catch (err) {
      ui.toast(err.message, 'error');
    }
  });

  render();
})();
