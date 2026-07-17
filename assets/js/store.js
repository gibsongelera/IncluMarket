/* InkluMarket store.js
   localStorage-backed data access layer. Mirrors the SQL schema constraints
   (CHECK values, NOT NULL, ranges) in JavaScript before writing.
*/
(function (global) {
  'use strict';

  var DB_KEY   = 'inklumarket_db_v1';
  var SESS_KEY = 'inklumarket_session_v1';
  var CART_KEY = 'inklumarket_cart_v1';
  var UI_KEY   = 'inklumarket_ui_v1';

  var VALID_ORDER_STATUS   = ['pending', 'processing', 'shipped', 'delivered', 'returned'];
  var VALID_TICKET_STATUS  = ['open', 'in_progress', 'resolved'];
  var VALID_PRIORITY       = ['low', 'medium', 'high'];
  var VALID_ROLES          = ['buyer', 'seller', 'admin'];
  var VALID_PRODUCT_STATUS = ['pending', 'approved', 'flagged'];

  function readDb() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[store] Failed to parse DB, resetting.', e);
      return null;
    }
  }

  function writeDb(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  function seedIfNeeded(force) {
    var current = readDb();
    if (!force && current && current._version === global.INKLU_SEED._version) return current;
    /* Deep clone the seed so subsequent writes don't mutate the in-memory seed */
    var fresh = JSON.parse(JSON.stringify(global.INKLU_SEED));
    writeDb(fresh);
    return fresh;
  }

  function getAll(table) {
    var db = readDb() || seedIfNeeded();
    return (db[table] || []).slice();
  }

  function setAll(table, rows) {
    var db = readDb() || seedIfNeeded();
    db[table] = rows;
    writeDb(db);
  }

  function findById(table, id) {
    var rows = getAll(table);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) return rows[i];
    }
    return null;
  }

  function nextId(table) {
    var rows = getAll(table);
    var max = 0;
    for (var i = 0; i < rows.length; i++) {
      if (typeof rows[i].id === 'number' && rows[i].id > max) max = rows[i].id;
    }
    return max + 1;
  }

  function assert(cond, msg) {
    if (!cond) throw new Error('[store] ' + msg);
  }

  function validate(table, row) {
    switch (table) {
      case 'users':
        assert(row.name && row.email && row.role, 'users: name, email, role are required');
        assert(VALID_ROLES.indexOf(row.role) >= 0, 'users.role must be buyer|seller|admin');
        break;
      case 'products':
        assert(row.title && typeof row.base_price === 'number', 'products: title and numeric base_price required');
        assert(row.base_price >= 0, 'products.base_price must be >= 0');
        if (row.status) assert(VALID_PRODUCT_STATUS.indexOf(row.status) >= 0, 'products.status must be pending|approved|flagged');
        break;
      case 'product_variants':
        assert(row.product_id && row.color_name && row.sku_code, 'product_variants: product_id, color_name, sku_code required');
        assert(typeof row.stock_qty === 'number' && row.stock_qty >= 0, 'product_variants.stock_qty must be >= 0');
        break;
      case 'orders':
        assert(typeof row.total_amount === 'number' && row.total_amount >= 0, 'orders.total_amount must be >= 0');
        assert(VALID_ORDER_STATUS.indexOf(row.order_status) >= 0, 'orders.order_status invalid');
        break;
      case 'order_items':
        assert(row.order_id && row.quantity > 0, 'order_items: order_id and positive quantity required');
        assert(typeof row.unit_price === 'number' && row.unit_price >= 0, 'order_items.unit_price must be >= 0');
        break;
      case 'product_reviews':
        assert(row.product_id && row.buyer_id, 'product_reviews: product_id and buyer_id required');
        assert(row.rating_score >= 1 && row.rating_score <= 5, 'product_reviews.rating_score must be 1..5');
        break;
      case 'support_tickets':
        assert(row.user_id && row.subject && row.description_narrative, 'support_tickets: user_id, subject, description required');
        assert(VALID_TICKET_STATUS.indexOf(row.ticket_status) >= 0, 'support_tickets.ticket_status invalid');
        assert(VALID_PRIORITY.indexOf(row.priority_level) >= 0, 'support_tickets.priority_level invalid');
        break;
    }
  }

  function insert(table, row) {
    validate(table, row);
    var rows = getAll(table);
    if (!row.id) row.id = nextId(table);
    rows.push(row);
    setAll(table, rows);
    return row;
  }

  function update(table, id, patch) {
    var rows = getAll(table);
    var idx = -1;
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) { idx = i; break; }
    if (idx < 0) throw new Error('[store] ' + table + ' id ' + id + ' not found');
    var merged = Object.assign({}, rows[idx], patch);
    validate(table, merged);
    rows[idx] = merged;
    setAll(table, rows);
    return merged;
  }

  function remove(table, id) {
    var rows = getAll(table).filter(function (r) { return r.id !== id; });
    setAll(table, rows);
  }

  function query(table, predicate) {
    return getAll(table).filter(predicate);
  }

  function appendAudit(entry) {
    var row = Object.assign({ id: nextId('audit_logs'), created_at: new Date().toISOString() }, entry);
    var rows = getAll('audit_logs');
    rows.push(row);
    setAll('audit_logs', rows);
    return row;
  }

  function logConsent(entry) {
    var row = Object.assign({
      id: nextId('consent_logs'),
      consent: true,
      created_at: new Date().toISOString()
    }, entry);
    var rows = getAll('consent_logs');
    rows.push(row);
    setAll('consent_logs', rows);
    return row;
  }

  function resetAll() {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(SESS_KEY);
    localStorage.removeItem(CART_KEY);
    seedIfNeeded(true);
  }

  /* Session helpers */
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESS_KEY)) || null; }
    catch (e) { return null; }
  }
  function setSession(session) {
    if (!session) localStorage.removeItem(SESS_KEY);
    else localStorage.setItem(SESS_KEY, JSON.stringify(session));
  }

  /* Cart helpers (buyer-scoped) */
  function getCart(userId) {
    try {
      var raw = JSON.parse(localStorage.getItem(CART_KEY)) || {};
      return raw[userId] || [];
    } catch (e) { return []; }
  }
  function setCart(userId, items) {
    var raw = {};
    try { raw = JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch (e) {}
    raw[userId] = items;
    localStorage.setItem(CART_KEY, JSON.stringify(raw));
  }
  function clearCart(userId) { setCart(userId, []); }

  /* UI prefs (contrast toggle) */
  function getUiPref() {
    try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { return {}; }
  }
  function setUiPref(patch) {
    var cur = getUiPref();
    var next = Object.assign({}, cur, patch);
    localStorage.setItem(UI_KEY, JSON.stringify(next));
  }

  seedIfNeeded(false);

  global.store = {
    KEYS: { DB: DB_KEY, SESS: SESS_KEY, CART: CART_KEY, UI: UI_KEY },
    VALID: {
      ORDER_STATUS:   VALID_ORDER_STATUS,
      TICKET_STATUS:  VALID_TICKET_STATUS,
      PRIORITY:       VALID_PRIORITY,
      ROLES:          VALID_ROLES,
      PRODUCT_STATUS: VALID_PRODUCT_STATUS
    },
    getAll: getAll,
    setAll: setAll,
    findById: findById,
    insert: insert,
    update: update,
    remove: remove,
    query: query,
    nextId: nextId,
    appendAudit: appendAudit,
    logConsent: logConsent,
    resetAll: resetAll,
    getSession: getSession,
    setSession: setSession,
    getCart: getCart,
    setCart: setCart,
    clearCart: clearCart,
    getUiPref: getUiPref,
    setUiPref: setUiPref
  };
})(window);
