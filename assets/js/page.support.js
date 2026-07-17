/* Buyer support page — new ticket + my tickets thread */
(function () {
  'use strict';
  var session = auth.require(['buyer', 'seller']);
  if (!session) return;

  var listEl  = document.getElementById('my-tickets');
  var emptyEl = document.getElementById('tickets-empty');

  document.getElementById('ticket-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    if (!f.checkValidity()) { f.reportValidity(); return; }
    var subject = document.getElementById('tk-subject').value.trim();
    var priority = document.getElementById('tk-priority').value;
    var desc = document.getElementById('tk-desc').value.trim();
    if (!subject || !desc) return;
    var ticket = {
      user_id: session.user_id,
      subject: subject,
      description_narrative: desc,
      ticket_status: 'open',
      priority_level: priority,
      assigned_to: null,
      responses: [
        { author_role: session.role, author_id: session.user_id, message: desc, created_at: new Date().toISOString() }
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    try {
      var saved = store.insert('support_tickets', ticket);
      store.appendAudit({
        actor_id: session.user_id, actor_role: session.role,
        action: 'opened_ticket', target: 'ticket:' + saved.id
      });
      ui.toast('Ticket #' + saved.id + ' submitted.', 'success');
      f.reset();
      render();
    } catch (err) {
      ui.toast(err.message, 'error');
    }
  });

  function render() {
    var tickets = store.query('support_tickets', function (t) { return t.user_id === session.user_id; })
                       .sort(function (a, b) { return b.updated_at.localeCompare(a.updated_at); });
    if (tickets.length === 0) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    listEl.innerHTML = tickets.map(function (t) {
      var thread = (t.responses || []).map(function (r) {
        var isAdmin = r.author_role === 'admin';
        return '<div class="msg ' + (isAdmin ? 'msg--admin' : '') + '">' +
          '<header><span>' + ui.escapeHtml(r.author_role) + '</span><span>' + ui.formatDateTime(r.created_at) + '</span></header>' +
          '<div>' + ui.escapeHtml(r.message) + '</div>' +
        '</div>';
      }).join('');
      return '<article class="ticket-card">' +
        '<header><strong>#' + t.id + ' &middot; ' + ui.escapeHtml(t.subject) + '</strong>' +
        ui.pillFor(t.ticket_status) + '</header>' +
        '<p class="muted small">Priority: ' + ui.escapeHtml(t.priority_level) + ' &middot; ' + ui.formatDateTime(t.created_at) + '</p>' +
        '<div class="thread">' + thread + '</div>' +
      '</article>';
    }).join('');
  }
  render();
})();
