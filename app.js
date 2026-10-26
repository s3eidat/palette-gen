/* Palette Gen — palettes are built in OKLCH (perceptual), then mapped into sRGB by reducing chroma. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;
  var N = 5;

  // ---------- colour science (Björn Ottosson's OKLab) ----------
  function toLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function fromLin(x) { return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; }
  function hexToRgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgbToHex(rgb) { return "#" + rgb.map(function (v) { return Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0"); }).join(""); }
  function hexToOklch(hex) {
    var c = hexToRgb(hex).map(toLin);
    var l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
    var m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
    var s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
    var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    var a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    var b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    var C = Math.sqrt(a * a + b * b), H = Math.atan2(b, a) * 180 / Math.PI;
    return { l: L, c: C, h: H < 0 ? H + 360 : H };
  }
  function oklchToSrgb(L, C, H) { // unclamped sRGB 0..1
    var hr = H * Math.PI / 180, a = C * Math.cos(hr), b = C * Math.sin(hr);
    var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3), m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3), s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map(fromLin);
  }
  function inGamut(rgb) { return rgb.every(function (v) { return v >= -1e-4 && v <= 1 + 1e-4; }); }
  // Keep lightness and hue, lower chroma until the colour fits in sRGB (CSS Color 4 style).
  function oklchToHex(L, C, H) {
    L = Math.min(1, Math.max(0, L));
    var rgb = oklchToSrgb(L, C, H);
    if (!inGamut(rgb)) {
      var lo = 0, hi = C;
      for (var i = 0; i < 24; i++) { var mid = (lo + hi) / 2; if (inGamut(oklchToSrgb(L, mid, H))) lo = mid; else hi = mid; }
      rgb = oklchToSrgb(L, lo, H);
    }
    return rgbToHex(rgb.map(function (v) { return v * 255; }));
  }
  function lum(hex) { var c = hexToRgb(hex).map(toLin); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function grade(r) { return r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA large" : "fail"; }
  function normHex(v) { var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v).trim()); if (!m) return null; var x = m[1]; if (x.length === 3) x = x.replace(/./g, "$&$&"); return "#" + x.toLowerCase(); }
  function fmtLch(hex) { var o = hexToOklch(hex); return "oklch(" + (o.l * 100).toFixed(1) + "% " + o.c.toFixed(3) + " " + (o.c < 0.0005 ? 0 : o.h.toFixed(1)) + ")"; }

  // ---------- generation ----------
  var HARMONIES = ["analogous", "complementary", "triadic", "split", "mono"];
  function hues(kind, H) {
    var o = { analogous: [-40, -20, 0, 20, 40], complementary: [-12, 0, 12, 180, 192], triadic: [0, 120, 240, 0, 120], split: [0, 150, 210, 0, 180], mono: [0, 0, 0, 0, 0] }[kind];
    return o.map(function (d) { return (H + d + 360) % 360; });
  }
  function generate(kind, locked, rnd) {
    rnd = rnd || Math.random;
    if (kind === "auto") kind = HARMONIES[Math.floor(rnd() * HARMONIES.length)];
    var anchor = locked.filter(function (x) { return x && hexToOklch(x).c > 0.03; })[0];
    var H = anchor ? hexToOklch(anchor).h : rnd() * 360;
    var hs = hues(kind, H);
    if (kind !== "mono") hs = hs.map(function (h) { return (h + (rnd() - 0.5) * 8 + 360) % 360; });
    var lo = 0.24 + rnd() * 0.14, hi = 0.86 + rnd() * 0.1, peak = 0.09 + rnd() * 0.13;
    var Ls = []; for (var i = 0; i < N; i++) Ls.push(lo + (hi - lo) * i / (N - 1) + (rnd() - 0.5) * 0.04);
    // shuffle hue order so the darkest swatch isn't always the same family
    for (i = hs.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = hs[i]; hs[i] = hs[j]; hs[j] = t; }
    return { kind: kind, colors: Ls.map(function (L, k) {
      if (locked[k]) return locked[k];
      var C = peak * (kind === "mono" ? 0.45 + 0.9 * (1 - Math.abs(L - 0.6) * 1.6) : 1 - Math.abs(L - 0.62) * 1.1);
      return oklchToHex(L, Math.max(0.01, C), hs[k]);
    }) };
  }
  function parseHash(h) {
    var parts = String(h || "").replace(/^#/, "").split("-").map(normHex);
    return parts.length === N && parts.every(Boolean) ? parts : null;
  }

  // ---------- state ----------
  var colors = parseHash(location.hash) || S3.store("pg.last") || ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51"];
  var locks = new Array(N).fill(false), undoStack = [], harmony = S3.store("pg.harmony") || "auto", fmt = S3.store("pg.fmt") || "css";
  var lastKind = "";

  function commit(next, pushHistory) {
    if (pushHistory) { undoStack.push(colors.slice()); if (undoStack.length > 50) undoStack.shift(); }
    colors = next.slice();
    S3.store("pg.last", colors);
    try { window.history.replaceState(null, "", "#" + colors.map(function (c) { return c.slice(1); }).join("-")); } catch (e) { /* file:// or sandbox */ }
    render();
  }

  // ---------- swatches ----------
  var box = $("#swatches"), els = [];
  for (var i = 0; i < N; i++) (function (i) {
    var hex = S3.h("input", { "class": "pg-hex mono", spellcheck: "false", "aria-label": "Colour " + (i + 1) + " hex", maxlength: "7" });
    var picker = S3.h("input", { type: "color", "aria-label": "Pick colour " + (i + 1) });
    var lock = S3.h("button", { "class": "pg-ico", "aria-pressed": "false", title: "Lock (keeps it when generating)", "aria-label": "Lock colour " + (i + 1), html: '<svg class="i"><use href="#i-lock"/></svg>' });
    var copy = S3.h("button", { "class": "pg-ico", title: "Copy hex", "aria-label": "Copy colour " + (i + 1), html: '<svg class="i"><use href="#i-copy"/></svg>' });
    var pick = S3.h("label", { "class": "pg-ico pg-pick", title: "Edit colour", html: '<svg class="i"><use href="#i-settings"/></svg>' }, [picker]);
    var lch = S3.h("span", { "class": "pg-lch mono" }), con = S3.h("span", { "class": "pg-con" });
    var sw = S3.h("div", { "class": "pg-sw" }, [S3.h("div", { "class": "pg-tools" }, [lock, pick, copy]), S3.h("div", { "class": "pg-info" }, [hex, lch, con])]);
    lock.addEventListener("click", function () { locks[i] = !locks[i]; render(); });
    copy.addEventListener("click", function () { S3.copy(colors[i], colors[i] + " copied"); });
    picker.addEventListener("input", function () { var n = colors.slice(); n[i] = picker.value; commit(n, false); });
    
    [picker, hex].forEach(function (el) { el.addEventListener("focus", function () { undoStack.push(colors.slice()); $("#undo").disabled = false; }); });
    hex.addEventListener("input", function () { var v = normHex(hex.value); if (v) { var n = colors.slice(); n[i] = v; commit(n, false); } });
    hex.addEventListener("change", function () { hex.value = colors[i].toUpperCase(); });
    box.appendChild(sw);
    els.push({ sw: sw, hex: hex, picker: picker, lock: lock, lch: lch, con: con });
  })(i);

  function render() {
    colors.forEach(function (c, i) {
      var e = els[i], cw = contrast(c, "#ffffff"), cb = contrast(c, "#000000");
      e.sw.style.background = c;
      e.sw.style.color = cw >= cb ? "#ffffff" : "#111418";
      if (document.activeElement !== e.hex) e.hex.value = c.toUpperCase();
      e.picker.value = c; e.lch.textContent = fmtLch(c);
      e.con.textContent = "White " + cw.toFixed(1) + " " + grade(cw) + "\nBlack " + cb.toFixed(1) + " " + grade(cb);
      e.lock.setAttribute("aria-pressed", String(locks[i])); e.sw.classList.toggle("locked", locks[i]);
    });
    $("#undo").disabled = !undoStack.length;
    renderOut();
  }

  // ---------- export ----------
  function exportText(kind, cs) {
    if (kind === "css") return ":root {\n" + cs.map(function (c, i) { return "  --palette-" + (i + 1) + ": " + c + ";"; }).join("\n") + "\n}\n";
    if (kind === "scss") return cs.map(function (c, i) { return "$palette-" + (i + 1) + ": " + c + ";"; }).join("\n") + "\n";
    if (kind === "json") return JSON.stringify(cs.map(function (c) { var o = hexToOklch(c); return { hex: c, rgb: hexToRgb(c), oklch: [+o.l.toFixed(4), +o.c.toFixed(4), +o.h.toFixed(2)] }; }), null, 2) + "\n";
    return "// tailwind.config.js\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: {\n        palette: {\n" +
      cs.map(function (c, i) { return "          " + (i + 1) + ": '" + c + "',"; }).join("\n") + "\n        },\n      },\n    },\n  },\n};\n";
  }
  var EXT = { css: "css", scss: "scss", json: "json", tailwind: "js" };
  function renderOut() { $("#out").textContent = exportText(fmt, colors); }
  $$("#fmt button").forEach(function (b) {
    b.setAttribute("aria-pressed", String(b.dataset.v === fmt));
    b.addEventListener("click", function () { fmt = b.dataset.v; S3.store("pg.fmt", fmt); $$("#fmt button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); renderOut(); });
  });
  $("#copyOut").addEventListener("click", function () { S3.copy(exportText(fmt, colors)); S3.done(); });
  $("#dlOut").addEventListener("click", function () { S3.download(exportText(fmt, colors), fmt === "tailwind" ? "tailwind.palette.js" : "palette." + EXT[fmt], "text/plain"); S3.done(); });
  $("#link").addEventListener("click", function () { S3.copy(location.href.split("#")[0] + "#" + colors.map(function (c) { return c.slice(1); }).join("-"), "Link copied"); });
  $("#png").addEventListener("click", function () {
    var W = 1500, H = 600, c = document.createElement("canvas"); c.width = W; c.height = H;
    var x = c.getContext("2d"), w = W / N;
    colors.forEach(function (col, i) {
      x.fillStyle = col; x.fillRect(Math.round(i * w), 0, Math.ceil(w), H);
      x.fillStyle = contrast(col, "#fff") >= contrast(col, "#000") ? "#ffffff" : "#111418";
      x.font = "700 30px Inter, system-ui, sans-serif"; x.fillText(col.toUpperCase(), i * w + 28, H - 64);
      x.globalAlpha = 0.75; x.font = "500 17px Inter, system-ui, sans-serif"; x.fillText(fmtLch(col), i * w + 28, H - 34); x.globalAlpha = 1;
    });
    c.toBlob(function (b) { S3.download(b, "palette-" + colors.map(function (k) { return k.slice(1); }).join("-") + ".png"); S3.done(); }, "image/png");
  });

  // ---------- saved ----------
  function savedList() { return S3.store("pg.saved") || []; }
  function renderSaved() {
    var list = savedList(), wrap = $("#saved"); wrap.innerHTML = "";
    $("#savedCount").textContent = list.length ? "(" + list.length + ")" : "";
    if (!list.length) { wrap.appendChild(S3.h("div", { "class": "empty", html: "<b>Nothing saved yet</b>Press “Save palette” to keep one here." })); return; }
    list.forEach(function (p, k) {
      var strip = S3.h("button", { "class": "pg-strip", title: "Load " + p.join(" "), "aria-label": "Load palette " + p.join(" ") }, p.map(function (c) { return S3.h("span", { style: "background:" + c }); }));
      strip.addEventListener("click", function () { locks.fill(false); commit(p, true); });
      var del = S3.h("button", { "class": "btn ghost icon small", "aria-label": "Delete saved palette", html: '<svg class="i"><use href="#i-x"/></svg>' });
      del.addEventListener("click", function () { var l = savedList(); l.splice(k, 1); S3.store("pg.saved", l); renderSaved(); });
      wrap.appendChild(S3.h("div", { "class": "row pg-saved-row" }, [strip, del]));
    });
  }
  $("#save").addEventListener("click", function () {
    var l = savedList(), key = colors.join();
    if (l.some(function (p) { return p.join() === key; })) { S3.toast("Already saved"); return; }
    l.unshift(colors.slice()); S3.store("pg.saved", l.slice(0, 60)); renderSaved(); S3.toast("Palette saved ✓"); S3.done();
  });

  // ---------- controls ----------
  function next() {
    var g = generate(harmony, colors.map(function (c, i) { return locks[i] ? c : null; }));
    lastKind = g.kind; commit(g.colors, true);
    if (harmony === "auto") $("#gen").title = "Last: " + g.kind;
  }
  $("#gen").addEventListener("click", next);
  $("#undo").addEventListener("click", function () { if (undoStack.length) commit(undoStack.pop(), false); });
  $$("#harmony button").forEach(function (b) {
    b.setAttribute("aria-pressed", String(b.dataset.v === harmony));
    b.addEventListener("click", function () { harmony = b.dataset.v; S3.store("pg.harmony", harmony); $$("#harmony button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); next(); });
  });
  document.addEventListener("keydown", function (e) {
    var t = e.target, typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName || "") || t.isContentEditable;
    if (e.code === "Space" && !typing && !e.repeat && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); next();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); $("#undo").click(); }
  });
  window.addEventListener("hashchange", function () { var p = parseHash(location.hash); if (p && p.join() !== colors.join()) commit(p, true); });

  commit(colors, false); renderSaved();

  window.S3_DEMO = function () { locks.fill(false); commit(["#1d3557", "#2a9d8f", "#8ecae6", "#f4a261", "#e76f51"], false); locks[1] = true; render(); };

  window.S3_SELFTEST = function () {
    function near(o, l, c, h) { return Math.abs(o.l - l) < 5e-4 && Math.abs(o.c - c) < 5e-4 && (h == null || Math.abs(o.h - h) < 0.05); }
    var ok = near(hexToOklch("#ff0000"), 0.62796, 0.25768, 29.234) && near(hexToOklch("#00ff00"), 0.86644, 0.29483, 142.495) &&
      near(hexToOklch("#0000ff"), 0.45201, 0.31321, 264.052) && near(hexToOklch("#ffffff"), 1, 0) && near(hexToOklch("#000000"), 0, 0) &&
      oklchToHex(0.62796, 0.25768, 29.234) === "#ff0000" && oklchToHex(0.45201, 0.31321, 264.052) === "#0000ff";
    // round-trip a spread of colours exactly
    for (var r = 0; r < 256 && ok; r += 17) for (var g = 0; g < 256 && ok; g += 51) for (var b = 0; b < 256; b += 85) {
      var hex = rgbToHex([r, g, b]), o = hexToOklch(hex); if (oklchToHex(o.l, o.c, o.h) !== hex) { ok = false; break; }
    }
    // out-of-gamut request keeps lightness and hue, lands inside sRGB
    var m = oklchToHex(0.7, 0.4, 150), mo = hexToOklch(m);
    ok = ok && Math.abs(mo.l - 0.7) < 0.01 && Math.abs(mo.h - 150) < 2 && mo.c < 0.4;
    ok = ok && Math.abs(contrast("#ffffff", "#000000") - 21) < 1e-9 && Math.abs(contrast("#777777", "#ffffff") - 4.48) < 0.01 && grade(4.6) === "AA" && grade(2) === "fail";
    var seed = 7, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    ["auto"].concat(HARMONIES).forEach(function (k) {
      var p = generate(k, [null, "#123456", null, null, null], rnd).colors;
      ok = ok && p.length === 5 && p.every(function (c) { return /^#[0-9a-f]{6}$/.test(c); }) && p[1] === "#123456";
    });
    ok = ok && parseHash("#ff0000-00ff00-0000ff-ffffff-000") !== null && parseHash("#ff0000-zz") === null && normHex("ABC") === "#aabbcc";
    return ok;
  };
})();
