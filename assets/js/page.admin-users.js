/* Admin — user governance (full CRUD)
   - Add / edit / delete users
   - Inline role change with cascade audit
   - Proper detail modal (no alert)
   - Toast notifications on every state change
   - On delete, mirrors the SQL DDL rules:
       products.seller_id    ON DELETE CASCADE (drop products + their variants)
       orders.buyer_id       ON DELETE SET NULL
       product_reviews.buyer ON DELETE SET NULL
       support_tickets.user  ON DELETE CASCADE
     consent_logs and audit_logs are preserved (audit-trail integrity).
*/
(function () {
  'use strict';
  var session = auth.require(['admin']);
  if (!session) return;

  var roleSel   = document.getElementById('usr-role');
  var searchEl  = document.getElementById('usr-search');
  var countEl   = document.getElementById('usr-count');
  var addBtn    = document.getElementById('add-user');
  var modal     = document.getElementById('user-modal');
  var form      = document.getElementById('user-form');
  var errorEl   = document.getElementById('um-error');
  var pwdField  = document.getElementById('um-password-field');
  var pwdInput  = document.getElementById('um-password');
  var consentField = document.getElementById('um-consent-field');
  var consentInp   = document.getElementById('um-consent');
  var titleEl   = document.getElementById('um-title');
  var detailsModal = document.getElementById('user-details');
  var detailsBody  = document.getElementById('ud-body');

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function currentAdminId() { return session.user_id; }

  function openCreateModal() {
    form.reset();
    form.querySelector('input[name="id"]').value = '';
    titleEl.textContent = 'Add new user';
    pwdField.hidden = false;
    pwdInput.required = true;
    consentField.hidden = false;
    consentInp.required = true;
    consentInp.checked = false;
    errorEl.hidden = true;
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
    setTimeout(function () { document.getElementById('um-name').focus(); }, 0);
  }

  function openEditModal(id) {
    var u = store.findById('users', id);
    if (!u) { ui.toast('User not found.', 'error'); return; }
    form.reset();
    form.querySelector('input[name="id"]').value = u.id;
    titleEl.textContent = 'Edit user #' + u.id;
    document.getElementById('um-name').value = u.name || '';
    document.getElementById('um-email').value = u.email || '';
    document.getElementById('um-role').value = u.role || 'buyer';
    document.getElementById('um-disability').value = u.disability_type || '';
    document.getElementById('um-needs').value = u.assistive_needs || '';
    /* On edit, password is optional (leave blank to keep current). Consent already recorded. */
    pwdField.hidden = false;
    pwdInput.required = false;
    pwdInput.value = '';
    pwdInput.placeholder = 'Leave blank to keep current password';
    consentField.hidden = true;
    consentInp.required = false;
    errorEl.hidden = true;
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
    setTimeout(function () { document.getElementById('um-name').focus(); }, 0);
  }

  function openDetailsModal(id) {
    var u = store.findById('users', id);
    if (!u) { ui.toast('User not found.', 'error'); return; }
    var consents = store.query('consent_logs', function (c) { return c.user_id === u.id; });
    var products = store.query('products', function (p) { return p.seller_id === u.id; });
    var orders   = store.query('orders',   function (o) { return o.buyer_id === u.id; });
    var reviews  = store.query('product_reviews', function (r) { return r.buyer_id === u.id; });
    var tickets  = store.query('support_tickets', function (t) { return t.user_id === u.id; });

    detailsBody.innerHTML =
      '<dl class="detail-grid">' +
        row('Name', ui.escapeHtml(u.name)) +
        row('Email (masked)', ui.escapeHtml(ui.maskEmail(u.email))) +
        row('Role', '<span class="badge badge--blue">' + ui.escapeHtml(u.role) + '</span>') +
        row('Disability type', ui.escapeHtml(u.disability_type || '—')) +
        row('Assistive needs', ui.escapeHtml(u.assistive_needs || '—')) +
        row('Joined', ui.formatDate(u.created_at)) +
        row('Last updated', ui.formatDate(u.updated_at)) +
        row('Consent logs', String(consents.length)) +
      '</dl>' +

      '<h3 class="detail-heading">Activity footprint</h3>' +
      '<ul class="detail-metrics">' +
        '<li><strong>' + products.length + '</strong> product' + s(products.length) + ' listed</li>' +
        '<li><strong>' + orders.length + '</strong> order' + s(orders.length) + ' placed</li>' +
        '<li><strong>' + reviews.length + '</strong> review' + s(reviews.length) + ' written</li>' +
        '<li><strong>' + tickets.length + '</strong> support ticket' + s(tickets.length) + '</li>' +
      '</ul>';

    if (typeof detailsModal.showModal === 'function') detailsModal.showModal();
    else detailsModal.setAttribute('open', '');
  }
  function row(label, value) {
    return '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>';
  }
  function s(n) { return n === 1 ? '' : 's'; }

  function saveUser(e) {
    e.preventDefault();
    errorEl.hidden = true;

    var id = form.querySelector('input[name="id"]').value;
    var name  = document.getElementById('um-name').value.trim();
    var email = document.getElementById('um-email').value.trim().toLowerCase();
    var role  = document.getElementById('um-role').value;
    var disability = document.getElementById('um-disability').value.trim() || null;
    var needs      = document.getElementById('um-needs').value.trim() || null;
    var password   = pwdInput.value;

    if (!name) return fail('Full name is required.');
    if (name.length < 2) return fail('Full name looks too short.');
    if (!email) return fail('Email is required.');
    if (!EMAIL_RE.test(email)) return fail('Please enter a valid email address.');
    if (!role || store.VALID.ROLES.indexOf(role) < 0) return fail('Please pick a valid role.');

    var existing = store.getAll('users').find(function (u) {
      return (u.email || '').toLowerCase() === email && String(u.id) !== String(id);
    });
    if (existing) return fail('Another user already uses that email.');

    if (!id) {
      if (!password) return fail('Password is required for a new user.');
      if (password.length < 8) return fail('Password must be at least 8 characters.');
      if (!consentInp.checked) return fail('Consent confirmation is required to create a user (RA 10173).');
    } else if (password && password.length < 8) {
      return fail('New password must be at least 8 characters (or leave blank).');
    }

    try {
      var saved;
      var nowIso = new Date().toISOString();
      if (id) {
        var patch = {
          name: name, email: email, role: role,
          disability_type: disability, assistive_needs: needs,
          updated_at: nowIso
        };
        if (password) patch.password_hash = 'bcrypt-cost-12$demo$' + btoa(email).slice(0, 20);
        saved = store.update('users', Number(id), patch);
        store.appendAudit({
          actor_id: currentAdminId(), actor_role: 'admin',
          action: password ? 'updated_user_with_password_reset' : 'updated_user',
          target: 'user:' + saved.id
        });
        ui.toast('User "' + saved.name + '" updated.', 'success');
      } else {
        saved = store.insert('users', {
          name: name, email: email, role: role,
          password_hash: 'bcrypt-cost-12$demo$' + btoa(email).slice(0, 20),
          disability_type: disability, assistive_needs: needs,
          created_at: nowIso, updated_at: nowIso
        });
        store.logConsent({
          user_id: saved.id, action: 'account_created_by_admin', consent: true,
          purpose: 'RA 10173 DPA registration consent (admin-recorded)'
        });
        store.appendAudit({
          actor_id: currentAdminId(), actor_role: 'admin',
          action: 'created_user_' + role, target: 'user:' + saved.id
        });
        ui.toast('User "' + saved.name + '" created.', 'success');
      }
      modal.close();
      render();
    } catch (err) {
      fail(err.message || 'Could not save user.');
    }
  }
  function fail(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    ui.toast(msg, 'error');
  }

  function deleteUser(id) {
    var u = store.findById('users', id);
    if (!u) { ui.toast('User not found.', 'error'); return; }
    if (u.id === currentAdminId()) {
      ui.toast('You cannot delete the account you are signed in with.', 'error');
      return;
    }

    /* Assess cascade impact */
    var products = store.query('products', function (p) { return p.seller_id === u.id; });
    var variantsToDrop = products.reduce(function (acc, p) {
      return acc.concat(store.query('product_variants', function (v) { return v.product_id === p.id; }));
    }, []);
    var orders   = store.query('orders',          function (o) { return o.buyer_id === u.id; });
    var reviews  = store.query('product_reviews', function (r) { return r.buyer_id === u.id; });
    var tickets  = store.query('support_tickets', function (t) { return t.user_id === u.id; });

    var summary =
      'Delete user "' + u.name + '" (' + u.role + ')?\n\n' +
      'This will:\n' +
      '  • Delete ' + products.length + ' product' + s(products.length) + ' and ' + variantsToDrop.length + ' variant' + s(variantsToDrop.length) + ' (CASCADE)\n' +
      '  • Delete ' + tickets.length + ' support ticket' + s(tickets.length) + ' (CASCADE)\n' +
      '  • Detach ' + orders.length + ' order' + s(orders.length) + ' (buyer set to NULL)\n' +
      '  • Detach ' + reviews.length + ' review' + s(reviews.length) + ' (buyer set to NULL)\n\n' +
      'Consent logs and audit entries are preserved.\n\nType YES to confirm.';
    var typed = prompt(summary);
    if (typed !== 'YES') {
      ui.toast('Deletion cancelled.', 'warning');
      return;
    }

    try {
      /* CASCADE: drop each product and its variants */
      products.forEach(function (p) {
        store.query('product_variants', function (v) { return v.product_id === p.id; })
             .forEach(function (v) { store.remove('product_variants', v.id); });
        store.remove('products', p.id);
      });
      /* SET NULL on orders + reviews */
      orders.forEach(function (o)  { store.update('orders',          o.id, { buyer_id: null }); });
      reviews.forEach(function (r) { store.update('product_reviews', r.id, { buyer_id: null }); });
      /* CASCADE: drop tickets */
      tickets.forEach(function (t) { store.remove('support_tickets', t.id); });
      /* Finally, remove the user */
      store.remove('users', u.id);

      store.appendAudit({
        actor_id: currentAdminId(), actor_role: 'admin',
        action: 'deleted_user_' + u.role, target: 'user:' + u.id
      });
      ui.toast('User "' + u.name + '" deleted.', 'success');
      render();
    } catch (err) {
      ui.toast(err.message || 'Delete failed.', 'error');
    }
  }

  function changeRole(id, next) {
    var u = store.findById('users', id);
    if (!u) return;
    if (u.id === currentAdminId() && next !== 'admin') {
      ui.toast('You cannot demote your own admin account.', 'error');
      render();
      return;
    }
    if (!confirm('Change role of "' + u.name + '" from "' + u.role + '" to "' + next + '"?')) {
      render();
      return;
    }
    try {
      store.update('users', id, { role: next, updated_at: new Date().toISOString() });
      store.appendAudit({
        actor_id: currentAdminId(), actor_role: 'admin',
        action: 'changed_role_to_' + next, target: 'user:' + id
      });
      ui.toast('Role for "' + u.name + '" is now ' + next + '.', 'success');
    } catch (err) {
      ui.toast(err.message || 'Could not change role.', 'error');
    }
    render();
  }

  function render() {
    var role = roleSel.value;
    var q = (searchEl.value || '').trim().toLowerCase();
    var users = store.getAll('users').filter(function (u) {
      if (role && u.role !== role) return false;
      if (q) {
        var hay = (u.name + ' ' + u.email).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });

    var totalAll = store.getAll('users').length;
    if (countEl) {
      countEl.textContent = 'Showing ' + users.length + ' of ' + totalAll + ' user' + s(totalAll);
    }

    var body = document.getElementById('user-rows');
    var empty = document.getElementById('users-empty');
    if (users.length === 0) { body.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;

    body.innerHTML = users.map(function (u) {
      var isSelf = u.id === currentAdminId();
      return '<tr>' +
        '<td><strong>' + ui.escapeHtml(u.name) + '</strong>' +
          (isSelf ? ' <span class="badge badge--yellow">You</span>' : '') +
        '</td>' +
        '<td title="Email masked for PII protection (RA 10173)"><code>' + ui.escapeHtml(ui.maskEmail(u.email)) + '</code></td>' +
        '<td>' +
          '<select class="role-sel" data-uid="' + u.id + '" aria-label="Change role for ' + ui.escapeHtml(u.name) + '">' +
            ['buyer','seller','admin'].map(function (r) {
              return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + r + '</option>';
            }).join('') +
          '</select>' +
        '</td>' +
        '<td>' + ui.escapeHtml(u.disability_type || '—') + '</td>' +
        '<td>' + ui.formatDate(u.created_at) + '</td>' +
        '<td class="row-actions">' +
          '<button class="btn btn--ghost btn--sm" data-view="' + u.id + '">Details</button> ' +
          '<button class="btn btn--ghost btn--sm" data-edit="' + u.id + '">Edit</button> ' +
          '<button class="btn btn--danger btn--sm" data-del="' + u.id + '"' + (isSelf ? ' disabled aria-disabled="true" title="You cannot delete yourself"' : '') + '>Delete</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    body.querySelectorAll('.role-sel').forEach(function (s) {
      s.addEventListener('change', function () {
        changeRole(Number(s.getAttribute('data-uid')), s.value);
      });
    });
    body.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { openDetailsModal(Number(b.getAttribute('data-view'))); });
    });
    body.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEditModal(Number(b.getAttribute('data-edit'))); });
    });
    body.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        deleteUser(Number(b.getAttribute('data-del')));
      });
    });
  }

  /* Wiring */
  addBtn.addEventListener('click', openCreateModal);
  document.getElementById('um-save').addEventListener('click', saveUser);
  detailsModal.querySelector('[data-close-details]').addEventListener('click', function () {
    detailsModal.close();
  });

  roleSel.addEventListener('change', render);
  searchEl.addEventListener('input', render);

  /* Keyboard shortcut: press "N" (not in a text field) to add a new user */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var t = e.target;
      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (typing) return;
      e.preventDefault();
      openCreateModal();
    }
  });

  render();
})();
