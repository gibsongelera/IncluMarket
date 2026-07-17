/* InkluMarket cart.js — shared cart helper for buyer pages.
   Cart shape: array of { product_id, variant_id, quantity, unit_price, added_at }
*/
(function (global) {
  'use strict';

  function getUserId() {
    var s = store.getSession();
    return s ? s.user_id : null;
  }

  function getItems() {
    var uid = getUserId();
    if (!uid) return [];
    return store.getCart(uid);
  }

  function saveItems(items) {
    var uid = getUserId();
    if (!uid) return;
    store.setCart(uid, items);
    updateBadge();
  }

  function count() {
    return getItems().reduce(function (n, it) { return n + Number(it.quantity || 0); }, 0);
  }

  function subtotal() {
    return getItems().reduce(function (n, it) {
      return n + (Number(it.unit_price || 0) * Number(it.quantity || 0));
    }, 0);
  }

  function findIdx(items, productId, variantId) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].product_id === productId && items[i].variant_id === variantId) return i;
    }
    return -1;
  }

  function addItem(productId, variantId, quantity, unitPrice) {
    quantity = Math.max(1, Number(quantity) || 1);
    var items = getItems();
    var idx = findIdx(items, productId, variantId);

    var variant = store.findById('product_variants', variantId);
    var stockCap = variant ? variant.stock_qty : quantity;

    if (idx >= 0) {
      var next = items[idx].quantity + quantity;
      if (next > stockCap) next = stockCap;
      items[idx].quantity = next;
    } else {
      items.push({
        product_id: productId,
        variant_id: variantId,
        quantity: Math.min(quantity, stockCap),
        unit_price: Number(unitPrice) || 0,
        added_at: new Date().toISOString()
      });
    }
    saveItems(items);
  }

  function setQuantity(productId, variantId, quantity) {
    var items = getItems();
    var idx = findIdx(items, productId, variantId);
    if (idx < 0) return;
    var variant = store.findById('product_variants', variantId);
    var stockCap = variant ? variant.stock_qty : quantity;
    var q = Math.max(1, Math.min(stockCap, Number(quantity) || 1));
    items[idx].quantity = q;
    saveItems(items);
  }

  function removeItem(productId, variantId) {
    var items = getItems().filter(function (it) {
      return !(it.product_id === productId && it.variant_id === variantId);
    });
    saveItems(items);
  }

  function clear() {
    var uid = getUserId();
    if (uid) store.clearCart(uid);
    updateBadge();
  }

  function updateBadge() {
    var el = document.getElementById('cart-count');
    if (el) el.textContent = String(count());
  }

  document.addEventListener('DOMContentLoaded', updateBadge);

  global.cart = {
    getItems: getItems,
    addItem: addItem,
    setQuantity: setQuantity,
    removeItem: removeItem,
    clear: clear,
    count: count,
    subtotal: subtotal,
    updateBadge: updateBadge
  };
})(window);
