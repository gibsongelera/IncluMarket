/* Landing / login page controller */
(function () {
  'use strict';

  var session = store.getSession();
  if (session) {
    /* Already signed in — send to their home */
    location.href = auth.homeForRole(session.role);
    return;
  }

  /* -------------------------------------------------------------
     Quick-demo accounts — rendered as small avatar cards
     ------------------------------------------------------------- */
  function initials(name) {
    return name.split(/\s+/).map(function (p) { return p.charAt(0).toUpperCase(); }).slice(0, 2).join('');
  }
  function initQuickAccounts() {
    var el = document.getElementById('quick-accounts');
    if (!el) return;
    var picks = [
      { email: 'buyer1@inklumarket.ph',  label: 'Karla Mendoza',     role: 'buyer'  },
      { email: 'seller1@inklumarket.ph', label: 'Maria Santos',      role: 'seller' },
      { email: 'seller3@inklumarket.ph', label: 'Liwayway Bautista', role: 'seller' },
      { email: 'admin@inklumarket.ph',   label: 'Ana Reyes',         role: 'admin'  }
    ];
    var html = '';
    picks.forEach(function (p) {
      html += '<button type="button" class="quick-account qa-' + p.role + '" ' +
              'data-email="' + ui.escapeHtml(p.email) + '" ' +
              'data-initials="' + ui.escapeHtml(initials(p.label)) + '" ' +
              'aria-label="Sign in as ' + ui.escapeHtml(p.label) + ' (' + p.role + ')">' +
                '<span class="qa-body">' +
                  '<span class="qa-name">' + ui.escapeHtml(p.label) + '</span>' +
                  '<span class="qa-role">' + ui.escapeHtml(p.role) + '</span>' +
                '</span>' +
              '</button>';
    });
    el.innerHTML = html;
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-email]');
      if (!b) return;
      document.getElementById('login-email').value = b.getAttribute('data-email');
      document.getElementById('login-password').value = 'demo1234';
      submitLogin();
    });
  }

  /* -------------------------------------------------------------
     Live stats strip
     ------------------------------------------------------------- */
  function populateStats() {
    var products = store.getAll('products') || [];
    var sellers  = (store.getAll('users') || []).filter(function (u) { return u.role === 'seller'; });
    var orders   = store.getAll('orders') || [];
    setStat('stat-products', products.length);
    setStat('stat-sellers',  sellers.length);
    setStat('stat-orders',   orders.length);
  }
  function setStat(id, target) {
    var el = document.getElementById(id);
    if (!el) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = String(target);
      return;
    }
    /* short count-up */
    var start = performance.now();
    var duration = 700;
    function tick(t) {
      var p = Math.min(1, (t - start) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toString();
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* -------------------------------------------------------------
     Tab switching (Sign in / Create account)
     ------------------------------------------------------------- */
  function initTabs() {
    var tabs = document.querySelectorAll('[role="tab"][data-tab]');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { activateTab(t.getAttribute('data-tab')); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          var next = e.key === 'ArrowRight'
            ? t.nextElementSibling
            : t.previousElementSibling;
          if (next && next.getAttribute('role') === 'tab') {
            activateTab(next.getAttribute('data-tab'));
            next.focus();
          }
        }
      });
    });
  }
  function activateTab(name) {
    ['signin', 'signup'].forEach(function (n) {
      var tab   = document.getElementById('tab-' + n);
      var panel = document.getElementById('panel-' + n);
      var on = n === name;
      if (tab)   { tab.setAttribute('aria-selected', on ? 'true' : 'false'); tab.tabIndex = on ? 0 : -1; }
      if (panel) { panel.hidden = !on; }
    });
  }

  /* -------------------------------------------------------------
     Password show/hide toggle
     ------------------------------------------------------------- */
  function initPasswordToggle() {
    var btn = document.getElementById('toggle-password');
    var inp = document.getElementById('login-password');
    var on  = document.getElementById('pw-eye');
    var off = document.getElementById('pw-eye-off');
    if (!btn || !inp) return;
    btn.addEventListener('click', function () {
      var showing = inp.type === 'text';
      inp.type = showing ? 'password' : 'text';
      btn.setAttribute('aria-pressed', showing ? 'false' : 'true');
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      if (on)  on.hidden  = !showing;
      if (off) off.hidden =  showing;
    });
  }

  /* -------------------------------------------------------------
     Sign-in submit
     ------------------------------------------------------------- */
  function submitLogin() {
    var errorEl = document.getElementById('login-error');
    errorEl.hidden = true;
    errorEl.textContent = '';
    var email = document.getElementById('login-email').value;
    var password = document.getElementById('login-password').value;
    var result = auth.login(email, password);
    if (!result.ok) {
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      ui.toast(result.error, 'error');
      return;
    }
    ui.toast('Welcome back, ' + result.user.name + '.', 'success');
    setTimeout(function () { location.href = auth.homeForRole(result.user.role); }, 400);
  }
  document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    submitLogin();
  });

  /* -------------------------------------------------------------
     Signup submit
     ------------------------------------------------------------- */
  function submitSignup(e) {
    e.preventDefault();
    var errorEl = document.getElementById('signup-error');
    errorEl.hidden = true;
    var name     = document.getElementById('su-name').value.trim();
    var email    = document.getElementById('su-email').value.trim().toLowerCase();
    var password = document.getElementById('su-password').value;
    var role     = document.getElementById('su-role').value;
    var consent  = document.getElementById('su-consent').checked;

    function fail(msg) { errorEl.textContent = msg; errorEl.hidden = false; ui.toast(msg, 'error'); }

    if (!name || !email || !password) return fail('Please fill in all fields.');
    if (password.length < 8)            return fail('Password must be at least 8 characters.');
    if (!consent)                       return fail('You must accept the Data Privacy notice to continue.');
    var existing = store.getAll('users').find(function (u) { return (u.email || '').toLowerCase() === email; });
    if (existing)                       return fail('An account with that email already exists in the demo.');

    try {
      var user = store.insert('users', {
        name: name, email: email,
        password_hash: 'bcrypt-cost-12$demo$' + btoa(email).slice(0, 20),
        role: role,
        disability_type: null, assistive_needs: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      store.logConsent({
        user_id: user.id,
        action: 'account_created',
        consent: true,
        purpose: 'RA 10173 DPA registration consent'
      });
      store.appendAudit({
        actor_id: user.id, actor_role: role,
        action: 'account_created', target: 'user:' + user.id
      });
      ui.toast('Account created. Signing you in…', 'success');
      auth.login(email, password);
      setTimeout(function () { location.href = auth.homeForRole(role); }, 500);
    } catch (err) {
      fail(err.message || 'Could not create account.');
    }
  }
  var signupForm = document.getElementById('signup-form');
  if (signupForm) signupForm.addEventListener('submit', submitSignup);

  /* -------------------------------------------------------------
     Boot
     ------------------------------------------------------------- */
  initQuickAccounts();
  initTabs();
  initPasswordToggle();
  populateStats();

  /* Focus the email field on load for keyboard-first flow */
  var emailField = document.getElementById('login-email');
  if (emailField) setTimeout(function () { emailField.focus(); }, 100);
})();
