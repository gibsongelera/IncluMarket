/* Vanilla Canvas 2D charts — bar, line, pie.
   Colors pull directly from the DSWD tokens via getComputedStyle.
*/
(function (global) {
  'use strict';

  function tokens(canvas) {
    var cs = getComputedStyle(document.documentElement);
    return {
      blue:   cs.getPropertyValue('--brand-blue').trim()   || '#2E3192',
      red:    cs.getPropertyValue('--brand-red').trim()    || '#EE1C25',
      yellow: cs.getPropertyValue('--brand-yellow').trim() || '#FEF200',
      charcoal: cs.getPropertyValue('--text-charcoal').trim() || '#212529',
      muted:  cs.getPropertyValue('--text-muted').trim()   || '#5A6169',
      border: cs.getPropertyValue('--border').trim()       || '#DEE2E6',
      surface: cs.getPropertyValue('--surface-gray').trim() || '#F8F9FA'
    };
  }

  function resize(canvas) {
    /* Snap canvas backing store to CSS width for crispness */
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(300, Math.round(rect.width));
    var h = Math.round(w * (canvas.height / canvas.width || .4));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function drawAxes(ctx, x0, y0, x1, y1, t) {
    ctx.strokeStyle = t.border; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x0, y1);
    ctx.moveTo(x0, y1); ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  function niceMax(m) {
    if (m <= 5) return Math.max(5, Math.ceil(m));
    var pow = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil(m / pow) * pow;
  }

  function bar(canvas, data, opts) {
    opts = opts || {};
    var setup = resize(canvas); var ctx = setup.ctx, w = setup.w, h = setup.h;
    var t = tokens();
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = t.charcoal;

    var padL = 44, padR = 12, padT = 12, padB = 34;
    var chartW = w - padL - padR, chartH = h - padT - padB;
    var maxVal = niceMax(Math.max.apply(null, data.map(function (d) { return d.value; })) || 1);

    drawAxes(ctx, padL, padT, w - padR, h - padB, t);

    /* Y grid + labels */
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    var ticks = 4;
    for (var i = 0; i <= ticks; i++) {
      var y = padT + chartH - (chartH * (i / ticks));
      var val = (maxVal * i / ticks);
      ctx.fillStyle = t.muted;
      ctx.fillText(fmt(val, opts.currency), padL - 6, y);
      ctx.strokeStyle = t.border;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.setLineDash([]);
    }

    var barW = chartW / data.length * 0.6;
    var gap  = chartW / data.length * 0.4;
    var color = opts.color || t.blue;

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    data.forEach(function (d, i) {
      var x = padL + (chartW / data.length) * i + gap / 2;
      var barH = (d.value / maxVal) * chartH;
      var y = padT + chartH - barH;
      ctx.fillStyle = color;
      roundRect(ctx, x, y, barW, barH, 4);
      ctx.fill();

      ctx.fillStyle = t.muted;
      ctx.fillText(d.label, x + barW / 2, padT + chartH + 6);
    });
  }

  function line(canvas, series, opts) {
    opts = opts || {};
    var setup = resize(canvas); var ctx = setup.ctx, w = setup.w, h = setup.h;
    var t = tokens();
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px system-ui, -apple-system, sans-serif';

    var padL = 44, padR = 12, padT = 12, padB = 34;
    var chartW = w - padL - padR, chartH = h - padT - padB;
    var allVals = [];
    series.forEach(function (s) { s.points.forEach(function (p) { allVals.push(p.value); }); });
    var maxVal = niceMax(Math.max.apply(null, allVals) || 1);
    var n = series[0].points.length;

    drawAxes(ctx, padL, padT, w - padR, h - padB, t);

    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    var ticks = 4;
    for (var i = 0; i <= ticks; i++) {
      var y = padT + chartH - (chartH * (i / ticks));
      var val = (maxVal * i / ticks);
      ctx.fillStyle = t.muted;
      ctx.fillText(fmt(val, opts.currency), padL - 6, y);
      ctx.strokeStyle = t.border;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    series[0].points.forEach(function (p, i) {
      var x = padL + (chartW * (i / Math.max(1, n - 1)));
      ctx.fillStyle = t.muted;
      if (i % Math.max(1, Math.floor(n / 6)) === 0 || i === n - 1) {
        ctx.fillText(p.label, x, padT + chartH + 6);
      }
    });

    series.forEach(function (s, si) {
      var color = s.color || [t.blue, t.red, t.yellow][si % 3];
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.points.forEach(function (p, i) {
        var x = padL + (chartW * (i / Math.max(1, n - 1)));
        var y = padT + chartH - (p.value / maxVal) * chartH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      s.points.forEach(function (p, i) {
        var x = padL + (chartW * (i / Math.max(1, n - 1)));
        var y = padT + chartH - (p.value / maxVal) * chartH;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      });
    });
  }

  function pie(canvas, data) {
    var setup = resize(canvas); var ctx = setup.ctx, w = setup.w, h = setup.h;
    var t = tokens();
    ctx.clearRect(0, 0, w, h);

    var total = data.reduce(function (n, d) { return n + d.value; }, 0) || 1;
    var cx = w / 2 - 60, cy = h / 2, r = Math.min(w * .35, h * .38);
    var colors = [t.blue, t.red, t.yellow, t.muted, t.charcoal, '#146C43'];
    var start = -Math.PI / 2;
    data.forEach(function (d, i) {
      var slice = (d.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + slice);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = t.surface; ctx.lineWidth = 2; ctx.stroke();
      start += slice;
    });

    /* Legend */
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var lx = cx + r + 24, ly = cy - (data.length * 20) / 2;
    data.forEach(function (d, i) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(lx, ly + i * 20 - 6, 12, 12);
      ctx.fillStyle = t.charcoal;
      var pct = Math.round((d.value / total) * 100);
      ctx.fillText(d.label + '  ' + pct + '%', lx + 20, ly + i * 20);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (h <= 0) return;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function fmt(n, currency) {
    if (!currency) {
      if (Math.abs(n) >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
      return Math.round(n).toString();
    }
    if (Math.abs(n) >= 1000) return '₱' + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
    return '₱' + Math.round(n);
  }

  global.charts = { bar: bar, line: line, pie: pie };

  window.addEventListener('resize', function () {
    /* Redraw hook: pages can listen for this if they want responsive charts.
       We fire a custom event to keep charts decoupled. */
    document.dispatchEvent(new CustomEvent('charts:redraw'));
  });
})(window);
