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

  /* Global helpers: contrast toggle + logout wiring */
  function initGlobalUI() {
    var pref = global.store && global.store.getUiPref() || {};
    if (pref.contrast === 'high') document.documentElement.setAttribute('data-contrast', 'high');

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
    icon: icon
  };
})(window);
