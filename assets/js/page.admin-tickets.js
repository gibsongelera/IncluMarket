/* Admin — ticket resolution CRM */
(function () {
  'use strict';
  var session = auth.require(['admin']);
  if (!session) return;

  var tabs = document.querySelectorAll('#tk-tabs .tab');
  var filter = 'open';
  var activeId = null;

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('tab--active'); x.setAttribute('aria-selected', 'false'); });
      t.classList.add('tab--active'); t.setAttribute('aria-selected', 'true');
      filter = t.getAttribute('data-status');
      renderList();
    });
  });

  function tickets() {
    var all = store.getAll('support_tickets').sort(function (a, b) { return b.updated_at.localeCompare(a.updated_at); });
    if (filter === 'all') return all;
    return all.filter(function (t) { return t.ticket_status === filter; });
  }

  function renderList() {
    var list = document.getElementById('ticket-list');
    var arr = tickets();
    if (arr.length === 0) {
      list.innerHTML = '<p class="empty">No tickets in this status.</p>';
      renderDetail(null);
      return;
    }
    list.innerHTML = arr.map(function (t) {
      var user = store.findById('users', t.user_id);
      return '<button type="button" class="ticket-list__item ' + (activeId === t.id ? 'is-active' : '') + '" data-tid="' + t.id + '">' +
        '<strong>#' + t.id + ' &middot; ' + ui.escapeHtml(t.subject) + '</strong>' +
        '<small>' + ui.escapeHtml(user ? user.name : 'User') + ' &middot; ' + ui.formatDate(t.updated_at) + '</small>' +
        '<div style="margin-top:.35rem;">' + ui.pillFor(t.ticket_status) +
          ' <span class="badge">' + ui.escapeHtml(t.priority_level) + '</span></div>' +
      '</button>';
    }).join('');
    list.querySelectorAll('.ticket-list__item').forEach(function (b) {
      b.addEventListener('click', function () {
        activeId = Number(b.getAttribute('data-tid'));
        renderList();
        renderDetail(activeId);
      });
    });
    if (!activeId && arr[0]) { activeId = arr[0].id; renderList(); renderDetail(activeId); }
    else if (activeId) renderDetail(activeId);
  }

  function renderDetail(id) {
    var el = document.getElementById('ticket-detail');
    if (!id) { el.innerHTML = '<p class="muted">Select a ticket to view details.</p>'; return; }
    var t = store.findById('support_tickets', id);
    if (!t) { el.innerHTML = '<p class="empty">Ticket not found.</p>'; return; }
    var user = store.findById('users', t.user_id);
    var thread = (t.responses || []).map(function (r) {
      return '<div class="msg ' + (r.author_role === 'admin' ? 'msg--admin' : '') + '">' +
        '<header><span>' + ui.escapeHtml(r.author_role) + '</span><span>' + ui.formatDateTime(r.created_at) + '</span></header>' +
        '<div>' + ui.escapeHtml(r.message) + '</div>' +
      '</div>';
    }).join('') || '<p class="muted">No messages yet.</p>';

    el.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:1rem;flex-wrap:wrap;">' +
        '<h2 style="margin:0;">#' + t.id + ' &middot; ' + ui.escapeHtml(t.subject) + '</h2>' +
        ui.pillFor(t.ticket_status) +
      '</div>' +
      '<p class="muted small">' +
        'From <strong>' + ui.escapeHtml(user ? user.name : 'User') + '</strong> (' + ui.escapeHtml(ui.maskEmail(user ? user.email : '')) + ')' +
        ' &middot; Priority: ' + ui.escapeHtml(t.priority_level) +
        ' &middot; Opened ' + ui.formatDateTime(t.created_at) +
      '</p>' +

      '<div class="thread">' + thread + '</div>' +

      '<div class="form" style="margin-top:.75rem;">' +
        '<div class="field">' +
          '<label for="reply">Reply</label>' +
          '<textarea id="reply" rows="3" placeholder="Type a reply to the user…"></textarea>' +
        '</div>' +
        '<div class="form-actions">' +
          '<button class="btn btn--primary" id="reply-send">Send reply</button>' +
          '<button class="btn btn--ghost" data-status="in_progress">Mark in-progress</button>' +
          '<button class="btn btn--ghost" data-status="resolved">Mark resolved</button>' +
          '<button class="btn btn--ghost" data-status="open">Re-open</button>' +
        '</div>' +
      '</div>';

    document.getElementById('reply-send').addEventListener('click', function () {
      var msg = (document.getElementById('reply').value || '').trim();
      if (!msg) { ui.toast('Please write a reply.', 'warning'); return; }
      var updated = Object.assign({}, t, {
        responses: (t.responses || []).concat([{ author_role: 'admin', author_id: session.user_id, message: msg, created_at: new Date().toISOString() }]),
        assigned_to: t.assigned_to || session.user_id,
        updated_at: new Date().toISOString()
      });
      store.update('support_tickets', t.id, updated);
      store.appendAudit({ actor_id: session.user_id, actor_role: 'admin', action: 'replied_ticket', target: 'ticket:' + t.id });
      ui.toast('Reply sent.', 'success');
      renderList();
    });

    el.querySelectorAll('[data-status]').forEach(function (b) {
      b.addEventListener('click', function () {
        var status = b.getAttribute('data-status');
        store.update('support_tickets', t.id, {
          ticket_status: status,
          assigned_to: t.assigned_to || session.user_id,
          updated_at: new Date().toISOString()
        });
        store.appendAudit({ actor_id: session.user_id, actor_role: 'admin', action: 'ticket_status_' + status, target: 'ticket:' + t.id });
        ui.toast('Ticket #' + t.id + ' set to "' + status + '".', 'success');
        renderList();
      });
    });
  }

  renderList();
})();
