/* InkluMarket auth.js — demo session + role guard
   NOTE: This is a static demo. Passwords are not really hashed; any password
   is accepted for a known seeded email in the demo. In real deployment a
   bcrypt-verified hash comparison + TLS 1.2+ + CSRF protection would apply.
*/
(function (global) {
  'use strict';

  var HOME_BY_ROLE = {
    buyer:  '../buyer/home.html',
    seller: '../seller/dashboard.html',
    admin:  '../admin/users.html'
  };
  var HOME_BY_ROLE_ROOT = {
    buyer:  'buyer/home.html',
    seller: 'seller/dashboard.html',
    admin:  'admin/users.html'
  };
  var LOGIN_URL_FROM_SUB = '../index.html';
  var LOGIN_URL_ROOT     = 'index.html';

  function isRootPage() {
    /* True when page is at the repo root (index.html or /) */
    var path = location.pathname.toLowerCase();
    return /(?:^|\/)(index\.html)?$/.test(path);
  }

  function loginRedirect() {
    location.href = isRootPage() ? LOGIN_URL_ROOT : LOGIN_URL_FROM_SUB;
  }

  function homeForRole(role) {
    if (isRootPage()) return HOME_BY_ROLE_ROOT[role] || HOME_BY_ROLE_ROOT.buyer;
    return HOME_BY_ROLE[role] || HOME_BY_ROLE.buyer;
  }

  function login(email, password) {
    var normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return { ok: false, error: 'Please enter your email.' };
    if (!password)   return { ok: false, error: 'Please enter your password.' };

    var users = global.store.getAll('users');
    var user = null;
    for (var i = 0; i < users.length; i++) {
      if ((users[i].email || '').toLowerCase() === normalized) { user = users[i]; break; }
    }
    if (!user) return { ok: false, error: 'No account matches that email in the demo dataset.' };

    /* Demo policy: accept the seeded demo password OR any non-empty value for known users.
       Log an "auth_success (simulated bcrypt verify)" audit entry either way. */
    global.store.setSession({
      user_id: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      started_at: new Date().toISOString()
    });
    global.store.appendAudit({
      actor_id: user.id,
      actor_role: user.role,
      action: 'auth_login (simulated bcrypt verify)',
      target: 'user:' + user.id
    });
    return { ok: true, user: user };
  }

  function logout() {
    var s = global.store.getSession();
    if (s) {
      global.store.appendAudit({
        actor_id: s.user_id,
        actor_role: s.role,
        action: 'auth_logout',
        target: 'user:' + s.user_id
      });
    }
    global.store.setSession(null);
    loginRedirect();
  }

  function currentUser() {
    var s = global.store.getSession();
    if (!s) return null;
    return global.store.findById('users', s.user_id);
  }

  function require(roles) {
    var s = global.store.getSession();
    if (!s) { loginRedirect(); return null; }
    if (roles && roles.length && roles.indexOf(s.role) < 0) {
      /* Wrong role: redirect to their own home */
      location.href = homeForRole(s.role);
      return null;
    }
    return s;
  }

  /* Populate the top-of-page user strip if present */
  function renderUserStrip() {
    var strip = document.getElementById('user-strip');
    if (!strip) return;
    var s = global.store.getSession();
    if (!s) { strip.hidden = true; return; }
    strip.hidden = false;
    strip.innerHTML =
      '<div class="container">' +
        '<span>Signed in as <strong>' + ui.escapeHtml(s.name) + '</strong>' +
        ' &middot; <span class="role-tag">' + ui.escapeHtml(s.role) + '</span>' +
        ' &middot; <span title="Email masked in shared views">' + ui.escapeHtml(ui.maskEmail(s.email)) + '</span>' +
        '</span>' +
      '</div>';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderUserStrip);
  } else {
    renderUserStrip();
  }

  global.auth = {
    login: login,
    logout: logout,
    currentUser: currentUser,
    require: require,
    homeForRole: homeForRole,
    loginRedirect: loginRedirect
  };
})(window);
