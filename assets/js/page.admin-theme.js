/* Admin — Theme & appearance customizer */
(function () {
  'use strict';
  if (!auth.require(['admin'])) return;

  var navEl = document.getElementById('theme-nav');
  var bodyEl = document.getElementById('theme-body');
  var footerEl = document.getElementById('theme-footer');
  var navHex = document.getElementById('theme-nav-hex');
  var bodyHex = document.getElementById('theme-body-hex');
  var footerHex = document.getElementById('theme-footer-hex');
  var labelEl = document.getElementById('theme-active-label');

  function normalizeHex(v) {
    if (!v) return null;
    v = String(v).trim();
    if (v[0] !== '#') v = '#' + v;
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v.toUpperCase();
    if (/^#[0-9A-Fa-f]{3}$/.test(v)) {
      return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toUpperCase();
    }
    return null;
  }

  function pairColor(picker, hexInput) {
    picker.addEventListener('input', function () {
      hexInput.value = picker.value.toUpperCase();
      livePreviewChrome();
    });
    hexInput.addEventListener('change', function () {
      var h = normalizeHex(hexInput.value);
      if (!h) { ui.toast('Enter a valid hex color (#RRGGBB).', 'warning'); return; }
      hexInput.value = h;
      picker.value = h;
      livePreviewChrome();
    });
  }

  pairColor(navEl, navHex);
  pairColor(bodyEl, bodyHex);
  pairColor(footerEl, footerHex);

  function loadFromPref() {
    var pref = store.getUiPref();
    var preset = ui.getThemePreset(pref.themePreset || 'default');
    var nav = pref.colorNav || preset.vars['--color-nav'];
    var body = pref.colorBody || preset.vars['--color-body'];
    var footer = pref.colorFooter || preset.vars['--color-footer'];
    navEl.value = nav; navHex.value = nav.toUpperCase();
    bodyEl.value = body; bodyHex.value = body.toUpperCase();
    footerEl.value = footer; footerHex.value = footer.toUpperCase();
    updateActiveLabel(pref);
    markActivePreset(pref.themePreset || 'default');
  }

  function livePreviewChrome() {
    document.documentElement.style.setProperty('--color-nav', navEl.value);
    document.documentElement.style.setProperty('--color-body', bodyEl.value);
    document.documentElement.style.setProperty('--color-body-bg', bodyEl.value);
    document.documentElement.style.setProperty('--color-footer', footerEl.value);
  }

  function updateActiveLabel(pref) {
    pref = pref || store.getUiPref();
    var p = ui.getThemePreset(pref.themePreset || 'default');
    labelEl.textContent = 'Active preset: ' + p.label + (pref.colorNav || pref.colorBody || pref.colorFooter ? ' (with custom chrome overrides)' : '');
  }

  function markActivePreset(id) {
    document.querySelectorAll('[data-preset]').forEach(function (el) {
      var on = el.getAttribute('data-preset') === id;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', String(on));
    });
  }

  function applyPreset(id, clearChrome) {
    var patch = { themePreset: id };
    if (clearChrome) {
      patch.colorNav = null;
      patch.colorBody = null;
      patch.colorFooter = null;
      patch.colorNavText = null;
      patch.colorFooterText = null;
    }
    store.setUiPref(patch);
    ui.applyThemeFromPref(store.getUiPref());
    loadFromPref();
    ui.toast('Theme applied: ' + ui.getThemePreset(id).label, 'success');
  }

  document.getElementById('theme-save').addEventListener('click', function () {
    var nav = normalizeHex(navHex.value);
    var body = normalizeHex(bodyHex.value);
    var footer = normalizeHex(footerHex.value);
    if (!nav || !body || !footer) {
      ui.toast('All chrome colors must be valid hex values.', 'error');
      return;
    }
    ui.saveThemePref({
      colorNav: nav,
      colorBody: body,
      colorFooter: footer
    });
    updateActiveLabel();
    store.appendAudit({
      actor_id: auth.currentUser().id,
      actor_role: 'admin',
      action: 'updated_theme_chrome',
      target: 'ui:theme'
    });
    ui.toast('Chrome colors saved. Synced for all roles.', 'success');
  });

  document.getElementById('theme-reset-chrome').addEventListener('click', function () {
    var pref = store.getUiPref();
    applyPreset(pref.themePreset || 'default', true);
  });

  /* Brand palette swatches — main provided + event presets */
  var swatchList = document.getElementById('theme-swatch-list');
  var eventGrid = document.getElementById('theme-event-grid');
  var presets = ui.getThemePresets();
  var mainIds = ['default'];
  var eventIds = presets.map(function (p) { return p.id; }).filter(function (id) { return id !== 'default'; });

  function swatchRowHtml(p) {
    var dots = (p.swatches || []).map(function (c) {
      return '<span class="theme-dot" style="background:' + c + '" title="' + c + '"></span>';
    }).join('');
    return '<button type="button" class="theme-swatch-row" role="listitem" data-preset="' + p.id + '" aria-pressed="false">' +
      '<span class="theme-swatch-row__dots">' + dots + '</span>' +
      '<span class="theme-swatch-row__meta">' +
        '<strong>' + ui.escapeHtml(p.label) + '</strong>' +
        '<span class="muted small">' + ui.escapeHtml(p.description || '') + '</span>' +
      '</span>' +
    '</button>';
  }

  swatchList.innerHTML = presets.filter(function (p) { return mainIds.indexOf(p.id) >= 0; })
    .concat(presets.filter(function (p) { return mainIds.indexOf(p.id) < 0; }))
    .map(swatchRowHtml).join('');

  eventGrid.innerHTML = eventIds.map(function (id) {
    var p = ui.getThemePreset(id);
    var dots = (p.swatches || []).map(function (c) {
      return '<span class="theme-dot" style="background:' + c + '"></span>';
    }).join('');
    return '<button type="button" class="theme-event-card" data-preset="' + p.id + '" aria-pressed="false">' +
      '<span class="theme-event-card__dots">' + dots + '</span>' +
      '<strong>' + ui.escapeHtml(p.label) + '</strong>' +
      '<span class="muted small">' + ui.escapeHtml(p.description || '') + '</span>' +
    '</button>';
  }).join('');

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-preset]');
    if (!btn || !btn.closest('#theme-swatch-list, #theme-event-grid')) return;
    applyPreset(btn.getAttribute('data-preset'), true);
    store.appendAudit({
      actor_id: auth.currentUser().id,
      actor_role: 'admin',
      action: 'applied_theme_preset',
      target: 'theme:' + btn.getAttribute('data-preset')
    });
  });

  loadFromPref();
})();
