/* DropNest hero nest — canvas port of the app's NestHero (pseudo-3D, depth-sorted).
   Same projection as the Compose version: camera elevation ~20°, six glass panels on a hex
   floor, item chips that always face the viewer, radar rings, a liquid level that rises as
   items drop in. Drag to spin (inertia 0.94/frame like the app); auto-spins otherwise. */
(function () {
  var canvas = document.getElementById("nest");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var stage = canvas.parentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var TILT = 0.36, COS_T = 0.94, EASE = function (t) { return 1 - Math.pow(1 - t, 3); };
  var KINDS = [
    { k: "img", label: "IMG_4821.jpg" }, { k: "file", label: "brief-v2.pdf" }, { k: "link", label: "maps.app/…" },
    { k: "txt", label: "Wifi password" }, { k: "img", label: "roof-detail.jpg" }, { k: "file", label: "invoice.pdf" },
    { k: "txt", label: "Address for Fri" }, { k: "link", label: "figma.com/…" },
  ];

  // ---- theme tokens from CSS ----
  var T = {};
  function hex2rgb(h) { h = h.trim(); if (h[0] !== "#") return null; if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; var n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function readTokens() {
    var cs = getComputedStyle(document.documentElement);
    function tok(name, fb) { var v = cs.getPropertyValue(name); var rgb = v ? hex2rgb(v) : null; return rgb || fb; }
    T.accent = tok("--accent", [141, 132, 240]); T.deep = tok("--accent-deep", [91, 84, 201]);
    T.surface = tok("--surface", [35, 37, 50]); T.surface2 = tok("--surface2", [42, 45, 60]); T.bg2 = tok("--bg2", [27, 29, 44]);
    T.text = tok("--text", [236, 238, 251]); T.muted = tok("--muted", [150, 154, 184]);
    T.light = document.documentElement.dataset.theme === "light";
  }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  readTokens();
  new MutationObserver(readTokens).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // ---- state ----
  var spin = 0, vel = 0, dragging = false, lastX = 0, lastT = 0;
  var chips = [], nextId = 0, fill = 0, fillTarget = 0, ringPhase = 0, lastFrame = 0, seq = 0;
  var W = 0, H = 0, dpr = 1, running = true, visible = true;

  function addChip(delay) {
    var d = KINDS[seq++ % KINDS.length];
    chips.push({ id: nextId++, kind: d.k, label: d.label, t: -delay, out: 0 });
  }
  addChip(0); addChip(0.35); addChip(0.7);

  function resize() {
    var r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(r.width); H = Math.round(r.height);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
  }
  resize();
  window.addEventListener("resize", resize);

  // ---- projection ----
  var cx, cy, s;
  function P(x, y, z) {
    var c = Math.cos(spin), sn = Math.sin(spin);
    var rx = x * c + z * sn, rz = -x * sn + z * c;
    return { x: cx + rx * s, y: cy - y * COS_T * s + rz * TILT * s, d: rz };
  }
  function depthOf(x, z) { return -x * Math.sin(spin) + z * Math.cos(spin); }

  function hexPath(radius, h) {
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 3 * i, p = P(Math.cos(a) * radius, h, Math.sin(a) * radius);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }
  function ellipse(x, y, rx, ry, style, stroke) {
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2);
    if (stroke) { ctx.strokeStyle = style; ctx.lineWidth = 1; ctx.stroke(); } else { ctx.fillStyle = style; ctx.fill(); }
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---- icons (stroke drawings in a 16-unit box) ----
  function icon(kind, x, y, sz, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sz / 16, sz / 16);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (kind === "img") {
      roundRect(1.5, 2.5, 13, 11, 1.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, 12); ctx.lineTo(6, 8); ctx.lineTo(9, 11); ctx.lineTo(11, 9); ctx.lineTo(14.5, 12.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(10.5, 6, 1.2, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "file") {
      ctx.beginPath(); ctx.moveTo(3, 1.5); ctx.lineTo(9.5, 1.5); ctx.lineTo(13, 5); ctx.lineTo(13, 14.5); ctx.lineTo(3, 14.5); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9.5, 1.5); ctx.lineTo(9.5, 5); ctx.lineTo(13, 5); ctx.stroke();
    } else if (kind === "link") {
      ctx.beginPath(); ctx.moveTo(7, 5); ctx.lineTo(9, 3); ctx.arc(11.2, 5.2, 3, -2.36, 0.78, false); ctx.lineTo(11, 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9, 11); ctx.lineTo(7, 13); ctx.arc(4.8, 10.8, 3, 0.78, 3.93, false); ctx.lineTo(5, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, 10); ctx.lineTo(10, 6); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(2.5, 4); ctx.lineTo(13.5, 4); ctx.moveTo(2.5, 8); ctx.lineTo(13.5, 8); ctx.moveTo(2.5, 12); ctx.lineTo(9, 12); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- frame ----
  function draw(now) {
    var dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0.016; lastFrame = now;
    if (!reduced) {
      if (!dragging) { if (Math.abs(vel) > 0.0005) { spin += vel; vel *= 0.94; } else spin += 0.168 * dt; }
      ringPhase = (ringPhase + dt / 3.6) % 1;
    }
    fillTarget = Math.min(chips.filter(function (c) { return c.out < 1; }).length / 6, 0.8);
    fill += (fillTarget - fill) * Math.min(dt * 3, 1);
    chips.forEach(function (c) { if (c.out > 0 && c.out < 1) c.out = Math.min(c.out + dt * 2.5, 1); else if (c.t < 1) c.t = Math.min(c.t + dt * 2, 1); });
    chips = chips.filter(function (c) { return c.out < 1; });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    s = Math.min(W / 300, H / 225); cx = W / 2; cy = H * 0.5;
    var acc = T.accent, deep = T.deep;

    // Glow disc + radar rings
    var g = ctx.createRadialGradient(cx, cy + 20 * s, 0, cx, cy + 20 * s, 104 * s);
    g.addColorStop(0, rgba(acc, T.light ? 0.16 : 0.18)); g.addColorStop(1, rgba(acc, 0));
    ctx.save(); ctx.translate(cx, cy + 20 * s); ctx.scale(1, TILT); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 104 * s, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    for (var k = 0; k < 2; k++) {
      var p = (ringPhase + k * 0.5) % 1, r = 70 * s * (0.3 + 1.45 * p);
      ellipse(cx, cy, r, r * TILT, rgba(acc, 0.32 * 0.55 * (1 - p)), true);
    }

    // Floor
    hexPath(63, 0);
    var fg = ctx.createLinearGradient(cx - 60 * s, cy - 30 * s, cx + 60 * s, cy + 30 * s);
    fg.addColorStop(0, rgba(T.surface2, 1)); fg.addColorStop(1, rgba(T.bg2, 1));
    ctx.fillStyle = fg; ctx.fill(); ctx.strokeStyle = rgba(acc, 0.32); ctx.lineWidth = 1; ctx.stroke();
    // Liquid: level rises with the number of items
    var lh = 4 + fill * 62;
    hexPath(60, 0); ctx.fillStyle = rgba(acc, 0.12); ctx.fill();

    // Depth-sorted: liquid walls, glass panels, chip shadows, chips
    var items = [];
    for (k = 0; k < 6; k++) {
      (function (k) {
        var a = Math.PI / 3 * k + Math.PI / 6, ux = Math.cos(a), uz = Math.sin(a), px = -uz, pz = ux;
        var R = 54, w = 32, hgt = 116, depth = depthOf(ux * R, uz * R), front = (depth + 54) / 108;
        var c1x = ux * R + px * w, c1z = uz * R + pz * w, c2x = ux * R - px * w, c2z = uz * R - pz * w;
        // liquid wall (slightly inset)
        items.push({ d: depth - 0.5, draw: function () {
          var b1 = P(c1x * 0.96, 0, c1z * 0.96), b2 = P(c2x * 0.96, 0, c2z * 0.96), t1 = P(c1x * 0.96, lh, c1z * 0.96), t2 = P(c2x * 0.96, lh, c2z * 0.96);
          ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(b2.x, b2.y); ctx.closePath();
          ctx.fillStyle = rgba(acc, 0.10 + 0.16 * front); ctx.fill();
        } });
        items.push({ d: depth, draw: function () {
          var b1 = P(c1x, 0, c1z), b2 = P(c2x, 0, c2z), t1 = P(c1x, hgt, c1z), t2 = P(c2x, hgt, c2z);
          ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(b2.x, b2.y); ctx.closePath();
          var pg = ctx.createLinearGradient(0, t1.y, 0, b1.y);
          pg.addColorStop(0, rgba(acc, 0.03 + 0.13 * front)); pg.addColorStop(1, rgba(acc, 0.02));
          ctx.fillStyle = pg; ctx.fill();
          ctx.strokeStyle = rgba(acc, 0.22 + 0.2 * front); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
        } });
      })(k);
    }
    // liquid top surface (drawn after walls of the back, before front walls: give it middle depth)
    items.push({ d: 0, draw: function () { hexPath(57.6, lh); ctx.fillStyle = rgba(acc, 0.22); ctx.fill(); ctx.strokeStyle = rgba(acc, 0.45); ctx.lineWidth = 1; ctx.stroke(); } });

    var n = Math.max(chips.length, 1);
    chips.forEach(function (c, i) {
      var a = (i / n) * Math.PI * 2 + i * 0.6, r = 22 + (i % 3) * 10, h = 10 + i * 17 + (i % 2) * 5;
      var x = Math.cos(a) * r, z = Math.sin(a) * r;
      var prog = Math.max(0, Math.min(1, c.t)), e = EASE(prog), alpha = e * (1 - c.out);
      var bob = reduced ? 0 : Math.sin(now / 900 + i * 1.3) * 2.5;
      var y = h + (1 - e) * 60 + bob;
      // floor shadow
      items.push({ d: depthOf(x, z) - 0.2, draw: function () {
        var q = P(x, 0.5, z); ellipse(q.x, q.y, 22 * s * (0.6 + 0.4 * e), 7 * s * (0.6 + 0.4 * e), rgba([4, 6, 20], 0.35 * alpha));
      } });
      items.push({ d: depthOf(x, z), draw: function () {
        var q = P(x, y, z), cw = 74 * s * 0.92, ch = 26 * s * 0.92;
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.shadowColor = "rgba(4,6,20,.45)"; ctx.shadowBlur = 14 * s * 0.5; ctx.shadowOffsetY = 4;
        roundRect(q.x - cw / 2, q.y - ch / 2, cw, ch, 7 * s * 0.6); ctx.fillStyle = rgba(T.surface, 1); ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = T.light ? "rgba(22,24,38,.14)" : "rgba(255,255,255,.12)"; ctx.lineWidth = 1; ctx.stroke();
        icon(c.kind, q.x - cw / 2 + 7 * s * 0.6, q.y - 8 * s * 0.6, 16 * s * 0.6, rgba(acc, 1));
        ctx.fillStyle = rgba(T.text, 1); ctx.font = "600 " + Math.round(8.2 * s * 0.6 + 2) + "px Manrope, system-ui, sans-serif"; ctx.textBaseline = "middle";
        var lbl = c.label, maxW = cw - 30 * s * 0.6;
        while (ctx.measureText(lbl).width > maxW && lbl.length > 3) lbl = lbl.slice(0, -2) + "…";
        ctx.fillText(lbl, q.x - cw / 2 + 26 * s * 0.6, q.y + 0.5);
        ctx.restore();
      } });
    });
    items.sort(function (a, b) { return a.d - b.d; }).forEach(function (it) { it.draw(); });

    if (running && visible && !reduced) requestAnimationFrame(draw);
  }

  // Items keep dropping in (and the oldest leaves) so the nest feels alive.
  if (!reduced) setInterval(function () {
    if (!visible) return;
    if (chips.length >= 4) { var live = chips.filter(function (c) { return c.out === 0; }); if (live[0]) live[0].out = 0.001; }
    addChip(0);
  }, 5200);

  // Drag to spin, inertia like the app.
  canvas.addEventListener("pointerdown", function (e) { dragging = true; lastX = e.clientX; vel = 0; canvas.setPointerCapture(e.pointerId); stage.classList.add("dragging"); });
  canvas.addEventListener("pointermove", function (e) { if (!dragging) return; var dx = e.clientX - lastX; lastX = e.clientX; var d = dx * 0.5 * Math.PI / 180; spin += d; vel = d; });
  function up() { if (!dragging) return; dragging = false; stage.classList.remove("dragging"); }
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);

  if ("IntersectionObserver" in window) new IntersectionObserver(function (en) {
    var was = visible; visible = en[0].isIntersecting; if (visible && !was && !reduced) { lastFrame = 0; requestAnimationFrame(draw); }
  }).observe(stage);

  // Fonts affect the labels; redraw once they arrive.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (reduced) draw(performance.now()); });
  requestAnimationFrame(draw);
})();
