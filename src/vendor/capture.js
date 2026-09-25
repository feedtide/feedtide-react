(function () {
  // Screenshot annotation editor. Fetched by embed.js (loadScript) only when
  // the user clicks Screenshot, never bundled — so it has its own budget in
  // bundle-size.test.ts. Same rules as embed.js otherwise: ES5, no
  // dependencies. It talks back only through the callbacks given to open().
  //
  // Everything the user draws is an op in image space: the canvas is at
  // device-pixel scale and displayed fit-to-screen, so pointer positions are
  // mapped through the display ratio, undo is ops.pop() and one render()
  // replays the lot over the captured image.

  var TOOLS = ['pen', 'select', 'text', 'box', 'arrow'];
  var TITLES = { pen: 'Draw', select: 'Highlight', text: 'Text', box: 'Hide', arrow: 'Arrow', undo: 'Undo', cancel: 'Cancel' };
  var ICONS = {
    pen: 'M3 21l3.5-.7L18 8.8 15.2 6 3.7 17.5zM14 7l3 3',
    select: 'M4 4h16v16H4z',
    text: 'M5 6h14M12 6v13',
    box: 'M4 4h16v16H4z',
    arrow: 'M5 19L19 5M11 5h8v8',
    undo: 'M9 14l-4-4 4-4M5 10h9a5 5 0 010 10h-3',
    cancel: 'M6 6l12 12M18 6L6 18'
  };
  var COLOURS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#111827', '#ffffff'];

  var CSS =
    '.wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:64px 16px 16px;box-sizing:border-box;background:#111827;--tb:#1f2937;--hv:#374151;--fg:#e5e7eb;--sep:#4b5563;font:13px system-ui,sans-serif}' +
    '.wrap.light{background:#e5e7eb;--tb:#fff;--hv:#f3f4f6;--fg:#111827;--sep:#d1d5db}' +
    'canvas{display:block;max-width:100%;max-height:100%;box-shadow:0 8px 40px rgba(0,0,0,.4);touch-action:none;cursor:crosshair}' +
    '.tb{position:absolute;top:12px;left:12px;max-width:calc(100vw - 24px);display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:6px;border-radius:12px;background:var(--tb);color:var(--fg);box-shadow:0 4px 16px rgba(0,0,0,.3)}' +
    '.tb.r{left:auto;right:12px}' +
    '.tb button{all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;cursor:pointer;color:inherit}' +
    '.tb button:hover{background:var(--hv)}' +
    '.tb .on{background:#3b82f6;color:#fff}' +
    '.tb svg{width:18px;height:18px}' +
    '.tb .sw{width:22px;height:22px;border-radius:50%;border:2px solid var(--sep)}' +
    '.tb .sw.on{box-shadow:0 0 0 2px var(--fg)}' +
    '.sep{width:1px;height:20px;background:var(--sep);margin:0 4px}' +
    '.tb .save{width:auto;padding:0 12px;background:#3b82f6;color:#fff;font-weight:600}' +
    '.txt{position:absolute;background:0 0;border:1px dashed;outline:0;padding:0;margin:0;min-width:60px;font:bold 16px system-ui,sans-serif}';

  function ico(name) {
    return '<svg viewBox="0 0 24 24" fill="' + (name === 'box' ? 'currentColor' : 'none') +
      '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
      (name === 'select' ? ' stroke-dasharray="3 3"' : '') + '><path d="' + ICONS[name] + '"/></svg>';
  }

  function btn(attr, title, inner, cls) {
    return '<button type="button" ' + attr + ' title="' + title + '"' +
      (cls ? ' class="' + cls + '"' : '') + '>' + inner + '</button>';
  }

  window.FeedtideCapture = {
    root: null,

    /**
     * Open the editor over the page.
     *
     * @param {Object}   o
     * @param {HTMLCanvasElement} o.canvas  - The capture, at device-pixel scale. Not modified.
     * @param {string}   o.position  - Widget position; the toolbox moves right when the pill is top-left.
     * @param {string}   o.theme     - 'dark' for a dark editor, anything else for light.
     * @param {Function} [o.onOpen]  - Called once the editor is in the top layer.
     * @param {Function} o.onSave    - Called with a PNG Blob of the flattened image.
     * @param {Function} o.onCancel  - Called with no argument on cancel, or an error string.
     */
    open: function (o) {
      if (this.root) return;
      var self = this;
      var base = o.canvas, W = base.width, H = base.height;
      // Stroke and type scale with the image so they look the same at any DPR.
      var lw = Math.max(2, Math.round(W / 640)), fs = lw * 8;
      var ops = [], cur = null, tool = 'pen', colour = COLOURS[0];
      var raf = 0, input = null, closed = false;

      // <dialog> for the top layer; attachShadow is not allowed on it, so a
      // child div hosts the shadow root that isolates our CSS from the page.
      var dlg = document.createElement('dialog');
      dlg.id = 'feedtide-capture';
      dlg.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;overflow:hidden;z-index:2147483647';
      var host = document.createElement('div');
      var sh = host.attachShadow({ mode: 'open' });

      var html = '<style>' + CSS + '</style><div class="wrap' + (o.theme === 'dark' ? '' : ' light') +
        '"><div class="tb' + (/^(top-)?left$/.test(o.position) ? ' r' : '') + '">';
      var i;
      for (i = 0; i < TOOLS.length; i++) html += btn('data-tool="' + TOOLS[i] + '"', TITLES[TOOLS[i]], ico(TOOLS[i]));
      html += '<i class="sep"></i>';
      for (i = 0; i < COLOURS.length; i++) html += btn('data-c="' + COLOURS[i] + '" style="background:' + COLOURS[i] + '"', '', '', 'sw');
      html += '<i class="sep"></i>' +
        btn('data-act="undo"', TITLES.undo, ico('undo')) +
        btn('data-act="cancel"', TITLES.cancel, ico('cancel')) +
        btn('data-act="save"', 'Attach to feedback', 'Save', 'save') +
        '</div><canvas></canvas></div>';
      sh.innerHTML = html;
      dlg.appendChild(host);

      var wrap = sh.querySelector('.wrap');
      var tb = sh.querySelector('.tb');
      var cv = sh.querySelector('canvas');
      var ctx = cv.getContext('2d');
      cv.width = W;
      cv.height = H;

      function draw(op) {
        var x = op.x, y = op.y, w = op.w, h = op.h, p = op.pts, j;
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle = op.c;
        ctx.lineWidth = lw;
        ctx.lineCap = ctx.lineJoin = 'round';
        if (p) {
          ctx.beginPath();
          for (j = 0; j < p.length; j += 2) j ? ctx.lineTo(p[j], p[j + 1]) : ctx.moveTo(p[j], p[j + 1]);
          ctx.stroke();
        } else if (op.t === 'select') {
          ctx.setLineDash([lw * 2, lw * 2]);
          ctx.strokeRect(x, y, w, h);
        } else if (op.t === 'box') {
          ctx.fillRect(x, y, w, h);
        } else if (op.t === 'arrow') {
          var a = Math.atan2(h, w), n = lw * 5, ex = x + w, ey = y + h;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(ex, ey);
          ctx.moveTo(ex - n * Math.cos(a - 0.5), ey - n * Math.sin(a - 0.5));
          ctx.lineTo(ex, ey);
          ctx.lineTo(ex - n * Math.cos(a + 0.5), ey - n * Math.sin(a + 0.5));
          ctx.stroke();
        } else {
          ctx.font = 'bold ' + fs + 'px system-ui,sans-serif';
          ctx.textBaseline = 'top';
          ctx.fillText(op.s, x, y);
        }
        ctx.restore();
      }

      function render() {
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(base, 0, 0);
        for (var j = 0; j < ops.length; j++) draw(ops[j]);
        if (cur) draw(cur);
      }

      // Drag previews redraw at most once a frame.
      function schedule() {
        if (!raf) raf = requestAnimationFrame(function () { raf = 0; render(); });
      }

      // Pointer position in image space.
      function pos(e) {
        var r = cv.getBoundingClientRect();
        return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
      }

      // Text is typed into a positioned <input>; committing turns it into an op.
      function commitText() {
        var el = input;
        if (!el) return;
        input = null;
        var v = el.value.replace(/\s+$/, '');
        el.remove();
        if (v) { el._op.s = v; ops.push(el._op); render(); }
      }

      function placeText(p, e) {
        commitText();
        var k = cv.getBoundingClientRect().width / W;
        input = document.createElement('input');
        input.className = 'txt';
        input._op = { t: 'text', c: colour, x: p[0], y: p[1] };
        input.style.cssText = 'left:' + e.clientX + 'px;top:' + e.clientY + 'px;color:' + colour + ';font-size:' + Math.round(fs * k) + 'px';
        input.onkeydown = function (ev) {
          ev.stopPropagation();
          if (ev.key === 'Enter') commitText();
          // preventDefault keeps Escape from also cancelling the dialog
          else if (ev.key === 'Escape') { ev.preventDefault(); input.value = ''; commitText(); }
        };
        input.onblur = commitText;
        wrap.appendChild(input);
        input.focus();
      }

      cv.addEventListener('pointerdown', function (e) {
        if (e.button) return;
        // Cancelling pointerdown also cancels the compatibility mousedown,
        // whose default action would move focus off the text input we are
        // about to place (and blur = commit, so the input vanished on desktop).
        e.preventDefault();
        var p = pos(e);
        if (tool === 'text') { placeText(p, e); return; }
        commitText();
        // Synthetic pointers (tests, some WebViews) have no id to capture
        try { cv.setPointerCapture(e.pointerId); } catch (x) { }
        // select / box / arrow are all a dragged rect; only draw() differs
        cur = tool === 'pen' ? { c: colour, pts: p } : { t: tool, c: colour, x: p[0], y: p[1], w: 0, h: 0 };
      });
      cv.addEventListener('pointermove', function (e) {
        if (!cur) return;
        var p = pos(e);
        if (cur.pts) cur.pts.push(p[0], p[1]);
        else { cur.w = p[0] - cur.x; cur.h = p[1] - cur.y; }
        schedule();
      });
      function up() {
        if (!cur) return;
        if (cur.pts ? cur.pts.length > 2 : (cur.w || cur.h)) ops.push(cur);
        cur = null;
        render();
      }
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);

      function mark(sel, attr, val) {
        var b = tb.querySelectorAll(sel);
        for (var j = 0; j < b.length; j++) b[j].classList.toggle('on', b[j].getAttribute(attr) === val);
      }
      tb.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        var t = b.getAttribute('data-tool'), c = b.getAttribute('data-c'), a = b.getAttribute('data-act');
        if (t) {
          tool = t;
          mark('[data-tool]', 'data-tool', t);
          cv.style.cursor = t === 'text' ? 'text' : 'crosshair';
        } else if (c) {
          colour = c;
          mark('[data-c]', 'data-c', c);
          if (input) { input.style.color = c; input._op.c = c; }
        } else if (a === 'undo') {
          commitText();
          ops.pop();
          render();
        } else if (a === 'cancel') {
          cancel();
        } else {
          save();
        }
      });
      mark('[data-tool]', 'data-tool', tool);
      mark('[data-c]', 'data-c', colour);

      dlg.addEventListener('keydown', function (e) {
        if (!input && (e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); ops.pop(); render(); }
      });
      // Escape, and anything else that closes the dialog under us, is a cancel.
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); cancel(); });
      dlg.addEventListener('close', cancel);
      // Nothing clicked in here is the host page's business. In particular
      // embed.js closes the widget on a click outside it, and a synchronous
      // cancel has already restored the widget by the time the click bubbles.
      dlg.addEventListener('click', function (e) { e.stopPropagation(); });

      function finish(fn) {
        if (closed) return;
        closed = true;
        if (raf) cancelAnimationFrame(raf);
        try { dlg.close(); } catch (e) { }
        dlg.remove();
        self.root = null;
        fn();
      }
      function cancel() { finish(function () { o.onCancel(); }); }
      function save() {
        commitText();
        cur = null;
        render();
        cv.toBlob(function (b) {
          finish(function () { b ? o.onSave(b) : o.onCancel('Failed to export screenshot'); });
        }, 'image/png');
      }

      this.root = dlg;
      document.body.appendChild(dlg);
      try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
      // Keep the canvas clear of the toolbox, which wraps on narrow screens.
      wrap.style.paddingTop = (tb.offsetHeight + 24) + 'px';
      render();
      if (o.onOpen) o.onOpen();
    }
  };
})();
