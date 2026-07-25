/* InkluMarket ui.js — small UI helpers (toasts, formatting, masking, stars) */
(function (global) {
  'use strict';

  var PHP = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 });

  function money(n) {
    var v = Number(n) || 0;
    return PHP.format(v);
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
    } catch (e) { return iso; }
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  }

  /* Basic PII mask: j***@m***.ph */
  function maskEmail(email) {
    if (!email || email.indexOf('@') < 0) return email || '';
    var parts = email.split('@');
    var local = parts[0], domain = parts[1];
    var localMasked = local.length <= 2
      ? (local[0] || '*') + '*'
      : local[0] + '***' + local[local.length - 1];
    var domainParts = domain.split('.');
    var host = domainParts[0];
    var tld = domainParts.slice(1).join('.');
    var hostMasked = host.length <= 2 ? host[0] + '*' : host[0] + '***';
    return localMasked + '@' + hostMasked + (tld ? '.' + tld : '');
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(message, variant) {
    variant = variant || 'success';
    var region = document.getElementById('toast-region');
    if (!region) return;
    var el = document.createElement('div');
    el.className = 'toast toast--' + variant;
    el.textContent = message;
    region.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity 200ms';
      setTimeout(function () { el.remove(); }, 220);
    }, 3200);
  }

  function starHtml(score, max) {
    max = max || 5;
    var s = Math.max(0, Math.min(max, Math.round(score || 0)));
    var out = '<span class="stars" aria-label="' + s + ' out of ' + max + ' stars">';
    for (var i = 1; i <= max; i++) {
      out += '<span class="star ' + (i <= s ? 'star--filled' : 'star--empty') + '" aria-hidden="true">★</span>';
    }
    out += '</span>';
    return out;
  }

  function starInput(container, initial, onChange) {
    var value = initial || 0;
    container.innerHTML = '';
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(n === value));
        b.setAttribute('aria-label', n + ' star' + (n > 1 ? 's' : ''));
        b.textContent = '★';
        b.className = n <= value ? 'is-active' : '';
        b.addEventListener('click', function () { setValue(n); });
        b.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   { e.preventDefault(); setValue(Math.min(5, value + 1)); focus(value); }
          if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') { e.preventDefault(); setValue(Math.max(1, value - 1)); focus(value); }
        });
        container.appendChild(b);
      })(i);
    }
    function focus(n) {
      var btns = container.querySelectorAll('button');
      if (btns[n - 1]) btns[n - 1].focus();
    }
    function setValue(n) {
      value = n;
      var btns = container.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var active = (i + 1) <= value;
        btns[i].className = active ? 'is-active' : '';
        btns[i].setAttribute('aria-checked', String((i + 1) === value));
      }
      if (typeof onChange === 'function') onChange(value);
    }
    return { getValue: function () { return value; }, setValue: setValue };
  }

  function pillFor(status) {
    var label = status ? status.replace(/_/g, ' ') : '';
    return '<span class="pill pill--' + status + '">' + escapeHtml(label) + '</span>';
  }

  /* SVG data-URL placeholder derived from the product's emoji art. Used as the
     fallback when a product has no uploaded photos. Kept inline for zero deps. */
  function svgPlaceholder(emoji, bg) {
    bg = bg || '#F8F9FA';
    emoji = emoji || '🛍️';
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet">' +
        '<rect width="400" height="400" fill="' + bg + '"/>' +
        '<text x="50%" y="50%" font-size="200" text-anchor="middle" dominant-baseline="central" font-family="system-ui,Segoe UI Emoji,Apple Color Emoji">' +
          escapeHtml(emoji) +
        '</text>' +
      '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function productImageSrc(product, index) {
    if (!product) return svgPlaceholder('🛍️');
    var arr = Array.isArray(product.images) ? product.images : [];
    var i = Math.max(0, Math.min(index || 0, arr.length - 1));
    if (arr.length) return arr[i];
    return svgPlaceholder(product.image);
  }

  function productThumb(product, altOverride, extraClass) {
    var alt = altOverride != null ? altOverride : (product ? product.title : 'Product image');
    var cls = ['product-img'].concat(extraClass ? [extraClass] : []).join(' ');
    return '<img class="' + cls + '" src="' + productImageSrc(product, 0) + '" alt="' + escapeHtml(alt) + '" loading="lazy" />';
  }

  /* Inline SVG icon library (Lucide-inspired 24x24). All icons are aria-hidden
     because the surrounding element is expected to carry the accessible name. */
  var ICONS = {
    search:   '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    cart:     '<circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2l2.5 12h11l2-8H7"/>',
    user:     '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/>',
    bell:     '<path d="M6 8a6 6 0 0 1 12 0v4l2 3H4l2-3z"/><path d="M10 18a2 2 0 0 0 4 0"/>',
    grid:     '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    box:      '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4"/><path d="M12 11v10"/>',
    tag:      '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="8" cy="8" r="1.5"/>',
    chart:    '<path d="M3 20h18"/><path d="M6 16v-4"/><path d="M11 16V8"/><path d="M16 16v-6"/><path d="M21 16v-2"/>',
    users:    '<circle cx="9" cy="8" r="4"/><path d="M2 21c1-4 4-6 7-6s6 2 7 6"/><circle cx="17" cy="7" r="3"/><path d="M15 15c2 0 5 2 6 5"/>',
    shield:   '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    check:    '<path d="M4 12l5 5L20 6"/>',
    flag:     '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    trash:    '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
    edit:     '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/>',
    plus:     '<path d="M12 5v14"/><path d="M5 12h14"/>',
    minus:    '<path d="M5 12h14"/>',
    logout:   '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
    heart:    '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-3 4 4 0 0 1 7 3c0 5.5-7 10-7 10z"/>',
    home:     '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    star:     '<path d="M12 2l3 6.5 7 1-5 5 1.5 7L12 18l-6.5 3.5L7 14.5 2 9.5l7-1z"/>',
    truck:    '<rect x="1" y="7" width="13" height="10" rx="1"/><path d="M14 10h4l3 3v4h-7"/><circle cx="6" cy="19" r="2"/><circle cx="17" cy="19" r="2"/>',
    x:        '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'
  };
  function icon(name, size) {
    var d = ICONS[name] || '';
    size = size || 20;
    return '<svg class="icon" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  /* ---------- Theme / appearance (synced via localStorage UI prefs) ---------- */
  var THEME_PRESETS = {
    default: {
      id: 'default',
      label: 'Inklu default',
      description: 'Orange · burgundy · olive · forest',
      swatches: ['#D46E00', '#C55501', '#711402', '#695A07', '#136533'],
      vars: {
        '--palette-primary': '#D46E00',
        '--palette-primary-dark': '#C55501',
        '--palette-deep': '#711402',
        '--palette-olive': '#695A07',
        '--palette-forest': '#136533',
        '--palette-primary-100': '#FCE8D4',
        '--palette-deep-100': '#F3E4E0',
        '--palette-olive-100': '#F0ECD4',
        '--palette-forest-100': '#D8EDE3',
        '--brand-yellow': '#F0C36A',
        '--brand-yellow-800': '#695A07',
        '--brand-red-800': '#4A0D01',
        '--color-nav': '#711402',
        '--color-nav-text': '#FFFFFF',
        '--color-body': '#5D9D8A',
        /* Exact rainbow from provided gradient swatch (plum → navy → teal → green → gold → orange → rust) */
        '--color-body-bg': 'linear-gradient(90deg,#781838 0%,#551547 7.7%,#301658 15.4%,#121B69 23.1%,#234075 30.8%,#417080 38.5%,#5D9D8A 46.2%,#75B485 53.8%,#8DA062 61.5%,#B28C42 69.2%,#DF7B30 76.9%,#D26F2C 84.6%,#C36227 92.3%,#B45623 100%)',
        '--color-footer': '#2A1A12',
        '--color-footer-text': '#F8F1EA'
      }
    },
    womens_month: {
      id: 'womens_month',
      label: "Women's Month",
      description: 'Pink-forward complementary',
      swatches: ['#C2185B', '#AD1457', '#6A1B4D', '#8E2448', '#2E7D6F'],
      vars: {
        '--palette-primary': '#C2185B',
        '--palette-primary-dark': '#AD1457',
        '--palette-deep': '#6A1B4D',
        '--palette-olive': '#8E2448',
        '--palette-forest': '#2E7D6F',
        '--palette-primary-100': '#FCE4EC',
        '--palette-deep-100': '#F3E5F0',
        '--palette-olive-100': '#F8E7EE',
        '--palette-forest-100': '#DFF3EF',
        '--brand-yellow': '#F48FB1',
        '--brand-yellow-800': '#8E2448',
        '--brand-red-800': '#4A0E36',
        '--color-nav': '#6A1B4D',
        '--color-nav-text': '#FFFFFF',
        '--color-body': '#FFF5F8',
        '--color-body-bg': '#FFF5F8',
        '--color-footer': '#3D102C',
        '--color-footer-text': '#FCE4EC'
      }
    },
    pride: {
      id: 'pride',
      label: 'Pride Month',
      description: 'Rainbow-inspired complementary',
      swatches: ['#E40303', '#FF8C00', '#5B2C6F', '#0047AB', '#009C49'],
      vars: {
        '--palette-primary': '#FF8C00',
        '--palette-primary-dark': '#E40303',
        '--palette-deep': '#5B2C6F',
        '--palette-olive': '#0047AB',
        '--palette-forest': '#009C49',
        '--palette-primary-100': '#FFF0D9',
        '--palette-deep-100': '#EDE4F3',
        '--palette-olive-100': '#DCE6F5',
        '--palette-forest-100': '#D6F3E4',
        '--brand-yellow': '#FFD100',
        '--brand-yellow-800': '#B8860B',
        '--brand-red-800': '#3D1C4A',
        '--color-nav': '#5B2C6F',
        '--color-nav-text': '#FFFFFF',
        '--color-body': '#FFF8F0',
        '--color-body-bg': '#FFF8F0',
        '--color-footer': '#2A1638',
        '--color-footer-text': '#F3E9FF'
      }
    },
    independence: {
      id: 'independence',
      label: 'Independence Day',
      description: 'June 12 — blue · red · gold',
      swatches: ['#0038A8', '#CE1126', '#0A1F5C', '#FCD116', '#0B5C3B'],
      vars: {
        '--palette-primary': '#CE1126',
        '--palette-primary-dark': '#A50E1E',
        '--palette-deep': '#0038A8',
        '--palette-olive': '#B8860B',
        '--palette-forest': '#0B5C3B',
        '--palette-primary-100': '#FDE3E6',
        '--palette-deep-100': '#DCE6F7',
        '--palette-olive-100': '#FFF6D6',
        '--palette-forest-100': '#D8EFE4',
        '--brand-yellow': '#FCD116',
        '--brand-yellow-800': '#B8860B',
        '--brand-red-800': '#7A0A16',
        '--color-nav': '#0038A8',
        '--color-nav-text': '#FFFFFF',
        '--color-body': '#F5F8FF',
        '--color-body-bg': '#F5F8FF',
        '--color-footer': '#0A1F5C',
        '--color-footer-text': '#FCD116'
      }
    },
    christmas: {
      id: 'christmas',
      label: 'Christmas',
      description: 'Evergreen · berry · gold',
      swatches: ['#C41E3A', '#8B0000', '#0B3D2E', '#B8860B', '#145A32'],
      vars: {
        '--palette-primary': '#C41E3A',
        '--palette-primary-dark': '#8B0000',
        '--palette-deep': '#0B3D2E',
        '--palette-olive': '#B8860B',
        '--palette-forest': '#145A32',
        '--palette-primary-100': '#FDE6EA',
        '--palette-deep-100': '#D9EBE3',
        '--palette-olive-100': '#FFF4D6',
        '--palette-forest-100': '#D8EFDF',
        '--brand-yellow': '#F0D060',
        '--brand-yellow-800': '#B8860B',
        '--brand-red-800': '#5C0000',
        '--color-nav': '#0B3D2E',
        '--color-nav-text': '#FFFFFF',
        '--color-body': '#F7FBF8',
        '--color-body-bg': '#F7FBF8',
        '--color-footer': '#06261C',
        '--color-footer-text': '#F0D060'
      }
    },
    holy_week: {
      id: 'holy_week',
      label: 'Holy Week / Lent',
      description: 'Violet · ash · olive',
      swatches: ['#6B4C9A', '#4A2C6A', '#3D2B1F', '#6B5B2A', '#2F5D50'],
      vars: {
        '--palette-primary': '#6B4C9A',
        '--palette-primary-dark': '#4A2C6A',
        '--palette-deep': '#3D2B1F',
        '--palette-olive': '#6B5B2A',
        '--palette-forest': '#2F5D50',
        '--palette-primary-100': '#EDE6F5',
        '--palette-deep-100': '#E8E0D8',
        '--palette-olive-100': '#F0ECD4',
        '--palette-forest-100': '#D8EBE5',
        '--brand-yellow': '#D4C48A',
        '--brand-yellow-800': '#6B5B2A',
        '--brand-red-800': '#2A1C14',
        '--color-nav': '#3D2B1F',
        '--color-nav-text': '#FFFFFF',
        '--color-body': '#F7F4EF',
        '--color-body-bg': '#F7F4EF',
        '--color-footer': '#241912',
        '--color-footer-text': '#EDE6F5'
      }
    },
    buwan_ng_wika: {
      id: 'buwan_ng_wika',
      label: 'Buwan ng Wika',
      description: 'Language month — warm gold · earth',
      swatches: ['#D4A017', '#B8860B', '#5C3317', '#6B4F1D', '#1B5E4B'],
      vars: {
        '--palette-primary': '#D4A017',
        '--palette-primary-dark': '#B8860B',
        '--palette-deep': '#5C3317',
        '--palette-olive': '#6B4F1D',
        '--palette-forest': '#1B5E4B',
        '--palette-primary-100': '#FFF4D4',
        '--palette-deep-100': '#F0E4D8',
        '--palette-olive-100': '#F3ECD4',
        '--palette-forest-100': '#D6EFE7',
        '--brand-yellow': '#F5D76E',
        '--brand-yellow-800': '#6B4F1D',
        '--brand-red-800': '#3D220F',
        '--color-nav': '#5C3317',
        '--color-nav-text': '#FFFFFF',
        '--color-body': '#FFFBF0',
        '--color-body-bg': '#FFFBF0',
        '--color-footer': '#2E1A0C',
        '--color-footer-text': '#FFF4D4'
      }
    },
    pwd_awareness: {
      id: 'pwd_awareness',
      label: 'PWD / Disability Rights',
      description: 'Awareness blue · teal · gold',
      swatches: ['#0077C8', '#005A9C', '#003D6B', '#6B5B00', '#00857C'],
      vars: {
        '--palette-primary': '#0077C8',
        '--palette-primary-dark': '#005A9C',
        '--palette-deep': '#003D6B',
        '--palette-olive': '#6B5B00',
        '--palette-forest': '#00857C',
        '--palette-primary-100': '#D9EFFA',
        '--palette-deep-100': '#D6E4F0',
        '--palette-olive-100': '#F5F0D0',
        '--palette-forest-100': '#D4F0ED',
        '--brand-yellow': '#F0D060',
        '--brand-yellow-800': '#6B5B00',
        '--brand-red-800': '#00284A',
        '--color-nav': '#003D6B',
        '--color-nav-text': '#FFFFFF',
        '--color-body': '#F3F9FC',
        '--color-body-bg': '#F3F9FC',
        '--color-footer': '#00284A',
        '--color-footer-text': '#D9EFFA'
      }
    }
  };

  var THEME_VAR_KEYS = [
    '--palette-primary', '--palette-primary-dark', '--palette-deep',
    '--palette-olive', '--palette-forest',
    '--palette-primary-100', '--palette-deep-100', '--palette-olive-100', '--palette-forest-100',
    '--brand-yellow', '--brand-yellow-800', '--brand-red-800',
    '--color-nav', '--color-nav-text', '--color-body', '--color-body-bg', '--color-footer', '--color-footer-text'
  ];

  function syncCompatAliases(root) {
    /* Keep legacy --brand-* tokens in sync with the complementary palette. */
    root.style.setProperty('--brand-blue', 'var(--palette-primary-dark)');
    root.style.setProperty('--brand-blue-800', 'var(--palette-deep)');
    root.style.setProperty('--brand-blue-100', 'var(--palette-primary-100)');
    root.style.setProperty('--brand-red', 'var(--palette-deep)');
    root.style.setProperty('--brand-red-100', 'var(--palette-deep-100)');
    root.style.setProperty('--success', 'var(--palette-forest)');
    root.style.setProperty('--success-100', 'var(--palette-forest-100)');
    root.style.setProperty('--warning', 'var(--palette-olive)');
    root.style.setProperty('--warning-100', 'var(--palette-olive-100)');
    root.style.setProperty('--danger', 'var(--palette-deep)');
    root.style.setProperty('--danger-100', 'var(--palette-deep-100)');
    root.style.setProperty('--info', 'var(--palette-primary-dark)');
    root.style.setProperty('--info-100', 'var(--palette-primary-100)');
    root.style.setProperty('--focus-ring', '3px solid var(--palette-primary)');
  }

  function clearThemeVars(root) {
    THEME_VAR_KEYS.forEach(function (k) { root.style.removeProperty(k); });
    [
      '--brand-blue', '--brand-blue-800', '--brand-blue-100',
      '--brand-red', '--brand-red-100',
      '--success', '--success-100', '--warning', '--warning-100',
      '--danger', '--danger-100', '--info', '--info-100', '--focus-ring'
    ].forEach(function (k) { root.style.removeProperty(k); });
  }

  function applyThemeFromPref(pref) {
    pref = pref || (global.store && global.store.getUiPref()) || {};
    var root = document.documentElement;
    var presetId = pref.themePreset || 'default';
    var preset = THEME_PRESETS[presetId] || THEME_PRESETS.default;
    var vars = Object.assign({}, preset.vars);

    if (pref.colorNav) vars['--color-nav'] = pref.colorNav;
    if (pref.colorBody) {
      vars['--color-body'] = pref.colorBody;
      vars['--color-body-bg'] = pref.colorBody; /* solid override replaces rainbow bg */
    }
    if (pref.colorFooter) vars['--color-footer'] = pref.colorFooter;
    if (pref.colorNavText) vars['--color-nav-text'] = pref.colorNavText;
    if (pref.colorFooterText) vars['--color-footer-text'] = pref.colorFooterText;

    /* Ensure non-default presets always have a solid body-bg when not specified */
    if (!vars['--color-body-bg'] && vars['--color-body']) {
      vars['--color-body-bg'] = vars['--color-body'];
    }

    clearThemeVars(root);
    Object.keys(vars).forEach(function (k) {
      root.style.setProperty(k, vars[k]);
    });
    syncCompatAliases(root);
    root.setAttribute('data-theme-preset', preset.id);

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', vars['--color-nav'] || vars['--palette-deep']);
  }

  function saveThemePref(patch) {
    if (!global.store) return;
    global.store.setUiPref(patch);
    applyThemeFromPref(global.store.getUiPref());
  }

  function getThemePresets() {
    return Object.keys(THEME_PRESETS).map(function (k) { return THEME_PRESETS[k]; });
  }

  function getThemePreset(id) {
    return THEME_PRESETS[id] || THEME_PRESETS.default;
  }

  /* Global helpers: contrast toggle + logout wiring + theme boot */
  function initGlobalUI() {
    var pref = global.store && global.store.getUiPref() || {};
    if (pref.contrast === 'high') document.documentElement.setAttribute('data-contrast', 'high');
    applyThemeFromPref(pref);

    window.addEventListener('storage', function (e) {
      if (!global.store) return;
      if (e.key === global.store.KEYS.UI) {
        var next = global.store.getUiPref();
        if (next.contrast === 'high') document.documentElement.setAttribute('data-contrast', 'high');
        else document.documentElement.removeAttribute('data-contrast');
        applyThemeFromPref(next);
        document.querySelectorAll('[data-action="toggle-contrast"]').forEach(function (b) {
          b.setAttribute('aria-pressed', String(document.documentElement.getAttribute('data-contrast') === 'high'));
        });
      }
    });

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="toggle-contrast"]');
      if (btn) {
        var current = document.documentElement.getAttribute('data-contrast');
        if (current === 'high') {
          document.documentElement.removeAttribute('data-contrast');
          btn.setAttribute('aria-pressed', 'false');
          global.store.setUiPref({ contrast: 'default' });
        } else {
          document.documentElement.setAttribute('data-contrast', 'high');
          btn.setAttribute('aria-pressed', 'true');
          global.store.setUiPref({ contrast: 'high' });
        }
      }

      var logout = e.target.closest('[data-action="logout"]');
      if (logout) {
        if (global.auth) global.auth.logout();
      }

      var reset = e.target.closest('[data-action="clear-storage"]');
      if (reset) {
        if (confirm('Reset all demo data (users, products, orders, tickets, cart)?')) {
          global.store.resetAll();
          global.store.setSession(null);
          toast('Demo data reset.', 'success');
          setTimeout(function () { location.reload(); }, 400);
        }
      }
    });

    /* Sync contrast button state on load */
    document.querySelectorAll('[data-action="toggle-contrast"]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(document.documentElement.getAttribute('data-contrast') === 'high'));
    });
  }

  /* Apply theme ASAP (before paint of chrome) and again on DOM ready for contrast buttons */
  applyThemeFromPref((global.store && global.store.getUiPref()) || {});

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGlobalUI);
  } else {
    initGlobalUI();
  }

  global.ui = {
    money: money,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    maskEmail: maskEmail,
    escapeHtml: escapeHtml,
    toast: toast,
    starHtml: starHtml,
    starInput: starInput,
    pillFor: pillFor,
    svgPlaceholder: svgPlaceholder,
    productImageSrc: productImageSrc,
    productThumb: productThumb,
    icon: icon,
    applyThemeFromPref: applyThemeFromPref,
    saveThemePref: saveThemePref,
    getThemePresets: getThemePresets,
    getThemePreset: getThemePreset,
    THEME_PRESETS: THEME_PRESETS
  };
})(window);
