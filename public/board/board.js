/* Schoology Board: the shared board app. The same file runs on the website and
   inside the offline download, so both behave identically. Plain JS, no build. */
(function () {
  'use strict';

  function readJson(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }
  var CFG = readJson('sb-config') || window.SB_CONFIG || { mode: 'web' };
  var MODE = CFG.mode || 'web';
  var BASE = CFG.assetBase || '/board/';
  var K = MODE === 'offline' ? 'schoology-board:offline:' + CFG.boardId : 'schoology-board:v1';
  var COLS = [['todo', 'Need to be done'], ['started', 'Started'], ['proctor', 'Needs to be proctored'], ['done', 'Completed']];
  var COL_IDS = COLS.map(function (c) { return c[0]; });
  var UNSORTED = 'Unsorted';
  var ics = window.SBics, cas = window.SBcas;
  var S, app;

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(k) { var p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function sod(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function monday(d) { var x = sod(d); var w = (x.getDay() + 6) % 7; return addDays(x, -w); }
  function toDate(due) { var d = new Date(due); return isNaN(d) ? new Date(8.64e15) : d; }
  var fmtDay = function (d) { return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }); };
  var fmtShort = function (d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  var fmtT = function (d) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
  function localStr(d) { return dayKey(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function isTyping(e) { var t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
  function svg(path) { return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>'; }
  var ICON = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    up: svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
    down: svg('<path d="M12 5v14M5 12l7 7 7-7"/>'),
    dl: svg('<path d="M12 3v12M6 11l6 6 6-6M4 21h16"/>'),
    tag: svg('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
    refresh: svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
    key: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
    left: svg('<path d="m15 18-6-6 6-6"/>'),
    right: svg('<path d="m9 18 6-6-6-6"/>'),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>')
  };

  // ---------- state ----------
  function blank() {
    return {
      v: 1, boardId: rid(), updated: 0, ics: {}, cas: {}, custom: {}, cats: [], order: [], rename: {},
      ov: {}, hidden: {}, status: {}, rules: [], lastImport: null, feedUrl: '', seenExport: null,
      prefs: { view: 'week', weekOffset: 0, from: '', to: '', hidePast: false, course: null, q: '' }
    };
  }
  function normalizeState(st) {
    st = Object.assign(blank(), st || {});
    st.prefs = Object.assign(blank().prefs, st.prefs || {});
    ['ics', 'cas', 'custom', 'rename', 'ov', 'hidden', 'status'].forEach(function (k) { if (!st[k] || typeof st[k] !== 'object') st[k] = {}; });
    ['cats', 'order', 'rules'].forEach(function (k) { if (!Array.isArray(st[k])) st[k] = []; });
    return st;
  }
  function load() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(K) || 'null'); } catch (e) { saved = null; }
    var baked = MODE === 'offline' ? readJson('sb-data') : null;
    var st = saved;
    if (baked && (!saved || (saved.seenExport !== baked.exportedAt && (baked.updated || 0) > (saved.updated || 0)))) st = baked;
    st = normalizeState(st);
    if (baked) st.seenExport = baked.exportedAt;
    return st;
  }
  function save() {
    S.updated = Date.now();
    try { localStorage.setItem(K, JSON.stringify(S)); }
    catch (e) { toast("Couldn't save to this browser's storage. Changes will be lost on reload."); }
  }

  // ---------- categories ----------
  function alias(name) {
    var n = name, guard = 0;
    while (n && S.rename[n] && guard++ < 10) n = S.rename[n];
    return n;
  }
  function ruleCourse(title) {
    var t = String(title || '').toLowerCase();
    for (var i = 0; i < S.rules.length; i++) if (S.rules[i].text && t.indexOf(S.rules[i].text) >= 0) return S.rules[i].course;
    return null;
  }
  function ruleKey(title) {
    var w = String(title || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(function (x) { return x.length > 1; });
    return w.slice(0, 2).join(' ');
  }

  // ---------- matching CAS <-> calendar ----------
  var STOP = { submit: 1, upload: 1, read: 1, complete: 1, the: 1, a: 1, an: 1, of: 1, and: 1, to: 1, for: 1, in: 1, on: 1, your: 1, by: 1, due: 1, at: 1, pm: 1, am: 1, et: 1, with: 1, my: 1, perform: 1 };
  function toks(t) {
    return String(t || '').toLowerCase().replace(/[\u201C\u201D"'\u2019]/g, '').replace(/\b0+(\d)/g, '$1')
      .replace(/[^a-z0-9.\-\s]+/g, ' ').split(/\s+/).map(function (w) { return w.replace(/^[.\-]+|[.\-]+$/g, ''); })
      .filter(function (w) { return w && !STOP[w]; });
  }
  function dayDiff(a, b) { return Math.round((sod(toDate(a)) - sod(toDate(b))) / 864e5); }
  function sameish(casItem, icsItem) {
    var close = Math.abs(dayDiff(casItem.due, icsItem.due)) <= 1 ||
      (casItem.classDate && Math.abs(dayDiff(casItem.classDate + 'T12:00', icsItem.due)) <= 1);
    if (!close) return false;
    if (casItem.course && icsItem.course && icsItem.course !== UNSORTED && alias(casItem.course).toLowerCase() !== alias(icsItem.course).toLowerCase()) return false;
    var rng = String(casItem.title).match(/(\d+)-(\d+)\s*(?:to|through|\u2013)\s*(\d+)-(\d+)/i);
    if (rng) {
      var m = String(icsItem.title).match(/(\d+)-(\d+)/);
      if (m && +m[1] === +rng[1] && +rng[1] === +rng[3] && +m[2] >= +rng[2] && +m[2] <= +rng[4]) return true;
    }
    var A = toks(casItem.title), B = toks(icsItem.title);
    if (!A.length || !B.length) return false;
    var nA = A.filter(function (w) { return /^\d/.test(w); }), nB = B.filter(function (w) { return /^\d/.test(w); });
    if (nA.length && nB.length && !nA.some(function (n) { return nB.indexOf(n) >= 0; })) return false;
    var setB = {}; B.forEach(function (w) { setB[w] = 1; });
    var common = 0, seen = {};
    A.forEach(function (w) { if (setB[w] && !seen[w]) { common++; seen[w] = 1; } });
    var minLen = Math.min(new Set(A).size, new Set(B).size);
    return common / minLen >= 0.6 && (common >= 2 || minLen === 1);
  }

  // ---------- items ----------
  var OV_FIELDS = ['title', 'course', 'due', 'url', 'note', 'allDay'];
  function allItems() {
    var out = [];
    Object.keys(S.ics).forEach(function (id) { if (!S.hidden[id]) out.push(Object.assign({}, S.ics[id], { id: id, source: 'ics' })); });
    Object.keys(S.cas).forEach(function (id) { if (!S.hidden[id]) out.push(Object.assign({}, S.cas[id], { id: id, source: 'cas' })); });
    Object.keys(S.custom).forEach(function (id) { out.push(Object.assign({}, S.custom[id], { id: id, source: 'custom' })); });
    out.forEach(function (it) {
      var ov = S.ov[it.id];
      if (ov) OV_FIELDS.forEach(function (f) { if (ov[f] !== undefined) it[f] = ov[f]; });
      if (!it.course && it.source === 'ics') { var rc = ruleCourse(it.title); if (rc) it.course = rc; }
      it.explicitCourse = !!it.course;
    });
    // Hide CAS cards that duplicate a calendar item; the calendar item borrows the class.
    var icsItems = out.filter(function (i) { return i.source === 'ics'; });
    var result = out.filter(function (it) {
      if (it.source !== 'cas') return true;
      for (var j = 0; j < icsItems.length; j++) {
        if (sameish(it, icsItems[j])) {
          var m = icsItems[j];
          if (!m.explicitCourse) { m.course = it.course; m.explicitCourse = true; }
          if (!S.status[m.id] && S.status[it.id]) m.inheritStatus = S.status[it.id];
          return false;
        }
      }
      return true;
    });
    result.forEach(function (it) {
      it.course = alias(it.course || UNSORTED) || UNSORTED;
      it.d = toDate(it.due);
      it.col = S.status[it.id] || it.inheritStatus || (/\bproctor/i.test(it.title) ? 'proctor' : 'todo');
      if (COL_IDS.indexOf(it.col) < 0) it.col = 'todo';
    });
    return result;
  }
  function categories(items) {
    var names = {};
    (items || allItems()).forEach(function (i) { names[i.course] = (names[i.course] || 0) + 1; });
    S.cats.forEach(function (c) { if (!names[c]) names[c] = 0; });
    var list = Object.keys(names);
    list.sort(function (a, b) {
      if (a === UNSORTED) return 1; if (b === UNSORTED) return -1;
      var ia = S.order.indexOf(a), ib = S.order.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1; if (ib >= 0) return 1;
      return a.localeCompare(b);
    });
    return list;
  }

  // ---------- views ----------
  function viewRange() {
    var p = S.prefs, today = sod(new Date());
    if (p.view === 'today') return { from: today, to: addDays(today, 1), label: 'Today', overdue: true };
    if (p.view === 'week') {
      var m = addDays(monday(today), 7 * (p.weekOffset || 0)), e = addDays(m, 6);
      return { from: m, to: addDays(m, 7), label: fmtShort(m) + '\u2013' + (e.getMonth() === m.getMonth() ? e.getDate() : fmtShort(e)) };
    }
    if (p.view === 'range' && (p.from || p.to)) {
      var f = p.from ? parseDay(p.from) : new Date(-8.64e15), t = p.to ? addDays(parseDay(p.to), 1) : new Date(8.64e15);
      return { from: f, to: t, label: (p.from ? fmtShort(f) : '\u2026') + '\u2013' + (p.to ? fmtShort(parseDay(p.to)) : '\u2026') };
    }
    return { from: null, to: null, label: 'All' };
  }
  function inView(it, r) {
    var today = sod(new Date());
    if (S.prefs.hidePast && it.d < today) return false;
    if (!r.from) return true;
    if (it.d >= r.from && it.d < r.to) return true;
    if (r.overdue && it.d < r.from && it.col !== 'done') return true;
    return false;
  }
  function matchesQ(it) {
    var q = (S.prefs.q || '').trim().toLowerCase();
    if (!q) return true;
    return (it.title + ' ' + it.course + ' ' + (it.note || '')).toLowerCase().indexOf(q) >= 0;
  }

  // ---------- toast ----------
  function toast(msg, action, fn, ms) {
    var box = $('#sb-toast');
    if (!box) { box = document.createElement('div'); box.id = 'sb-toast'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action) + '</button>' : '');
    if (action) t.querySelector('button').onclick = function () { fn(); t.remove(); };
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || (action ? 7000 : 3500));
  }

  // ---------- rendering ----------
  function hasData() { return Object.keys(S.ics).length + Object.keys(S.cas).length + Object.keys(S.custom).length > 0 || S.cats.length > 0; }
  function render() {
    if (!hasData()) return renderFirstRun();
    renderShell();
    renderBoard();
  }

  function renderShell() {
    app.innerHTML =
      '<header class="sb-head"><h1>Schoology Board <span id="sb-label"></span></h1>' +
      '<div class="right"><span id="sb-prog"></span><span class="progbar" aria-hidden="true"><i id="sb-bar"></i></span>' +
      '<button class="btn" id="sb-import" title="Import (I)">' + ICON.down + '<span class="lbl">Import</span></button>' +
      (S.feedUrl ? '<button class="btn" id="sb-refresh" title="Refresh from your calendar link">' + ICON.refresh + '<span class="lbl">Refresh</span></button>' : '') +
      '<button class="btn" id="sb-add" title="Add a task (N)">' + ICON.plus + '<span class="lbl">Add</span></button>' +
      '<button class="btn" id="sb-cats" title="Categories">' + ICON.tag + '<span class="lbl">Categories</span></button>' +
      '<button class="btn primary" id="sb-offline" title="Download a self-contained copy that works without internet">' + ICON.dl + '<span class="lbl">Download for offline</span></button>' +
      '<button class="btn ghost" id="sb-keys" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">' + ICON.key + '</button>' +
      '</div></header>' +
      '<div class="sb-tools">' +
      '<div class="seg" role="group" aria-label="View"><button data-view="today">Due today</button><button data-view="week">Week</button><button data-view="all">All</button><button data-view="range">Range</button></div>' +
      '<span class="weeknav" id="sb-weeknav"><button class="btn ghost" id="sb-prev" aria-label="Previous week" title="Previous week ([)">' + ICON.left + '</button><b id="sb-week"></b><button class="btn ghost" id="sb-next" aria-label="Next week" title="Next week (])">' + ICON.right + '</button><button class="btn ghost small" id="sb-thisweek">This week</button></span>' +
      '<span class="range" id="sb-range"><input type="date" id="sb-from" aria-label="From"> to <input type="date" id="sb-to" aria-label="To"></span>' +
      '<label class="toggle"><input type="checkbox" id="sb-hidepast"> Hide past</label>' +
      '<input type="search" id="sb-search" placeholder="Search   /" aria-label="Search tasks">' +
      '</div>' +
      '<div class="chips" id="sb-chips" role="group" aria-label="Filter by class"></div>' +
      '<main class="board" id="sb-board" aria-label="Board"></main>' +
      '<div class="foot">' + (MODE === 'offline' ? 'Offline copy \u00b7 progress is saved in this browser' + (CFG.home ? ' \u00b7 <a href="' + esc(CFG.home) + '" target="_blank" rel="noopener">open the website</a>' : '') :
        'Everything stays in your browser \u00b7 <a href="https://github.com/nyfeblade/schoology-board" target="_blank" rel="noopener">Open source</a>') +
      ' \u00b7 <a href="#" id="sb-reset">Reset board</a></div>';
    $('#sb-import').onclick = openImport;
    $('#sb-add').onclick = function () { openEditor(null); };
    $('#sb-cats').onclick = openCategories;
    $('#sb-offline').onclick = downloadOffline;
    $('#sb-keys').onclick = openKeys;
    if ($('#sb-refresh')) $('#sb-refresh').onclick = function () { importLink(S.feedUrl, true); };
    $('#sb-reset').onclick = function (e) {
      e.preventDefault();
      if (confirm('Reset the board? This clears imported tasks, progress and categories in this browser.')) {
        try { localStorage.removeItem(K); } catch (x) { }
        S = blank(); if (MODE === 'offline') S.seenExport = (readJson('sb-data') || {}).exportedAt;
        save(); render();
      }
    };
    $$('.seg button').forEach(function (b) { b.onclick = function () { setView(b.dataset.view); }; });
    $('#sb-prev').onclick = function () { S.prefs.weekOffset--; save(); renderBoard(); };
    $('#sb-next').onclick = function () { S.prefs.weekOffset++; save(); renderBoard(); };
    $('#sb-thisweek').onclick = function () { S.prefs.weekOffset = 0; save(); renderBoard(); };
    $('#sb-from').onchange = function () { S.prefs.from = this.value; save(); renderBoard(); };
    $('#sb-to').onchange = function () { S.prefs.to = this.value; save(); renderBoard(); };
    $('#sb-hidepast').onchange = function () { S.prefs.hidePast = this.checked; save(); renderBoard(); };
    $('#sb-search').oninput = function () { S.prefs.q = this.value; renderBoard(); };
  }
  function setView(v) {
    S.prefs.view = v;
    if (v === 'range' && !S.prefs.from && !S.prefs.to) { var m = monday(new Date()); S.prefs.from = dayKey(m); S.prefs.to = dayKey(addDays(m, 13)); }
    save(); renderBoard();
  }

  function cardHtml(it, colId) {
    var h = (it.d - new Date()) / 36e5, done = colId === 'done';
    var cls = done ? '' : (h < 0 ? ' soon late' : h < 36 ? ' soon' : '');
    var url = safeUrl(it.url);
    var when = it.allDay ? 'All day' : fmtT(it.d);
    if (done) when = it.d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + when;
    var meta = (it.note ? esc(it.note) + ' \u00b7 ' : '') + (h < 0 && !done ? 'Overdue \u00b7 ' : '') + esc(when);
    var src = it.source === 'cas' ? '<span class="src" title="From a Course Assignment Sheet">CAS</span>' : it.source === 'custom' ? '<span class="src" title="Added by you">Mine</span>' : '';
    var label = it.title + ', ' + it.course + ', due ' + fmtDay(it.d) + ' ' + when + (done ? ', done' : '');
    return '<div class="card' + cls + '" tabindex="0" data-id="' + esc(it.id) + '" aria-label="' + esc(label) + '">' +
      (url ? '<a class="t" href="' + esc(url) + '" target="_blank" rel="noopener" draggable="false" tabindex="-1">' + esc(it.title) + '</a>' : '<span class="t">' + esc(it.title) + '</span>') +
      '<div class="m"><span class="l"><span class="tag">' + esc(it.course) + '</span>' + src + '</span><b>' + meta + '</b></div>' +
      '<button class="more" type="button" tabindex="-1" aria-label="Edit" title="Edit (E)">\u22ef</button></div>';
  }

  var lastItems = [];
  function renderBoard() {
    if (!$('#sb-board')) return render();
    var items = allItems(), r = viewRange(), p = S.prefs;
    var viewItems = items.filter(function (it) { return inView(it, r) && matchesQ(it); });
    var cats = categories(items);
    $('#sb-label').textContent = r.label;
    $$('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === p.view)); });
    $('#sb-weeknav').style.display = p.view === 'week' ? '' : 'none';
    $('#sb-week').textContent = p.weekOffset === 0 ? 'This week' : r.label;
    $('#sb-thisweek').style.display = p.weekOffset ? '' : 'none';
    $('#sb-range').style.display = p.view === 'range' ? '' : 'none';
    $('#sb-from').value = p.from || ''; $('#sb-to').value = p.to || '';
    $('#sb-hidepast').checked = !!p.hidePast;
    if (document.activeElement !== $('#sb-search')) $('#sb-search').value = p.q || '';
    var counts = {}, soon = {};
    viewItems.forEach(function (it) {
      if (it.col === 'done') return;
      counts[it.course] = (counts[it.course] || 0) + 1;
      if ((it.d - new Date()) / 36e5 < 36) soon[it.course] = (soon[it.course] || 0) + 1;
    });
    var openTotal = viewItems.filter(function (i) { return i.col !== 'done'; }).length;
    if (p.course && cats.indexOf(p.course) < 0) p.course = null;
    $('#sb-chips').innerHTML = '<button class="chip" data-c="" aria-pressed="' + (!p.course) + '">All classes <b>' + openTotal + '</b></button>' +
      cats.map(function (c) {
        return '<button class="chip" data-c="' + esc(c) + '" aria-pressed="' + (p.course === c) + '">' + esc(c) + ' <b>' + (counts[c] || 0) + '</b>' +
          (soon[c] ? '<span class="due" title="Due within 36 hours">\u2022 ' + soon[c] + '</span>' : '') + '</button>';
      }).join('');
    $$('#sb-chips .chip').forEach(function (b) { b.onclick = function () { S.prefs.course = b.dataset.c || null; save(); renderBoard(); }; });
    var shown = viewItems.filter(function (it) { return !p.course || it.course === p.course; });
    lastItems = shown;
    var html = '', today = dayKey(new Date());
    COLS.forEach(function (c) {
      var id = c[0], list = shown.filter(function (it) { return it.col === id; }).sort(function (a, b) { return a.d - b.d || a.title.localeCompare(b.title); });
      html += '<section class="col' + (id === 'done' ? ' done' : '') + '" data-col="' + id + '" aria-label="' + esc(c[1]) + '"><h2>' + esc(c[1]) + '<span>' + list.length + '</span></h2>';
      if (!list.length) html += '<div class="empty-col">' + (id === 'todo' ? (viewItems.length ? 'Nothing left here. Nice.' : (items.length ? 'Nothing due in this view' : 'No tasks yet')) : 'Drop cards here') + '</div>';
      if (id === 'done') list.forEach(function (it) { html += cardHtml(it, id); });
      else cats.forEach(function (cl) {
        var g = list.filter(function (it) { return it.course === cl; });
        if (!g.length) return;
        html += '<div class="cls">' + esc(cl) + '<span>' + g.length + '</span></div>';
        var last = '';
        g.forEach(function (it) {
          var dk = dayKey(it.d);
          if (dk !== last) { html += '<div class="day' + (dk === today ? ' today' : '') + '">' + (dk === today ? 'Today \u00b7 ' : '') + esc(fmtDay(it.d)) + '</div>'; last = dk; }
          html += cardHtml(it, id);
        });
      });
      html += '</section>';
    });
    $('#sb-board').innerHTML = html;
    var done = shown.filter(function (i) { return i.col === 'done'; }).length;
    $('#sb-prog').textContent = done + ' of ' + shown.length + ' done';
    $('#sb-bar').style.width = (shown.length ? Math.round(100 * done / shown.length) : 0) + '%';
    bindCards();
  }

  function itemById(id) {
    for (var i = 0; i < lastItems.length; i++) if (lastItems[i].id === id) return lastItems[i];
    var all = allItems();
    for (var j = 0; j < all.length; j++) if (all[j].id === id) return all[j];
    return null;
  }
  function setStatus(id, col, quiet) {
    var prev = (itemById(id) || {}).col || 'todo';
    if (prev === col) return;
    S.status[id] = col; save(); renderBoard();
    focusCard(id);
    if (!quiet) {
      var name = COLS.filter(function (c) { return c[0] === col; })[0][1];
      toast('Moved to ' + name, 'Undo', function () { S.status[id] = prev; save(); renderBoard(); focusCard(id); }, 4000);
    }
  }
  function focusCard(id) {
    var el = $('.card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (el) el.focus();
  }
  function toggleDone(id) {
    var it = itemById(id); if (!it) return;
    setStatus(id, it.col === 'done' ? 'todo' : 'done', true);
  }
  function deleteItem(id) {
    var it = itemById(id); if (!it) return;
    var snap = JSON.stringify(S);
    if (it.source === 'custom') delete S.custom[id];
    else S.hidden[id] = 1;
    save(); renderBoard();
    toast('Deleted "' + it.title.slice(0, 40) + '"', 'Undo', function () { S = normalizeState(JSON.parse(snap)); save(); renderBoard(); });
  }

  // ---------- drag and drop (mouse, pen and touch via pointer events) ----------
  var drag = null, suppressClick = false;
  function bindCards() {
    $$('#sb-board .card').forEach(function (el) {
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('dblclick', function (e) { if (e.target.closest('.more')) return; e.preventDefault(); toggleDone(el.dataset.id); });
      el.querySelector('.more').addEventListener('click', function (e) { e.stopPropagation(); openEditor(el.dataset.id); });
      var a = el.querySelector('a.t');
      if (a) a.addEventListener('click', function (e) { if (suppressClick) { e.preventDefault(); suppressClick = false; } });
    });
  }
  function onDown(e) {
    if (e.button !== 0 || e.target.closest('.more')) return;
    var el = e.currentTarget;
    drag = { el: el, id: el.dataset.id, x: e.clientX, y: e.clientY, started: false, touch: e.pointerType === 'touch', pid: e.pointerId, timer: null };
    if (drag.touch) drag.timer = setTimeout(function () { if (drag && !drag.started) { startDrag(drag.x, drag.y); if (navigator.vibrate) navigator.vibrate(12); } }, 260);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
  }
  function startDrag(x, y) {
    var r = drag.el.getBoundingClientRect();
    var g = drag.el.cloneNode(true); g.classList.add('drag-ghost'); g.style.width = r.width + 'px';
    g.removeAttribute('tabindex'); g.setAttribute('aria-hidden', 'true');
    document.body.appendChild(g);
    drag.ghost = g; drag.dx = x - r.left; drag.dy = y - r.top; drag.started = true;
    drag.el.classList.add('dragging');
    document.body.style.cursor = 'grabbing';
    moveGhost(x, y);
  }
  function moveGhost(x, y) {
    drag.ghost.style.left = (x - drag.dx) + 'px'; drag.ghost.style.top = (y - drag.dy) + 'px';
    var under = document.elementFromPoint(x, y), col = under && under.closest ? under.closest('.col') : null;
    $$('.col.over').forEach(function (c) { if (c !== col) c.classList.remove('over'); });
    if (col) col.classList.add('over');
    drag.col = col;
    var m = 48, b = $('#sb-board');
    if (y < m) window.scrollBy(0, -12); else if (y > innerHeight - m) window.scrollBy(0, 12);
    if (b && b.scrollWidth > b.clientWidth) { if (x < m) b.scrollLeft -= 14; else if (x > innerWidth - m) b.scrollLeft += 14; }
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    var dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (!drag.started) {
      if (drag.touch) { if (dist > 8) cleanupDrag(); return; } // a swipe: let the page scroll
      if (dist > 5) startDrag(e.clientX, e.clientY); else return;
    }
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);
  }
  function onUp() {
    if (!drag) return;
    if (drag.started) {
      suppressClick = true; setTimeout(function () { suppressClick = false; }, 60);
      var col = drag.col, id = drag.id;
      cleanupDrag();
      if (col) setStatus(id, col.dataset.col, true);
    } else cleanupDrag();
  }
  function onCancel() { cleanupDrag(); }
  function cleanupDrag() {
    if (!drag) return;
    clearTimeout(drag.timer);
    if (drag.ghost) drag.ghost.remove();
    if (drag.el) drag.el.classList.remove('dragging');
    $$('.col.over').forEach(function (c) { c.classList.remove('over'); });
    document.body.style.cursor = '';
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    drag = null;
  }
  document.addEventListener('touchmove', function (e) { if (drag && drag.started) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', function (e) { if (drag && drag.touch) e.preventDefault(); });

  // ---------- keyboard ----------
  function cardsInCol(col) { return $$('.col[data-col="' + col + '"] .card'); }
  document.addEventListener('keydown', function (e) {
    if (document.querySelector('dialog[open]')) return;
    if (isTyping(e)) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var ae = document.activeElement;
    var card = ae && ae.classList && ae.classList.contains('card') ? ae : null;
    var k = e.key;
    if (card) {
      var id = card.dataset.id, col = card.closest('.col').dataset.col, ci = COL_IDS.indexOf(col);
      if (k === 'Enter') { var a = card.querySelector('a.t'); if (a) a.click(); else openEditor(id); e.preventDefault(); return; }
      if (k === 'e' || k === 'E') { openEditor(id); e.preventDefault(); return; }
      if (k === 'x' || k === ' ') { toggleDone(id); e.preventDefault(); return; }
      if (/^[1-4]$/.test(k)) { setStatus(id, COL_IDS[+k - 1]); e.preventDefault(); return; }
      if (k === 'Delete' || k === 'Backspace') { deleteItem(id); e.preventDefault(); return; }
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && e.shiftKey) {
        var ni = Math.max(0, Math.min(3, ci + (k === 'ArrowLeft' ? -1 : 1)));
        if (ni !== ci) setStatus(id, COL_IDS[ni]);
        e.preventDefault(); return;
      }
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'j' || k === 'k') {
        var list = cardsInCol(col), i = list.indexOf(card), n = list[i + ((k === 'ArrowDown' || k === 'j') ? 1 : -1)];
        if (n) n.focus(); e.preventDefault(); return;
      }
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        var top = card.getBoundingClientRect().top, step = k === 'ArrowLeft' ? -1 : 1;
        for (var s = ci + step; s >= 0 && s < 4; s += step) {
          var l2 = cardsInCol(COL_IDS[s]);
          if (l2.length) {
            var best = l2[0], bd = Infinity;
            l2.forEach(function (c) { var dd = Math.abs(c.getBoundingClientRect().top - top); if (dd < bd) { bd = dd; best = c; } });
            best.focus(); break;
          }
        }
        e.preventDefault(); return;
      }
    }
    if (!hasData()) return;
    if (k === 'n' || k === 'N') { openEditor(null); e.preventDefault(); }
    else if (k === 'i' || k === 'I') { openImport(); e.preventDefault(); }
    else if (k === '/') { var sb = $('#sb-search'); if (sb) { sb.focus(); e.preventDefault(); } }
    else if (k === '?') { openKeys(); e.preventDefault(); }
    else if (k === 't') setView('today');
    else if (k === 'w') setView('week');
    else if (k === 'a') setView('all');
    else if (k === '[') { S.prefs.view = 'week'; S.prefs.weekOffset--; save(); renderBoard(); }
    else if (k === ']') { S.prefs.view = 'week'; S.prefs.weekOffset++; save(); renderBoard(); }
    else if (k === 'h') { S.prefs.hidePast = !S.prefs.hidePast; save(); renderBoard(); }
    else if (k === 'ArrowDown' || k === 'j') { var f = $('#sb-board .card'); if (f) { f.focus(); e.preventDefault(); } }
  });

  // ---------- dialogs ----------
  function dialog(title, body, foot, wide) {
    var d = document.createElement('dialog');
    if (wide) d.className = 'wide';
    d.innerHTML = '<div class="dlg-h"><h3>' + esc(title) + '</h3><button class="btn ghost" data-close aria-label="Close">' + ICON.x + '</button></div>' +
      '<div class="dlg-b">' + body + '</div>' + (foot ? '<div class="dlg-f">' + foot + '</div>' : '');
    document.body.appendChild(d);
    d.addEventListener('close', function () { d.remove(); });
    $$('[data-close]', d).forEach(function (b) { b.onclick = function () { d.close(); }; });
    d.addEventListener('mousedown', function (e) { if (e.target === d) d.close(); });
    d.showModal();
    return d;
  }

  function openKeys() {
    var rows = [['N', 'Add a task'], ['I', 'Import a calendar link, .ics or CAS PDF'], ['/', 'Search'], ['T W A', 'Due today, Week, All'], ['[ ]', 'Previous / next week'], ['H', 'Hide past'],
      ['\u2191 \u2193 \u2190 \u2192', 'Move focus between cards'], ['1 2 3 4', 'Move the card to a column'], ['Shift+\u2190 Shift+\u2192', 'Move the card one column'], ['X Space', 'Toggle done (or double-click)'],
      ['E', 'Edit the card'], ['Enter', 'Open it in Schoology'], ['Delete', 'Delete the card (with undo)'], ['?', 'This list']];
    dialog('Keyboard shortcuts', '<div class="keys">' + rows.map(function (r) {
      return '<span>' + r[0].split(' ').map(function (x) { return '<kbd>' + esc(x) + '</kbd>'; }).join(' ') + '</span><span class="muted">' + esc(r[1]) + '</span>';
    }).join('') + '</div><p class="hint">Drag cards between columns with a mouse, or long-press and drag on a touch screen.</p>');
  }

  function catOptions(sel) {
    var cats = categories();
    if (sel && cats.indexOf(sel) < 0) cats.unshift(sel);
    return cats.map(function (c) { return '<option' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
      '<option value="__new">+ New category\u2026</option>';
  }
  function bindNewCat(selectEl) {
    var prev = selectEl.value;
    selectEl.addEventListener('change', function () {
      if (selectEl.value !== '__new') { prev = selectEl.value; return; }
      var name = (prompt('New category name') || '').trim();
      if (name) {
        if (categories().indexOf(name) < 0) S.cats.push(name);
        save();
        var o = document.createElement('option'); o.textContent = name; selectEl.insertBefore(o, selectEl.lastElementChild); selectEl.value = name; prev = name;
      } else selectEl.value = prev;
    });
  }

  function openEditor(id) {
    var it = id ? itemById(id) : null;
    var base = it ? (it.source === 'ics' ? S.ics[id] : it.source === 'cas' ? S.cas[id] : S.custom[id]) : null;
    var d0 = it ? it.d : addDays(sod(new Date()), 1);
    var timeStr = it && !it.allDay ? pad(d0.getHours()) + ':' + pad(d0.getMinutes()) : '';
    var cats = categories();
    var defCourse = it ? it.course : (S.prefs.course || (cats[0] && cats[0] !== UNSORTED ? cats[0] : UNSORTED));
    var note = it && it.source === 'ics' ? '<p class="hint">From your Schoology calendar. Your edits are kept when you re-import.</p>' :
      it && it.source === 'cas' ? '<p class="hint">From a Course Assignment Sheet. Your edits are kept when you re-import your calendar.</p>' : '';
    var body = '<form class="form" id="ed-form" autocomplete="off">' +
      '<label for="ed-title">Title</label><input type="text" id="ed-title" required value="' + esc(it ? it.title : '') + '" placeholder="e.g. Read chapter 4, pp 80-95">' +
      '<label for="ed-cat">Category</label><select id="ed-cat">' + catOptions(defCourse) + '</select>' +
      '<label for="ed-date">Due</label><span class="two"><input type="date" id="ed-date" required value="' + dayKey(d0) + '"><input type="time" id="ed-time" value="' + timeStr + '" aria-label="Due time (optional)"></span>' +
      '<label for="ed-url">Link</label><input type="url" id="ed-url" placeholder="https://\u2026 (optional)" value="' + esc(it && it.url || '') + '">' +
      '<label for="ed-note">Note</label><input type="text" id="ed-note" placeholder="e.g. Before class (optional)" value="' + esc(it && it.note || '') + '">' +
      (it ? '' : '<label for="ed-col">Column</label><select id="ed-col">' + COLS.map(function (c) { return '<option value="' + c[0] + '">' + esc(c[1]) + '</option>'; }).join('') + '</select>') +
      '<button type="submit" hidden></button></form>' + note;
    var foot = (it ? '<button class="btn danger" id="ed-del">Delete</button>' + (it.source !== 'custom' && S.ov[id] ? '<button class="btn ghost" id="ed-revert">Reset to original</button>' : '') : '') +
      '<span class="r"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ed-save">' + (it ? 'Save' : 'Add task') + '</button></span>';
    var d = dialog(it ? 'Edit task' : 'Add a task', body, foot);
    bindNewCat($('#ed-cat', d));
    setTimeout(function () { $('#ed-title', d).focus(); }, 30);
    function submit(e) {
      if (e) e.preventDefault();
      var title = $('#ed-title', d).value.trim(), date = $('#ed-date', d).value, time = $('#ed-time', d).value;
      if (!title) { $('#ed-title', d).focus(); return; }
      if (!date) { $('#ed-date', d).focus(); return; }
      var course = $('#ed-cat', d).value; if (course === '__new') course = UNSORTED;
      var url = $('#ed-url', d).value.trim(); if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      var rec = { title: title, course: course, due: date + 'T' + (time || '23:59'), allDay: !time, url: url || null, note: $('#ed-note', d).value.trim() };
      if (!it) {
        var nid = 'custom-' + rid();
        S.custom[nid] = Object.assign({ id: nid, source: 'custom', created: Date.now() }, rec);
        var col = $('#ed-col', d).value; if (col !== 'todo') S.status[nid] = col;
        save(); d.close(); renderBoard(); focusCard(nid); toast('Added "' + title.slice(0, 40) + '"');
        return;
      }
      if (it.source === 'custom') Object.assign(S.custom[id], rec);
      else {
        var ov = {}, b = base || {}, prevOv = S.ov[id] || {};
        var baseDue = b.due ? toDate(b.due) : null;
        if (rec.title !== b.title) ov.title = rec.title;
        if (rec.course !== it.course || prevOv.course) ov.course = rec.course;
        if (!baseDue || localStr(baseDue) !== rec.due.slice(0, 16) || !!b.allDay !== rec.allDay) { ov.due = rec.due; ov.allDay = rec.allDay; }
        if ((rec.url || null) !== (b.url || null)) ov.url = rec.url;
        if ((rec.note || '') !== (b.note || '')) ov.note = rec.note;
        if (Object.keys(ov).length) S.ov[id] = ov; else delete S.ov[id];
      }
      save(); d.close(); renderBoard(); focusCard(id);
      if (it.source === 'ics' && !(base && base.course) && rec.course !== it.course && rec.course !== UNSORTED) suggestRule(it.title, rec.course, id);
    }
    $('#ed-form', d).onsubmit = submit;
    $('#ed-save', d).onclick = submit;
    if ($('#ed-del', d)) $('#ed-del', d).onclick = function () { d.close(); deleteItem(id); };
    if ($('#ed-revert', d)) $('#ed-revert', d).onclick = function () { delete S.ov[id]; save(); d.close(); renderBoard(); };
  }

  function suggestRule(title, course, exceptId) {
    var key = ruleKey(title); if (!key || key.length < 4) return;
    var similar = allItems().filter(function (i) { return i.source === 'ics' && i.id !== exceptId && !S.ov[i.id] && i.course === UNSORTED && i.title.toLowerCase().indexOf(key) >= 0; });
    if (!similar.length) return;
    toast('Also sort ' + similar.length + ' more "' + key + '\u2026" item' + (similar.length > 1 ? 's' : '') + ' into ' + course + '?', 'Yes', function () {
      S.rules.push({ text: key, course: course }); save(); renderBoard();
    }, 9000);
  }

  function openCategories() {
    function draw() {
      var items = allItems(), cats = categories(items), counts = {};
      items.forEach(function (i) { counts[i.course] = (counts[i.course] || 0) + 1; });
      return '<div class="cats"><ul>' + cats.map(function (c, i) {
        var custom = S.cats.indexOf(c) >= 0, n = counts[c] || 0;
        return '<li data-c="' + esc(c) + '"><input type="text" value="' + esc(c) + '" aria-label="Category name"' + (c === UNSORTED ? ' disabled' : '') + '>' +
          '<span class="n">' + n + ' task' + (n === 1 ? '' : 's') + '</span>' +
          '<button class="btn ghost" data-up ' + (i === 0 || c === UNSORTED ? 'disabled' : '') + ' aria-label="Move up">' + ICON.up + '</button>' +
          '<button class="btn ghost" data-down ' + (i >= cats.length - 1 || c === UNSORTED || cats[i + 1] === UNSORTED ? 'disabled' : '') + ' aria-label="Move down">' + ICON.down + '</button>' +
          (custom ? '<button class="btn ghost danger" data-del aria-label="Delete category ' + esc(c) + '">' + ICON.x + '</button>' : '<span style="width:38px;display:inline-block" title="Comes from your calendar or a CAS"></span>') + '</li>';
      }).join('') + '</ul>' +
        '<form class="row" id="cat-add" style="margin-top:14px"><input type="text" id="cat-new" placeholder="New category, e.g. Reading list or SAT prep" aria-label="New category name"><button class="btn primary">Add</button></form>' +
        '<p class="hint">Rename any category; renames survive re-imports. Categories you create can be deleted (their tasks move to Unsorted). Order here is the order on the board.</p></div>';
    }
    var d = dialog('Categories', draw(), '<span class="r"><button class="btn primary" data-close>Done</button></span>');
    function bind() {
      var b = $('.dlg-b', d);
      $$('li', b).forEach(function (li) {
        var name = li.dataset.c, inp = $('input', li);
        inp.onchange = function () { renameCategory(name, inp.value.trim()); refresh(); };
        inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } };
        var up = $('[data-up]', li), dn = $('[data-down]', li), del = $('[data-del]', li);
        if (up) up.onclick = function () { moveCategory(name, -1); refresh(); };
        if (dn) dn.onclick = function () { moveCategory(name, 1); refresh(); };
        if (del) del.onclick = function () { if (confirm('Delete category "' + name + '"? Its tasks move to Unsorted.')) { deleteCategory(name); refresh(); } };
      });
      $('#cat-add', b).onsubmit = function (e) {
        e.preventDefault(); var v = $('#cat-new', b).value.trim();
        if (v && categories().indexOf(v) < 0) { S.cats.push(v); save(); refresh(); $('#cat-new', d).focus(); }
      };
    }
    function refresh() { $('.dlg-b', d).innerHTML = draw(); bind(); renderBoard(); }
    bind();
  }
  function renameCategory(from, to) {
    if (!to || to === from || from === UNSORTED || to === UNSORTED) return;
    var swap = function (v) { return v === from ? to : v; };
    S.cats = S.cats.map(swap).filter(function (c, i, a) { return a.indexOf(c) === i; });
    S.order = S.order.map(swap);
    Object.keys(S.custom).forEach(function (k) { S.custom[k].course = swap(S.custom[k].course); });
    Object.keys(S.cas).forEach(function (k) { S.cas[k].course = swap(S.cas[k].course); });
    Object.keys(S.ov).forEach(function (k) { if (S.ov[k].course) S.ov[k].course = swap(S.ov[k].course); });
    S.rules.forEach(function (r) { r.course = swap(r.course); });
    if (S.prefs.course === from) S.prefs.course = to;
    Object.keys(S.rename).forEach(function (k) { if (S.rename[k] === from) S.rename[k] = to; });
    delete S.rename[to];
    if (Object.keys(S.ics).some(function (k) { return S.ics[k].course === from; })) S.rename[from] = to; // names from the feed itself
    save();
  }
  function deleteCategory(name) {
    S.cats = S.cats.filter(function (c) { return c !== name; });
    S.order = S.order.filter(function (c) { return c !== name; });
    Object.keys(S.custom).forEach(function (k) { if (S.custom[k].course === name) S.custom[k].course = UNSORTED; });
    Object.keys(S.cas).forEach(function (k) { if (S.cas[k].course === name) S.cas[k].course = UNSORTED; });
    Object.keys(S.ov).forEach(function (k) { if (S.ov[k].course === name) delete S.ov[k].course; });
    S.rules = S.rules.filter(function (r) { return r.course !== name; });
    if (S.prefs.course === name) S.prefs.course = null;
    save();
  }
  function moveCategory(name, dir) {
    var cats = categories().filter(function (c) { return c !== UNSORTED; });
    var i = cats.indexOf(name), j = i + dir;
    if (i < 0 || j < 0 || j >= cats.length) return;
    cats[i] = cats[j]; cats[j] = name; S.order = cats; save();
  }

  // ---------- import ----------
  function importPanel(first) {
    var canLink = MODE === 'web' || !!CFG.proxy;
    return '<div class="step"><h3><i>1</i> Paste your Schoology calendar link</h3>' +
      '<form class="row" id="imp-form"><input type="url" id="imp-url" placeholder="webcal://\u2026 or https://\u2026/calendar/feed/ical/\u2026" aria-label="Schoology calendar link" value="' + esc(S.feedUrl || '') + '"' + (canLink ? '' : ' disabled') + '>' +
      '<button class="btn primary" id="imp-go"' + (canLink ? '' : ' disabled') + '>Build my board</button></form>' +
      '<label class="toggle small" style="margin-top:8px"><input type="checkbox" id="imp-remember"' + (S.feedUrl || first ? ' checked' : '') + '> Remember the link on this device for one-click refresh</label>' +
      '<div class="err" id="imp-err" role="alert"></div>' +
      (MODE === 'offline' ? '<p class="hint">Needs internet: the link is fetched through ' + esc(CFG.home || 'the website') + '. Offline, drop an .ics file instead.</p>' : '') +
      '<details class="how"><summary>Where do I find this link?</summary><ol>' +
      '<li>In Schoology, open the account menu (top-right) and choose <b>Settings</b> (Account Settings).</li>' +
      '<li>Under <b>Share Your Schoology Calendar</b>, click <b>Enable</b>.</li>' +
      '<li>Copy the URL in <b>Use this iCal link</b> and paste it here.</li></ol>' +
      '<p class="small muted">Steps from PowerSchool\'s Schoology help. Your calendar needs at least one entry. Some schools hide this setting. Treat the link like a password: anyone with it can read your calendar.</p></details></div>' +
      '<div class="or">or</div>' +
      '<div class="step"><h3><i>2</i> Drop files</h3><label class="drop" id="imp-drop" tabindex="0"><input type="file" id="imp-file" class="sr" multiple accept=".ics,.ical,.ifb,.pdf,text/calendar,application/pdf">' +
      '<b>Drop a Schoology .ics file or Course Assignment Sheet PDFs</b><br><span class="small">or click to choose \u00b7 PDFs are read right here in your browser</span></label>' +
      '<div class="err" id="imp-ferr" role="alert"></div></div>';
  }
  function bindImport(root, onDone) {
    $('#imp-form', root).onsubmit = function (e) {
      e.preventDefault();
      var url = $('#imp-url', root).value.trim();
      if (!url) { $('#imp-err', root).textContent = 'Paste your calendar link first.'; $('#imp-url', root).focus(); return; }
      importLink(url, $('#imp-remember', root).checked, root, onDone);
    };
    var drop = $('#imp-drop', root), file = $('#imp-file', root);
    file.onchange = function () { var fs = Array.prototype.slice.call(file.files); file.value = ''; importFiles(fs, root, onDone); };
    drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { importFiles(Array.prototype.slice.call(e.dataTransfer.files), root, onDone); });
  }
  function openImport() {
    var d = dialog('Import', importPanel(false), '');
    bindImport(d, function () { if (d.open) d.close(); });
  }

  function renderFirstRun() {
    app.innerHTML = '<div class="hero"><h2>Your Schoology assignments,<br>on one <span>board</span>.</h2>' +
      '<p class="lead">Paste your calendar link or drop your files and you\'re set. Drag cards from <b>Need to be done</b> to <b>Completed</b>. Your board lives in your browser.</p>' +
      importPanel(true) +
      (CFG.sampleUrl ? '<div class="or">or</div><div style="text-align:center"><button class="btn" id="imp-sample">Try the sample board</button><p class="hint">Made-up classes and assignments, so you can look around first.</p></div>' : '') +
      '</div><div class="foot">' + (MODE === 'web' ? 'Free and <a href="https://github.com/nyfeblade/schoology-board" target="_blank" rel="noopener">open source</a>. Not affiliated with Schoology or PowerSchool.' : 'Offline copy') + '</div>';
    bindImport(app, null);
    if ($('#imp-sample')) $('#imp-sample').onclick = loadSample;
    setTimeout(function () { var u = $('#imp-url'); if (u && !u.disabled && matchMedia('(hover:hover)').matches) u.focus(); }, 0);
  }

  function busy(root, on, msg) {
    var b = root && $('#imp-go', root);
    if (b) { b.disabled = on; b.innerHTML = on ? '<span class="spinner"></span> ' + esc(msg || 'Loading\u2026') : 'Build my board'; }
  }
  function normalizeFeedUrl(u) {
    u = u.trim().replace(/^webcals?:\/\//i, 'https://');
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }
  function importLink(url, remember, root, onDone) {
    url = normalizeFeedUrl(url);
    var errEl = root ? $('#imp-err', root) : null;
    if (errEl) errEl.textContent = '';
    busy(root, true, 'Fetching your calendar\u2026');
    var rbtn = $('#sb-refresh'); if (rbtn && !root) rbtn.disabled = true;
    var proxy = MODE === 'web' ? (CFG.proxy || '/api/feed') : CFG.proxy;
    fetch(proxy, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url }), cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.error || ('Could not fetch the calendar (' + r.status + ').')); });
        return r.arrayBuffer();
      })
      .then(function (buf) {
        var text = ics.decodeBytes(buf);
        var had = !!S.feedUrl;
        S.feedUrl = remember ? url : '';
        applyIcs(text, 'link');
        if (had !== !!S.feedUrl) { renderShell(); renderBoard(); }
        if (onDone) onDone();
      })
      .catch(function (e) {
        var msg = e && e.message && !/Failed to fetch|NetworkError|Load failed/i.test(e.message) ? e.message : 'Network error. Check your connection and try again.';
        if (errEl) errEl.textContent = msg; else toast(msg);
      })
      .then(function () { busy(root, false); if (rbtn) rbtn.disabled = false; });
  }

  function applyIcs(text, source, opts) {
    var items = ics.parseIcs(text);
    if (opts && opts.shiftMs) items.forEach(function (it) {
      var d = new Date(toDate(it.due).getTime() + opts.shiftMs);
      it.due = /Z$/.test(it.due) ? d.toISOString() : localStr(d);
    });
    if (!items.length) throw new Error('That calendar has no events yet.');
    var before = S.ics, map = {}, fresh = 0;
    items.forEach(function (it) { if (!before[it.uid]) fresh++; map[it.uid] = it; });
    S.ics = map;
    S.lastImport = { at: Date.now(), source: source, count: items.length };
    if (S.prefs.view === 'week' && !allItems().some(function (i) { return inView(i, viewRange()); })) S.prefs.view = 'all';
    save();
    if (!$('#sb-board')) renderShell();
    renderBoard();
    toast('Imported ' + items.length + ' calendar item' + (items.length === 1 ? '' : 's') + (Object.keys(before).length ? ' (' + fresh + ' new)' : '') + '.');
  }

  function readFile(f, asText) {
    return new Promise(function (res, rej) {
      var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
      if (asText) r.readAsText(f); else r.readAsArrayBuffer(f);
    });
  }
  function importFiles(files, root, onDone) {
    var errEl = root ? $('#imp-ferr', root) : null;
    if (errEl) errEl.textContent = '';
    var icsFiles = files.filter(function (f) { return /\.(ics|ical|ifb)$/i.test(f.name) || /calendar/.test(f.type); });
    var pdfs = files.filter(function (f) { return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; });
    if (!icsFiles.length && !pdfs.length) { if (errEl) errEl.textContent = 'Use a .ics calendar file or a CAS PDF.'; return; }
    var chain = Promise.resolve();
    icsFiles.forEach(function (f) { chain = chain.then(function () { return readFile(f); }).then(function (b) { applyIcs(ics.decodeBytes(b), 'file'); }); });
    if (pdfs.length) {
      chain = chain.then(function () {
        if (errEl) errEl.innerHTML = '<span class="spinner"></span> <span class="muted">Reading ' + pdfs.length + ' PDF' + (pdfs.length > 1 ? 's' : '') + '\u2026</span>';
        return Promise.all(pdfs.map(parseCasFile));
      }).then(function (results) {
        if (errEl) errEl.textContent = '';
        if (onDone) onDone();
        openCasPreview(results);
      });
    } else chain = chain.then(function () { if (onDone) onDone(); });
    chain.catch(function (e) { var m = (e && e.message) || 'Could not read that file.'; if (errEl) errEl.textContent = m; else toast(m); });
  }

  var pdfjsPromise = null;
  function getPdfjs() {
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = (async function () {
      var mainUrl, workerUrl, inl = document.getElementById('sb-pdfjs');
      if (inl) {
        mainUrl = URL.createObjectURL(new Blob([inl.textContent], { type: 'text/javascript' }));
        workerUrl = URL.createObjectURL(new Blob([document.getElementById('sb-pdfworker').textContent], { type: 'text/javascript' }));
      } else if (MODE === 'offline') {
        throw new Error('This offline copy has no PDF reader. Import CAS PDFs on the website.');
      } else {
        mainUrl = new URL(BASE + 'vendor/pdf.min.mjs', location.href).href;
        workerUrl = new URL(BASE + 'vendor/pdf.worker.min.mjs', location.href).href;
      }
      var lib = await import(mainUrl);
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    })();
    pdfjsPromise.catch(function () { pdfjsPromise = null; });
    return pdfjsPromise;
  }
  async function parseCasFile(f) {
    try {
      var lib = await getPdfjs();
      var doc = await lib.getDocument({ data: new Uint8Array(await readFile(f)), isEvalSupported: false }).promise;
      var res = cas.parseCas(await cas.pagesFromPdf(doc), { fileName: f.name });
      res.fileName = f.name;
      if (!res.items.length && !res.warnings.length) res.warnings.push('No tasks found in this PDF.');
      return res;
    } catch (e) {
      return { fileName: f.name, course: UNSORTED, items: [], warnings: [(e && e.message) || 'Could not read this PDF.'] };
    }
  }

  function openCasPreview(results) {
    var icsItems = allItems().filter(function (i) { return i.source === 'ics'; });
    results.forEach(function (r) {
      r.classTime = '08:00';
      r.items.forEach(function (it) {
        it.on = it.selected;
        if (S.cas[it.id]) { it.dup = 'Already added'; it.on = false; }
        var m = icsItems.filter(function (x) { return sameish(it, x); });
        if (m.length) { it.dup = m.length > 1 ? 'On calendar (' + m.length + ')' : 'On calendar'; it.on = false; it.matches = m.map(function (x) { return x.id; }); }
      });
    });
    var kindName = { read: 'Reading', submit: 'Submit', do: 'Task', class: 'In class' };
    function draw() {
      return results.map(function (r, fi) {
        var n = r.items.filter(function (i) { return i.on; }).length;
        return '<section class="cas-file" data-f="' + fi + '"><header><input type="text" class="cas-course" value="' + esc(r.course) + '" aria-label="Class name" list="cas-cats">' +
          '<span class="muted small">' + esc(r.fileName) + ' \u00b7 ' + r.items.length + ' found \u00b7 <b class="cas-n">' + n + '</b> selected</span>' +
          '<label class="small muted" style="margin-left:auto">Class starts <input type="time" class="cas-time" value="' + r.classTime + '"></label>' +
          '<button class="btn ghost small cas-all">All</button><button class="btn ghost small cas-none">None</button></header>' +
          (r.warnings && r.warnings.length ? '<div class="err" style="padding:8px 12px">' + r.warnings.map(esc).join('<br>') + '</div>' : '') +
          '<table class="cas-table"><tbody>' + r.items.map(function (it, i) {
            var dd = toDate(it.due);
            return '<tr data-i="' + i + '"' + (it.on ? '' : ' class="off"') + '><td><input type="checkbox"' + (it.on ? ' checked' : '') + ' aria-label="Include"></td>' +
              '<td><input type="date" value="' + dayKey(dd) + '" aria-label="Due date"></td><td><input type="time" value="' + pad(dd.getHours()) + ':' + pad(dd.getMinutes()) + '" aria-label="Due time"></td>' +
              '<td style="width:100%"><input type="text" value="' + esc(it.title) + '" aria-label="Title"></td>' +
              '<td class="k">' + esc(kindName[it.kind] || it.kind) + '</td><td class="dup">' + esc(it.dup || '') + '</td></tr>';
          }).join('') + '</tbody></table></section>';
      }).join('') + '<datalist id="cas-cats">' + categories().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
        '<p class="hint">Readings and other work become cards too; learning objectives are skipped. Items already on your Schoology calendar start unchecked so you don\'t get doubles, and their class is copied onto the calendar card.</p>';
    }
    var total = function () { return results.reduce(function (s, r) { return s + r.items.filter(function (i) { return i.on; }).length; }, 0); };
    var d = dialog('Check your Course Assignment Sheet' + (results.length > 1 ? 's' : ''), draw(),
      '<span class="r"><button class="btn" data-close>Cancel</button><button class="btn primary" id="cas-add">Add ' + total() + ' tasks</button></span>', true);
    function upd() {
      $('#cas-add', d).textContent = 'Add ' + total() + ' tasks';
      $$('.cas-file', d).forEach(function (sec) { $('.cas-n', sec).textContent = results[+sec.dataset.f].items.filter(function (i) { return i.on; }).length; });
    }
    $$('.cas-file', d).forEach(function (sec) {
      var r = results[+sec.dataset.f];
      $('.cas-course', sec).onchange = function () { r.course = this.value.trim() || UNSORTED; };
      $('.cas-time', sec).onchange = function () {
        var t = this.value || '08:00'; r.classTime = t;
        $$('tr', sec).forEach(function (tr) { var it = r.items[+tr.dataset.i]; if (!it.explicitDue) { it.due = it.due.slice(0, 11) + t; $('input[type=time]', tr).value = t; } });
      };
      function setAll(v) { r.items.forEach(function (i) { i.on = v; }); $$('tr', sec).forEach(function (tr) { tr.classList.toggle('off', !v); $('input[type=checkbox]', tr).checked = v; }); upd(); }
      $('.cas-all', sec).onclick = function () { setAll(true); };
      $('.cas-none', sec).onclick = function () { setAll(false); };
      $$('tr', sec).forEach(function (tr) {
        var it = r.items[+tr.dataset.i], ins = $$('input', tr);
        ins[0].onchange = function () { it.on = this.checked; tr.classList.toggle('off', !it.on); upd(); };
        ins[1].onchange = function () { if (this.value) it.due = this.value + it.due.slice(10); };
        ins[2].onchange = function () { if (this.value) { it.due = it.due.slice(0, 11) + this.value; it.explicitDue = true; } };
        ins[3].onchange = function () { it.title = this.value.trim() || it.title; };
      });
    });
    $('#cas-add', d).onclick = function () {
      var added = 0;
      results.forEach(function (r) {
        r.items.forEach(function (it) {
          if (it.matches) it.matches.forEach(function (mid) { // teach matching calendar items their class
            var base = S.ics[mid];
            if (base && !base.course && !(S.ov[mid] && S.ov[mid].course)) S.ov[mid] = Object.assign(S.ov[mid] || {}, { course: r.course });
          });
          if (!it.on) return;
          S.cas[it.id] = { id: it.id, source: 'cas', course: r.course, title: it.title, due: it.due, classDate: it.classDate, kind: it.kind, note: it.explicitDue ? '' : 'Before class' };
          delete S.hidden[it.id];
          added++;
        });
      });
      save(); d.close();
      if (!$('#sb-board')) renderShell();
      renderBoard();
      toast('Added ' + added + ' task' + (added === 1 ? '' : 's') + ' from ' + results.length + ' sheet' + (results.length > 1 ? 's' : '') + '.');
    };
  }

  // ---------- sample board ----------
  var SAMPLE_RULES = [
    { text: 'lab', course: 'Biology' }, { text: 'cell', course: 'Biology' }, { text: 'biology', course: 'Biology' },
    { text: 'dbq', course: 'World History' }, { text: 'primary source', course: 'World History' }, { text: 'history', course: 'World History' },
    { text: 'problem set', course: 'Geometry' }, { text: 'proof', course: 'Geometry' }, { text: 'geometry', course: 'Geometry' },
    { text: 'essay', course: 'English 10' }, { text: 'novel', course: 'English 10' }, { text: 'vocab quiz', course: 'English 10' },
    { text: 'pr\u00e1ctica', course: 'Spanish II' }, { text: 'spanish', course: 'Spanish II' }, { text: 'vocabulario', course: 'Spanish II' }
  ];
  function loadSample() {
    var btn = $('#imp-sample'); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Loading sample\u2026'; }
    fetch(CFG.sampleUrl).then(function (r) { if (!r.ok) throw new Error('Could not load the sample.'); return r.arrayBuffer(); }).then(function (buf) {
      var text = ics.decodeBytes(buf);
      // Slide the sample so its first week is this week.
      var items = ics.parseIcs(text), first = items.reduce(function (m, i) { var dd = toDate(i.due); return dd < m ? dd : m; }, new Date(8.64e15));
      var today = new Date(), wkend = today.getDay() === 0 || today.getDay() === 6;
      var target = addDays(monday(today), wkend ? 7 : 0); // on weekends, show the coming week
      var weeks = Math.round((target - monday(first)) / (7 * 864e5));
      S.rules = SAMPLE_RULES.slice();
      S.order = ['Biology', 'World History', 'Geometry', 'English 10', 'Spanish II'];
      var st = { 'sb-sample-001@example.invalid': 'done', 'sb-sample-003@example.invalid': 'done', 'sb-sample-010@example.invalid': 'started', 'sb-sample-014@example.invalid': 'proctor' };
      Object.keys(st).forEach(function (k) { S.status[k] = st[k]; });
      S.prefs.view = 'week'; S.prefs.weekOffset = wkend ? 1 : 0;
      applyIcs(text, 'sample', { shiftMs: weeks * 7 * 864e5 });
    }).catch(function (e) { toast(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Try the sample board'; } });
  }

  // ---------- offline download ----------
  function scriptSafe(s) { return String(s).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--'); }
  function getSrc(name, id) {
    var el = id && document.getElementById(id);
    if (el) return Promise.resolve(el.textContent);
    return fetch(BASE + name, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('missing ' + name); return r.text(); });
  }
  function buildOfflineHtml() {
    var files = {};
    return Promise.all([
      getSrc('board.css', 'sb-css').then(function (t) { files.css = t; }),
      getSrc('ics.js', 'sb-src-ics').then(function (t) { files.ics = t; }),
      getSrc('cas.js', 'sb-src-cas').then(function (t) { files.cas = t; }),
      getSrc('board.js', 'sb-src-board').then(function (t) { files.board = t; }),
      getSrc('vendor/pdf.min.mjs', 'sb-pdfjs').then(function (t) { files.pdf = t; }, function () { }),
      getSrc('vendor/pdf.worker.min.mjs', 'sb-pdfworker').then(function (t) { files.worker = t; }, function () { })
    ]).then(function () {
      var snap = JSON.parse(JSON.stringify(S));
      snap.feedUrl = ''; // never bake the private calendar link into a file
      snap.exportedAt = Date.now();
      snap.updated = snap.exportedAt;
      var cfg = {
        mode: 'offline', boardId: S.boardId, exportedAt: snap.exportedAt,
        proxy: MODE === 'web' ? location.origin + (CFG.proxy || '/api/feed') : CFG.proxy,
        home: MODE === 'web' ? location.origin : CFG.home
      };
      var j = function (o) { return JSON.stringify(o).replace(/</g, '\\u003c'); };
      return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Schoology Board (offline)</title><meta name="color-scheme" content="dark"><style id="sb-css">' + files.css.replace(/<\/style/gi, '<\\/style') + '</style></head><body>' +
        '<div id="app"><div class="loading">Loading your board\u2026</div></div>\n' +
        '<script id="sb-config" type="application/json">' + j(cfg) + '</script>\n' +
        '<script id="sb-data" type="application/json">' + j(snap) + '</script>\n' +
        (files.pdf && files.worker ? '<script id="sb-pdfjs" type="text/plain">' + scriptSafe(files.pdf) + '</script>\n<script id="sb-pdfworker" type="text/plain">' + scriptSafe(files.worker) + '</script>\n' : '') +
        '<script id="sb-src-ics">' + scriptSafe(files.ics) + '</script>\n' +
        '<script id="sb-src-cas">' + scriptSafe(files.cas) + '</script>\n' +
        '<script id="sb-src-board">' + scriptSafe(files.board) + '</script>\n</body></html>\n';
    });
  }
  function downloadOffline() {
    var btn = $('#sb-offline'), old = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span><span class="lbl"> Packing\u2026</span>';
    buildOfflineHtml().then(function (html) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      a.download = 'schoology-board-' + dayKey(new Date()) + '.html';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      toast('Saved. Open the file from your Downloads. Progress you make there stays in that browser.', null, null, 6000);
    }).catch(function (e) { toast('Could not build the offline file: ' + e.message); })
      .then(function () { btn.disabled = false; btn.innerHTML = old; });
  }

  // ---------- boot ----------
  function init() {
    app = document.getElementById('app');
    if (!app) return;
    S = load();
    if (MODE === 'offline') save();
    render();
    setInterval(function () { if (!drag && !document.querySelector('dialog[open]') && $('#sb-board') && !(document.activeElement && document.activeElement.classList.contains('card'))) renderBoard(); }, 60000);
    window.addEventListener('storage', function (e) { if (e.key === K) { S = load(); render(); } });
  }
  window.SchoologyBoard = { state: function () { return S; }, render: render, matches: sameish, buildOfflineHtml: buildOfflineHtml, version: '1.0.0' };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
