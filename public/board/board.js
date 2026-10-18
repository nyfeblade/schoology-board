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
  // "Needs to be proctored" is optional; with it off, its cards show in Need to be done (their status is kept).
  function cols() { return S && S.proctorCol ? COLS : COLS.filter(function (c) { return c[0] !== 'proctor'; }); }
  function colIds() { return cols().map(function (c) { return c[0]; }); }
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
    phone: svg('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'),
    up: svg('<path d="M12 21V9M6 13l6-6 6 6M4 3h16"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    key: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
    left: svg('<path d="m15 18-6-6 6-6"/>'),
    right: svg('<path d="m9 18 6-6-6-6"/>'),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    more: svg('<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>'),
    upload: svg('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'),
    imp: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    filter: svg('<path d="M3 5h18M6 12h12M10 19h4"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
    ext: svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>')
  };
  var BIG_UPLOAD = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>';
  var REPO = 'https://github.com/nyfeblade/schoology-board';
  var SHORT = { todo: 'To do', started: 'Started', proctor: 'Proctor', done: 'Done' };

  // ---------- state ----------
  function blank() {
    return {
      v: 1, boardId: rid(), updated: 0, ics: {}, cas: {}, custom: {}, cats: [], order: [], rename: {},
      ov: {}, hidden: {}, status: {}, rules: [], lastImport: null, feedUrl: '', seenExport: null, createdAt: null,
      proctorCol: false, classMap: {}, namingSeen: {}, lastFetch: null, pending: null,
      prefs: { view: 'week', weekOffset: 0, from: '', to: '', hidePast: false, showPre: false, course: null, q: '' }
    };
  }
  function normalizeState(st) {
    st = Object.assign(blank(), st || {});
    st.prefs = Object.assign(blank().prefs, st.prefs || {});
    ['ics', 'cas', 'custom', 'rename', 'ov', 'hidden', 'status', 'classMap', 'namingSeen'].forEach(function (k) { if (!st[k] || typeof st[k] !== 'object') st[k] = {}; });
    ['cats', 'order', 'rules'].forEach(function (k) { if (!Array.isArray(st[k])) st[k] = []; });
    return st;
  }
  function load() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(K) || 'null'); } catch (e) { saved = null; }
    var baked = MODE === 'offline' ? readJson('sb-data') : null;
    var st = saved;
    if (baked && (!saved || (saved.seenExport !== baked.exportedAt && (baked.updated || 0) > (saved.updated || 0)))) st = baked;
    var hadProctorFlag = st && typeof st.proctorCol === 'boolean';
    st = normalizeState(st);
    // Every visit opens on the default week (next week from Friday 6 PM). "range" no longer exists.
    st.prefs.view = 'week'; st.prefs.weekOffset = 0; st.prefs.q = '';
    if (!hadProctorFlag) st._needsProctorCheck = true;
    if (baked) st.seenExport = baked.exportedAt;
    // Boards from before "board created" existed start counting from the first load after the update.
    if (!st.createdAt && Object.keys(st.ics).length + Object.keys(st.cas).length + Object.keys(st.custom).length) { st.createdAt = Date.now(); st._migrated = true; }
    // The cutoff is the start of the creation day (local), so work due later that day still shows.
    if (st.createdAt) { var mid = sod(new Date(st.createdAt)).getTime(); if (mid !== st.createdAt) { st.createdAt = mid; st._migrated = true; } }
    return st;
  }
  function save() {
    S.updated = Date.now();
    try { localStorage.setItem(K, JSON.stringify(S)); }
    catch (e) { toastErr("Couldn't save to this browser's storage. Changes will be lost on reload."); }
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
  var preItems = [];
  function allItems() {
    var out = [];
    Object.keys(S.ics).forEach(function (id) { if (!S.hidden[id]) out.push(Object.assign({}, S.ics[id], { id: id, source: 'ics' })); });
    Object.keys(S.cas).forEach(function (id) { if (!S.hidden[id]) out.push(Object.assign({}, S.cas[id], { id: id, source: 'cas' })); });
    Object.keys(S.custom).forEach(function (id) { out.push(Object.assign({}, S.custom[id], { id: id, source: 'custom' })); });
    out.forEach(function (it) {
      var ov = S.ov[it.id];
      if (ov) OV_FIELDS.forEach(function (f) { if (ov[f] !== undefined) it[f] = ov[f]; });
      // Audience tags ("Grades 7-12", "FT Students Only") are never classes, even in boards saved before this rule.
      if (it.source === 'ics' && it.course && !(ov && ov.course) && ics.isAudienceTag(it.course)) it.course = null;
      if (!it.course && it.source === 'ics') { var rc = ruleCourse(it.title); if (rc) it.course = rc; }
      if (!it.course && it.source === 'ics') { var pf = ics.titlePrefix(it.title); if (pf && S.classMap[pf.key]) { it.course = S.classMap[pf.key]; it.mapped = pf.key; } }
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
    // Still unsorted calendar items: guess the class from the title (CAS sheets are the source of truth).
    var guess = classifier(out);
    result.forEach(function (it) {
      if (it.source === 'ics' && !it.explicitCourse) { var g = guess(it.title, it.kind); if (g) { it.course = g.course; it.autoCourse = g.why; } }
    });
    result.forEach(function (it) {
      it.course = alias(it.course || UNSORTED) || UNSORTED;
      it.d = toDate(it.due);
      it.col = S.status[it.id] || it.inheritStatus || (/\bproctor/i.test(it.title) ? 'proctor' : 'todo');
      if (COL_IDS.indexOf(it.col) < 0) it.col = 'todo';
      it.rawCol = it.col;
      if (it.col === 'proctor' && !S.proctorCol) it.col = 'todo';
      // Imported work due before the board existed counts as already handled: hidden, not overdue, not Completed.
      it.pre = isPre(it);
    });
    preItems = result.filter(function (it) { return it.pre; });
    return S.prefs.showPre ? result : result.filter(function (it) { return !it.pre; });
  }
  function classifier(out) {
    var known = [], seen = {}, examples = [];
    function add(c) { c = c && alias(c); if (c && c !== UNSORTED && !seen[c]) { seen[c] = 1; known.push(c); } }
    out.forEach(function (it) {
      if (it.source === 'cas') { add(it.course); examples.push({ title: it.title, course: alias(it.course) }); }
    });
    S.cats.forEach(add);
    Object.keys(S.classMap).forEach(function (k) { add(S.classMap[k]); });
    out.forEach(function (it) {
      if (it.source === 'custom' && it.course) { add(it.course); examples.push({ title: it.title, course: alias(it.course) }); }
      if (it.source === 'ics' && it.explicitCourse) { add(it.course); if (S.ov[it.id] && S.ov[it.id].course) examples.push({ title: it.title, course: alias(it.course) }); }
    });
    return ics.buildClassifier(known, examples, out.filter(function (i) { return i.source === 'ics'; }));
  }
  function isPre(it) { return !!S.createdAt && it.source !== 'custom' && it.d.getTime() < S.createdAt; }
  function markCreated(at) { if (!S.createdAt) S.createdAt = sod(new Date(at || Date.now())).getTime(); }
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
    if (p.view === 'today') return { from: today, to: addDays(today, 1), label: 'Today' }; // today's local date only
    if (p.view === 'week') {
      var base = defaultMonday(), m = addDays(base, 7 * (p.weekOffset || 0)), e = addDays(m, 6);
      var range = fmtShort(m) + '\u2013' + (e.getMonth() === m.getMonth() ? e.getDate() : fmtShort(e));
      var rel = Math.round((m - monday(today)) / (7 * 864e5));
      return { from: m, to: addDays(m, 7), label: range, nav: (rel === 1 ? 'Next week \u00b7 ' : rel === 0 ? 'This week \u00b7 ' : '') + range, rel: rel };
    }
    return { from: null, to: null, label: 'All' };
  }
  // From Friday 6 PM through Sunday the default week is the coming Monday-Sunday.
  function weekendMode(now) { return ics.weekendMode(now || new Date()); }
  function defaultMonday() { return ics.defaultWeekStart(new Date()); }
  function inView(it, r) {
    var today = sod(new Date());
    if (S.prefs.hidePast && it.d < today) return false;
    if (!r.from) return true;
    if (it.d >= r.from && it.d < r.to) return true;
    return false;
  }
  function matchesQ(it) {
    var q = (S.prefs.q || '').trim().toLowerCase();
    if (!q) return true;
    return (it.title + ' ' + it.course + ' ' + (it.note || '')).toLowerCase().indexOf(q) >= 0;
  }

  // ---------- toast ----------
  // Bottom-right on desktop, bottom-centre on phones. Neutral by default, red border only for errors.
  function toast(msg, action, fn, ms, isErr) {
    var box = $('#sb-toast');
    if (!box) { box = document.createElement('div'); box.id = 'sb-toast'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    while (box.children.length >= 3) box.firstChild.remove();
    var t = document.createElement('div'); t.className = 'toast' + (isErr ? ' err' : '');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action) + '</button>' : '');
    if (action) t.querySelector('button').onclick = function () { fn(); t.remove(); };
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || (action ? 6000 : 3000));
  }
  function toastErr(msg) { toast(msg, null, null, 6000, true); }

  // ---------- menus (popover on desktop, bottom sheet on phones) ----------
  var openMenu = null;
  function sheetMode() { return matchMedia('(max-width: 900px), (pointer: coarse)').matches; }
  function closeMenu(restore) {
    if (!openMenu) return;
    var m = openMenu; openMenu = null;
    m.el.remove(); if (m.scrim) m.scrim.remove();
    m.anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', m.outside, true);
    window.removeEventListener('scroll', m.onScroll, true);
    window.removeEventListener('resize', m.onScroll);
    if (restore && document.contains(m.anchor)) m.anchor.focus({ preventScroll: true });
  }
  function menu(anchor, items, opts) {
    if (openMenu && openMenu.anchor === anchor) { closeMenu(true); return; }
    closeMenu(false);
    opts = opts || {};
    var sheet = sheetMode();
    var el = document.createElement('div');
    el.className = 'menu' + (sheet ? ' sheet' : ''); el.id = 'sb-menu'; el.setAttribute('role', 'menu');
    if (opts.label) el.setAttribute('aria-label', opts.label);
    el.innerHTML = (sheet && opts.title ? '<div class="menu-title">' + esc(opts.title) + '</div>' : '') + items.map(function (it, i) {
      if (it.sep) return '<div class="menu-sep" role="separator"></div>';
      if (it.heading) return '<div class="menu-h" role="presentation">' + esc(it.heading) + '</div>';
      if (it.check) return '<label class="menu-i' + (it.cls ? ' ' + it.cls : '') + '" role="menuitemcheckbox" aria-checked="' + !!it.checked + '"><input type="checkbox" id="' + it.id + '"' + (it.checked ? ' checked' : '') + '><span>' + esc(it.label) + '</span>' + (it.kbd ? '<kbd>' + esc(it.kbd) + '</kbd>' : '') + '</label>';
      return '<button type="button" class="menu-i' + (it.cls ? ' ' + it.cls : '') + '" role="menuitem" data-i="' + i + '"' + (it.id ? ' id="' + it.id + '"' : '') + '>' + (it.icon || '') + '<span>' + esc(it.label) + '</span>' + (it.kbd ? '<kbd>' + esc(it.kbd) + '</kbd>' : '') + '</button>';
    }).join('');
    var scrim = null;
    if (sheet) { scrim = document.createElement('div'); scrim.className = 'scrim'; document.body.appendChild(scrim); }
    document.body.appendChild(el);
    if (!sheet) {
      var r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      var top = r.bottom + 6; if (top + h > innerHeight - 8 && r.top - 6 - h > 8) top = r.top - 6 - h;
      el.style.top = top + 'px';
      el.style.left = Math.max(8, Math.min(innerWidth - w - 8, (opts.alignLeft ? r.left : r.right - w))) + 'px';
    }
    $$('button.menu-i', el).forEach(function (b) {
      b.onclick = function () { var it = items[+b.dataset.i]; closeMenu(!!it.restore); if (it.onClick) it.onClick(); };
    });
    items.forEach(function (it) { if (it.check) { var cb = $('#' + it.id, el); cb.onchange = function () { cb.parentNode.setAttribute('aria-checked', String(cb.checked)); it.onChange(cb.checked); }; } });
    anchor.setAttribute('aria-expanded', 'true');
    var m = { el: el, scrim: scrim, anchor: anchor };
    m.outside = function (e) { if (!el.contains(e.target) && !anchor.contains(e.target)) { if (scrim && e.target === scrim) e.preventDefault(); closeMenu(false); } };
    m.onScroll = function (e) { if (!sheet && !(e && e.target && el.contains(e.target))) closeMenu(false); };
    document.addEventListener('pointerdown', m.outside, true);
    if (!sheet) { window.addEventListener('scroll', m.onScroll, true); window.addEventListener('resize', m.onScroll); }
    openMenu = m;
    var first = $('.menu-i', el); if (first) first.focus({ preventScroll: true });
  }
  function menuKeys(e) {
    if (!openMenu) return false;
    var list = $$('.menu-i', openMenu.el), i = list.indexOf(document.activeElement);
    if (e.key === 'Escape') { closeMenu(true); e.preventDefault(); return true; }
    if (e.key === 'Tab') { closeMenu(false); return false; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      var n = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]; if (n) n.focus(); e.preventDefault(); return true;
    }
    if (e.key === 'Home' || e.key === 'End') { var x = e.key === 'Home' ? list[0] : list[list.length - 1]; if (x) x.focus(); e.preventDefault(); return true; }
    return openMenu.el.contains(document.activeElement);
  }

  // ---------- rendering ----------
  function hasData() { return Object.keys(S.ics).length + Object.keys(S.cas).length + Object.keys(S.custom).length > 0 || S.cats.length > 0; }
  function render() {
    if (!hasData()) return renderFirstRun();
    renderShell();
    renderBoard();
  }

  function renderShell() {
    closeMenu(false);
    app.innerHTML =
      '<header class="sb-head"><h1><span class="name">Schoology Board</span> <span id="sb-label"></span></h1>' +
      '<div class="prog"><span class="prog-t"><span id="sb-prog"></span><span id="sb-sync" class="sync" aria-live="polite"></span></span><span class="progbar" aria-hidden="true"><i id="sb-bar"></i></span></div>' +
      '<div class="acts">' +
      '<button class="btn primary" id="sb-add" title="Add a task (N)" aria-label="Add a task">' + ICON.plus + '<span class="lbl">Add</span></button>' +
      '<button class="btn hide-m" id="sb-import" title="Import (I)">' + ICON.imp + '<span class="lbl">Import</span></button>' +
      '<button class="btn icon" id="sb-more" title="More" aria-label="More actions" aria-haspopup="menu" aria-expanded="false">' + ICON.more + '</button>' +
      '</div></header>' +
      '<div class="sb-tools" id="sb-tools"><div class="tl">' +
      '<div class="seg" role="group" aria-label="View"><button data-view="today">Due today</button><button data-view="week">Week</button><button data-view="all">All</button></div>' +
      '<span class="weeknav" id="sb-weeknav"><button class="btn ghost icon" id="sb-prev" aria-label="Previous week" title="Previous week ([)">' + ICON.left + '</button><b id="sb-week"></b><button class="btn ghost icon" id="sb-next" aria-label="Next week" title="Next week (])">' + ICON.right + '</button><button class="btn ghost small" id="sb-thisweek">This week</button></span>' +
      '</div><div class="tr">' +
      '<div class="search"><button class="btn icon search-btn" id="sb-search-btn" aria-label="Search" title="Search (/)">' + ICON.search + '</button>' +
      '<span class="sfield">' + ICON.search + '<input type="search" id="sb-search" placeholder="Search" aria-label="Search tasks"><kbd class="kbd-only">/</kbd></span></div>' +
      '<button class="btn" id="sb-filter" aria-haspopup="menu" aria-expanded="false" title="Filter">' + ICON.filter + '<span class="lbl">Filter</span><i class="dot" aria-hidden="true"></i></button>' +
      '</div></div>' +
      '<div class="chips-wrap"><div class="chips" id="sb-chips" role="group" aria-label="Filter by class"></div></div>' +
      '<p class="sb-note" id="sb-note" hidden></p>' +
      '<nav class="colnav" id="sb-colnav" aria-label="Jump to column"></nav>' +
      '<main class="board" id="sb-board" aria-label="Board"></main>' +
      '<div class="foot">' + (MODE === 'offline' ? 'Offline copy \u00b7 progress is saved in this browser' + (CFG.home ? ' \u00b7 <a href="' + esc(CFG.home) + '" target="_blank" rel="noopener">open the website</a>' : '') :
        'Everything stays in your browser \u00b7 <a href="' + REPO + '" target="_blank" rel="noopener">Open source</a>') +
      ' \u00b7 <a href="#" id="sb-reset">Reset board</a></div>';
    $('#sb-import').onclick = openImport;
    $('#sb-add').onclick = function () { openEditor(null); };
    $('#sb-more').onclick = function () { moreMenu(this); };
    $('#sb-filter').onclick = function () { filterMenu(this); };
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
    var sIn = $('#sb-search'), tools = $('#sb-tools');
    sIn.oninput = function () { S.prefs.q = this.value; renderBoard(); };
    sIn.onblur = function () { if (!sIn.value) tools.classList.remove('searching'); };
    $('#sb-search-btn').onclick = function () { tools.classList.add('searching'); sIn.focus(); };
    if (S.prefs.q) tools.classList.add('searching');
    var board = $('#sb-board'), raf = 0;
    board.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; syncColnav(); }); }, { passive: true });
  }
  function filterMenu(anchor) {
    var items = [{ heading: 'Show' },
      { check: true, id: 'sb-hidepast', label: 'Hide past', kbd: 'H', checked: !!S.prefs.hidePast, onChange: function (v) { S.prefs.hidePast = v; save(); renderBoard(); } }];
    if (S.createdAt) items.push({ check: true, id: 'sb-showpre', label: 'Show items from before this board was created', checked: !!S.prefs.showPre, onChange: function (v) { S.prefs.showPre = v; save(); renderBoard(); } });
    items.push({ sep: true }, { heading: 'Columns' },
      { check: true, id: 'sb-proctorcol', label: '\u201cNeeds to be proctored\u201d column', checked: !!S.proctorCol, onChange: function (v) { setProctorCol(v); } });
    menu(anchor, items, { title: 'Filter & settings', label: 'Filter and settings' });
  }
  function setProctorCol(on) {
    S.proctorCol = !!on; save(); renderBoard();
    if (!on) {
      var n = allItems().filter(function (i) { return i.rawCol === 'proctor'; }).length;
      if (n) toast(n + ' card' + (n === 1 ? '' : 's') + ' moved to Need to be done. Turn the column back on to restore ' + (n === 1 ? 'it' : 'them') + '.', 'Undo', function () { setProctorCol(true); });
    }
  }
  function moreMenu(anchor) {
    var items = [
      { label: 'Import\u2026', icon: ICON.imp, kbd: 'I', cls: 'm-only', onClick: openImport },
      S.feedUrl ? { label: 'Refresh from calendar link', icon: ICON.refresh, id: 'sb-refresh', onClick: function () { toast('Refreshing your calendar\u2026'); importLink(S.feedUrl, true); } } : null,
      { label: 'Categories', icon: ICON.edit, id: 'sb-cats', onClick: openCategories },
      { label: 'Move to phone', icon: ICON.phone, id: 'sb-move', onClick: openMove },
      { label: 'Name your classes', icon: ICON.tag, id: 'sb-naming', onClick: function () { openNaming(true); } },
      { label: 'Save a backup', icon: ICON.dl, id: 'sb-backup', onClick: downloadOffline },
      { label: 'Import a backup', icon: ICON.up, id: 'sb-restore', onClick: pickBackup },
      { label: 'Keyboard shortcuts', icon: ICON.key, kbd: '?', id: 'sb-keys', cls: 'kbd-only', onClick: openKeys }
    ].filter(Boolean);
    menu(anchor, items, { label: 'More actions' });
  }
  function syncColnav() {
    var b = $('#sb-board'), nav = $('#sb-colnav'); if (!b || !nav) return;
    var cols = $$('.col', b); if (!cols.length) return;
    var mid = b.scrollLeft + b.clientWidth / 2, best = 0, bd = Infinity;
    cols.forEach(function (c, i) { var d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
    $$('button', nav).forEach(function (x, i) { x.setAttribute('aria-current', String(i === best)); });
  }
  function setView(v) {
    S.prefs.view = v;
    save(); renderBoard();
  }

  function cardHtml(it, colId) {
    var h = (it.d - new Date()) / 36e5, done = colId === 'done';
    var cls = done ? '' : (h < 0 ? ' late overdue' : h < 36 ? ' late' : '');
    var url = safeUrl(it.url);
    var when = it.allDay ? 'All day' : fmtT(it.d);
    if (done) when = it.d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + when;
    if (h < 0 && !done) when = 'Overdue \u00b7 ' + when;
    var src = it.source === 'cas' ? '<span class="src" title="From a Course Assignment Sheet">CAS</span>' : it.source === 'custom' ? '<span class="src" title="Added by you">Mine</span>' : '';
    var label = it.title + ', ' + it.course + ', due ' + fmtDay(it.d) + ' ' + when + (done ? ', done' : '');
    return '<div class="card' + cls + '" tabindex="0" data-id="' + esc(it.id) + '" aria-label="' + esc(label) + '">' +
      (url ? '<a class="t" href="' + esc(url) + '" target="_blank" rel="noopener" draggable="false" tabindex="-1">' + esc(it.title) + '</a>' : '<span class="t">' + esc(it.title) + '</span>') +
      (it.note ? '<div class="note">' + esc(it.note) + '</div>' : '') +
      '<div class="m"><span class="l"><span class="tag">' + esc(it.course) + '</span>' + src + '</span><span class="tm">' + esc(when) + '</span></div>' +
      '<button class="more" type="button" tabindex="-1" aria-label="Card actions" aria-haspopup="menu" aria-expanded="false" title="Actions (M)">' + ICON.more + '</button></div>';
  }
  function cardMenu(el) {
    var id = el.dataset.id, it = itemById(id); if (!it) return;
    var url = safeUrl(it.url);
    var items = [{ heading: 'Move to\u2026' }];
    cols().forEach(function (c, i) { if (c[0] !== it.col) items.push({ label: c[1], icon: ICON.arrow, kbd: String(i + 1), cls: 'move', onClick: function () { setStatus(id, c[0]); } }); });
    items.push({ sep: true },
      { label: it.col === 'done' ? 'Mark not done' : 'Mark done', icon: ICON.check, kbd: 'X', onClick: function () { toggleDone(id); } },
      { label: 'Edit\u2026', icon: ICON.edit, kbd: 'E', onClick: function () { openEditor(id); } });
    if (url) items.push({ label: 'Open in Schoology', icon: ICON.ext, onClick: function () { window.open(url, '_blank', 'noopener'); } });
    items.push({ label: 'Delete', icon: ICON.trash, kbd: 'Del', onClick: function () { deleteItem(id); } });
    menu(el.querySelector('.more'), items, { title: it.title, label: 'Card actions' });
  }

  var lastItems = [];
  function renderBoard() {
    if (!$('#sb-board')) return render();
    var items = allItems(), r = viewRange(), p = S.prefs, now = new Date();
    var viewItems = items.filter(function (it) { return inView(it, r) && matchesQ(it); });
    var cats = categories(items);
    $('#sb-label').textContent = r.label;
    $$('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === p.view)); });
    $('#sb-weeknav').style.display = p.view === 'week' ? '' : 'none';
    $('#sb-week').textContent = r.nav || r.label;
    $('#sb-thisweek').style.display = p.weekOffset ? '' : 'none';
    $('#sb-thisweek').textContent = weekendMode() ? 'Next week' : 'This week';
    $('#sb-filter').classList.toggle('on', !!(p.hidePast || p.showPre));
    renderSync();
    $('#sb-filter').setAttribute('aria-label', 'Filter' + (p.hidePast ? ' (hiding past)' : '') + (p.showPre ? ' (showing pre-board items)' : ''));
    if (document.activeElement !== $('#sb-search')) $('#sb-search').value = p.q || '';
    var counts = {};
    viewItems.forEach(function (it) { if (it.col !== 'done') counts[it.course] = (counts[it.course] || 0) + 1; });
    var openTotal = viewItems.filter(function (i) { return i.col !== 'done'; }).length;
    if (p.course && cats.indexOf(p.course) < 0) p.course = null;
    $('#sb-chips').innerHTML = '<button class="chip" data-c="" aria-pressed="' + (!p.course) + '">All classes <b>' + openTotal + '</b></button>' +
      cats.filter(function (c) { return counts[c] || S.cats.indexOf(c) >= 0 || p.course === c; }).map(function (c) { return '<button class="chip" data-c="' + esc(c) + '" aria-pressed="' + (p.course === c) + '">' + esc(c) + ' <b>' + (counts[c] || 0) + '</b></button>'; }).join('');
    $$('#sb-chips .chip').forEach(function (b) { b.onclick = function () { S.prefs.course = b.dataset.c || null; save(); renderBoard(); }; });
    var sel = $('#sb-chips .chip[aria-pressed="true"]'), cw = $('#sb-chips');
    if (sel && cw.scrollWidth > cw.clientWidth && (sel.offsetLeft < cw.scrollLeft || sel.offsetLeft + sel.offsetWidth > cw.scrollLeft + cw.clientWidth)) cw.scrollLeft = sel.offsetLeft - 16;
    var shown = viewItems.filter(function (it) { return !p.course || it.course === p.course; });
    lastItems = shown;
    var q = (p.q || '').trim(), openShown = shown.filter(function (i) { return i.col !== 'done'; }).length;
    var html = '', nav = '', today = dayKey(now);
    var visCols = cols();
    $('#sb-board').classList.toggle('three', visCols.length === 3);
    visCols.forEach(function (c) {
      var id = c[0], list = shown.filter(function (it) { return it.col === id; }).sort(function (a, b) { return a.d - b.d || a.title.localeCompare(b.title); });
      nav += '<button type="button" data-col="' + id + '">' + esc(SHORT[id]) + '<b>' + list.length + '</b></button>';
      html += '<section class="col' + (id === 'done' ? ' done' : '') + '" data-col="' + id + '" aria-label="' + esc(c[1]) + '"><h2>' + esc(c[1]) + '<span>' + list.length + '</span></h2>';
      if (!list.length) {
        if (id === 'todo' && q && !shown.length) {
          html += '<div class="empty-state"><p class="es-t">No matches for \u201c' + esc(q) + '\u201d</p><button class="btn" id="sb-clearq" type="button">Clear search</button></div>';
        } else if (id === 'todo' && p.view === 'today' && !openShown && !q) {
          var next = items.filter(function (i) { return i.col !== 'done' && i.d >= addDays(sod(now), 1) && (!p.course || i.course === p.course); }).sort(function (a, b) { return a.d - b.d; })[0];
          html += '<div class="empty-state"><p class="es-t">Nothing due today.</p>' + (next ?
            '<p class="es-s"><a href="#" id="sb-nextup" data-d="' + dayKey(next.d) + '">Next up: ' + esc(next.title) + ' \u00b7 ' + esc(next.d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })) + '</a></p>' :
            '<p class="es-s">Nothing coming up either.</p>') + '</div>';
        } else html += '<div class="empty-col">Drag cards here</div>';
      }
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
    $('#sb-colnav').innerHTML = nav;
    $$('#sb-colnav button').forEach(function (b) {
      b.onclick = function () { var col = $('.col[data-col="' + b.dataset.col + '"]'), bd = $('#sb-board'); bd.scrollTo({ left: col.offsetLeft - (bd.clientWidth - col.offsetWidth) / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
    });
    syncColnav();
    if ($('#sb-clearq')) $('#sb-clearq').onclick = function () { S.prefs.q = ''; $('#sb-search').value = ''; $('#sb-tools').classList.remove('searching'); renderBoard(); };
    if ($('#sb-nextup')) $('#sb-nextup').onclick = function (e) {
      e.preventDefault();
      S.prefs.view = 'week'; S.prefs.weekOffset = Math.round((monday(parseDay(this.dataset.d)) - defaultMonday()) / (7 * 864e5)); save(); renderBoard();
    };
    // Quiet note so nothing is hidden silently: earlier (pre-board) items that would be in this view.
    var hidN = preItems.filter(function (it) { return inView(it, r) && matchesQ(it) && (!p.course || it.course === p.course); }).length;
    var note = $('#sb-note');
    if (!hidN) { note.hidden = true; note.innerHTML = ''; }
    else {
      note.hidden = false;
      note.innerHTML = p.showPre ? 'Showing ' + hidN + ' item' + (hidN === 1 ? '' : 's') + ' from before this board \u00b7 <a href="#" id="sb-pre-toggle">Hide</a>'
        : hidN + ' earlier item' + (hidN === 1 ? '' : 's') + ' hidden \u00b7 <a href="#" id="sb-pre-toggle">Show</a>';
      $('#sb-pre-toggle').onclick = function (e) { e.preventDefault(); S.prefs.showPre = !S.prefs.showPre; save(); renderBoard(); };
    }
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
      el.querySelector('.more').addEventListener('click', function (e) { e.stopPropagation(); cardMenu(el); });
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
    closeMenu(false);
    var bd = $('#sb-board'); if (bd) bd.classList.add('dragging-on');
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
    var bd = $('#sb-board'); if (bd) bd.classList.remove('dragging-on');
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
    if (menuKeys(e)) return;
    if (isTyping(e)) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var ae = document.activeElement;
    var card = ae && ae.classList && ae.classList.contains('card') ? ae : null;
    var k = e.key;
    if (card) {
      var CI = colIds(), id = card.dataset.id, col = card.closest('.col').dataset.col, ci = CI.indexOf(col);
      if (k === 'Enter') { var a = card.querySelector('a.t'); if (a) a.click(); else openEditor(id); e.preventDefault(); return; }
      if (k === 'e' || k === 'E') { openEditor(id); e.preventDefault(); return; }
      if (k === 'm' || k === 'M' || (k === 'F10' && e.shiftKey) || k === 'ContextMenu') { cardMenu(card); e.preventDefault(); return; }
      if (k === 'x' || k === ' ') { toggleDone(id); e.preventDefault(); return; }
      if (/^[1-4]$/.test(k) && CI[+k - 1]) { setStatus(id, CI[+k - 1]); e.preventDefault(); return; }
      if (k === 'Delete' || k === 'Backspace') { deleteItem(id); e.preventDefault(); return; }
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && e.shiftKey) {
        var ni = Math.max(0, Math.min(CI.length - 1, ci + (k === 'ArrowLeft' ? -1 : 1)));
        if (ni !== ci) setStatus(id, CI[ni]);
        e.preventDefault(); return;
      }
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'j' || k === 'k') {
        var list = cardsInCol(col), i = list.indexOf(card), n = list[i + ((k === 'ArrowDown' || k === 'j') ? 1 : -1)];
        if (n) n.focus(); e.preventDefault(); return;
      }
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        var top = card.getBoundingClientRect().top, step = k === 'ArrowLeft' ? -1 : 1;
        for (var s = ci + step; s >= 0 && s < CI.length; s += step) {
          var l2 = cardsInCol(CI[s]);
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
    else if (k === '/') { var sb = $('#sb-search'); if (sb) { $('#sb-tools').classList.add('searching'); sb.focus(); e.preventDefault(); } }
    else if (k === '?') { openKeys(); e.preventDefault(); }
    else if (k === 't') setView('today');
    else if (k === 'w') setView('week');
    else if (k === 'a') setView('all');
    else if (k === '[') { S.prefs.view = 'week'; S.prefs.weekOffset--; save(); renderBoard(); }
    else if (k === ']') { S.prefs.view = 'week'; S.prefs.weekOffset++; save(); renderBoard(); }
    else if (k === 'h') { S.prefs.hidePast = !S.prefs.hidePast; save(); renderBoard(); toast(S.prefs.hidePast ? 'Hiding past items' : 'Showing past items'); }
    else if (k === 'ArrowDown' || k === 'j') { var f = $('#sb-board .card'); if (f) { f.focus(); e.preventDefault(); } }
  });

  // ---------- dialogs ----------
  function dialog(title, body, foot, wide) {
    var d = document.createElement('dialog');
    if (wide) d.className = 'wide';
    d.innerHTML = '<div class="dlg-h"><h3>' + esc(title) + '</h3><button class="btn ghost icon" data-close aria-label="Close">' + ICON.x + '</button></div>' +
      '<div class="dlg-b">' + body + '</div>' + (foot ? '<div class="dlg-f">' + foot + '</div>' : '');
    document.body.appendChild(d);
    d.addEventListener('close', function () { d.remove(); });
    $$('[data-close]', d).forEach(function (b) { b.onclick = function () { d.close(); }; });
    d.addEventListener('mousedown', function (e) { if (e.target === d) d.close(); });
    d.setAttribute('tabindex', '-1');
    closeMenu(false);
    d.showModal();
    d.focus({ preventScroll: true });
    return d;
  }

  function openKeys() {
    var rows = [['N', 'Add a task'], ['I', 'Import a calendar link, .ics or CAS PDF'], ['/', 'Search'], ['T W A', 'Due today, Week, All'], ['[ ]', 'Previous / next week'], ['H', 'Hide past'],
      ['\u2191 \u2193 \u2190 \u2192', 'Move focus between cards'], ['1 2 3 4', 'Move the card to a column'], ['Shift+\u2190 Shift+\u2192', 'Move the card one column'], ['X Space', 'Toggle done (or double-click)'],
      ['E', 'Edit the card'], ['M', 'Card menu (move, done, edit, delete)'], ['Enter', 'Open it in Schoology'], ['Delete', 'Delete the card (with undo)'], ['?', 'This list']];
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
      (it ? '' : '<label for="ed-col">Column</label><select id="ed-col">' + cols().map(function (c) { return '<option value="' + c[0] + '">' + esc(c[1]) + '</option>'; }).join('') + '</select>') +
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
    return '<div class="imp">' +
      '<form id="imp-form" novalidate><label class="imp-l" for="imp-url">Paste your Schoology calendar link</label>' +
      '<div class="row"><input type="url" id="imp-url" placeholder="webcal://\u2026 or https://\u2026/calendar/feed/ical/\u2026" value="' + esc(S.feedUrl || '') + '"' + (canLink ? '' : ' disabled') + ' autocomplete="off" spellcheck="false">' +
      '<button class="btn primary" id="imp-go"' + (canLink ? '' : ' disabled') + '>Build my board</button></div>' +
      '<label class="remember"><input type="checkbox" id="imp-remember"' + (S.feedUrl || first ? ' checked' : '') + '> Remember the link on this device for one-click refresh</label>' +
      '<div class="err" id="imp-err" role="alert"></div>' +
      (MODE === 'offline' ? '<p class="hint">Needs internet: the link is fetched through ' + esc(CFG.home || 'the website') + '. Offline, drop an .ics file instead.</p>' : '') +
      '<details class="how"' + (first ? ' open' : '') + '><summary>Where do I find this link?</summary><ol class="how-steps">' +
      '<li>In Schoology, open <b>Calendar</b>.</li>' +
      '<li>At the bottom of the month grid, click <b>Export</b>, then <b>Share Calendar</b>.</li>' +
      '<li>Copy the <b>iCal link</b> and paste it above.</li></ol>' +
      '<p class="small dim">Some schools turn calendar sharing off. Treat the link like a password.</p></details></form>' +
      '<div class="or">or</div>' +
      '<label class="drop" id="imp-drop" tabindex="0"><input type="file" id="imp-file" class="sr" tabindex="-1" multiple accept=".ics,.ical,.ifb,.pdf,text/calendar,application/pdf">' +
      '<span class="drop-ic">' + BIG_UPLOAD + '</span><span class="drop-t">Drop a Schoology .ics or Course Assignment Sheet PDFs</span>' +
      '<span class="drop-s">or click to choose \u00b7 PDFs are read here in your browser</span></label>' +
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
    closeMenu(false);
    var two = !!CFG.preview;
    app.innerHTML = '<div class="hero' + (two ? ' two' : '') + '"><div class="hero-l">' +
      '<h2>Your Schoology assignments, on one board.</h2>' +
      '<p class="lead">Paste your calendar link or drop your files. Drag cards from <b>Need to be done</b> to <b>Completed</b>. Everything stays in your browser.</p>' +
      (CFG.sampleUrl ? '<button class="btn" id="imp-sample">Try the sample board ' + ICON.arrow + '</button>' : '') +
      importPanel(true) + '</div>' +
      (two ? '<div class="hero-r" aria-hidden="true"><img src="' + esc(CFG.preview) + '" alt="" width="1200" height="750" decoding="async"></div>' : '') +
      '</div><footer class="foot fr"><span>' + (MODE === 'web' ? 'Free and open source. Not affiliated with Schoology or PowerSchool.' : 'Offline copy of Schoology Board.') + '</span>' +
      '<a class="btn small" href="' + REPO + '" target="_blank" rel="noopener">' + ICON.star + ' Star on GitHub</a></footer>';
    bindImport(app, null);
    if ($('#imp-sample')) $('#imp-sample').onclick = loadSample;
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
  // ---------- calendar link (fetched through the relay; the link lives only in this browser) ----------
  var syncing = false;
  function relayFetch(url) {
    var proxy = MODE === 'web' ? (CFG.proxy || '/api/feed') : CFG.proxy;
    return fetch(proxy, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url }), cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.error || ('Could not fetch the calendar (' + r.status + ').')); });
        return r.arrayBuffer();
      });
  }
  function importLink(url, remember, root, onDone) {
    url = normalizeFeedUrl(url);
    var errEl = root ? $('#imp-err', root) : null;
    if (errEl) errEl.textContent = '';
    busy(root, true, 'Fetching your calendar\u2026');
    relayFetch(url)
      .then(function (buf) {
        var text = ics.decodeBytes(buf);
        var had = !!S.feedUrl;
        S.feedUrl = remember ? url : '';
        S.lastFetch = remember ? { at: Date.now(), ok: true } : null;
        applyIcs(text, 'link');
        if (had !== !!S.feedUrl) { renderShell(); renderBoard(); }
        if (onDone) onDone();
        maybeNaming();
      })
      .catch(function (e) {
        var msg = e && e.message && !/Failed to fetch|NetworkError|Load failed/i.test(e.message) ? e.message : 'Network error. Check your connection and try again.';
        if (errEl) errEl.textContent = msg; else toastErr(msg);
      })
      .then(function () { busy(root, false); });
  }
  // Refresh on open: quietly re-fetch the saved link and merge like a re-import; keep the cached board on failure.
  function refreshFeed() {
    if (MODE !== 'web' || !S.feedUrl || syncing) return;
    syncing = true; renderSync();
    var url = S.feedUrl;
    relayFetch(url)
      .then(function (buf) { if (S.feedUrl !== url) return; applyIcs(ics.decodeBytes(buf), 'refresh', { quiet: true }); S.lastFetch = { at: Date.now(), ok: true }; save(); })
      .catch(function () { S.lastFetch = { at: (S.lastFetch && S.lastFetch.at) || null, ok: false, failedAt: Date.now() }; save(); })
      .then(function () { syncing = false; renderSync(); });
  }
  function ago(t) {
    var m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    if (m < 24 * 60) return Math.floor(m / 60) + 'h ago';
    return 'on ' + fmtShort(new Date(t));
  }
  function renderSync() {
    var el = $('#sb-sync'); if (!el) return;
    var html = '';
    if (MODE === 'offline') html = 'Offline copy';
    else if (S.feedUrl) {
      var f = S.lastFetch;
      if (syncing) html = '<span class="spinner sm" aria-hidden="true"></span>Refreshing\u2026';
      else if (f && f.ok === false) html = 'Couldn\u2019t refresh \u00b7 <a href="#" id="sb-retry">Retry</a>';
      else if (f && f.at) html = 'Updated ' + ago(f.at);
    }
    el.innerHTML = html ? '<span class="sep" aria-hidden="true">\u00b7</span>' + html : '';
    var rt = $('#sb-retry'); if (rt) rt.onclick = function (e) { e.preventDefault(); refreshFeed(); };
  }


  // ---------- move to phone: the board travels in the link's #fragment, which browsers never send to a server ----------
  var MOVE_KEY = '#move=', QR_MAX = 1200;
  function b64u(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '=';
    var bin = atob(str), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function pipeBytes(bytes, t) { return new Response(new Blob([bytes]).stream().pipeThrough(t)).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  function encodeMove(obj) {
    var raw = new TextEncoder().encode(JSON.stringify(obj));
    if (!window.CompressionStream) return Promise.resolve('r' + b64u(raw));
    return pipeBytes(raw, new CompressionStream('deflate-raw')).then(function (z) { return 'z' + b64u(z); });
  }
  function decodeMove(code) {
    return Promise.resolve().then(function () {
      var bytes = unb64u(code.slice(1));
      if (code[0] === 'r') return new TextDecoder().decode(bytes);
      if (code[0] !== 'z' || !window.DecompressionStream) throw new Error('bad');
      return pipeBytes(bytes, new DecompressionStream('deflate-raw')).then(function (b) { return new TextDecoder().decode(b); });
    }).then(function (t) { var p = JSON.parse(t); if (!p || p.v !== 1) throw new Error('bad'); return p; });
  }
  function prune(o) { Object.keys(o).forEach(function (k) { var v = o[k]; if (v == null || v === '' || (typeof v === 'object' && !Object.keys(v).length)) delete o[k]; }); return o; }
  function movePayload() {
    var feed = MODE === 'web' ? S.feedUrl : '';
    // With a calendar link the phone refetches the events, so only short hashes of their UIDs travel.
    var key = function (id) { return feed && S.ics[id] ? '~' + ics.hash(id) : id; };
    var remap = function (m) { var o = {}; Object.keys(m).forEach(function (k) { o[key(k)] = m[k]; }); return o; };
    var p = prune({
      f: feed, c: S.createdAt, pc: S.proctorCol ? 1 : 0, st: remap(S.status), ov: remap(S.ov), hd: remap(S.hidden),
      cu: S.custom, ca: S.cats, or: S.order, rn: S.rename, ru: S.rules, cm: S.classMap, cas: S.cas,
      pr: prune({ hp: S.prefs.hidePast ? 1 : 0, sp: S.prefs.showPre ? 1 : 0 })
    });
    if (S.pending) ['st', 'ov', 'hd'].forEach(function (k) { if (S.pending[k]) p[k] = Object.assign({}, S.pending[k], p[k] || {}); });
    if (!feed) { // no link to refetch from: send the events still in play, minimal fields only
      p.ev = Object.keys(S.ics).filter(function (id) {
        var it = S.ics[id];
        return S.status[id] || S.ov[id] || !S.createdAt || toDate(it.due).getTime() >= S.createdAt;
      }).map(function (id) { var it = S.ics[id]; return [id, it.title, it.due, it.allDay ? 1 : 0, it.url || '', it.kind || '', it.course || 0]; });
    }
    p.v = 1;
    return p;
  }
  function moveBase() { return MODE === 'web' ? location.origin + location.pathname : (CFG.home || 'https://schoology-board.vercel.app') + '/'; }
  function drawQr(canvas, text) {
    if (!window.qrcode) return false;
    var q;
    try { q = window.qrcode(0, 'M'); q.addData(text, 'Byte'); q.make(); } catch (e) { return false; }
    // Whole pixels per module keep the code crisp for phone cameras.
    var n = q.getModuleCount(), quiet = 4, cells = n + quiet * 2;
    var target = Math.min(280, Math.floor(window.innerWidth * 0.72)), k = Math.max(2, Math.floor(target / cells));
    var dpr = Math.max(1, Math.round(window.devicePixelRatio || 1)), scale = k * dpr, size = cells * scale, ctx = canvas.getContext('2d');
    canvas.width = canvas.height = size;
    canvas.style.width = canvas.style.height = cells * k + 'px';
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    canvas.dataset.modules = n;
    return true;
  }
  function openMove() {
    var p = movePayload();
    encodeMove(p).then(function (code) {
      var url = moveBase() + MOVE_KEY + code, fits = url.length <= QR_MAX;
      var what = 'progress, your own tasks and categories, class names and settings';
      var body = '<p class="mv-intro">' + (fits ? 'Scan this with your phone\u2019s camera, or send yourself the link.' : 'This board is too big for a QR code that phones read reliably. Copy or share the link to your phone instead.') +
        ' Your phone gets this board: ' + what + '.</p>' +
        (fits ? '<div class="mv-qr"><canvas id="mv-qr" role="img" aria-label="QR code with the move link"></canvas></div>' : '') +
        '<div class="mv-link"><input type="text" id="mv-url" readonly value="' + esc(url) + '" aria-label="Move link"><button class="btn" id="mv-copy">Copy link</button>' +
        (navigator.share ? '<button class="btn" id="mv-share">Share</button>' : '') + '</div>' +
        '<p class="mv-note">' + ICON.lock + '<span>' + (p.f ? 'The link contains your calendar link, so treat it like a password. ' : 'The link contains your board, so only send it to yourself. ') +
        'Everything sits after the \u201c#\u201d, which your browser never sends to any server. Nothing is uploaded.' +
        (p.f ? '' : ' Your phone won\u2019t refresh from Schoology until you add your calendar link there.') + '</span></p>';
      var d = dialog('Move to phone', body, '<span class="r"><button class="btn primary" data-close>Done</button></span>');
      d.classList.add('move');
      if (fits && !drawQr($('#mv-qr', d), url)) { var w = $('.mv-qr', d); if (w) w.remove(); }
      $('#mv-copy', d).onclick = function () {
        var inp = $('#mv-url', d), btn = this;
        var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy link'; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { inp.select(); document.execCommand('copy'); done(); });
        else { inp.select(); document.execCommand('copy'); done(); }
      };
      var sh = $('#mv-share', d); if (sh) sh.onclick = function () { navigator.share({ title: 'Schoology Board', url: url }).catch(function () { }); };
      $('#mv-url', d).onfocus = function () { this.select(); };
    }, function () { toastErr('Could not make the link in this browser.'); });
  }
  // Turn a move payload into board state. Hashed calendar UIDs wait in S.pending until the feed arrives.
  function stateFromMove(p) {
    var st = { status: {}, ov: {}, hidden: {}, pending: null, ics: {} };
    [['st', 'status'], ['ov', 'ov'], ['hd', 'hidden']].forEach(function (pair) {
      var m = p[pair[0]] || {};
      Object.keys(m).forEach(function (k) {
        if (k[0] === '~') { st.pending = st.pending || {}; (st.pending[pair[0]] = st.pending[pair[0]] || {})[k] = m[k]; }
        else st[pair[1]][k] = m[k];
      });
    });
    (p.ev || []).forEach(function (e) { st.ics[e[0]] = { uid: e[0], title: e[1], course: e[6] || null, due: e[2], allDay: !!e[3], url: e[4], desc: '', kind: e[5] || 'assignment', source: 'ics' }; });
    st.custom = p.cu || {}; st.cats = p.ca || []; st.order = p.or || []; st.rename = p.rn || {}; st.rules = p.ru || [];
    st.classMap = p.cm || {}; st.cas = p.cas || {}; st.proctorCol = !!p.pc; st.createdAt = p.c || null; st.feedUrl = p.f || '';
    st.prefs = { hidePast: !!(p.pr && p.pr.hp), showPre: !!(p.pr && p.pr.sp) };
    return st;
  }
  function resolvePending() {
    if (!S.pending) return;
    var byHash = {};
    Object.keys(S.ics).forEach(function (id) { byHash['~' + ics.hash(id)] = id; });
    [['st', 'status'], ['ov', 'ov'], ['hd', 'hidden']].forEach(function (pair) {
      var m = S.pending[pair[0]]; if (!m) return;
      Object.keys(m).forEach(function (h) { if (byHash[h]) { S[pair[1]][byHash[h]] = m[h]; delete m[h]; } });
      if (!Object.keys(m).length) delete S.pending[pair[0]];
    });
    if (!Object.keys(S.pending).length) S.pending = null;
  }
  function hasBoard() { return !!(Object.keys(S.ics).length + Object.keys(S.cas).length + Object.keys(S.custom).length); }
  // Apply incoming state (from a move link or a backup) by replacing or merging. The incoming side wins conflicts.
  function adoptState(inc, how) {
    var keepId = S.boardId, keepFeed = S.feedUrl, cur = S;
    if (how === 'replace') {
      var base = blank();
      Object.keys(inc).forEach(function (k) { if (k !== 'prefs') base[k] = inc[k]; });
      base.prefs = Object.assign(base.prefs, inc.prefs || {});
      S = normalizeState(base);
      if (!S.feedUrl && MODE === 'web') S.feedUrl = keepFeed; // a backup never carries the link; keep this device's
    } else {
      ['status', 'ov', 'hidden', 'custom', 'cas', 'rename', 'classMap', 'ics', 'namingSeen'].forEach(function (k) { if (inc[k]) cur[k] = Object.assign({}, cur[k], inc[k]); });
      (inc.cats || []).forEach(function (c) { if (cur.cats.indexOf(c) < 0) cur.cats.push(c); });
      (inc.order || []).forEach(function (c) { if (cur.order.indexOf(c) < 0) cur.order.push(c); });
      var seenR = {}; cur.rules = (cur.rules || []).concat(inc.rules || []).filter(function (r) { var j = JSON.stringify(r); if (seenR[j]) return false; seenR[j] = 1; return true; });
      if (inc.createdAt) cur.createdAt = cur.createdAt ? Math.min(cur.createdAt, inc.createdAt) : inc.createdAt;
      cur.proctorCol = !!(cur.proctorCol || inc.proctorCol);
      if (inc.feedUrl && MODE === 'web') cur.feedUrl = inc.feedUrl;
      if (inc.pending) { cur.pending = cur.pending || {}; Object.keys(inc.pending).forEach(function (k) { cur.pending[k] = Object.assign({}, cur.pending[k], inc.pending[k]); }); }
      S = normalizeState(cur);
    }
    if (MODE !== 'web') S.feedUrl = '';
    S.boardId = keepId;
    if (S.createdAt) S.createdAt = sod(new Date(S.createdAt)).getTime();
    resolvePending();
    // Everything already on the board counts as named; don't pop the naming step for it.
    namingData().groups.forEach(function (g) { S.namingSeen[g.key] = 1; });
    save(); render();
  }
  function confirmAdopt(title, summary, inc, okLabel, onDone) {
    var existing = hasBoard();
    var body = '<p class="mv-intro">' + summary + '</p>' +
      (existing ? '<p class="hint">This browser already has a board. <b>Replace</b> swaps it for the incoming one. <b>Merge</b> keeps both; where they disagree, the incoming one wins.</p>' : '');
    var d = dialog(existing ? title.replace : title.fresh, body,
      '<button class="btn ghost" data-close id="mv-cancel">Cancel</button><span class="r">' + (existing ? '<button class="btn" id="mv-merge">Merge</button>' : '') +
      '<button class="btn primary" id="mv-replace">' + (existing ? 'Replace' : okLabel) + '</button></span>');
    var go = function (how) { d.close(); adoptState(inc, how); if (onDone) onDone(how); };
    $('#mv-replace', d).onclick = function () { go('replace'); };
    var mg = $('#mv-merge', d); if (mg) mg.onclick = function () { go('merge'); };
  }
  function countSummary(inc, nEvents) {
    var done = Object.keys(inc.status || {}).filter(function (k) { return inc.status[k] === 'done'; }).length;
    var pend = inc.pending && inc.pending.st ? Object.keys(inc.pending.st).filter(function (k) { return inc.pending.st[k] === 'done'; }).length : 0;
    var parts = [];
    if (nEvents) parts.push(nEvents + ' calendar item' + (nEvents === 1 ? '' : 's'));
    parts.push((done + pend) + ' done');
    var cu = Object.keys(inc.custom || {}).length; if (cu) parts.push(cu + ' of your own task' + (cu === 1 ? '' : 's'));
    var cas = Object.keys(inc.cas || {}).length; if (cas) parts.push(cas + ' from Course Assignment Sheets');
    var cm = Object.keys(inc.classMap || {}).length; if (cm) parts.push(cm + ' class name' + (cm === 1 ? '' : 's'));
    return parts.join(' \u00b7 ');
  }
  function takeMoveFromUrl() {
    if (location.hash.indexOf(MOVE_KEY) !== 0) return;
    var code = location.hash.slice(MOVE_KEY.length);
    // Strip the fragment right away, whatever the user decides.
    history.replaceState(null, '', location.pathname + location.search);
    decodeMove(code).then(function (p) {
      var inc = stateFromMove(p);
      var sum = countSummary(inc, (p.ev || []).length) + '.' + (inc.feedUrl ? ' Your calendar link is included, so this device will fetch your assignments right after.' : '');
      confirmAdopt({ fresh: 'Move this board here?', replace: 'Replace this board?' }, sum, inc, 'Move here', function () {
        if (S.feedUrl && MODE === 'web') { S.lastFetch = null; refreshFeed(); }
        toast('Board moved to this device.');
      });
    }, function () { toastErr('That move link is damaged or cut off. Make a new one on the other device.'); });
  }
  // ---------- import a backup (.html from "Save a backup", or a .json export) ----------
  function parseBackup(text) {
    var t = text.replace(/^\uFEFF/, '').trim(), data = null;
    if (t[0] === '{') data = JSON.parse(t);
    else {
      var doc = new DOMParser().parseFromString(text, 'text/html'), el = doc.getElementById('sb-data');
      if (el) data = JSON.parse(el.textContent);
    }
    if (data && data.state && typeof data.state === 'object') data = data.state;
    if (!data || typeof data !== 'object' || !(data.ics || data.custom || data.status || data.cas)) throw new Error('That file isn\u2019t a Schoology Board backup.');
    delete data.boardId; delete data.seenExport;
    return data;
  }
  function pickBackup() {
    var old = $('#sb-restore-file'); if (old) old.remove();
    var inp = document.createElement('input');
    inp.type = 'file'; inp.id = 'sb-restore-file'; inp.hidden = true; inp.accept = '.html,.htm,.json,text/html,application/json';
    document.body.appendChild(inp);
    inp.onchange = function () {
      var f = inp.files[0]; inp.remove(); if (!f) return;
      readFile(f, true).then(function (text) {
        var data = parseBackup(text);
        var n = Object.keys(data.ics || {}).length;
        var when = data.exportedAt ? ' saved ' + new Date(data.exportedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
        confirmAdopt({ fresh: 'Restore this backup?', replace: 'Replace this board?' }, '<b>' + esc(f.name) + '</b>' + esc(when) + '. ' + countSummary(data, n) + '.', data, 'Restore', function () {
          toast('Backup restored.');
          if (S.feedUrl && MODE === 'web') refreshFeed();
        });
      }).catch(function (e) { toastErr((e && e.message && !/JSON|Unexpected/.test(e.message)) ? e.message : 'That file isn\u2019t a Schoology Board backup.'); });
    };
    inp.click();
  }

  // ---------- name your classes ----------
  function namingData() {
    var items = allItems(), groups = {}, order = [], unsorted = [];
    items.forEach(function (it) {
      if (it.source !== 'ics' || (S.ov[it.id] && S.ov[it.id].course)) return;
      var pf = (it.mapped || it.autoCourse === 'cluster' || it.autoCourse === 'prefix') && ics.titlePrefix(it.title);
      if (pf) {
        var g = groups[pf.key];
        if (!g) { g = groups[pf.key] = { key: pf.key, raws: {}, n: 0, course: it.course, sample: it.title }; order.push(pf.key); }
        g.n++; g.raws[pf.raw] = (g.raws[pf.raw] || 0) + 1;
        return;
      }
      if (it.course === UNSORTED && ics.isWork(it)) unsorted.push(it);
    });
    var list = order.map(function (k) { var g = groups[k]; g.raw = Object.keys(g.raws).sort(function (a, b) { return g.raws[b] - g.raws[a]; })[0]; return g; })
      .sort(function (a, b) { return b.n - a.n; });
    var t0 = sod(new Date());
    unsorted.sort(function (a, b) { return ((a.d < t0) - (b.d < t0)) || (a.d - b.d); });
    return { groups: list, unsorted: unsorted.slice(0, 40), unsortedAll: unsorted, unsortedTotal: unsorted.length };
  }
  function maybeNaming() {
    var nd = namingData();
    var fresh = nd.groups.some(function (g) { return !S.namingSeen[g.key]; }) || nd.unsortedAll.some(function (i) { return !S.namingSeen[i.id]; });
    if (fresh && !document.querySelector('dialog[open]')) setTimeout(function () { openNaming(false); }, 60);
  }
  function openNaming(fromMenu) {
    var nd = namingData();
    var sugg = [], seen = {};
    function addS(c) { if (c && c !== UNSORTED && !seen[c]) { seen[c] = 1; sugg.push(c); } }
    Object.keys(S.cas).forEach(function (k) { addS(alias(S.cas[k].course)); });
    categories().forEach(addS);
    nd.groups.forEach(function (g) { addS(g.course); });
    if (!nd.groups.length && !nd.unsorted.length) {
      dialog('Name your classes', '<p class="nm-empty">Every assignment already has a class. Nothing to name right now.</p>', '<span class="r"><button class="btn primary" data-close>Done</button></span>');
      return;
    }
    var body = '<p class="nm-intro">Schoology doesn\u2019t say which class each assignment is for. We grouped them by how their titles start. Fix any names; we\u2019ll remember them for every refresh.</p>' +
      (sugg.length ? '<div class="nm-sugg" aria-label="Your classes"><span class="dim">Your classes</span>' + sugg.map(function (c) { return '<button type="button" class="chip" data-s="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' : '') +
      (nd.groups.length ? '<h4 class="nm-h">Detected from titles</h4><div class="nm-list">' + nd.groups.map(function (g) {
        var val = S.classMap[g.key] || g.course || g.raw;
        return '<div class="nm-row" data-k="' + esc(g.key) + '"><div class="nm-l"><b>' + esc(g.raw) + '</b><span class="dim"> \u00b7 ' + g.n + ' item' + (g.n === 1 ? '' : 's') + '</span><div class="nm-s">' + esc(g.sample) + '</div></div>' +
          '<input type="text" class="nm-in" list="nm-cats" value="' + esc(val) + '" aria-label="Class name for ' + esc(g.raw) + '"></div>';
      }).join('') + '</div>' : '') +
      (nd.unsorted.length ? '<h4 class="nm-h">Not sorted yet <span class="dim">' + nd.unsortedTotal + '</span></h4><div class="nm-list">' + nd.unsorted.map(function (it) {
        return '<div class="nm-row" data-id="' + esc(it.id) + '"><div class="nm-l"><span class="nm-t">' + esc(it.title) + '</span><div class="nm-s">' + esc(it.d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })) + '</div></div>' +
          '<input type="text" class="nm-in" list="nm-cats" placeholder="Unsorted" aria-label="Class for ' + esc(it.title) + '"></div>';
      }).join('') + (nd.unsortedTotal > nd.unsorted.length ? '<p class="hint">Showing the first ' + nd.unsorted.length + '. You can sort the rest from each card\u2019s \u22ef menu.</p>' : '') + '</div>' : '') +
      '<datalist id="nm-cats">' + sugg.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>';
    var d = dialog('Name your classes', body, '<button class="btn ghost" id="nm-skip">' + (fromMenu ? 'Cancel' : 'Skip') + '</button><span class="r"><button class="btn primary" id="nm-done">Done</button></span>', true);
    d.classList.add('naming');
    var lastIn = null;
    $$('.nm-in', d).forEach(function (inp) { inp.addEventListener('focus', function () { lastIn = inp; }); });
    $$('.nm-sugg .chip', d).forEach(function (b) { b.onclick = function () { var t = lastIn || $('.nm-in', d); if (t) { t.value = b.dataset.s; t.focus(); } }; });
    function markSeen() { nd.groups.forEach(function (g) { S.namingSeen[g.key] = 1; }); nd.unsortedAll.forEach(function (i) { S.namingSeen[i.id] = 1; }); }
    $('#nm-skip', d).onclick = function () { if (!fromMenu) { markSeen(); save(); } d.close(); };
    $('#nm-done', d).onclick = function () {
      var n = 0;
      $$('.nm-row[data-k]', d).forEach(function (row) { var v = $('.nm-in', row).value.trim(); if (v && v !== UNSORTED) { S.classMap[row.dataset.k] = v; n++; } else delete S.classMap[row.dataset.k]; });
      $$('.nm-row[data-id]', d).forEach(function (row) { var v = $('.nm-in', row).value.trim(); if (v && v !== UNSORTED) { S.ov[row.dataset.id] = Object.assign(S.ov[row.dataset.id] || {}, { course: v }); n++; } });
      markSeen(); save(); d.close(); renderBoard();
      toast(n ? 'Saved. Future refreshes use these class names.' : 'Saved.');
    };
  }

  function applyIcs(text, source, opts) {
    var items = ics.parseIcs(text);
    if (opts && opts.shiftMs) items.forEach(function (it) {
      var d = new Date(toDate(it.due).getTime() + opts.shiftMs);
      it.due = /Z$/.test(it.due) ? d.toISOString() : localStr(d);
    });
    if (!items.length) throw new Error('That calendar has no events yet.');
    markCreated();
    var before = S.ics, map = {}, fresh = 0;
    items.forEach(function (it) { if (!before[it.uid]) fresh++; map[it.uid] = it; });
    S.ics = map;
    resolvePending();
    S.lastImport = { at: Date.now(), source: source, count: items.length };
    save();
    if (!$('#sb-board')) renderShell();
    renderBoard();
    if (!(opts && opts.quiet)) toast('Imported ' + items.length + ' calendar item' + (items.length === 1 ? '' : 's') + (Object.keys(before).length ? ' (' + fresh + ' new)' : '') + '.');
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
        if (errEl) errEl.innerHTML = '<span class="loadmsg"><span class="spinner"></span> Reading ' + pdfs.length + ' PDF' + (pdfs.length > 1 ? 's' : '') + '\u2026</span>';
        return Promise.all(pdfs.map(parseCasFile));
      }).then(function (results) {
        if (errEl) errEl.textContent = '';
        if (onDone) onDone();
        openCasPreview(results);
      });
    } else chain = chain.then(function () { if (onDone) onDone(); if (icsFiles.length) maybeNaming(); });
    chain.catch(function (e) { var m = (e && e.message) || 'Could not read that file.'; if (errEl) errEl.textContent = m; else toastErr(m); });
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
        if (m.length) { it.dup = m.length > 1 ? 'Already on calendar (' + m.length + ')' : 'Already on calendar'; it.on = false; it.matches = m.map(function (x) { return x.id; }); }
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
              '<td class="k"><span class="pill kind">' + esc(kindName[it.kind] || it.kind) + '</span></td><td class="dup">' + (it.dup ? '<span class="pill">' + esc(it.dup) + '</span>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></section>';
      }).join('') + '<datalist id="cas-cats">' + categories().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
        '<p class="hint">Readings and other work become cards too; learning objectives are skipped. Items already on your Schoology calendar start unchecked so you don\'t get doubles, and their class is copied onto the calendar card.</p>';
    }
    var total = function () { return results.reduce(function (s, r) { return s + r.items.filter(function (i) { return i.on; }).length; }, 0); };
    var d = dialog('Check your Course Assignment Sheet' + (results.length > 1 ? 's' : ''), draw(),
      '<span class="r"><button class="btn" data-close>Cancel</button><button class="btn primary" id="cas-add">Add ' + total() + ' task' + (total() === 1 ? '' : 's') + '</button></span>', true);
    function upd() {
      var n = total(); $('#cas-add', d).textContent = 'Add ' + n + ' task' + (n === 1 ? '' : 's'); $('#cas-add', d).disabled = !n;
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
      markCreated();
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
      var target = defaultMonday(); // the week the board opens on
      var weeks = Math.round((target - monday(first)) / (7 * 864e5));
      S.rules = SAMPLE_RULES.slice();
      S.order = ['Biology', 'World History', 'Geometry', 'English 10', 'Spanish II'];
      var st = { 'sb-sample-001@example.invalid': 'done', 'sb-sample-003@example.invalid': 'done', 'sb-sample-010@example.invalid': 'started', 'sb-sample-014@example.invalid': 'proctor' };
      Object.keys(st).forEach(function (k) { S.status[k] = st[k]; });
      S.prefs.view = 'week'; S.prefs.weekOffset = 0; S.proctorCol = true; // the demo shows every column
      markCreated(addDays(target, -7).getTime()); // the made-up board "started" a week before the sample week
      applyIcs(text, 'sample', { shiftMs: weeks * 7 * 864e5 });
    }).catch(function (e) { toastErr(e.message); if (btn) { btn.disabled = false; btn.innerHTML = 'Try the sample board ' + ICON.arrow; } });
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
      getSrc('vendor/qrcode.js', 'sb-src-qr').then(function (t) { files.qr = t; }, function () { }),
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
        '<title>Schoology Board (backup)</title><meta name="color-scheme" content="dark"><style id="sb-css">' + files.css.replace(/<\/style/gi, '<\\/style') + '</style></head><body>' +
        '<div id="app"><div class="loading">Loading your board\u2026</div></div>\n' +
        '<script id="sb-config" type="application/json">' + j(cfg) + '</script>\n' +
        '<script id="sb-data" type="application/json">' + j(snap) + '</script>\n' +
        (files.pdf && files.worker ? '<script id="sb-pdfjs" type="text/plain">' + scriptSafe(files.pdf) + '</script>\n<script id="sb-pdfworker" type="text/plain">' + scriptSafe(files.worker) + '</script>\n' : '') +
        (files.qr ? '<script id="sb-src-qr">' + scriptSafe(files.qr) + '</script>\n' : '') +
        '<script id="sb-src-ics">' + scriptSafe(files.ics) + '</script>\n' +
        '<script id="sb-src-cas">' + scriptSafe(files.cas) + '</script>\n' +
        '<script id="sb-src-board">' + scriptSafe(files.board) + '</script>\n</body></html>\n';
    });
  }
  var packing = false;
  function downloadOffline() {
    if (packing) return;
    packing = true;
    toast('Saving a backup\u2026', null, null, 1500);
    buildOfflineHtml().then(function (html) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      a.download = 'schoology-board-backup-' + dayKey(new Date()) + '.html';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      toast('Backup saved. Open it from your Downloads; it works without internet.', null, null, 5000);
    }).catch(function (e) { toastErr('Could not save the backup: ' + e.message); })
      .then(function () { packing = false; });
  }

  // ---------- boot ----------
  function init() {
    app = document.getElementById('app');
    if (!app) return;
    S = load();
    var migrated = S._migrated; delete S._migrated;
    if (S._needsProctorCheck) { // boards from before the column was optional keep it if they use it
      delete S._needsProctorCheck;
      S.proctorCol = Object.keys(S.status).some(function (k) { return S.status[k] === 'proctor'; }) ||
        [S.ics, S.cas, S.custom].some(function (m) { return Object.keys(m).some(function (k) { return /\bproctor/i.test(m[k].title || ''); }); });
      migrated = true;
    }
    if (MODE === 'offline' || migrated) save();
    render();
    var moving = MODE === 'web' && location.hash.indexOf(MOVE_KEY) === 0;
    if (moving) takeMoveFromUrl(); else refreshFeed();
    window.addEventListener('hashchange', function () { if (MODE === 'web') takeMoveFromUrl(); });
    setInterval(renderSync, 30000);
    setInterval(function () { if (!drag && !document.querySelector('dialog[open]') && $('#sb-board') && !(document.activeElement && document.activeElement.classList.contains('card'))) renderBoard(); }, 60000);
    window.addEventListener('storage', function (e) { if (e.key === K) { S = load(); delete S._migrated; delete S._needsProctorCheck; render(); } });
  }
  window.SchoologyBoard = { state: function () { return S; }, render: render, matches: sameish, buildOfflineHtml: buildOfflineHtml, movePayload: function () { return movePayload(); }, version: '1.3.1' };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
