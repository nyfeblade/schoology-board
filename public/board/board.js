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
  var wedge = window.SBwedge;
  // "Needs to be proctored" is optional; with it off, its cards show in Need to be done (their status is kept).
  function cols() { return wedge.visibleColumns(S && S.columns, !!(S && S.proctorCol)); }
  function colIds() { return cols().map(function (c) { return c.id; }); }
  function colById(id) {
    var list = (S && S.columns) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function icsSourceName() { return wedge.hostKind(S && S.feedUrl) === 'calendar' ? 'calendar' : 'Schoology calendar'; }
  var UNSORTED = 'Unsorted';
  var ics = window.SBics, cas = window.SBcas, plan = window.SBplan;
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
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    play: svg('<path d="M7 4v16l13-8z"/>'),
    stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
    star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>')
  };
  var BIG_UPLOAD = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>';
  var REPO = 'https://github.com/nyfeblade/schoology-board';
  var SHORT = { todo: 'To do', started: 'Started', proctor: 'Proctor', done: 'Done' };
  var DEFAULT_COL = { todo: 'Need to be done', started: 'Started', proctor: 'Needs to be proctored', done: 'Completed' };
  function shortCol(c) {
    if (DEFAULT_COL[c.id] && c.name === DEFAULT_COL[c.id] && SHORT[c.id]) return SHORT[c.id];
    var n = c.name || 'Column';
    return n.length > 16 ? n.slice(0, 15) + '\u2026' : n;
  }

  // ---------- state ----------
  function blank() {
    return {
      v: 1, boardId: rid(), updated: 0, ics: {}, cas: {}, custom: {}, cats: [], order: [], rename: {},
      ov: {}, hidden: {}, status: {}, rules: [], lastImport: null, feedUrl: '', seenExport: null, createdAt: null,
      proctorCol: false, classMap: {}, namingSeen: {}, lastFetch: null, pending: null,
      // planner: time estimates, one-tap type (e.g. test), timed minutes, finished study/start-early chunks per night
      est: {}, ttype: {}, actual: {}, sdone: {}, timer: null, planStart: null,
      // Tonight: items pulled in early, the student's own order for today, flags they confirmed, class colors per theme
      pulled: {}, earlyPin: {}, tnOrder: null, checked: {}, colors: {}, colorAuto: {},
      columns: null, labels: [],
      prefs: { tab: 'now', view: 'week', weekOffset: 0, from: '', to: '', hidePast: false, showPre: false, course: null, label: null, q: '', theme: 'sticker', mode: '', showDone: false, groupBy: 'date' }
    };
  }
  function normalizeState(st) {
    st = Object.assign(blank(), st || {});
    st.prefs = Object.assign(blank().prefs, st.prefs || {});
    ['ics', 'cas', 'custom', 'rename', 'ov', 'hidden', 'status', 'classMap', 'namingSeen', 'est', 'ttype', 'actual', 'sdone', 'pulled', 'earlyPin', 'checked', 'colors', 'colorAuto'].forEach(function (k) { if (!st[k] || typeof st[k] !== 'object') st[k] = {}; });
    ['cats', 'order', 'rules'].forEach(function (k) { if (!Array.isArray(st[k])) st[k] = []; });
    st.columns = wedge.migrateColumns(st).columns;
    st.labels = wedge.sanitizeLabels(st.labels);
    if (st.prefs.label && !st.labels.some(function (l) { return l.id === st.prefs.label; })) st.prefs.label = null;
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
    // Returning students open on Tonight ("what do I do next?"); ?view=board|ahead (e.g. from the installed app) picks another view.
    // The Calendar view isn't built yet, so old ?view=cal links open Tonight instead of a dead end.
    var qv = (location.search.match(/[?&]view=(now|tonight|board|ahead)\b/) || [])[1];
    st.prefs.tab = qv === 'tonight' ? 'now' : qv || 'now';
    // Pulled-in items only stay pulled for the night they were pulled.
    var tk = dayKey(new Date());
    Object.keys(st.pulled || {}).forEach(function (k) { if (st.pulled[k] !== tk) delete st.pulled[k]; });
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
  var OV_FIELDS = ['title', 'course', 'due', 'url', 'note', 'allDay', 'checks', 'labels'];
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
          // The class sheet gives a definite date that disagrees with the calendar: we use the calendar, and say so.
          if (it.note !== 'Before class' && dayDiff(it.due, m.due) !== 0 && !(S.ov[m.id] && S.ov[m.id].due)) m.check = { what: 'due date', src: icsSourceName(), url: safeUrl(m.url),
            why: 'Your class sheet says ' + fmtDayShort(toDate(it.due)) + ', but the ' + icsSourceName() + ' says ' + fmtDayShort(toDate(m.due)) + '. This list uses the calendar date.' };
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
    var knownCols = (S.columns || []).map(function (c) { return c.id; });
    var labelIds = {};
    (S.labels || []).forEach(function (l) { labelIds[l.id] = 1; });
    result.forEach(function (it) {
      it.course = alias(it.course || UNSORTED) || UNSORTED;
      if (it.source === 'custom' && (it.undated || !it.due)) {
        var nowD = new Date();
        it.undated = true;
        it.allDay = true;
        it.d = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate(), 23, 59, 0, 0);
      } else {
        it.d = toDate(it.due);
        it.undated = false;
      }
      it.labels = (Array.isArray(it.labels) ? it.labels : []).filter(function (id) { return labelIds[id]; });
      it.checks = wedge.sanitizeChecks(it.checks);
      it.col = S.status[it.id] || it.inheritStatus || (/\bproctor/i.test(it.title) ? 'proctor' : 'todo');
      if (knownCols.indexOf(it.col) < 0) it.col = 'todo';
      it.rawCol = it.col;
      if (it.col === 'proctor' && !S.proctorCol) it.col = 'todo';
      // Imported work due before the board existed counts as already handled: hidden, not overdue, not Completed.
      it.pre = isPre(it);
      if (!it.check) it.check = checkOf(it);
    });
    preItems = result.filter(function (it) { return it.pre; });
    return S.prefs.showPre ? result : result.filter(function (it) { return !it.pre; });
  }
  // Things we read but aren't sure about. Each becomes a "Double-check this" note with its reason and source.
  function checkOf(it) {
    var src = it.source === 'cas' ? 'class sheet' : it.source === 'ics' ? icsSourceName() : '', url = it.source === 'ics' ? safeUrl(it.url) : '';
    if (!src) return null;
    if (it.source === 'cas' && it.dueWord && it.note === 'Before class') return { what: 'due date', src: src, url: url, why: 'The class sheet mentions a due date we couldn\u2019t read, so this uses the start of class (' + fmtDayShort(toDate(it.due)) + ').' };
    var kw = /\b(quiz|test|exam)\b/i.test(it.title) && it.title.match(/\b(open[- ]?book|take[- ]?home|practice|retake)\b/i);
    if (kw) return { what: 'kind of work', src: src, url: url, why: 'The title says it\u2019s a quiz or test but also \u201c' + kw[0].toLowerCase() + '\u201d, so it may be homework instead. It\u2019s planned as a test with study time. If that\u2019s wrong, change the kind in its time estimate.' };
    return null;
  }
  function fmtDayShort(d) { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
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
    m.el.remove();
    // A tap on the backdrop closes on pointerdown; keep an invisible backdrop until the click that follows, so it can't land on what's underneath.
    if (m.scrim) { var sc = m.scrim; if (m.tapped) { sc.style.opacity = '0'; var gone = function () { sc.remove(); }; sc.addEventListener('click', gone); setTimeout(gone, 500); } else sc.remove(); }
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
      var radio = it.swatch || it.radio, ic = it.swatch ? '<i class="msw" style="background:var(--swatch-' + it.swatch + ')" aria-hidden="true"></i>' : (it.icon || '');
      return '<button type="button" class="menu-i' + (it.cls ? ' ' + it.cls : '') + (radio ? ' radio' : '') + '" role="' + (radio ? 'menuitemradio' : 'menuitem') + '"' + (radio ? ' aria-checked="' + !!it.checked + '"' : '') + ' data-i="' + i + '"' + (it.id ? ' id="' + it.id + '"' : '') + '>' + ic + '<span>' + esc(it.label) + '</span>' + (it.kbd ? '<kbd>' + esc(it.kbd) + '</kbd>' : '') + (radio && it.checked ? ICON.check : '') + '</button>';
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
    m.outside = function (e) { if (!el.contains(e.target) && !anchor.contains(e.target)) { if (scrim && e.target === scrim) { e.preventDefault(); m.tapped = true; } closeMenu(false); } };
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
  function hasData() { return !!S.feedUrl || Object.keys(S.ics).length + Object.keys(S.cas).length + Object.keys(S.custom).length > 0 || S.cats.length > 0; }
  function render() {
    if (!hasData()) return renderFirstRun();
    renderShell();
    renderBoard();
  }

  // Views behind the top nav (bottom nav on phones). Tonight is home; Calendar is announced, not built yet.
  var NAV = [['now', 'Tonight', 'moon', ''], ['board', 'Board', 'board', ''], ['ahead', 'Sunday plan', 'sun', '']];
  var NAV_TIP = { now: 'Tonight: what to do and in what order', board: 'Every assignment by status', ahead: 'Your week ahead: tests, the busiest day and what to start early' };
  var NICON = {
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/></svg>',
    board: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="11" rx="1.5"/><rect x="15.5" y="4" width="5" height="7" rx="1.5"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14.5h5M8 17h8"/></svg>',
    pal: '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.6-2.1-.5-1.2.3-2.4 1.6-2.4H17a4 4 0 0 0 4-4C21 7 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/></svg>',
    dots: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>',
    ref: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9M20 20v-4h-4"/></svg>',
    grip: '<svg viewBox="0 0 12 20" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="4" r="1.6"/><circle cx="9" cy="4" r="1.6"/><circle cx="3" cy="10" r="1.6"/><circle cx="9" cy="10" r="1.6"/><circle cx="3" cy="16" r="1.6"/><circle cx="9" cy="16" r="1.6"/></g></svg>',
    pull: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V7M6.5 12.5 12 7l5.5 5.5M5 4h14"/></svg>',
    flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/><path d="M12 7.2v6.2"/><circle cx="12" cy="16.9" r=".6" fill="currentColor"/></svg>',
    ext: '<svg class="ex" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5"/></svg>',
    ck: '<svg class="ck" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
    cup: '<svg class="cup" viewBox="0 0 32 32" aria-hidden="true"><path class="steam" d="M12 3.5c-1.6 1.8 1.6 2.9 0 4.9M17.5 3.5c-1.6 1.8 1.6 2.9 0 4.9"/><clipPath id="cupc"><path d="M5.5 11h18v7.5a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7z"/></clipPath><g clip-path="url(#cupc)"><rect class="fill" x="4" y="10" width="21" height="17"/></g><path class="body" d="M5.5 11h18v7.5a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7z"/><path class="body" d="M23.5 13.5h2a3 3 0 0 1 0 6h-2.2"/><path class="tick" d="M10 18l3 3 5.5-6"/></svg>'
  };
  function navHtml(bottom) {
    return NAV.map(function (n) {
      var soon = n[3] ? '<span class="soon">Soon</span>' : '';
      return '<a href="?view=' + n[0] + '" data-tab="' + n[0] + '" title="' + esc(NAV_TIP[n[0]]) + '">' + (bottom ? NICON[n[2]] + '<span>' + esc(n[1]) + '</span>' : esc(n[1])) + soon + '</a>';
    }).join('');
  }
  function renderShell() {
    closeMenu(false);
    app.innerHTML =
      '<header class="topbar" id="sb-top"><a class="brand" href="?view=now" id="sb-brand"><i aria-hidden="true"></i><span>Schoology Board</span></a>' +
      '<nav class="navt" id="sb-tabs" aria-label="Views">' + navHtml(false) + '</nav>' +
      '<div class="tools">' +
      '<button class="btn" id="sb-add" title="Add a task (N)">' + ICON.plus + '<span class="lbl">Add task</span></button>' +
      (MODE === 'web' ? '<button class="ib thbtn hide-m" id="sb-theme" aria-label="Change theme" title="Change theme">' + NICON.pal + '</button>' : '') +
      '<button class="ib" id="sb-more" aria-label="More actions" aria-haspopup="menu" aria-expanded="false" title="More">' + NICON.dots + '</button>' +
      '</div></header>' +
      '<div id="sb-main"></div>' +
      '<div class="foot">' + (MODE === 'offline' ? 'Offline copy \u00b7 progress is saved in this browser' + (CFG.home ? ' \u00b7 <a href="' + esc(CFG.home) + '" target="_blank" rel="noopener">Open the website</a>' : '') :
        'Everything stays in your browser \u00b7 <a href="' + REPO + '" target="_blank" rel="noopener">Open source</a>') +
      ' \u00b7 <a href="#" id="sb-reset">Reset this board</a></div>' +
      '<nav class="botnav" id="sb-botnav" aria-label="Views">' + navHtml(true) + '</nav>';
    $('#sb-add').onclick = function () { openEditor(null); };
    $('#sb-more').onclick = function () { moreMenu(this); };
    var th = $('#sb-theme'); if (th) th.onclick = openThemes;
    $('#sb-brand').onclick = function (e) { e.preventDefault(); setTab('now'); };
    $$('[data-tab]', app).forEach(function (b) { b.onclick = function (e) { e.preventDefault(); setTab(b.dataset.tab); }; });
    $('#sb-reset').onclick = function (e) { e.preventDefault(); confirmReset(); };
  }
  function confirmReset() {
    var n = Object.keys(S.ics).length + Object.keys(S.cas).length + Object.keys(S.custom).length, done = Object.keys(S.status).filter(function (k) { return S.status[k] === 'done'; }).length;
    var d = dialog('Reset this board?', '<p>This erases everything this board saved in this browser:</p><ul class="rs-list">' +
      '<li>' + plural(n, 'task') + ' (from Schoology, class sheets and your own)</li>' +
      '<li>Your check-offs (' + done + ' done) and what you started</li>' +
      '<li>Time estimates, timings and tonight\u2019s order</li>' +
      '<li>Class names, categories and colors</li>' + (S.feedUrl ? '<li>Your saved calendar link</li>' : '') + '</ul>' +
      '<p class="hint">It can\u2019t be undone. Save a backup file first if you might want it back.</p>',
      '<button class="btn" id="rs-backup">' + ICON.dl + 'Save a backup first</button><span class="r"><button class="btn" data-close>Cancel</button><button class="btn danger" id="rs-go">Erase this board</button></span>');
    d.classList.add('reset');
    $('#rs-backup', d).onclick = function () { downloadOffline(); };
    $('#rs-go', d).onclick = function () {
      d.close();
      try { localStorage.removeItem(K); } catch (x) { }
      S = blank(); if (MODE === 'offline') S.seenExport = (readJson('sb-data') || {}).exportedAt;
      save(); render(); toast('Board erased.');
    };
  }
  function setTab(t) {
    if (t !== 'board' && t !== 'ahead') t = 'now';
    if (S.prefs.tab === t && $('#sb-main').firstChild) return;
    S.prefs.tab = t; save();
    $('#sb-main').innerHTML = '';
    renderBoard();
    window.scrollTo(0, 0);
  }

  // ---------- themes and class colors ----------
  var THEMES = [
    ['sticker', 'Sticker Book', 'Chunky stickers, bold outlines, a DONE! stamp.', ['Sky', 'Lemon', 'Lilac', 'Grass', 'Cherry', 'Navy', 'Pebble', 'Plum']],
    ['arcade', 'Arcade Night', 'Dark and glowing, with XP for every check-off.', ['Sunny', 'Violet', 'Lime', 'Coral', 'Electric blue', 'Steel', 'White', 'Green']],
    ['notebook', 'Highlighter Notebook', 'Graph paper and highlighter. Light or dark.', ['Yellow', 'Green', 'Sky blue', 'Lavender', 'Red', 'Pencil', 'Ink blue', 'Purple']],
    ['varsity', 'Varsity', 'Scoreboard type, team colors, a final score.', ['Royal', 'Gold', 'Maroon', 'Kelly green', 'Varsity red', 'Navy', 'Silver', 'Purple']],
    ['riso', 'Riso Zine', 'Two-color print, stamps and halftone dots.', ['Riso blue', 'Yellow', 'Bright red', 'Green', 'Blue tint', 'Purple overprint', 'Warm grey', 'Burgundy']],
    ['cafe', 'Lo-fi Caf\u00e9', 'Warm and dim. Your mug fills as you go.', ['Slate blue', 'Honey', 'Lavender', 'Sage', 'Brick', 'Plum', 'Latte', 'Foam']],
    ['minimal', 'Minimal', 'Quiet black and white. Light or dark.', ['Blue', 'Mustard', 'Violet', 'Green', 'Plum', 'Graphite', 'Navy', 'Rose']],
    ['nocturne', 'Nocturne', 'A night sky. Each thing you finish lights a star.', ['Sapphire', 'Amethyst', 'Moonlight gold', 'Garnet', 'Sage', 'Pearl', 'Brass', 'Orchid'], 'preview']
  ];
  // Preview themes (Nocturne) stay out of the picker until ?preview=<name> is opened once on this device
  // (?preview=off hides them again). A board already using one keeps it.
  var PREVIEW = (function () {
    try {
      var m = /[?&]preview=([a-z]+)/.exec(location.search);
      if (m) { if (m[1] === 'off') localStorage.removeItem('sb-preview'); else localStorage.setItem('sb-preview', m[1]); }
      return localStorage.getItem('sb-preview') || '';
    } catch (e) { return ''; }
  })();
  function pickable(t) { return !t[4] || PREVIEW === t[0] || (S && S.prefs.theme === t[0]); }
  // Themes with a light and a dark version; the student's choice is shared between them.
  var MODES = { notebook: 1, minimal: 1 };
  // Swatches a theme never hands out on its own (a student can still pick them): Minimal's Rose, Nocturne's Orchid.
  var NO_AUTO = { minimal: [8], nocturne: [8] };
  function themeInfo(id) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i][0] === id) return THEMES[i]; return THEMES[0]; }
  function curTheme() { var t = S && S.prefs.theme; return themeInfo(t)[0]; }
  function applyTheme() {
    var t = curTheme(), mode = MODES[t] && S.prefs.mode === 'dark' ? 'dark' : '';
    // The backup file only carries the theme it was saved with.
    if (MODE === 'offline') { var baked = document.documentElement.getAttribute('data-theme'); if (baked) t = baked; }
    document.documentElement.setAttribute('data-theme', t);
    if (mode) document.documentElement.setAttribute('data-mode', mode); else document.documentElement.removeAttribute('data-mode');
    try { localStorage.setItem('sb-theme', JSON.stringify({ t: t, m: mode })); } catch (e) { }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', themeVar('--meta-theme-color', ''));
    document.documentElement.classList.toggle('lowfx', t === 'nocturne' && lowFx());
    nocSky(t === 'nocturne');
  }
  // ---------- Nocturne: the sky, and the constellation that lights a star per finished thing ----------
  // Glass blur is skipped (solid cards) on 2-core machines, with Save-Data, with ?lite, under
  // prefers-reduced-transparency, and where backdrop-filter is unsupported (the last two in CSS).
  function lowFx() {
    try { return (navigator.hardwareConcurrency || 8) <= 2 || !!(navigator.connection && navigator.connection.saveData) || /[?&]lite\b/.test(location.search); } catch (e) { return false; }
  }
  function nocSky(on) {
    var el = document.getElementById('sb-sky');
    if (!on) { if (el) el.remove(); return; }
    if (el || !document.body) return;
    var r = 7, rnd = function () { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; }, stars = '';
    for (var i = 0; i < 40; i++) stars += '<circle cx="' + Math.round(rnd() * 1440) + '" cy="' + Math.round(rnd() * 900) + '" r="' + (0.5 + Math.round(rnd() * 3) * 0.15).toFixed(2) + '" opacity="' + (0.22 + rnd() * 0.3).toFixed(2) + '"/>';
    el = document.createElement('div'); el.id = 'sb-sky'; el.className = 'nsky'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="nglow"></div><svg class="nstars" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">' + stars + '</svg>' +
      '<div class="nmoon"><svg viewBox="0 0 120 120"><defs><radialGradient id="nmh"><stop offset="0" stop-opacity=".2"/><stop offset=".22" stop-opacity=".1"/><stop offset=".45" stop-opacity=".035"/><stop offset=".75" stop-opacity=".01"/><stop offset="1" stop-opacity="0"/></radialGradient>' +
      '<mask id="nmm"><rect width="120" height="120" fill="white"/><circle cx="71.5" cy="51" r="24" fill="black"/></mask></defs>' +
      '<circle cx="60" cy="60" r="60" fill="url(#nmh)"/><circle class="disc" cx="60" cy="60" r="22" opacity=".028"/><circle class="lit" cx="60" cy="60" r="22" mask="url(#nmm)"/></svg></div><div class="ngrain"></div>';
    document.body.insertBefore(el, document.body.firstChild);
  }
  var NOC = { fresh: false, draw: false };
  var CONST = {
    8: { vb: '0 0 216 92', p: [[12, 70], [44, 62], [74, 69], [102, 54], [124, 28], [160, 18], [192, 36], [170, 64]], path: [0, 1, 2, 3, 4, 5, 6, 7, 3] },
    15: { vb: '0 0 196 56', p: [[8, 38], [22, 26], [38, 32], [50, 18], [66, 12], [82, 20], [92, 34], [108, 40], [124, 32], [134, 18], [150, 12], [166, 20], [176, 34], [188, 44], [160, 46]], path: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 12, 14] }
  };
  function arcPts(n) { var p = [], path = []; for (var i = 0; i < n; i++) { var t = i / (n - 1 || 1); p.push([Math.round(10 + t * 196), Math.round(70 - Math.sin(t * Math.PI) * 44 + (i % 2 ? 6 : -4))]); path.push(i); } return { vb: '0 0 216 92', p: p, path: path }; }
  // done of total, drawn with at most 15 stars (bigger nights light them in proportion; all lit only when all done).
  function constel(done, total, o) {
    o = o || {};
    var n = Math.min(total, 15), lit = total <= 15 ? done : (done >= total ? 15 : Math.floor(done * 15 / total));
    if (!n) return '';
    var C = CONST[n] || arcPts(n), all = lit >= n, big = n > 8, uid = 'cg' + (o.id || '');
    var d = C.path.map(function (i, k) { return (k ? 'L' : 'M') + C.p[i][0] + ' ' + C.p[i][1]; }).join(' ');
    return '<svg class="cst' + (all ? ' full' : '') + (all && o.draw ? ' draw' : '') + '" viewBox="' + C.vb + '" aria-hidden="true" focusable="false">' +
      '<defs><radialGradient id="' + uid + '"><stop offset="0" stop-opacity=".55"/><stop offset=".35" stop-opacity=".16"/><stop offset="1" stop-opacity="0"/></radialGradient></defs>' +
      (all ? '<path class="cl" d="' + d + '" pathLength="1"/>' : '<path class="cg" d="' + d + '"/>') +
      C.p.map(function (q, i) {
        return i < lit ? '<g class="sl' + (o.fresh && i === lit - 1 ? ' fresh' : '') + '" style="--i:' + i + '"><circle class="sh" cx="' + q[0] + '" cy="' + q[1] + '" r="' + (big ? 7 : 9) + '" fill="url(#' + uid + ')"/><circle class="sc" cx="' + q[0] + '" cy="' + q[1] + '" r="' + (big ? 1.7 : 2.1) + '"/></g>'
          : '<circle class="su" cx="' + q[0] + '" cy="' + q[1] + '" r="' + (big ? 1.1 : 1.4) + '"/>';
      }).join('') + '</svg>';
  }
  function setTheme(t, mode) {
    S.prefs.theme = t; if (mode !== undefined) S.prefs.mode = mode;
    save(); applyTheme(); render();
  }
  function openThemes() {
    if (MODE !== 'web') { toast('Themes can be changed on the website. This backup keeps the theme it was saved with.'); return; }
    var cur = curTheme();
    var body = '<p class="mv-intro">Pick a look. Your tasks stay the same; class colors are saved for each theme.</p><div class="thgrid" role="radiogroup" aria-label="Themes">' + THEMES.filter(pickable).map(function (t) {
      return '<button type="button" class="thp" data-theme="' + t[0] + '" role="radio" aria-checked="' + (t[0] === cur) + '">' +
        '<span class="thp-s"><span class="thp-card"><i class="thp-ck"></i><span class="thp-l"></span><span class="thp-tag"></span></span>' +
        '<span class="thp-sw">' + [1, 2, 3, 4, 5].map(function (n) { return '<i style="background:var(--swatch-' + n + ')"></i>'; }).join('') + '</span></span>' +
        '<span class="thp-n">' + esc(t[1]) + (t[4] ? ' <span class="thp-pv">Preview</span>' : '') + '</span><span class="thp-d">' + esc(t[2]) + '</span></button>';
    }).join('') + '</div>' +
      '<div class="thmode" id="th-mode"' + (MODES[cur] ? '' : ' hidden') + '><span id="th-mode-n">' + esc(themeInfo(cur)[1]) + ':</span><div class="seg" role="group" aria-label="Light or dark"><button type="button" data-mode="" aria-pressed="' + (S.prefs.mode !== 'dark') + '">Light</button><button type="button" data-mode="dark" aria-pressed="' + (S.prefs.mode === 'dark') + '">Dark</button></div></div>';
    var d = dialog('Change theme', body, '<span class="r"><button class="btn primary" data-close>Done</button></span>');
    d.classList.add('themes');
    $$('.thp', d).forEach(function (b) {
      b.onclick = function () {
        setTheme(b.dataset.theme);
        $$('.thp', d).forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
        $('#th-mode', d).hidden = !MODES[b.dataset.theme]; $('#th-mode-n', d).textContent = themeInfo(b.dataset.theme)[1] + ':';
        toast('Theme: ' + themeInfo(b.dataset.theme)[1]);
      };
    });
    $$('[data-mode]', d).forEach(function (b) {
      b.onclick = function () { setTheme(curTheme(), b.dataset.mode); $$('[data-mode]', d).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); };
    });
  }
  // A class's color: the student's own pick for this theme wins. Otherwise each class gets the next unused swatch
  // of the theme's 8, in order of first appearance (earliest due date first), saved per theme so colors never
  // shuffle. No two classes share a swatch until all 8 are used; after that the least-used swatch is reused.
  function ensureColors(items) {
    var t = curTheme(), auto = S.colorAuto[t] = S.colorAuto[t] || {}, picks = S.colors[t] || {};
    var first = {};
    (items || allItems()).concat(preItems).forEach(function (it) { var c = it.course; if (!c || c === UNSORTED) return; var d = it.d ? it.d.getTime() : 0; if (first[c] === undefined || d < first[c]) first[c] = d; });
    S.cats.forEach(function (c) { if (c !== UNSORTED && first[c] === undefined) first[c] = Infinity; });
    var todo = Object.keys(first).filter(function (c) { return !(picks[c] >= 1 && picks[c] <= 8) && !(auto[c] >= 1 && auto[c] <= 8); });
    if (!todo.length) return false;
    todo.sort(function (a, b) { return first[a] - first[b] || a.localeCompare(b); });
    var use = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    Object.keys(first).forEach(function (c) { var n = picks[c] >= 1 && picks[c] <= 8 ? picks[c] : auto[c]; if (n >= 1 && n <= 8) use[n]++; });
    todo.forEach(function (c) {
      var skip = NO_AUTO[t] || [], best = 1; for (var n = 2; n <= 8; n++) if (skip.indexOf(n) < 0 && use[n] < use[best]) best = n;
      auto[c] = best; use[best]++;
    });
    return true;
  }
  function colorOf(course) {
    if (!course || course === UNSORTED) return { n: 0, picked: false };
    var t = curTheme(), pick = S.colors && S.colors[t] && S.colors[t][course];
    if (pick >= 1 && pick <= 8) return { n: pick, picked: true };
    var a = S.colorAuto && S.colorAuto[t] && S.colorAuto[t][course];
    if (!(a >= 1 && a <= 8)) { ensureColors(); a = S.colorAuto[t] && S.colorAuto[t][course]; }
    return { n: a >= 1 && a <= 8 ? a : 0, picked: false };
  }
  function cvars(course) { var n = colorOf(course).n; return '--c:var(--swatch-' + n + ');--ci:var(--swatch-' + n + '-ink)'; }
  function openSwatches(anchor, course) {
    var t = themeInfo(curTheme()), cur = colorOf(course).n;
    var items = [{ heading: 'Color for ' + course }];
    t[3].forEach(function (name, i) {
      items.push({ label: name, swatch: i + 1, checked: cur === i + 1, onClick: function () {
        S.colors = S.colors || {}; (S.colors[curTheme()] = S.colors[curTheme()] || {})[course] = i + 1; save(); renderBoard();
        toast(course + ' is now ' + name + ' in ' + t[1] + '.');
      } });
    });
    if (colorOf(course).picked) items.push({ sep: true }, { label: 'Use the default color', icon: ICON.refresh, onClick: function () { delete S.colors[curTheme()][course]; save(); renderBoard(); } });
    menu(anchor, items, { title: 'Pick a color for ' + course, label: 'Class color' });
  }
  // The Board tab: view switch, search, class chips and the columns.
  function mountBoard() {
    $('#sb-main').innerHTML =
      // Phones (600px and narrower): a compact header. Row 1 = title, week, freshness and three icon buttons;
      // row 2 = the view chip and class chips; row 3 = the column tabs. Add task is the round button.
      '<div class="mh" id="sb-mh"><div class="mh1" id="sb-mh1"><div class="mh-id"><span class="brand mh-logo" aria-hidden="true"><i></i></span><div class="mh-tt"><h1 class="mh-t">Board</h1><div class="mh-sub" id="sb-msub"></div></div></div>' +
      '<div class="mh-ic"><button type="button" class="mib" id="sb-msearch-btn" aria-label="Search" aria-expanded="false" aria-controls="sb-ms">' + ICON.search + '</button>' +
      '<button type="button" class="mib" id="sb-mfilter" aria-label="Filter" aria-haspopup="menu" aria-expanded="false">' + ICON.filter + '<i class="dot" aria-hidden="true"></i></button>' +
      '<button type="button" class="mib" id="sb-mmore" aria-label="More actions" aria-haspopup="menu" aria-expanded="false">' + NICON.dots + '</button></div>' +
      '<div class="mh-s" id="sb-ms" role="search" hidden>' + ICON.search + '<input type="search" id="sb-msearch" placeholder="Search tasks" aria-label="Search tasks" enterkeyhint="search"><button type="button" class="mib" id="sb-msx" aria-label="Close search">' + ICON.x + '</button></div></div></div>' +
      '<div class="mbar" id="sb-mbar" aria-hidden="true"><span class="mbar-t" id="sb-mbar-t">Board</span><button type="button" class="mib" id="sb-mbar-s" tabindex="-1" aria-label="Search">' + ICON.search + '</button></div>' +
      '<button type="button" class="fab" id="sb-fab" aria-label="Add task" title="Add task">' + ICON.plus + '</button>' +
      '<div class="bhead"><div class="hl"><h1 class="bh-t">Board <span id="sb-label"></span></h1></div><div class="hr"><span id="sb-fresh">' + freshHtml() + '</span>' +
      '<div class="prog"><span class="hsky" id="sb-hsky"></span><span class="prog-t" id="sb-prog"></span><span class="progbar" aria-hidden="true"><i id="sb-bar"></i></span></div></div></div><div id="sb-banner">' + bannerHtml() + '</div>' +
      '<div class="sb-tools" id="sb-tools"><div class="tl">' +
      '<div class="seg" role="group" aria-label="Show"><button data-view="today">Due today</button><button data-view="week">Week</button><button data-view="all">All</button></div>' +
      '<span class="weeknav" id="sb-weeknav"><button class="btn ghost icon" id="sb-prev" aria-label="Previous week" title="Previous week ([)">' + ICON.left + '</button><b id="sb-week"></b><button class="btn ghost icon" id="sb-next" aria-label="Next week" title="Next week (])">' + ICON.right + '</button><button class="btn ghost small" id="sb-thisweek">This week</button></span>' +
      '</div><div class="tr">' +
      '<div class="search"><button class="btn icon search-btn" id="sb-search-btn" aria-label="Search" title="Search (/)">' + ICON.search + '</button>' +
      '<span class="sfield">' + ICON.search + '<input type="search" id="sb-search" placeholder="Search" aria-label="Search tasks"><kbd class="kbd-only">/</kbd></span></div>' +
      '<button class="btn" id="sb-filter" aria-haspopup="menu" aria-expanded="false" title="Filter and settings">' + ICON.filter + '<span class="lbl">Filter</span><i class="dot" aria-hidden="true"></i></button>' +
      '</div>' +
      '<div class="chips-wrap" id="sb-chipsw"><button type="button" class="chip vchip" id="sb-vchip" aria-haspopup="menu" aria-expanded="false"></button><div class="chips" id="sb-chips" role="group" aria-label="Filter by class"></div></div></div>' +
      '<p class="sb-note" id="sb-note" hidden></p>' +
      '<nav class="colnav" id="sb-colnav" aria-label="Jump to column"></nav>' +
      '<main class="board" id="sb-board" aria-label="Board"></main>';
    $('#sb-filter').onclick = function () { filterMenu(this); };
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
    mountPhoneHead();
  }
  // ---------- phone board header ----------
  function phoneHead() { var h = $('#sb-mh1'); return !!(h && h.offsetParent); }
  function mountPhoneHead() {
    var ms = $('#sb-ms'), mi = $('#sb-msearch'), mb = $('#sb-msearch-btn');
    $('#sb-fab').onclick = function () { openEditor(null); };
    $('#sb-mmore').onclick = function () { moreMenu(this); };
    $('#sb-mfilter').onclick = function () { filterMenu(this); };
    $('#sb-vchip').onclick = function () { viewMenu(this); };
    mb.onclick = function () { openPhoneSearch(); };
    $('#sb-msx').onclick = function () { closePhoneSearch(true); };
    mi.oninput = function () { S.prefs.q = this.value; renderBoard(); };
    mi.onkeydown = function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePhoneSearch(true); } };
    $('#sb-mbar-s').onclick = function () { window.scrollTo(0, 0); openPhoneSearch(); };
    if (S.prefs.q) { ms.hidden = false; $('#sb-mh1').classList.add('searching'); mb.setAttribute('aria-expanded', 'true'); }
    document.body.classList.remove('mcompact');
    // The compact title bar fades in once row 1 has scrolled out of view.
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (es) {
        var e = es[es.length - 1];
        if (!e.target.isConnected) { io.disconnect(); document.body.classList.remove('mcompact'); return; }
        var on = !e.isIntersecting && e.boundingClientRect.bottom <= 0;
        document.body.classList.toggle('mcompact', on);
        var bar = $('#sb-mbar'); if (bar) { bar.setAttribute('aria-hidden', String(!on)); $('#sb-mbar-s').tabIndex = on ? 0 : -1; }
      });
      io.observe($('#sb-mh1'));
    }
  }
  function openPhoneSearch() {
    var ms = $('#sb-ms'); if (!ms) return;
    ms.hidden = false; $('#sb-mh1').classList.add('searching'); $('#sb-msearch-btn').setAttribute('aria-expanded', 'true'); $('#sb-msearch').focus();
  }
  function closePhoneSearch(clear) {
    var ms = $('#sb-ms'); if (!ms) return;
    ms.hidden = true; $('#sb-mh1').classList.remove('searching'); $('#sb-msearch-btn').setAttribute('aria-expanded', 'false');
    if (clear && S.prefs.q) { S.prefs.q = ''; $('#sb-msearch').value = ''; $('#sb-search').value = ''; save(); renderBoard(); }
    $('#sb-msearch-btn').focus();
  }
  var VIEWS = [['today', 'Due today'], ['week', 'Week'], ['all', 'All']];
  function viewMenu(anchor) {
    var items = VIEWS.map(function (v) { return { radio: true, label: v[1], checked: S.prefs.view === v[0], id: 'sb-v-' + v[0], onClick: function () { setView(v[0]); } }; });
    if (S.prefs.view === 'week' && S.prefs.weekOffset) items.push({ sep: true }, { label: 'Back to ' + (weekendMode() ? 'next week' : 'this week'), icon: ICON.refresh, id: 'sb-v-now', onClick: function () { S.prefs.weekOffset = 0; save(); renderBoard(); } });
    menu(anchor, items, { title: 'Show', label: 'Show', alignLeft: true });
  }
  // Row 1's second line: ‹ week › · freshness (or the Link Schoology link until a feed is saved).
  function phoneFresh() {
    var s = freshState();
    if (s.k === 'none') return '<button type="button" class="mh-link" data-addlink title="' + esc(s.tip) + '">Link Schoology<span class="la" aria-hidden="true"> \u2192</span></button>';
    if (s.k === 'off') return '<span class="mh-fr">' + esc(s.t) + '</span>';
    if (s.k === 'sync') return '<span class="mh-fr fsync" role="status">Syncing\u2026</span>';
    var f = S.lastFetch || {}, t = s.k === 'err' ? 'Sync failed' : 'Synced ' + ago(f.at);
    var lab = s.k === 'err' ? 'The last refresh failed. ' + (f.at ? 'Last synced ' + ago(f.at) + '. ' : '') + 'Tap to try again' : s.k === 'stale' ? t + ', might be out of date. Tap to refresh' : t + '. Tap to refresh';
    return '<button type="button" class="mh-fr ' + (s.k === 'err' ? 'ferr' : s.k) + '" data-refresh title="' + esc(s.tip) + '" aria-label="' + esc(lab) + '">' + '<span class="mh-frt">' + (s.k === 'ok' ? '' : '<i class="fdot" aria-hidden="true"></i>') + esc(t) + '</span></button>';
  }
  function phoneSub() {
    var el = $('#sb-msub'); if (!el) return;
    var p = S.prefs, r = viewRange();
    var when = p.view === 'week' ? '<button type="button" class="mh-ar" id="sb-mprev" aria-label="Previous week">' + ICON.left + '</button><span class="mh-wk">' + esc(r.label) + '</span><button type="button" class="mh-ar" id="sb-mnext" aria-label="Next week">' + ICON.right + '</button>' :
      '<span class="mh-wk">' + (p.view === 'today' ? 'Due today' : 'All dates') + '</span>';
    el.innerHTML = when + '<span class="mh-sep" aria-hidden="true">\u00b7</span>' + phoneFresh();
    if ($('#sb-mprev')) { $('#sb-mprev').onclick = function () { S.prefs.weekOffset--; save(); renderBoard(); }; $('#sb-mnext').onclick = function () { S.prefs.weekOffset++; save(); renderBoard(); }; }
    $('#sb-mbar-t').textContent = 'Board \u00b7 ' + (p.view === 'week' ? r.label : p.view === 'today' ? 'Due today' : 'All dates');
    var v = VIEWS.filter(function (x) { return x[0] === p.view; })[0] || VIEWS[1];
    $('#sb-vchip').innerHTML = esc(v[1]) + '<span class="vc" aria-hidden="true">\u25be</span>';
    $('#sb-vchip').setAttribute('aria-label', 'Showing: ' + v[1] + '. Change view');
    var on = !!(p.hidePast || p.showPre || p.groupBy === 'class' || p.label);
    $('#sb-mfilter').classList.toggle('on', on);
    $('#sb-mfilter').setAttribute('aria-label', on ? 'Filter (some filters are on)' : 'Filter');
    var mi = $('#sb-msearch'); if (document.activeElement !== mi) mi.value = p.q || '';
  }
  function filterMenu(anchor) {
    var items = [{ heading: 'Show' },
      { check: true, id: 'sb-hidepast', label: 'Hide past', kbd: 'H', checked: !!S.prefs.hidePast, onChange: function (v) { S.prefs.hidePast = v; save(); renderBoard(); } }];
    if (S.createdAt) items.push({ check: true, id: 'sb-showpre', label: 'Show items from before this board was created', checked: !!S.prefs.showPre, onChange: function (v) { S.prefs.showPre = v; save(); renderBoard(); } });
    items.push({ sep: true }, { heading: 'Arrange' },
      { check: true, id: 'sb-groupcls', label: 'Group by class', checked: S.prefs.groupBy === 'class', onChange: function (v) { S.prefs.groupBy = v ? 'class' : 'date'; save(); renderBoard(); } });
    items.push({ sep: true }, { heading: 'Columns' },
      { check: true, id: 'sb-proctorcol', label: '\u201cNeeds to be proctored\u201d column', checked: !!S.proctorCol, onChange: function (v) { setProctorCol(v); } },
      { label: 'Edit columns\u2026', id: 'sb-columns', onClick: function () { openColumns(); } });
    if (S.labels && S.labels.length) {
      items.push({ sep: true }, { heading: 'Label' },
        { radio: true, label: 'All labels', checked: !S.prefs.label, onClick: function () { S.prefs.label = null; save(); renderBoard(); } });
      S.labels.forEach(function (l) {
        items.push({ radio: true, label: l.name, checked: S.prefs.label === l.id, onClick: function () { S.prefs.label = l.id; save(); renderBoard(); } });
      });
    }
    menu(anchor, items, { title: 'Filter & settings', label: 'Filter and settings' });
  }
  function setProctorCol(on) {
    S.proctorCol = !!on;
    if (on) S.columns = wedge.ensureProctor(S.columns, true);
    save(); renderBoard();
    if (!on) {
      var n = allItems().filter(function (i) { return i.rawCol === 'proctor'; }).length;
      if (n) toast(n + ' card' + (n === 1 ? '' : 's') + ' moved to Need to be done. Turn the column back on to restore ' + (n === 1 ? 'it' : 'them') + '.', 'Undo', function () { setProctorCol(true); });
    }
  }
  function moreMenu(anchor) {
    var items = [
      { label: 'Import tasks\u2026', icon: ICON.imp, kbd: 'I', id: 'sb-import', onClick: openImport },
      S.feedUrl ? { label: linkWords().refresh, icon: ICON.refresh, id: 'sb-refresh', onClick: function () { refreshFeed(true); } } : null,
      MODE === 'web' ? { label: 'Change theme', icon: NICON.pal, id: 'sb-theme-m', cls: 'm-only', onClick: openThemes } : null,
      { label: 'Edit categories', icon: ICON.edit, id: 'sb-cats', onClick: openCategories },
      { label: 'Edit columns\u2026', id: 'sb-columns-m', onClick: function () { openColumns(); } },
      { label: 'Name your classes', icon: ICON.tag, id: 'sb-naming', onClick: function () { openNaming(true); } },
      { label: sheetMode() ? 'Send this board to another device' : 'Move this board to your phone', icon: ICON.phone, id: 'sb-move', onClick: openMove },
      { label: 'Save a backup file', icon: ICON.dl, id: 'sb-backup', onClick: downloadOffline },
      { label: 'Import a backup file', icon: ICON.up, id: 'sb-restore', onClick: pickBackup },
      { label: 'Show keyboard shortcuts', icon: ICON.key, kbd: '?', id: 'sb-keys', cls: 'kbd-only', onClick: openKeys }
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
    if (S.prefs.tab !== 'board') { S.prefs.tab = 'board'; save(); $('#sb-main').innerHTML = ''; }
    save(); renderBoard();
  }

  function themeVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  // To-do columns group by date: Overdue, Today, Tomorrow, then one header per day.
  function dateGroups(list, now) {
    var today = sod(now), tk = dayKey(today), tm = dayKey(addDays(today, 1)), out = [], by = {};
    list.forEach(function (it) {
      var k = it.d < now ? 'over' : dayKey(it.d);
      if (!by[k]) { by[k] = { k: k === 'over' ? 'over' : k === tk ? 'today' : k === tm ? 'tomorrow' : 'day', key: k, items: [] }; out.push(by[k]); }
      by[k].items.push(it);
    });
    out.sort(function (a, b) { return a.k === 'over' ? -1 : b.k === 'over' ? 1 : a.key < b.key ? -1 : 1; });
    out.forEach(function (g) {
      var d = g.k === 'over' ? null : parseDay(g.key);
      g.label = g.k === 'over' ? 'Overdue' : g.k === 'today' ? '<span class="todayl">Today</span>' : g.k === 'tomorrow' ? 'Tomorrow' :
        esc(d.toLocaleDateString('en-US', Math.abs(d - today) < 6.5 * 864e5 ? { weekday: 'long' } : { weekday: 'long', month: 'short', day: 'numeric' }));
      if (g.k === 'tomorrow' || (g.k === 'day' && Math.abs(d - today) < 6.5 * 864e5)) g.label += ' <span class="dd">' + esc(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) + '</span>';
      if (g.k === 'today') g.label += ' <span class="dd">' + esc(today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })) + '</span>';
    });
    return out;
  }
  function cardHtml(it, colId) {
    var h = (it.d - new Date()) / 36e5, done = colId === 'done';
    var cls = done ? '' : (h < 0 && !it.undated ? ' overdue' : '');
    var url = safeUrl(it.url);
    var when = it.undated ? 'No date' : (it.allDay ? 'All day' : fmtT(it.d));
    if (done && !it.undated) when = it.d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + when;
    if (h < 0 && !done && !it.undated) when = 'Overdue \u00b7 ' + when;
    var src = it.source === 'cas' ? '<span class="src" title="From a Course Assignment Sheet (CAS) PDF">Sheet</span>' : it.source === 'custom' ? '<span class="src" title="Added by you">Mine</span>' : '';
    var fl = !done && cardFlags[it.id];
    if (fl && fl.early) src += '<span class="flag early" title="About ' + esc(plan.fmtMin(fl.est.min)) + ' of work, due in a few days. Tonight\u2019s plan includes a first chunk.">Start early</span>';
    else if (fl && fl.test) src += '<span class="flag test" title="Study sessions are planned on the nights before it">' + esc(plan.LABEL[fl.est.type]) + '</span>';
    if (S.timer && S.timer.id === it.id) src += '<span class="flag run" title="Timer running">' + ICON.clock + '<span class="run-t">' + timerText() + '</span></span>';
    var label = it.title + ', ' + it.course + (it.undated ? ', no date' : ', due ' + fmtDay(it.d) + ' ' + when) + (done ? ', done' : '');
    var fg = it.check && !S.checked[it.id] && !done;
    var labs = (it.labels || []).map(function (id) {
      var l = null; (S.labels || []).forEach(function (x) { if (x.id === id) l = x; });
      return l ? '<span class="lb" style="background:var(--swatch-' + l.swatch + ');color:var(--swatch-' + l.swatch + '-ink)">' + esc(l.name) + '</span>' : '';
    }).join('');
    var ck = it.checks && it.checks.length ? '<span class="ckn">' + it.checks.filter(function (c) { return c.done; }).length + '/' + it.checks.length + '</span>' : '';
    return '<div class="card' + cls + (done ? ' is-done' : '') + (fg ? ' flagged' : '') + '" tabindex="0" data-id="' + esc(it.id) + '" aria-label="' + esc(label + (fg ? ', double-check this' : '')) + '" style="' + cvars(it.course) + '">' +
      '<button type="button" class="chk" tabindex="-1" aria-pressed="' + done + '" aria-label="' + esc((done ? 'Mark not done: ' : 'Mark done: ') + it.title) + '" title="' + (done ? 'Mark not done' : 'Mark done') + ' (X)">' + NICON.ck + '</button>' +
      (url ? '<a class="t" href="' + esc(url) + '" target="_blank" rel="noopener" draggable="false" tabindex="-1">' + esc(it.title) + '</a>' : '<span class="t">' + esc(it.title) + '</span>') +
      (it.note ? '<div class="note">' + esc(it.note) + '</div>' : '') +
      (labs ? '<div class="lbs">' + labs + '</div>' : '') +
      (fg ? '<span class="flagtag" title="' + esc(it.check.why) + '">' + NICON.flag + 'Double-check this</span>' : '') +
      '<div class="m"><span class="l"><span class="tag">' + esc(it.course) + '</span>' + src + ck + '</span><span class="tm">' + esc(when) + '</span></div>' +
      '<button class="more" type="button" tabindex="-1" aria-label="Card actions" aria-haspopup="menu" aria-expanded="false" title="Actions (M)">' + ICON.more + '</button></div>';
  }
  function cardMenu(el) {
    var id = el.dataset.id, it = itemById(id); if (!it) return;
    var url = safeUrl(it.url);
    var items = [{ label: 'Open card', icon: ICON.edit, onClick: function () { openCard(id); } }, { heading: 'Move to\u2026' }];
    cols().forEach(function (c, i) { if (c.id !== it.col) items.push({ label: c.name, icon: ICON.arrow, kbd: String(i + 1), cls: 'move', onClick: function () { setStatus(id, c.id); } }); });
    items.push({ sep: true },
      { label: it.col === 'done' ? 'Mark not done' : 'Mark done', icon: ICON.check, kbd: 'X', onClick: function () { toggleDone(id); } },
      { label: 'Edit\u2026', icon: ICON.edit, kbd: 'E', onClick: function () { openEditor(id); } },
      { label: 'Set time estimate\u2026', icon: ICON.clock, onClick: function () { openEstimate(id); } },
      { label: 'Change ' + it.course + ' color\u2026', icon: ICON.tag, onClick: function () { openSwatches(el.querySelector('.more'), it.course); } },
      S.timer && S.timer.id === id ? { label: 'Stop timer', icon: ICON.stop, onClick: function () { stopTimer(true); } } : { label: 'Start timer', icon: ICON.play, onClick: function () { startTimer(id); } });
    if (url) items.push({ label: 'Open in Schoology', icon: ICON.ext, onClick: function () { window.open(url, '_blank', 'noopener'); } });
    if (it.check && !S.checked[id]) items.push({ label: 'It\u2019s right (clear the double-check note)', icon: ICON.check, onClick: function () { S.checked[id] = 1; save(); renderBoard(); toast('Thanks. Marked as checked.'); } });
    items.push({ label: 'Delete', icon: ICON.trash, kbd: 'Del', onClick: function () { deleteItem(id); } });
    menu(el.querySelector('.more'), items, { title: it.title, label: 'Card actions' });
  }

  var lastItems = [], cardFlags = {};
  // Draw whichever tab is open. Everything that changes state calls this.
  function renderBoard() {
    if (!$('#sb-main')) return render();
    var tab = S.prefs.tab || 'now';
    $$('[data-tab]', app).forEach(function (b) { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('#sb-add').classList.toggle('primary', tab === 'board');
    document.body.dataset.tab = tab;
    if (ensureColors()) save();
    if (tab === 'now') { renderNow(); return mark(); }
    if (tab === 'ahead') { renderAhead(); return mark(); }
    if (!$('#sb-board')) mountBoard();
    drawBoard();
    mark();
  }
  function mark() { if (window.performance && performance.mark && !performance.getEntriesByName('sb-content').length) performance.mark('sb-content'); }
  function drawBoard() {
    var items = allItems(), r = viewRange(), p = S.prefs, now = new Date();
    cardFlags = plan.flags(items, pctx(), now);
    var viewItems = items.filter(function (it) { return inView(it, r) && matchesQ(it) && (!p.label || (it.labels || []).indexOf(p.label) >= 0); });
    var cats = categories(items);
    $('#sb-label').textContent = r.label;
    $$('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === p.view)); });
    $('#sb-weeknav').style.display = p.view === 'week' ? '' : 'none';
    var wn = r.nav || r.label, wi = wn.indexOf(' \u00b7 ');
    $('#sb-week').innerHTML = wi > 0 ? '<span class="wl">' + esc(wn.slice(0, wi + 3)) + '</span>' + esc(wn.slice(wi + 3)) : esc(wn);
    $('#sb-thisweek').style.display = p.weekOffset ? '' : 'none';
    $('#sb-thisweek').textContent = weekendMode() ? 'Next week' : 'This week';
    $('#sb-filter').classList.toggle('on', !!(p.hidePast || p.showPre || p.groupBy === 'class' || p.label));
    renderSync();
    phoneSub();
    $('#sb-filter').setAttribute('aria-label', 'Filter' + (p.hidePast ? ' (hiding past)' : '') + (p.showPre ? ' (showing pre-board items)' : '') + (p.groupBy === 'class' ? ' (grouped by class)' : '') + (p.label ? ' (one label)' : ''));
    if (document.activeElement !== $('#sb-search')) $('#sb-search').value = p.q || '';
    var counts = {};
    viewItems.forEach(function (it) { if (it.col !== 'done') counts[it.course] = (counts[it.course] || 0) + 1; });
    var openTotal = viewItems.filter(function (i) { return i.col !== 'done'; }).length;
    if (p.course && cats.indexOf(p.course) < 0) p.course = null;
    $('#sb-chips').innerHTML = '<button class="chip" data-c="" aria-pressed="' + (!p.course) + '" title="' + openTotal + ' to do in this view">All classes <b>' + openTotal + '</b></button>' +
      cats.filter(function (c) { return counts[c] || S.cats.indexOf(c) >= 0 || p.course === c; }).map(function (c) { return '<button class="chip" data-c="' + esc(c) + '" aria-pressed="' + (p.course === c) + '" title="' + (counts[c] || 0) + ' to do in this view" style="' + cvars(c) + '"><i class="cdot" aria-hidden="true"></i>' + esc(c) + ' <b>' + (counts[c] || 0) + '</b></button>'; }).join('');
    $$('#sb-chips .chip').forEach(function (b) { b.onclick = function () { S.prefs.course = b.dataset.c || null; save(); renderBoard(); }; });
    var sel = $('#sb-chips .chip[aria-pressed="true"]'), cw = $('#sb-chips');
    if (cw.scrollWidth <= cw.clientWidth) cw = $('#sb-chipsw'); // phones scroll the whole row (view chip + classes)
    if (sel && cw.scrollWidth > cw.clientWidth && (sel.offsetLeft < cw.scrollLeft || sel.offsetLeft + sel.offsetWidth > cw.scrollLeft + cw.clientWidth)) cw.scrollLeft = sel.offsetLeft - 16;
    var shown = viewItems.filter(function (it) { return !p.course || it.course === p.course; });
    lastItems = shown;
    var q = (p.q || '').trim(), openShown = shown.filter(function (i) { return i.col !== 'done'; }).length;
    var html = '', nav = '', today = dayKey(now);
    var visCols = cols();
    var ncol = visCols.length;
    $('#sb-board').classList.toggle('three', ncol === 3);
    $('#sb-board').classList.toggle('many', ncol > 4);
    $('#sb-board').style.gridTemplateColumns = (ncol === 3 || ncol === 4) ? '' : 'repeat(' + ncol + ',minmax(0,1fr))';
    visCols.forEach(function (c) {
      var id = c.id, list = shown.filter(function (it) { return it.col === id; }).sort(function (a, b) { return a.d - b.d || a.title.localeCompare(b.title); });
      nav += '<button type="button" data-col="' + id + '" title="' + list.length + ' card' + (list.length === 1 ? '' : 's') + '">' + esc(shortCol(c)) + '<b>' + list.length + '</b></button>';
      html += '<section class="col' + (c.kind === 'done' ? ' done' : '') + '" data-col="' + id + '" aria-label="' + esc(c.name) + '"><h2><button type="button" class="coln">' + esc(c.name) + '</button><span title="' + list.length + ' card' + (list.length === 1 ? '' : 's') + '">' + list.length + '</span></h2>';
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
      else if (p.groupBy !== 'class') dateGroups(list, now).forEach(function (g) {
        html += '<div class="day dgrp' + (g.k === 'over' ? ' over' : g.k === 'today' ? ' today' : '') + '" role="heading" aria-level="3">' + g.label + '<span class="dn" title="' + plural(g.items.length, 'card') + '">' + g.items.length + '</span></div>';
        g.items.forEach(function (it) { html += cardHtml(it, id); });
      });
      else cats.forEach(function (cl) {
        var g = list.filter(function (it) { return it.course === cl; });
        if (!g.length) return;
        html += '<div class="cls">' + esc(cl) + '<span title="' + g.length + ' card' + (g.length === 1 ? '' : 's') + '">' + g.length + '</span></div>';
        var last = '';
        g.forEach(function (it) {
          var dk = dayKey(it.d);
          if (dk !== last) { html += '<div class="day' + (dk === today ? ' today' : '') + '">' + (dk === today ? '<span class="todayl">Today</span> ' : '') + esc(fmtDay(it.d)) + '</div>'; last = dk; }
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
    if ($('#sb-clearq')) $('#sb-clearq').onclick = function () { S.prefs.q = ''; $('#sb-search').value = ''; if ($('#sb-ms')) { $('#sb-msearch').value = ''; $('#sb-ms').hidden = true; $('#sb-mh1').classList.remove('searching'); $('#sb-msearch-btn').setAttribute('aria-expanded', 'false'); } $('#sb-tools').classList.remove('searching'); renderBoard(); };
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
    $('#sb-prog').innerHTML = '<b>' + done + '</b> of ' + shown.length + ' done';
    $('#sb-hsky').innerHTML = curTheme() === 'nocturne' ? constel(done, shown.length, { id: 'b' }) : '';
    document.body.dataset.view = 'board'; document.title = 'Board \u00b7 Schoology Board';
    $('#sb-bar').style.width = (shown.length ? Math.round(100 * done / shown.length) : 0) + '%';
    $$('#sb-board .coln').forEach(function (b) { b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); openColumns(); }; });
    bindCards();
  }

  // ---------- planner context ----------
  function pctx() {
    var today = dayKey(new Date());
    return { est: S.est, ttype: S.ttype, actual: S.actual, sdone: S.sdone, timer: S.timer, pulled: S.pulled, earlyPin: S.earlyPin,
      order: S.tnOrder && S.tnOrder.day === today ? S.tnOrder.ids : null, isWork: function (it) { return ics.isWork(it); } };
  }
  var SRC_LABEL = { est: 'our guess', learned: 'your average', set: 'yours' };
  function fmtRange(a, b) {
    var x = fmtT(a), y = fmtT(b), ap = / [AP]M$/;
    if (x.slice(-2) === y.slice(-2)) x = x.replace(ap, '');
    return x + '\u2013' + y;
  }
  // "today 11:59 PM", "tomorrow 8:00 AM", "Thu 8:00 AM", "Oct 30"
  function dueWords(it, now) {
    var dd = Math.round((sod(it.d) - sod(now)) / 864e5), t = it.allDay ? '' : ' ' + fmtT(it.d);
    if (dd === 0) return (it.d.getHours() >= 17 ? 'tonight' : 'today') + t;
    if (dd === 1) return 'tomorrow' + t;
    if (dd < 0) return (dd === -1 ? 'yesterday' : it.d.toLocaleDateString('en-US', { weekday: 'short' })) + t;
    if (dd < 7) return it.d.toLocaleDateString('en-US', { weekday: 'short' }) + t;
    return fmtShort(it.d) + t;
  }
  function durS(m) { m = Math.round(m); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + m % 60 + 'm' : ''); }
  function plural(n, w, ws) { return n + ' ' + (n === 1 ? w : (ws || w + 's')); }
  function timerText() {
    if (!S.timer) return '';
    var s = Math.max(0, Math.floor((Date.now() - S.timer.at) / 1000)), m = Math.floor(s / 60);
    return (m >= 60 ? Math.floor(m / 60) + ':' + pad(m % 60) : m) + ':' + pad(s % 60);
  }
  function greeting(now) { var h = now.getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

  // ---------- freshness: always visible, on every view ----------
  // The first fetch for a linked board with nothing saved yet shows a skeleton (a note appears after 8 s).
  var loadSince = 0;
  function loadingNow() { return MODE === 'web' && !!S.feedUrl && !Object.keys(S.ics).length && (syncing || !S.lastFetch); }
  // "Open Schoology" goes to the student's own school site (taken from their saved link, in this browser only).
  function schoologyHome() {
    try {
      var raw = String(S.feedUrl || '').replace(/^webcals?:\/\//i, 'https://');
      var u = new URL(raw);
      if (u.protocol === 'https:' || u.protocol === 'http:') return 'https://' + u.host + (wedge.hostKind(S.feedUrl) === 'calendar' ? '/' : '/home');
    } catch (e) { }
    return 'https://www.schoology.com/';
  }
  // Schoology wording stays for Schoology links and for unknown saved hosts (including test doubles).
  // A saved Google, Outlook, or iCloud link does not claim to be Schoology.
  function linkWords() {
    var cal = wedge.hostKind(S && S.feedUrl) === 'calendar';
    return {
      cal: cal,
      sync: cal ? 'Syncing your calendar\u2026' : 'Syncing with Schoology\u2026',
      reach: cal ? 'Couldn\u2019t reach your calendar' : 'Couldn\u2019t reach Schoology',
      update: cal ? 'Couldn\u2019t update your calendar.' : 'Couldn\u2019t update from Schoology.',
      open: cal ? 'Open calendar' : 'Open Schoology',
      refresh: cal ? 'Refresh calendar now' : 'Refresh from Schoology now',
      synced: cal ? 'Synced ' : 'Synced with Schoology '
    };
  }
  function freshState() {
    if (MODE === 'offline') return { k: 'off', t: 'Saved copy from ' + fmtShort(new Date(CFG.exportedAt || S.updated || Date.now())), tip: 'This is a backup file. Open the website to update from Schoology.' };
    if (!S.feedUrl) return { k: 'none', t: 'Not linked to Schoology', tip: 'Add your Schoology calendar link so this updates by itself.' };
    var w = linkWords();
    var f = S.lastFetch || {}, at = f.at ? new Date(f.at) : null, tip = at ? 'Last good sync: ' + at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + fmtT(at) : 'Not synced yet';
    if (syncing) return { k: 'sync', t: w.sync, tip: tip };
    if (f.ok === false) return { k: 'err', t: at ? 'Sync failed \u00b7 last good ' + fmtT(at) : f.why ? 'Sync failed' : w.reach, tip: tip };
    if (at && Date.now() - f.at > 6 * 36e5) return { k: 'stale', t: 'Synced ' + ago(f.at) + ' \u00b7 ' + fmtT(at), tip: tip };
    if (at) return { k: 'ok', t: w.synced + ago(f.at), tip: tip };
    return { k: 'sync', t: w.sync, tip: tip };
  }
  function freshHtml() {
    var s = freshState(), w = linkWords();
    if (s.k === 'none') return '<div class="fresh"><button type="button" class="fpill none linkb" data-addlink title="' + esc(s.tip) + '"><i class="fdot"></i><span class="ft">Link Schoology</span><span aria-hidden="true">\u2192</span></button></div>';
    var btn = s.k === 'none' ? '<button type="button" class="btn small" data-addlink>Add your link</button>' :
      s.k === 'off' ? '' : '<button type="button" class="refresh" data-refresh' + (s.k === 'sync' ? ' disabled' : '') + ' aria-label="' + esc(w.refresh) + '" title="' + esc(w.refresh) + '">' + NICON.ref + '</button>';
    return '<div class="fresh"><span class="fpill ' + (s.k === 'ok' ? 'ok' : s.k === 'sync' ? 'fsync' : s.k === 'err' ? 'ferr' : s.k) + '" role="status" title="' + esc(s.tip) + '"><i class="fdot"></i><span class="ft">' + esc(s.t) + '</span></span>' + btn + '</div>';
  }
  function bannerHtml() {
    if (MODE !== 'web' || !S.feedUrl || syncing) return '';
    var f = S.lastFetch || {}, w = linkWords();
    if (f.ok === false) return '<div class="banner ferr" role="alert"><div class="bt">' + (f.why ? '<b>' + esc(w.update) + '</b> ' + esc(f.why) + ' ' : '<b>' + esc(w.reach) + '.</b> ') + (f.at ? 'Showing what we had at ' + fmtT(new Date(f.at)) + (sod(new Date(f.at)) < sod(new Date()) ? ' on ' + fmtShort(new Date(f.at)) : '') + '.' : 'Showing what\u2019s saved on this device.') +
      ' <span class="bs">Your check-offs still save on this device.</span></div><div class="ba"><button class="btn primary" data-refresh>Retry</button><a class="btn" href="' + esc(schoologyHome()) + '" target="_blank" rel="noopener">' + esc(w.open) + NICON.ext + '</a></div></div>';
    if (f.at && Date.now() - f.at > 6 * 36e5) return '<div class="banner stale" role="status"><div class="bt"><b>This list might be out of date.</b> The last sync was ' + esc(ago(f.at)) + ' (' + fmtT(new Date(f.at)) + '), so anything posted since then won\u2019t show yet.</div><div class="ba"><button class="btn primary" data-refresh>Refresh now</button></div></div>';
    return '';
  }
  function bindFresh(root) {
    $$('[data-refresh]', root).forEach(function (b) { b.onclick = function () { refreshFeed(true); }; });
    $$('[data-addlink]', root).forEach(function (b) { b.onclick = openImport; });
  }

  // ---------- "Double-check this": low-confidence reads, each with a reason and a source ----------
  function flagOf(it) { return it.check && !(S.checked && S.checked[it.id]) ? it.check : null; }
  function flagBox(it, compact) {
    var f = flagOf(it); if (!f) return '';
    var src = f.url ? '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">Source: ' + esc(f.src) + NICON.ext + '</a>' : '<span>Source: ' + esc(f.src) + '</span>';
    return '<div class="flagbox' + (compact ? ' small' : '') + '" role="note"><span class="fl-h">' + NICON.flag + 'Double-check this ' + esc(f.what) + '</span><p>' + esc(f.why) + '</p>' +
      '<div class="fl-a">' + src + '<button type="button" class="lnk" data-ok="' + esc(it.id) + '">It\u2019s right</button></div></div>';
  }

  // ---------- Tonight (home) ----------
  var lastPlan = null, tnBusy = false;
  function tonightModel(now) {
    var items = allItems(), ctx = pctx();
    var ps = S.planStart && S.planStart.day === dayKey(now) ? S.planStart.t : null;
    var P = plan.tonight(items, ctx, now, { start: ps });
    var today = sod(now), wEnd = P.windowEnd, tk = dayKey(now);
    var first = {}, last = {}, brk = {};
    P.blocks.forEach(function (b, i) {
      if (b.kind === 'break') { var prev = P.blocks[i - 1]; if (prev && prev.task) brk[prev.task.id] = true; return; }
      if (!first[b.task.id]) first[b.task.id] = b; last[b.task.id] = b;
    });
    var spillIds = {}; P.spill.forEach(function (t) { spillIds[t.id] = true; });
    var od = P.tasks.filter(function (t) { return t.overdue; }), tn = P.tasks.filter(function (t) { return !t.overdue; });
    var inScope = function (i) { return plan.plannable(Object.assign({}, i, { col: 'todo' }), ctx) && !plan.isTestType(plan.inferType(i, S.ttype)) && ((i.d >= addDays(today, -2) && i.d < wEnd) || (S.pulled && S.pulled[i.id])); };
    var finished = items.filter(function (i) { return i.col === 'done' && inScope(i); });
    var chunkDone = items.filter(function (i) { return S.sdone[i.id + '@' + tk] && i.col !== 'done'; });
    var coming = items.filter(function (i) { return i.col !== 'done' && plan.plannable(i, ctx) && i.d >= wEnd && i.d < addDays(wEnd, 7) && !(S.pulled && S.pulled[i.id]) && !P.tasks.some(function (t) { return t.id === i.id; }); });
    // Open work overdue by more than two days isn't planned tonight; say so instead of hiding it.
    var older = items.filter(function (i) { return i.col !== 'done' && plan.plannable(i, ctx) && !plan.isTestType(plan.inferType(i, S.ttype)) && i.d < addDays(today, -2) && !(S.pulled && S.pulled[i.id]); });
    return { P: P, items: items, od: od, tn: tn, first: first, last: last, brk: brk, spill: spillIds, finished: finished, chunkDone: chunkDone, coming: coming, older: older, wEnd: wEnd };
  }
  function dueLine(t, now) {
    var it = t.item;
    if (t.overdue) { var dd = Math.round((sod(now) - sod(it.d)) / 864e5), tm = it.allDay ? '' : ' ' + fmtT(it.d); return dd <= 0 ? 'Was due today' + tm : dd === 1 ? 'Was due yesterday' + tm : 'Was due ' + it.d.toLocaleDateString('en-US', { weekday: 'short' }) + tm + ', ' + dd + ' days ago'; }
    if (t.kind === 'study') return plan.LABEL[t.est.type] + ' ' + dueWords(it, now);
    var w = 'Due ' + dueWords(it, now);
    if (it.note && /before class/i.test(it.note)) w += ', before class';
    return w;
  }
  function kindTag(t) {
    if (t.kind === 'study') { var n = plan.studyNights(t.item, t.est, sod(new Date())); return '<span class="pin">Study session' + (n.length > 1 ? ' \u00b7 ' + n.length + ' planned' : '') + '</span>'; }
    if (t.kind === 'early') return '<span class="pin early" title="Big assignment due in a few days. Tonight is a first chunk.">Start early \u00b7 first ' + durS(t.min) + '</span>';
    return '';
  }
  function rowHtml(t, M, now, opts) {
    var it = t.item, url = safeUrl(it.url), f = flagOf(it), b = M.first[t.id], e = M.last[t.id], spill = M.spill[t.id];
    var guess = t.est.src === 'est', run = S.timer && S.timer.id === t.id;
    var when = spill ? '<span class="when late">Won\u2019t fit before ' + fmtT(M.P.endBy) + '</span>' : b ? '<span class="when" title="Planned time">' + esc(fmtRange(b.start, e.end)) + (M.brk[t.id] ? ' \u00b7 then a ' + 10 + '-min break' : '') + '</span>' : '';
    var timer = run ? '<span class="run" title="Timer running"><i class="fdot"></i><span class="run-t">' + timerText() + '</span></span><button type="button" class="lnk" data-stop>Stop timer</button>'
      : opts.lead ? '<button type="button" class="lnk tmr" data-timer="' + esc(t.id) + '">Start timer</button>' : '';
    var title = url ? '<a class="rt" href="' + esc(url) + '" target="_blank" rel="noopener" draggable="false" title="Open in Schoology">' + glue(it.title) + '</a>' : '<span class="rt">' + esc(it.title) + '</span>';
    var chk = curTheme() === 'cafe' ? NICON.cup : NICON.ck;
    var doneLabel = t.kind === 'work' ? 'Mark done: ' : 'Done for tonight: ';
    return '<li class="trow ' + (t.overdue ? 'tlate' : 'tn') + (f ? ' flagged' : '') + (t.pulled ? ' pulled' : '') + (run ? ' running' : '') + '" data-id="' + esc(t.id) + '" data-kind="' + t.kind + '" style="' + cvars(it.course) + '">' +
      (opts.drag ? '<button type="button" class="grip" aria-label="Reorder ' + esc(it.title) + ' (arrow keys)" title="Drag to reorder">' + NICON.grip + '</button>' : '') +
      '<button type="button" class="bigchk" aria-pressed="false" aria-label="' + esc(doneLabel + it.title) + '" title="' + (t.kind === 'work' ? 'Mark done' : 'Done for tonight') + '">' + chk + '</button>' +
      '<div class="rb">' + title + '<div class="rm"><span class="rcls">' + esc(it.course) + '</span><span class="due">' + (f && f.what === 'due date' ? '<span class="q" title="Double-check this date">?</span>' : '') + esc(dueLine(t, now)) + '</span>' + when + kindTag(t) +
      (t.pulled ? '<span class="pin">Pulled in</span><button type="button" class="lnk" data-back="' + esc(t.id) + '">Put back</button>' : '') + timer + '</div>' + flagBox(it) + '</div>' +
      '<button type="button" class="estb' + (guess ? ' guess' : '') + '" data-est="' + esc(t.id) + '" aria-haspopup="true" aria-label="Time estimate: ' + esc(durS(t.min)) + ', ' + SRC_LABEL[t.est.src] + '. Change it" title="' + (guess ? 'Our guess. Tap to set your own.' : t.est.src === 'learned' ? 'Your average from timing this kind of work. Tap to change.' : 'Your estimate. Tap to change.') + '">' + durS(t.min) + '</button></li>';
  }
  function glue(t) { t = String(t); var i = t.lastIndexOf(' '); return i < 0 ? '<span class="nw">' + esc(t) + NICON.ext + '</span>' : esc(t.slice(0, i + 1)) + '<span class="nw">' + esc(t.slice(i + 1)) + NICON.ext + '</span>'; }
  function doneRow(it, now, chunk) {
    var url = safeUrl(it.url);
    return '<li class="trow tdone" data-id="' + esc(it.id) + '" data-kind="' + (chunk ? 'study' : 'work') + '" style="' + cvars(it.course) + '"><button type="button" class="bigchk" aria-pressed="true" aria-label="' + esc((chunk ? 'Not done for tonight: ' : 'Mark not done: ') + it.title) + '">' + (curTheme() === 'cafe' ? NICON.cup : NICON.ck) + '</button>' +
      '<div class="rb">' + (url ? '<a class="rt" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(it.title) + '</a>' : '<span class="rt">' + esc(it.title) + '</span>') +
      '<div class="rm"><span class="rcls">' + esc(it.course) + '</span><span class="due">' + (chunk ? 'Done for tonight' : 'Done \u00b7 was due ' + esc(dueWords(it, now))) + '</span></div></div></li>';
  }
  function cuItem(it, now, learned) {
    var e = plan.estimate(it, pctx(), learned), url = safeUrl(it.url), test = plan.isTestType(e.type);
    return '<li class="cu" style="' + cvars(it.course) + '"><span class="cdot" aria-hidden="true"></span><div class="cb">' +
      (url ? '<a class="ct" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(it.title) + '</a>' : '<span class="ct">' + esc(it.title) + '</span>') +
      '<span class="cm">' + esc(it.course) + ' \u00b7 ' + (test ? esc(plan.LABEL[e.type]) + ' \u00b7 ' : '') + (it.allDay ? 'all day' : fmtT(it.d)) + ' \u00b7 ~' + durS(e.min) + (test ? ' of study' : '') + '</span>' + flagBox(it, true) + '</div>' +
      '<button type="button" class="pull" data-pull="' + esc(it.id) + '" aria-label="Pull ' + esc(it.title) + ' into tonight" title="' + (test ? 'Add a study session tonight' : 'Pull into tonight') + '">' + NICON.pull + '<span>Tonight</span></button></li>';
  }
  function dayGroups(list, now, max) {
    var learned = plan.learnedTable(allItems(), pctx()), byDay = {};
    list.forEach(function (it) { var k = dayKey(it.d); (byDay[k] = byDay[k] || []).push(it); });
    var keys = Object.keys(byDay).sort(), rest = keys.slice(max).reduce(function (a, k) { return a + byDay[k].length; }, 0);
    var more = rest ? '<p class="hid cu-more"><span class="cmn">' + rest + '</span> more due later ' + (rest === 1 ? 'is' : 'are') + ' on the board <span aria-hidden="true">\u00b7</span> <button type="button" class="lnk" data-go="board">Open the board</button></p>' : '';
    return keys.slice(0, max).map(function (k) {
      var l = byDay[k].sort(function (a, b) { return a.d - b.d; }), d = parseDay(k), dd = Math.round((d - sod(now)) / 864e5);
      var m = l.reduce(function (a, it) { return a + plan.estimate(it, pctx(), learned).min; }, 0);
      return '<div class="cug"><h3><span>' + esc(dd === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })) + '</span><em>' + plural(l.length, 'thing') + ' \u00b7 ~' + durS(m) + '</em></h3><ul>' + l.map(function (it) { return cuItem(it, now, learned); }).join('') + '</ul></div>';
    }).join('') + more;
  }
  var ART = {
    minimal: function () { return ''; },
    nocturne: function () { return ''; },
    sticker: function (k) { return k === 'done' ? '<svg class="stk" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="48" class="a1"/><path d="M38 61l15 15 30-32" class="tick"/></svg><span class="stamp-s">DONE!</span>' : '<svg class="stk" viewBox="0 0 120 120" aria-hidden="true"><path d="M84 78A36 36 0 0 1 42 22a38 38 0 1 0 42 56z" class="a2"/><circle cx="92" cy="28" r="6" class="a1"/></svg>'; },
    arcade: function (k) { return '<span class="gg">' + (k === 'done' ? 'GG' : 'FREE PLAY') + '</span><span class="ggs">' + (k === 'done' ? '+50 XP \u00b7 night cleared' : 'Nothing due tonight') + '</span>'; },
    notebook: function (k) { return '<span class="hand">' + (k === 'done' ? 'nailed it.' : 'a free night.') + '<svg viewBox="0 0 200 70" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M178 20C140 2 46 4 18 24 0 38 22 62 92 64s104-10 98-34C186 16 150 8 120 10"/></svg></span>'; },
    varsity: function (k, n) { return k === 'done' ? '<span class="bigw">W</span><span class="fin">FINAL \u00b7 ' + n + '\u20130</span>' : '<span class="rest">REST DAY</span><span class="fin">NO GAME TONIGHT</span>'; },
    riso: function (k) { return '<span class="rstamp">' + (k === 'done' ? 'SORTED' : 'DAY OFF') + '</span>'; },
    cafe: function (k) { return '<svg class="cafe" viewBox="0 0 160 110" aria-hidden="true"><path d="M14 30h132v74H14z" class="c-wall"/><path d="M8 18h144l-8 16H16z" class="c-awn"/>' + [0, 1, 2].map(function (i) { return '<rect class="pane' + (k === 'done' ? ' lit' : '') + '" style="animation-delay:' + (0.1 + i * 0.1) + 's" x="' + (28 + i * 38) + '" y="44" width="28" height="40" rx="14"/>'; }).join('') + '</svg><span class="cap">' + (k === 'done' ? 'Lights low. Kettle on.' : 'Quiet night at the caf\u00e9.') + '</span>'; }
  };
  function freeHtml(k, M, now) {
    var nextDays = M.coming.slice().sort(function (a, b) { return a.d - b.d; });
    var firstDay = nextDays.length ? dayKey(nextDays[0].d) : null, peek = nextDays.filter(function (i) { return dayKey(i.d) === firstDay; });
    var n = M.finished.length + M.chunkDone.length, learned = plan.learnedTable(M.items, pctx());
    var label = firstDay ? (function (d) { var dd = Math.round((d - sod(now)) / 864e5); return dd === 1 ? 'tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); })(parseDay(firstDay)) : '';
    return '<section class="free ' + k + '" aria-label="' + (k === 'done' ? 'You\u2019re free tonight' : 'Nothing due tonight') + '"><div class="art">' + (ART[curTheme()] || ART.sticker)(k, n) + '</div>' +
      '<p class="fl">' + (k === 'done' ? 'All ' + plural(n, 'thing') + ' due through ' + esc(byWord(M.wEnd, now)) + ' ' + (n === 1 ? 'is' : 'are') + ' checked off.' : 'Nothing is due ' + (M.wEnd - sod(now) > 2 * 864e5 ? 'before ' + esc(addDays(M.wEnd, -1).toLocaleDateString('en-US', { weekday: 'long' })) + ' ends' : 'today or tomorrow') + '. Take the night, or get a head start.') + '</p>' +
      (peek.length ? '<div class="peek"><div class="sh"><h2>' + (k === 'done' ? 'Peek at what\u2019s next' : 'What\u2019s next') + '</h2><span class="meta">Due ' + esc(label) + '</span></div><ul>' + peek.map(function (it) { return cuItem(it, now, learned); }).join('') + '</ul>' +
        (nextDays.length > peek.length ? '<p class="hid cu-more"><span class="cmn">' + (nextDays.length - peek.length) + '</span> more due later ' + (nextDays.length - peek.length === 1 ? 'is' : 'are') + ' on the board <span aria-hidden="true">\u00b7</span> <button type="button" class="lnk" data-go="board">Open the board</button></p>' : '') + '</div>'
        : '<div class="peek"><p class="then">Nothing else is on your board for the next week.</p><div class="sa"><button type="button" class="btn" data-go="board">Open the board</button></div></div>') + '</section>';
  }
  function byWord(wEnd, now) { var d = addDays(wEnd, -1), dd = Math.round((d - sod(now)) / 864e5); return dd <= 0 ? 'today' : dd === 1 ? 'tomorrow' : d.toLocaleDateString('en-US', { weekday: 'long' }); }
  function skeletonHtml(now) {
    var r = function (w) { return '<div class="skrow"><span class="sk ckk"></span><span class="skb"><span class="sk" style="width:' + w + '%"></span><span class="sk s2" style="width:' + (w * 0.55) + '%"></span></span><span class="sk skchip"></span></div>'; };
    var slow = loadSince && Date.now() - loadSince > 8000;
    return '<section class="thero" aria-busy="true"><div class="hl"><p class="greet">' + greeting(now) + '</p><span class="sr">Getting tonight\u2019s list from Schoology</span><span class="sk vb"></span><span class="sk nb"></span></div><div class="hr">' + freshHtml() + '</div></section>' +
      (slow ? '<div class="banner slow" role="status"><div class="bt"><b>Still working.</b> Schoology is slow right now. This page fills in by itself when it answers.</div><div class="ba"><a class="btn" href="' + esc(schoologyHome()) + '" target="_blank" rel="noopener">Open Schoology' + NICON.ext + '</a></div></div>' : '') +
      '<section class="sec"><div class="sh"><span class="sk hb"></span></div><div class="list">' + r(62) + '</div></section>' +
      '<section class="sec"><div class="sh"><span class="sk hb"></span></div><div class="list">' + r(70) + r(48) + r(58) + r(40) + '</div></section>';
  }
  function renderNow() {
    var now = new Date(), main = $('#sb-main');
    document.body.dataset.view = 'now';
    if (loadingNow()) {
      if (!loadSince) { loadSince = Date.now(); setTimeout(function () { if (loadingNow() && S.prefs.tab === 'now') renderNow(); }, 8100); }
      main.innerHTML = '<main class="tnm" id="tn-main">' + skeletonHtml(now) + '</main>'; bindFresh(main); return;
    }
    loadSince = 0;
    var M = tonightModel(now), P = M.P;
    lastPlan = P;
    if (S.timer && !M.items.some(function (i) { return i.id === S.timer.id; })) { S.timer = null; save(); }
    var n = M.od.length + M.tn.length, mins = P.tasks.reduce(function (a, t) { return a + t.min; }, 0);
    var total = n + M.finished.length + M.chunkDone.length;
    var empty = !n && !M.finished.length && !M.chunkDone.length, done = !n && !empty;
    var verdict, nudge = '';
    if (empty) {
      verdict = 'Nothing due tonight';
      var nx = M.coming.slice().sort(function (a, b) { return a.d - b.d; })[0];
      if (nx) nudge = 'Next deadline: <b>' + esc(nx.title) + '</b>, due ' + esc(dueWords(nx, now)) + '.';
    } else if (done) { verdict = curTheme() === 'minimal' ? 'Nothing left tonight.' : curTheme() === 'nocturne' ? 'The sky\u2019s clear tonight.' : 'You\u2019re free tonight'; nudge = 'Everything due through ' + esc(byWord(M.wEnd, now)) + ' is done. Nice work.'; }
    else {
      verdict = plural(n, 'thing') + ' tonight, <span class="nw">about ' + durS(mins) + '</span>';
      var lead = P.tasks[0];
      nudge = lead.overdue ? 'Start with <b>' + esc(lead.item.title) + '</b>. It was due ' + esc(dueWords(lead.item, now)) + '.'
        : lead.kind === 'study' ? 'First up: study for <b>' + esc(lead.item.title) + '</b> (' + esc(dueWords(lead.item, now)) + ').'
        : 'First up: <b>' + esc(lead.item.title) + '</b>, due ' + esc(dueWords(lead.item, now)) + '.';
      if (P.finish && !P.spill.length) nudge += ' Done by about ' + fmtT(P.finish) + '.';
      else if (P.spill.length) nudge += ' That\u2019s more than fits tonight: ' + plural(P.spill.length, 'thing') + ' won\u2019t fit before ' + fmtT(P.endBy) + '.';
    }
    var flagged = M.items.filter(function (i) { return flagOf(i) && (P.tasks.some(function (t) { return t.id === i.id; }) || M.coming.indexOf(i) >= 0); });
    var doneN = M.finished.length + M.chunkDone.length;
    var prog = total ? '<div class="tprog" aria-label="' + doneN + ' of ' + total + ' done for tonight">' + (curTheme() === 'nocturne' ? '<span class="nsk">' + constel(doneN, total, { id: 't', fresh: NOC.fresh, draw: NOC.draw }) + '</span>' : '') + '<span class="tpt"><b>' + doneN + '</b> of ' + total + ' done</span><span class="ps"><span class="psl">Done</span><span class="pd" id="pDone">' + pad(doneN) + '</span><i>/</i><span class="pd">' + pad(total) + '</span></span><span class="pbar"><i style="width:' + Math.round(100 * doneN / total) + '%"></i></span></div>' : '';
    NOC.fresh = NOC.draw = false;
    var h = '<section class="thero' + (done ? ' hdone' : '') + '"><div class="hl"><p class="greet">' + greeting(now) + '</p><h1 class="verdict" id="verdict">' + verdict + '</h1>' + (nudge ? '<p class="nudge">' + nudge + '</p>' : '') +
      (flagged.length ? '<p class="flagn">' + NICON.flag + plural(flagged.length, 'item') + ' to double-check. ' + (flagged.length === 1 ? 'It\u2019s' : 'They\u2019re') + ' marked below.</p>' : '') + '</div><div class="hr">' + freshHtml() + prog + '</div></section>' + bannerHtml();
    if (empty || done) h += freeHtml(empty ? 'empty' : 'done', M, now);
    else {
      var leadId = P.tasks[0] && P.tasks[0].id;
      if (M.od.length) h += '<section class="sec dofirst" aria-labelledby="dfH"><div class="sh"><h2 id="dfH">Do first</h2><span class="cnt" title="' + plural(M.od.length, 'overdue item') + '">' + M.od.length + '</span><span class="meta">Overdue \u00b7 pinned to the top</span></div><ul class="list">' +
        M.od.map(function (t) { return rowHtml(t, M, now, { lead: t.id === leadId }); }).join('') + '</ul></section>';
      if (M.tn.length) {
        var startVal = pad(P.start.getHours()) + ':' + pad(P.start.getMinutes()), defStart = plan.defaultStart(now);
        h += '<section class="sec tonight" aria-labelledby="tnH"><div class="sh"><h2 id="tnH">Tonight</h2><span class="cnt" title="' + plural(M.tn.length, 'thing') + ' for tonight">' + M.tn.length + '</span><span class="meta">' +
          (P.custom ? 'Your order \u00b7 <button type="button" class="lnk" data-resetorder>Back to suggested</button>' : 'By due time, then size \u00b7 <span class="dk">drag</span><span class="mb">hold</span> to reorder') + '</span></div>' +
          '<p class="tn-when"><span class="tlab" id="tn-startl">Start at</span><span class="tchip"><b>' + fmtT(P.start) + '</b>' + ICON.clock + '<input type="time" id="tn-start" value="' + startVal + '" step="300" aria-labelledby="tn-startl" title="Change the start time"></span>' + (S.planStart && S.planStart.day === dayKey(now) && P.picked && P.picked > defStart ? ' <button type="button" class="lnk" id="tn-now">Start now instead</button>' : '') +
          (P.spill.length ? '<span> \u00b7 <b>' + plural(P.spill.length, 'thing') + '</b> won\u2019t fit before ' + fmtT(P.endBy) + '</span>' : P.finish ? '<span> \u00b7 done by about <b>' + fmtT(P.finish) + '</b></span>' : '') + '</p>' +
          '<ul class="list" id="tnList">' + M.tn.map(function (t) { return rowHtml(t, M, now, { drag: true, lead: t.id === leadId }); }).join('') + '</ul>' +
          (P.spill.length ? '<div class="spill" role="note"><p><b>Won\u2019t fit before ' + fmtT(P.endBy) + ':</b> ' + plural(P.spill.length, 'thing') + ', about ' + durS(P.spill.reduce(function (a, t) { return a + t.min; }, 0)) + '. Start earlier, shorten an estimate, or ask your teacher about what won\u2019t fit.</p></div>' : '') +
          (P.tasks.some(function (t) { return t.est.src === 'est'; }) ? '<p class="legend"><span class="lg" aria-hidden="true"></span>Dashed times are our guesses. Tap one to set your own.</p>' : '') + '</section>';
      }
    }
    if (M.older.length) h += '<p class="hid older">' + plural(M.older.length, 'older overdue item') + ' (more than 2 days late) ' + (M.older.length === 1 ? 'is' : 'are') + ' on the board, not in tonight\u2019s plan <span aria-hidden="true">\u00b7</span> <button type="button" class="lnk" data-go="board">Open the board</button></p>';
    var fin = M.finished.concat(M.chunkDone);
    if (fin.length && !done) h += S.prefs.showDone ? '<p class="hid fin">Showing ' + plural(fin.length, 'finished item') + ' <span aria-hidden="true">\u00b7</span> <button type="button" class="lnk" data-showdone aria-expanded="true">Hide</button></p><ul class="list donel">' + M.finished.map(function (it) { return doneRow(it, now); }).join('') + M.chunkDone.map(function (it) { return doneRow(it, now, true); }).join('') + '</ul>'
      : '<p class="hid fin">Hiding ' + plural(fin.length, 'finished item') + ' <span aria-hidden="true">\u00b7</span> <button type="button" class="lnk" data-showdone aria-expanded="false">Show</button></p>';
    if (!empty && !done && M.coming.length) h += '<section class="sec coming" aria-labelledby="cuH"><div class="sh"><h2 id="cuH">Coming up</h2><span class="cnt" title="' + plural(M.coming.length, 'thing') + ' due in the next week">' + M.coming.length + '</span><span class="meta">Pull one in if you have time tonight</span></div><div class="cuw">' + dayGroups(M.coming, now, 2) + '</div></section>';
    main.innerHTML = '<main class="tnm" id="tn-main">' + h + '</main>';
    document.title = (done ? 'Free tonight' : empty ? 'Nothing due' : n + ' tonight') + ' \u00b7 Schoology Board';
    bindNow(M);
  }
  function bindNow(M) {
    var m = $('#tn-main'); if (!m) return;
    bindFresh(m);
    $$('.bigchk', m).forEach(function (b) {
      b.onclick = function () {
        if (tnBusy) return;
        var row = b.closest('.trow'), id = row.dataset.id, kind = row.dataset.kind;
        if (b.getAttribute('aria-pressed') === 'true') { undoFinish(id, kind); return; }
        completeRow(row, id, kind);
      };
    });
    $$('[data-est]', m).forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); openEstPop(b); }; });
    $$('[data-timer]', m).forEach(function (b) { b.onclick = function () { startTimer(b.dataset.timer); }; });
    $$('[data-stop]', m).forEach(function (b) { b.onclick = function () { stopTimer(true); }; });
    $$('[data-pull]', m).forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.pull, it = itemById(id); S.pulled = S.pulled || {}; S.pulled[id] = dayKey(new Date()); save(); renderBoard();
        var row = $('.trow[data-id="' + cssEsc(id) + '"]'); if (row) row.classList.add('arrive');
        toast('Pulled into tonight: ' + (it ? it.title : ''), 'Undo', function () { delete S.pulled[id]; save(); renderBoard(); });
      };
    });
    $$('[data-back]', m).forEach(function (b) { b.onclick = function () { var id = b.dataset.back, it = itemById(id); delete S.pulled[id]; save(); renderBoard(); toast('Moved back to ' + (it ? it.d.toLocaleDateString('en-US', { weekday: 'long' }) : 'its day')); }; });
    $$('[data-ok]', m).forEach(function (b) { b.onclick = function () { S.checked = S.checked || {}; S.checked[b.dataset.ok] = 1; save(); renderBoard(); toast('Thanks. Marked as checked.'); }; });
    var sd = $('[data-showdone]', m); if (sd) sd.onclick = function () { S.prefs.showDone = !S.prefs.showDone; save(); renderBoard(); var x = $('[data-showdone]'); if (x) x.focus(); };
    var ro = $('[data-resetorder]', m); if (ro) ro.onclick = function () { S.tnOrder = null; save(); renderBoard(); toast('Back to the suggested order.'); };
    $$('[data-go]', m).forEach(function (b) { b.onclick = function () { setTab(b.dataset.go); }; });
    var inp = $('#tn-start', m);
    if (inp) {
      inp.onchange = function () { if (!inp.value) return; S.planStart = { day: dayKey(new Date()), t: inp.value }; save(); renderBoard(); var x = $('#tn-start'); if (x) x.focus(); };
      inp.onclick = function () { try { if (inp.showPicker) inp.showPicker(); } catch (e) { } };
    }
    var tn = $('#tn-now', m); if (tn) tn.onclick = function () { S.planStart = null; save(); renderBoard(); };
    $$('.grip', m).forEach(function (g) {
      g.onkeydown = function (e) {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        var ids = $$('#tnList .trow').map(function (r) { return r.dataset.id; }), id = g.closest('.trow').dataset.id, i = ids.indexOf(id), j = i + (e.key === 'ArrowUp' ? -1 : 1);
        if (j < 0 || j >= ids.length) return;
        ids.splice(i, 1); ids.splice(j, 0, id); S.tnOrder = { day: dayKey(new Date()), ids: ids }; save(); renderBoard();
        var ng = $('.trow[data-id="' + cssEsc(id) + '"] .grip'); if (ng) ng.focus();
        live('Moved to position ' + (j + 1) + ' of ' + ids.length);
      };
    });
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }
  function live(msg) { var l = $('#sb-live'); if (!l) { l = document.createElement('div'); l.id = 'sb-live'; l.className = 'sr'; l.setAttribute('aria-live', 'polite'); document.body.appendChild(l); } l.textContent = msg; }
  function reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // Finish a row: the theme's finish moment, then the row folds away. Undo is always one tap away.
  var STAMP = { sticker: 'DONE!', arcade: '+10 XP', varsity: 'FINAL', riso: 'DONE' };
  function completeRow(row, id, kind) {
    var openBefore = lastPlan ? lastPlan.tasks.length : 0;
    var after = function () { tnBusy = false; finishTask(id, kind, openBefore <= 1); };
    if (reducedMotion() || !row) { after(); return; }
    tnBusy = true;
    row.querySelector('.bigchk').setAttribute('aria-pressed', 'true'); row.classList.add('is-done', 'celebrate');
    var t = curTheme();
    if (STAMP[t]) { var s = document.createElement('span'); s.className = 'stamp'; s.textContent = STAMP[t]; row.appendChild(s); }
    if (t === 'sticker') { var r = row.querySelector('.bigchk').getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 8, 46); }
    if (t === 'varsity') { var p = $('#pDone'); if (p) p.classList.add('flip'); }
    if (t === 'nocturne') { NOC.fresh = true; NOC.draw = openBefore <= 1; }
    var quiet = t === 'minimal' || t === 'nocturne';
    setTimeout(function () {
      var hgt = row.offsetHeight;
      var a = row.animate([{ height: hgt + 'px', opacity: 1 }, { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginBottom: quiet ? '0px' : '-10px' }], { duration: quiet ? 200 : 220, easing: 'ease-in', fill: 'forwards' });
      a.onfinish = after;
    }, quiet ? 400 : 560);
  }
  function burst(x, y, n, spread) {
    var fx = $('#fx'); if (!fx) { fx = document.createElement('div'); fx.id = 'fx'; document.body.appendChild(fx); }
    var sh = ['<circle cx="12" cy="12" r="8"/>', '<rect x="5" y="5" width="14" height="14" rx="3"/>', '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>'];
    for (var i = 0; i < n; i++) {
      var s = document.createElement('span'); s.className = 'tpt c' + (i % 5 + 1);
      s.innerHTML = '<svg viewBox="0 0 24 24">' + sh[i % 3] + '</svg>';
      s.style.left = x + 'px'; s.style.top = y + 'px'; fx.appendChild(s);
      var ang = Math.PI * 2 * i / n + Math.random() * 0.4, d = spread * (0.6 + Math.random() * 0.5);
      s.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: 'translate(calc(-50% + ' + Math.cos(ang) * d + 'px),calc(-50% + ' + Math.sin(ang) * d + 'px)) scale(1)', opacity: 1, offset: 0.7 }, { transform: 'translate(calc(-50% + ' + Math.cos(ang) * d + 'px),calc(-50% + ' + (Math.sin(ang) * d + 18) + 'px)) scale(.9)', opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = (function (el) { return function () { el.remove(); }; })(s);
    }
  }
  var CEL = {
    sticker: function () { return '<b>Free tonight!</b>'; },
    arcade: function () { return '<b>GG</b><span>NIGHT CLEARED \u00b7 +50 XP</span>'; },
    notebook: function () { return '<b>nailed it.</b><svg viewBox="0 0 300 120" preserveAspectRatio="none"><path pathLength="1" d="M270 30C220 4 70 6 30 40 6 62 40 108 150 110s160-20 140-64C280 22 230 10 190 14"/></svg>'; },
    varsity: function (n) { return '<span class="cw">W</span><span><b>FINAL</b><i>' + n + '\u20130 tonight</i></span>'; },
    riso: function () { return '<b>TONIGHT: SORTED</b><span>EVERY LAST THING.</span>'; },
    cafe: function () { return '<b>You\u2019re free tonight.</b><span>Go put the kettle on.</span>'; }
  };
  // The last check-off: one short finish moment, and one toast that still offers Undo (just the toast with reduced motion).
  function celebrateAll(n, title, undo) {
    if (curTheme() === 'nocturne') { live('The sky\u2019s clear tonight.'); toast('The sky\u2019s clear tonight.', 'Undo', undo, 6000); return; }
    if (curTheme() === 'minimal') { var dc = new Date().toLocaleDateString('en-US', { weekday: 'long' }) + ' clear.'; live(dc); toast(dc, 'Undo', undo, 6000); return; }
    if (reducedMotion()) { toast('Everything\u2019s done. You\u2019re free tonight.', 'Undo', undo, 6000); return; }
    live('Everything\u2019s done. You\u2019re free tonight.');
    toast('Marked done: ' + title, 'Undo', undo, 6000);
    var t = curTheme(), c = document.createElement('div');
    c.id = 'cel'; c.setAttribute('aria-hidden', 'true'); c.innerHTML = '<div class="cin">' + (CEL[t] || CEL.sticker)(n) + '</div>';
    document.body.appendChild(c);
    if (t === 'sticker') burst(innerWidth / 2, innerHeight * 0.42, 22, Math.min(innerWidth * 0.38, 300));
    setTimeout(function () { c.remove(); }, 1150);
  }
  // Done from Tonight: a regular task moves to Completed; a study session or start-early chunk is done for tonight.
  function finishTask(id, kind, last) {
    if (S.timer && S.timer.id === id) stopTimer(false);
    var it = itemById(id), title = it ? it.title : '';
    if (S.pulled && S.pulled[id] && kind === 'work') delete S.pulled[id];
    if (kind === 'study' || kind === 'early') {
      var key = id + '@' + dayKey(new Date());
      S.sdone[key] = 1; save(); renderBoard();
      var undoS = function () { delete S.sdone[key]; save(); renderBoard(); };
      if (last) celebrateAll(1, title, undoS); else toast('Done for tonight: ' + title, 'Undo', undoS, 6000);
      return;
    }
    var prev = (it || {}).col || 'todo';
    S.status[id] = 'done'; save(); renderBoard();
    if (last) celebrateAll(tonightModel(new Date()).finished.length, title, function () { S.status[id] = prev === 'done' ? 'todo' : prev; save(); renderBoard(); });
    else toast('Done: ' + title, 'Undo', function () { S.status[id] = prev === 'done' ? 'todo' : prev; save(); renderBoard(); var r = $('.trow[data-id="' + cssEsc(id) + '"]'); if (r) r.classList.add('arrive'); }, 6000);
  }
  function undoFinish(id, kind) {
    if (kind === 'study') { delete S.sdone[id + '@' + dayKey(new Date())]; }
    else { S.status[id] = 'todo'; }
    save(); renderBoard();
    var it = itemById(id), r = $('.trow[data-id="' + cssEsc(id) + '"]'); if (r) r.classList.add('arrive');
    toast('Back on tonight\u2019s list: ' + (it ? it.title : ''));
  }
  function startTimer(id) {
    if (S.timer && S.timer.id !== id) stopTimer(false);
    S.timer = { id: id, at: Date.now() }; save(); renderBoard();
    toast('Timer started. Tap Stop timer when you finish or take a break.');
  }
  function stopTimer(announce) {
    if (!S.timer) return;
    var t = S.timer, mins = Math.max(1, Math.round((Date.now() - t.at) / 60000));
    S.actual[t.id] = (S.actual[t.id] || 0) + mins; S.timer = null; save();
    if (announce) {
      var it = itemById(t.id);
      toast('Timed ' + plan.fmtMin(mins) + (it ? ' on \u201c' + it.title.slice(0, 40) + '\u201d' : ''), 'Undo', function () { S.actual[t.id] = Math.max(0, (S.actual[t.id] || 0) - mins); if (!S.actual[t.id]) delete S.actual[t.id]; S.timer = t; save(); renderBoard(); }, 5000);
      renderBoard();
    }
  }
  function tickTimer() {
    if (!S || !S.timer) return;
    $$('.run-t').forEach(function (el) { el.textContent = timerText(); });
  }
  // Quick estimate popover (tap a time chip): common times, or "More options" for the full editor.
  function openEstPop(btn) {
    var id = btn.dataset.est, it = itemById(id); if (!it) return;
    var cur = (lastPlan && lastPlan.tasks.filter(function (t) { return t.id === id; })[0]) || null;
    var e = plan.estimate(it, pctx(), plan.learnedTable(allItems(), pctx())), test = plan.isTestType(e.type);
    var items = [{ heading: test ? 'Total study time' : 'How long will this take?' }];
    [15, 30, 45, 60, 90, 120].forEach(function (m) {
      items.push({ label: plan.fmtMin(m), checked: e.min === m, radio: true, onClick: function () { setEstimate(id, m); } });
    });
    items.push({ sep: true }, { label: 'More options\u2026', icon: ICON.clock, onClick: function () { openEstimate(id); } });
    menu(btn, items, { title: it.title + (cur && cur.kind === 'study' ? ' (study session)' : ''), label: 'Time estimate' });
  }
  function setEstimate(id, m) {
    var it = itemById(id); if (!it) return;
    var def = plan.estimate(it, Object.assign(pctx(), { est: {} }), plan.learnedTable(allItems(), pctx()));
    if (m === def.min) delete S.est[id]; else S.est[id] = m;
    save(); renderBoard(); toast('Estimate saved: ' + plan.fmtMin(m));
    var b = $('[data-est="' + cssEsc(id) + '"]'); if (b) b.focus({ preventScroll: true });
  }

  // ---------- Tonight: drag to reorder (mouse: 5 px; touch: 280 ms long-press) ----------
  var tdrag = { on: false, justDropped: false };
  document.addEventListener('pointerdown', function (e) {
    var row = e.target.closest && e.target.closest('#tnList .trow');
    if (!row || e.button > 0 || tnBusy) return;
    if (e.target.closest('a,button:not(.grip),input,.flagbox')) return;
    var sx = e.clientX, sy = e.clientY, touch = e.pointerType === 'touch', started = false, timer = null, lastY = sy;
    var start = function () { started = true; tBegin(row, sy); tMove(lastY); };
    if (touch) timer = setTimeout(start, 280);
    var mv = function (ev) {
      lastY = ev.clientY;
      if (!started) {
        var dd = Math.hypot(ev.clientX - sx, ev.clientY - sy);
        if (touch) { if (dd > 8) { clearTimeout(timer); clean(); } return; }
        if (dd > 5) start(); else return;
      }
      ev.preventDefault(); tMove(ev.clientY);
    };
    var up = function () { clearTimeout(timer); if (started) tEnd(); clean(); };
    var clean = function () { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointermove', mv, { passive: false }); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
  document.addEventListener('touchmove', function (e) { if (tdrag.on) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', function (e) { if (tdrag.on || (e.target.closest && e.target.closest('#tnList .trow') && sheetMode())) e.preventDefault(); });
  document.addEventListener('click', function (e) { if (tdrag.justDropped && e.target.closest && e.target.closest('.trow')) { tdrag.justDropped = false; e.preventDefault(); e.stopPropagation(); } }, true);
  function tBegin(row, y) {
    var rows = $$('#tnList .trow');
    tdrag.on = true; tdrag.row = row; tdrag.rows = rows; tdrag.idx = rows.indexOf(row); tdrag.to = tdrag.idx; tdrag.y0 = y + scrollY; tdrag.y = y;
    tdrag.mids = rows.map(function (r) { var b = r.getBoundingClientRect(); return b.top + scrollY + b.height / 2; });
    tdrag.h = row.offsetHeight + 10;
    row.classList.add('lift'); document.body.classList.add('dragging'); if (navigator.vibrate) navigator.vibrate(8); closeMenu(false); tAuto();
  }
  function tMove(y) {
    if (!tdrag.on) return;
    tdrag.y = y; var dy = y + scrollY - tdrag.y0; tdrag.row.style.transform = 'translateY(' + dy + 'px)';
    var c = tdrag.mids[tdrag.idx] + dy, to = tdrag.rows.filter(function (r, i) { return i !== tdrag.idx && tdrag.mids[i] < c; }).length; tdrag.to = to;
    tdrag.rows.forEach(function (r, i) {
      if (i === tdrag.idx) return; var s = 0;
      if (tdrag.idx < to && i > tdrag.idx && i <= to) s = -tdrag.h;
      if (to < tdrag.idx && i >= to && i < tdrag.idx) s = tdrag.h;
      r.style.transform = s ? 'translateY(' + s + 'px)' : '';
    });
  }
  function tAuto() {
    if (!tdrag.on) return;
    var y = tdrag.y, edge = 70, bottom = innerHeight - edge - (sheetMode() ? 70 : 0), v = 0;
    if (y < edge) v = -(edge - y) / 5; else if (y > bottom) v = (y - bottom) / 5;
    if (v) { scrollBy(0, v); tMove(y); }
    requestAnimationFrame(tAuto);
  }
  function tEnd() {
    var row = tdrag.row, rows = tdrag.rows, idx = tdrag.idx, to = tdrag.to;
    tdrag.on = false; tdrag.justDropped = true; setTimeout(function () { tdrag.justDropped = false; }, 50);
    document.body.classList.remove('dragging'); rows.forEach(function (r) { r.style.transform = ''; }); row.classList.remove('lift');
    if (to !== idx) {
      var ids = rows.map(function (r) { return r.dataset.id; }), mv = ids.splice(idx, 1)[0]; ids.splice(to, 0, mv);
      S.tnOrder = { day: dayKey(new Date()), ids: ids }; save(); renderBoard();
      var el = $('.trow[data-id="' + cssEsc(mv) + '"]'); if (el) el.classList.add('arrive');
      toast('Order saved. You can go back to the suggested order anytime.');
    }
  }

  // One-tap estimate editor: quick chips, a custom number, and the kind of work (Quiz/Test get study sessions).
  function openEstimate(id) {
    var it = itemById(id); if (!it) return;
    var items = allItems(), learned = plan.learnedTable(items, pctx());
    var e = plan.estimate(it, pctx(), learned), auto = plan.inferType(it, null);
    var curType = e.type, curMin = e.min;
    var ctxNoSet = Object.assign(pctx(), { est: {} });
    function body() {
      var test = plan.isTestType(curType), def = plan.estimate(it, Object.assign({}, ctxNoSet, { ttype: Object.assign({}, S.ttype, (function () { var o = {}; o[id] = curType; return o; })()) }), learned);
      return '<p class="est-for"><b>' + esc(it.title) + '</b><span class="dim"> \u00b7 ' + esc(it.course) + ' \u00b7 due ' + esc(dueWords(it, new Date())) + '</span></p>' +
        '<p class="est-l" id="est-l1">' + (test ? 'Total study time' : 'How long will this take?') + '</p>' +
        '<div class="est-chips" role="group" aria-labelledby="est-l1">' + [15, 30, 45, 60, 90, 120, 180].map(function (m) {
          return '<button type="button" class="chip" data-m="' + m + '" aria-pressed="' + (curMin === m) + '">' + esc(plan.fmtMin(m)) + '</button>';
        }).join('') + '<label class="est-custom">Other <input type="number" id="est-custom" min="5" max="600" step="5" inputmode="numeric" value="' + ([15, 30, 45, 60, 90, 120, 180].indexOf(curMin) < 0 ? curMin : '') + '" aria-label="Other time in minutes"> min</label></div>' +
        '<p class="est-l" id="est-l2">What kind of work is it?</p>' +
        '<div class="est-chips" role="group" aria-labelledby="est-l2">' + plan.TYPES.map(function (t) {
          return '<button type="button" class="chip" data-t="' + t + '" aria-pressed="' + (curType === t) + '">' + esc(plan.LABEL[t]) + '</button>';
        }).join('') + '</div>' +
        '<p class="hint">' + (test ? 'Study time is split into ' + plan.studyCount(it, curType) + ' sessions on the nights before it. ' : '') +
        'Typical for ' + esc(plan.LABEL[curType].toLowerCase()) + ': ' + esc(plan.fmtMin(def.min)) + (def.src === 'learned' ? ' (your average in ' + esc(it.course) + ')' : '') + '. ' +
        (def.src === 'learned' ? '' : 'Time 2 or more of these in ' + esc(it.course) + ' with the timer and the board uses your own average.') +
        (S.actual[id] ? ' Timed so far: ' + esc(plan.fmtMin(S.actual[id])) + '.' : '') + '</p>';
    }
    var d = dialog('Time estimate', '<div id="est-body">' + body() + '</div>',
      (S.est[id] || S.ttype[id] ? '<button class="btn ghost" id="est-reset">Use the typical time</button>' : '') +
      '<span class="r"><button class="btn" data-close>Cancel</button><button class="btn primary" id="est-save">Save estimate</button></span>');
    d.classList.add('est');
    function bind() {
      $$('[data-m]', d).forEach(function (b) { b.onclick = function () { curMin = +b.dataset.m; $('#est-body', d).innerHTML = body(); bind(); }; });
      $$('[data-t]', d).forEach(function (b) {
        b.onclick = function () {
          var wasDefault = !S.est[id] && curMin === plan.estimate(it, Object.assign({}, ctxNoSet, { ttype: (function () { var o = Object.assign({}, S.ttype); o[id] = curType; return o; })() }), learned).min;
          curType = b.dataset.t;
          if (wasDefault) curMin = plan.estimate(it, Object.assign({}, ctxNoSet, { ttype: (function () { var o = Object.assign({}, S.ttype); o[id] = curType; return o; })() }), learned).min;
          $('#est-body', d).innerHTML = body(); bind();
        };
      });
      var c = $('#est-custom', d); c.oninput = function () { var v = Math.round(+c.value); if (v >= 5 && v <= 600) { curMin = v; $$('[data-m]', d).forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.m === v)); }); } };
    }
    bind();
    $('#est-save', d).onclick = function () {
      if (curType === auto) delete S.ttype[id]; else S.ttype[id] = curType;
      var def = plan.estimate(it, Object.assign({}, ctxNoSet, { ttype: S.ttype }), learned);
      if (curMin === def.min) delete S.est[id]; else S.est[id] = curMin;
      save(); d.close(); renderBoard();
      toast('Estimate saved: ' + plan.fmtMin(curMin));
    };
    var rs = $('#est-reset', d); if (rs) rs.onclick = function () { delete S.est[id]; delete S.ttype[id]; save(); d.close(); renderBoard(); toast('Using the typical time again'); };
  }

  // ---------- Sunday plan: the coming Mon-Sun (before Friday 6 PM: this week; from then on: next week) ----------
  var lastWeek = null;
  function wday(d, long) { return d.toLocaleDateString('en-US', { weekday: long ? 'long' : 'short' }); }
  function nightsWords(t, now) {
    if (!t.nights.length) return sod(t.item.d) <= sod(now) ? 'It\u2019s today' : 'No study nights left';
    var names = t.nights.map(function (n) { return dayKey(n.day) === dayKey(now) ? 'tonight' : wday(n.day); });
    return 'Study ' + names.join(', ') + ' \u00b7 ' + plan.fmtMin(t.nights[0].min) + (t.nights.length > 1 ? ' each' : '');
  }
  function earlyState(e, now, tasks) {
    var key = e.item.id + '@' + dayKey(now);
    if (S.sdone[key]) return 'done';
    // On tonight's list in any form: its first chunk, or the whole thing when it falls inside tonight's window (e.g. due Monday, seen on Friday).
    return tasks.some(function (t) { return t.id === e.item.id; }) ? 'in' : 'add';
  }
  function renderAhead() {
    var now = new Date(), items = allItems(), cx = pctx(), ws = ics.defaultWeekStart(now), we = addDays(ws, 6);
    var W = plan.weekAhead(items, cx, ws, now), tasks = plan.tonightTasks(items, cx, now).tasks;
    var range = fmtShort(ws) + '\u2013' + (we.getMonth() === ws.getMonth() ? we.getDate() : fmtShort(we));
    var rel = Math.round((ws - monday(now)) / (7 * 864e5)), which = rel === 1 ? 'next' : 'this';
    lastWeek = { W: W, range: range, rel: rel };
    var max = Math.max.apply(null, W.days.map(function (d) { return d.min; }).concat([1]));
    var parts = [];
    parts.push(W.n ? '<b>' + plural(W.n, 'assignment') + '</b> due, about <b>' + esc(plan.fmtMin(W.total)) + '</b> of work' : 'No assignments due');
    if (W.tests.length) parts.push('<b>' + W.tests.length + '</b> ' + (W.tests.length === 1 ? 'quiz or test' : 'quizzes and tests'));
    if (W.heaviest) parts.push('busiest day: <b>' + esc(wday(W.heaviest.day, true)) + '</b> (' + esc(plan.fmtMin(W.heaviest.min)) + ' due)');
    var empty = !W.n && !W.tests.length;
    var nudge = empty ? 'Nothing is due ' + which + ' week yet. New assignments show up here when Schoology posts them.' : parts.join(' \u00b7 ') + '.';
    var canShare = shareFilesOk();
    var bars = '<section class="sec wk-days"><div class="sh"><h2>Work due each day</h2><span class="meta">Estimated minutes</span></div>' +
      '<ol class="wkb" aria-label="Estimated minutes of work due each day">' + W.days.map(function (d) {
        var heavy = W.heaviest && d === W.heaviest, past = d.day < sod(now);
        var lab = d.items.length ? plan.fmtMin(d.min) + ' \u00b7 ' + d.items.length + ' due' : 'Nothing due';
        return '<li class="' + (heavy ? 'heavy' : '') + (past ? ' past' : '') + '" aria-label="' + esc(wday(d.day, true) + ': ' + lab + (heavy ? ', busiest day' : '') + (past ? ', already past' : '')) + '">' +
          '<span class="wkb-d" aria-hidden="true"><b>' + esc(wday(d.day)) + '</b> ' + d.day.getDate() + '</span>' +
          '<span class="wkb-bar" aria-hidden="true"><i style="width:' + (d.min ? Math.max(4, Math.round(100 * d.min / max)) : 0) + '%"></i></span>' +
          '<span class="wkb-n" aria-hidden="true">' + esc(lab) + (heavy ? ' <span class="wkb-tag">Busiest</span>' : '') + '</span></li>';
      }).join('') + '</ol></section>';
    var tests = '<section class="sec wk-tests"><div class="sh"><h2>Quizzes and tests</h2><span class="cnt">' + W.tests.length + '</span><span class="meta">With study nights</span></div>' +
      (W.tests.length ? '<ul class="wkl">' + W.tests.map(function (t) {
        return '<li class="cu" style="' + cvars(t.item.course) + '"><span class="cdot" aria-hidden="true"></span><div class="cb"><span class="ct">' + esc(t.item.title) + '</span>' +
          '<span class="cm">' + esc(plan.LABEL[t.est.type]) + ' \u00b7 ' + esc(dueWords(t.item, now)) + ' \u00b7 ' + esc(t.item.course) + '</span>' +
          '<span class="cm wkl-s">' + esc(nightsWords(t, now)) + '</span></div></li>';
      }).join('') + '</ul>' : '<p class="then">No quizzes or tests on your board ' + which + ' week. If one is missing, open its card on the board and set its kind to Quiz or Test.</p>') + '</section>';
    var early = '<section class="sec wk-early"><div class="sh"><h2>Start early</h2><span class="cnt">' + W.early.length + '</span><span class="meta">2 h+, due in 3\u20135 days</span></div>' +
      (W.early.length ? '<ul class="wkl">' + W.early.map(function (e) {
        var st = earlyState(e, now, tasks);
        var act = st === 'done' ? '<span class="wkl-ok">' + ICON.check + 'First chunk done tonight</span>' :
          st === 'in' ? '<span class="wkl-ok">' + ICON.check + 'On tonight\u2019s list</span><button type="button" class="btn ghost wk-see" data-see="' + esc(e.item.id) + '">See tonight</button>' :
          '<button type="button" class="btn wk-add" data-early="' + esc(e.item.id) + '">Add first chunk to tonight</button>';
        return '<li class="cu" style="' + cvars(e.item.course) + '"><span class="cdot" aria-hidden="true"></span><div class="cb"><span class="ct">' + esc(e.item.title) + '</span>' +
          '<span class="cm">About ' + esc(plan.fmtMin(e.est.min)) + ' \u00b7 ' + esc(dueWords(e.item, now)) + ' \u00b7 ' + esc(e.item.course) + '</span>' +
          '<span class="cm wkl-s">First chunk: ' + esc(plan.fmtMin(e.chunk)) + ' tonight</span></div><div class="wkl-a">' + act + '</div></li>';
      }).join('') + '</ul>' : '<p class="then">Nothing big (2 hours or more) is due in 3 to 5 days. Set a longer estimate on a card if something will take a while.</p>') + '</section>';
    document.body.dataset.view = 'ahead';
    $('#sb-main').innerHTML = '<main class="tnm wkm"><section class="thero"><div class="hl"><p class="greet">Sunday plan \u00b7 ' + (rel === 1 ? 'next week' : 'this week') + '</p><h1 class="verdict">' + esc(range) + '</h1><p class="nudge">' + nudge + '</p></div><div class="hr">' + freshHtml() + '</div></section>' + bannerHtml() +
      '<div class="wk-acts"><button class="btn primary" id="wk-tonight">' + NICON.moon + 'See tonight\u2019s list</button>' +
      '<button class="btn" id="wk-img" title="' + (canShare ? 'Share a picture of this plan' : 'Save a picture of this plan') + '">' + ICON.dl + (canShare ? 'Share image' : 'Save image') + '</button>' +
      (empty ? '<button class="btn ghost" id="wk-board">Open the board</button>' : '') + '</div>' +
      bars + '<div class="wk-cols">' + tests + early + '</div></main>';
    bindFresh($('#sb-main'));
    document.title = 'Sunday plan \u00b7 Schoology Board';
    $('#wk-tonight').onclick = function () { setTab('now'); };
    $('#wk-img').onclick = shareWeek;
    if ($('#wk-board')) $('#wk-board').onclick = function () { setTab('board'); };
    $$('#sb-main [data-early]').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.early, it = itemById(id); S.earlyPin[id] = dayKey(new Date()); save(); renderAhead();
        toast('Added to tonight: first chunk of ' + (it ? it.title : 'this assignment'), 'Undo', function () { delete S.earlyPin[id]; save(); renderAhead(); }, 6000);
        var nb = $('#sb-main [data-see="' + cssEsc(id) + '"]'); if (nb) nb.focus();
      };
    });
    $$('#sb-main [data-see]').forEach(function (b) { b.onclick = function () { setTab('now'); var r = $('.trow[data-id="' + cssEsc(b.dataset.see) + '"]'); if (r) { r.scrollIntoView({ block: 'center' }); r.classList.add('arrive'); } }; });
  }
  function shareFilesOk() {
    try { return !!(window.File && navigator.canShare && navigator.canShare({ files: [new File([''], 'plan.png', { type: 'image/png' })] })); } catch (e) { return false; }
  }
  // A shareable picture of the plan, drawn here with <canvas> in the current theme. It holds only what the
  // screen shows (dates, titles, classes, minutes), never the calendar link. Nothing leaves the device unless you share it.
  function weekCanvas() {
    var L = lastWeek, W = L.W, c = document.createElement('canvas'), w = 1080, h = 1350, x = c.getContext('2d'), now = new Date();
    c.width = w; c.height = h;
    var V = function (n, f) { return themeVar(n, f) || f; }, font = V('--font-body', 'sans-serif'), disp = V('--font-display', font), mono = /^ui-monospace/.test(V('--font-mono', '')) ? font : V('--font-mono', font);
    var ink = V('--text-1', 'black'), dim = V('--text-2', 'gray'), mut = V('--text-3', 'gray'), card = V('--surface-1', 'white'), line = V('--border-1', 'silver');
    x.fillStyle = V('--bg', 'white'); x.fillRect(0, 0, w, h);
    var r = parseFloat(V('--radius-col', '16')) || 16;
    function rr(X, Y, W2, H2, R) { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W2, Y, X + W2, Y + H2, R); x.arcTo(X + W2, Y + H2, X, Y + H2, R); x.arcTo(X, Y + H2, X, Y, R); x.arcTo(X, Y, X + W2, Y, R); x.closePath(); }
    rr(48, 48, w - 96, h - 96, Math.min(r * 2, 36)); x.fillStyle = card; x.fill(); x.strokeStyle = V('--border-2', line); x.lineWidth = 3; x.stroke();
    function text(s, X, Y, size, color, weight, f, align) { x.fillStyle = color; x.font = (weight || 400) + ' ' + size + 'px ' + (f || font); x.textAlign = align || 'left'; x.fillText(s, X, Y); x.textAlign = 'left'; }
    function fit(s, max, size, weight, f) { x.font = (weight || 400) + ' ' + size + 'px ' + (f || font); if (x.measureText(s).width <= max) return s; while (s.length > 1 && x.measureText(s + '\u2026').width > max) s = s.slice(0, -1); return s + '\u2026'; }
    text('SUNDAY PLAN \u00b7 ' + (L.rel === 1 ? 'NEXT WEEK' : 'THIS WEEK'), 104, 136, 26, mut, 600);
    text(L.range, 104, 210, 72, ink, 700, disp);
    var sub = (W.n ? plural(W.n, 'assignment') + ' \u00b7 about ' + plan.fmtMin(W.total) : 'No assignments due') + (W.tests.length ? ' \u00b7 ' + W.tests.length + (W.tests.length === 1 ? ' quiz or test' : ' quizzes and tests') : '');
    text(fit(sub, 870, 32), 104, 262, 32, dim, 400);
    text('Work due each day', 104, 336, 28, ink, 700, disp);
    var max = Math.max.apply(null, W.days.map(function (d) { return d.min; }).concat([1])), y = 362;
    W.days.forEach(function (d) {
      var heavy = W.heaviest && d === W.heaviest;
      text(wday(d.day), 104, y + 33, 28, heavy ? ink : dim, heavy ? 700 : 400);
      rr(200, y + 10, 460, 30, 15); x.fillStyle = V('--bar-track', line); x.fill();
      if (d.min) { rr(200, y + 10, Math.max(30, Math.round(460 * d.min / max)), 30, 15); x.fillStyle = heavy ? V('--bar-heavy', ink) : V('--bar-fill', dim); x.fill(); }
      text(d.min ? plan.fmtMin(d.min) + (heavy ? ' \u00b7 busiest' : '') : 'Nothing due', 684, y + 34, 26, heavy ? ink : dim, heavy ? 700 : 400, mono);
      y += 54;
    });
    y += 46;
    function list(title, rows, emptyS) {
      text(title, 104, y, 28, ink, 700, disp); y += 46;
      (rows.length ? rows : [null]).forEach(function (row) {
        if (!row) { text(emptyS, 104, y, 26, mut); y += 44; return; }
        x.fillStyle = row.c; x.beginPath(); x.arc(114, y - 9, 8, 0, Math.PI * 2); x.fill();
        text(fit(row.t, 820, 28, 600), 136, y, 28, ink, 600); text(fit(row.m, 820, 23), 136, y + 32, 23, dim); y += 80;
      });
    }
    var sw = function (course) { return V('--swatch-' + colorOf(course).n, ink); };
    list('Quizzes and tests', W.tests.slice(0, 3).map(function (t) { return { c: sw(t.item.course), t: t.item.title, m: plan.LABEL[t.est.type] + ' \u00b7 ' + wday(t.item.d) + ' \u00b7 ' + nightsWords(t, now) }; }), 'None ' + (L.rel === 1 ? 'next' : 'this') + ' week');
    y += 14;
    list('Start early', W.early.slice(0, 2).map(function (e) { return { c: sw(e.item.course), t: e.item.title, m: 'About ' + plan.fmtMin(e.est.min) + ' \u00b7 due ' + wday(e.item.d) + ' \u00b7 first ' + plan.fmtMin(e.chunk) + ' tonight' }; }), 'Nothing big coming up');
    text('Made with Schoology Board', 104, h - 92, 24, mut, 400);
    return c;
  }
  function shareWeek() {
    if (!lastWeek) return;
    var name = 'sunday-plan-' + dayKey(ics.defaultWeekStart(new Date())) + '.png';
    var fonts = [themeVar('--font-body', ''), themeVar('--font-display', ''), themeVar('--font-mono', '')].filter(Boolean);
    var ready = document.fonts && document.fonts.load ? Promise.all(fonts.map(function (f) { return document.fonts.load('600 28px ' + f).catch(function () { }); })) : Promise.resolve();
    ready.then(function () {
      weekCanvas().toBlob(function (blob) {
        if (!blob) { toastErr('Could not make the image in this browser.'); return; }
        var file = window.File ? new File([blob], name, { type: 'image/png' }) : null;
        if (file && shareFilesOk()) {
          navigator.share({ files: [file], title: 'My week' }).catch(function (e) { if (e && e.name !== 'AbortError') saveBlob(blob, name); });
          return;
        }
        saveBlob(blob, name);
      }, 'image/png');
    });
  }
  function saveBlob(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast('Image saved to your downloads.');
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
    markMoved(id, col === 'done' ? 'sb-done-now' : 'sb-landed');
    if (!quiet) {
      var colDef = colById(col);
      var name = colDef ? colDef.name : 'that column';
      toast('Moved to ' + name, 'Undo', function () { S.status[id] = prev; save(); renderBoard(); focusCard(id); }, 4000);
    }
  }
  // Hooks for theme motion (--anim-card-landed / --anim-card-done); no-ops in the default theme.
  function markMoved(id, cls) {
    var el = $('.card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (!el) return;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 900);
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
  var drag = null, suppressClick = false, openTimer = null;
  function bindCards() {
    $$('#sb-board .card').forEach(function (el) {
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('click', function (e) {
        if (suppressClick || e.target.closest('a, button, .more, .chk')) return;
        var id = el.dataset.id;
        clearTimeout(openTimer);
        openTimer = setTimeout(function () { openTimer = null; if (!suppressClick) openCard(id); }, 280);
      });
      el.addEventListener('dblclick', function (e) {
        clearTimeout(openTimer); openTimer = null;
        if (e.target.closest('.more')) return; e.preventDefault(); toggleDone(el.dataset.id);
      });
      el.querySelector('.more').addEventListener('click', function (e) { e.stopPropagation(); cardMenu(el); });
      var chk = el.querySelector('.chk');
      if (chk) chk.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); clearTimeout(openTimer); openTimer = null; toggleDone(el.dataset.id); });
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
    clearTimeout(openTimer); openTimer = null;
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
      if (/^[1-9]$/.test(k) && CI[+k - 1]) { setStatus(id, CI[+k - 1]); e.preventDefault(); return; }
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
    else if (k === '/' && phoneHead()) { openPhoneSearch(); e.preventDefault(); }
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
    var rows = [['N', 'Add a task'], ['I', 'Import a calendar, a to-do list, or a Course Assignment Sheet'], ['/', 'Search'], ['T W A', 'Due today, Week, All'], ['[ ]', 'Previous / next week'], ['H', 'Hide past'],
      ['\u2191 \u2193 \u2190 \u2192', 'Move focus between cards'], ['1\u20139', 'Move the card to a column'], ['Shift+\u2190 Shift+\u2192', 'Move the card one column'], ['X Space', 'Toggle done (or double-click)'],
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
    var note = it && it.source === 'ics' ? '<p class="hint">From your ' + (wedge.hostKind(S.feedUrl) === 'calendar' ? 'calendar' : 'Schoology calendar') + '. Your edits are kept when the board updates.</p>' :
      it && it.source === 'cas' ? '<p class="hint">From a Course Assignment Sheet (CAS) PDF. Your edits are kept when the board updates.</p>' : '';
    var body = '<form class="form" id="ed-form" autocomplete="off">' +
      '<label for="ed-title">Title</label><input type="text" id="ed-title" required value="' + esc(it ? it.title : '') + '" placeholder="e.g. Read chapter 4, pp 80-95">' +
      '<label for="ed-cat">Category</label><select id="ed-cat">' + catOptions(defCourse) + '</select>' +
      '<label for="ed-date">Due</label><span class="two"><input type="date" id="ed-date" required value="' + dayKey(d0) + '"><input type="time" id="ed-time" value="' + timeStr + '" aria-label="Due time (optional)"></span>' +
      '<label for="ed-url">Link</label><input type="url" id="ed-url" placeholder="https://\u2026 (optional)" value="' + esc(it && it.url || '') + '">' +
      '<label for="ed-note">Note</label><input type="text" id="ed-note" placeholder="e.g. Before class (optional)" value="' + esc(it && it.note || '') + '">' +
      (it ? '' : '<label for="ed-col">Column</label><select id="ed-col">' + cols().map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('') + '</select>') +
      '<button type="submit" hidden></button></form>' + note;
    var foot = (it ? '<button class="btn danger" id="ed-del">Delete</button>' + (it.source !== 'custom' && S.ov[id] ? '<button class="btn ghost" id="ed-revert">Reset to original</button>' : '') : '') +
      '<span class="r"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ed-save">' + (it ? 'Save changes' : 'Add task') + '</button></span>';
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
      if (it.source === 'custom') { Object.assign(S.custom[id], rec); S.custom[id].undated = false; }
      else {
        var ov = {}, b = base || {}, prevOv = S.ov[id] || {};
        var baseDue = b.due ? toDate(b.due) : null;
        if (rec.title !== b.title) ov.title = rec.title;
        if (rec.course !== it.course || prevOv.course) ov.course = rec.course;
        if (!baseDue || localStr(baseDue) !== rec.due.slice(0, 16) || !!b.allDay !== rec.allDay) { ov.due = rec.due; ov.allDay = rec.allDay; }
        if ((rec.url || null) !== (b.url || null)) ov.url = rec.url;
        if ((rec.note || '') !== (b.note || '')) ov.note = rec.note;
        if (prevOv.checks) ov.checks = prevOv.checks;
        if (prevOv.labels) ov.labels = prevOv.labels;
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
          (custom ? '<button class="btn ghost danger" data-del aria-label="Delete category ' + esc(c) + '">' + ICON.x + '</button>' : '<span style="width:38px;display:inline-block" title="Comes from Schoology or a Course Assignment Sheet"></span>') + '</li>';
      }).join('') + '</ul>' +
        '<form class="row" id="cat-add" style="margin-top:14px"><input type="text" id="cat-new" placeholder="New category, e.g. Reading list or SAT prep" aria-label="New category name"><button class="btn primary">Add</button></form>' +
        '<p class="hint">Rename any category; renames survive re-imports. Categories you create can be deleted (their tasks move to Unsorted). Order here is the order on the board.</p></div>';
    }
    var d = dialog('Edit categories', draw(), '<span class="r"><button class="btn primary" data-close>Done</button></span>');
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

  // ---------- columns, labels, card detail ----------
  function writeCardField(it, key, val) {
    if (!it) return;
    if (it.source === 'custom') { if (S.custom[it.id]) S.custom[it.id][key] = val; }
    else S.ov[it.id] = Object.assign({}, S.ov[it.id] || {}, (function () { var o = {}; o[key] = val; return o; })());
  }
  function openColumns() {
    function draw() {
      var vis = cols();
      return '<div class="cats"><ul>' + vis.map(function (c, i) {
        var locked = c.id === 'todo' || c.kind === 'done';
        return '<li data-id="' + esc(c.id) + '"><input type="text" maxlength="60" value="' + esc(c.name) + '" aria-label="Column name">' +
          '<button class="btn ghost" type="button" data-up ' + (i === 0 ? 'disabled' : '') + ' aria-label="Move up">' + ICON.up + '</button>' +
          '<button class="btn ghost" type="button" data-down ' + (i >= vis.length - 1 ? 'disabled' : '') + ' aria-label="Move down">' + ICON.down + '</button>' +
          (locked ? '<span style="width:38px;display:inline-block"></span>' : '<button class="btn ghost danger" type="button" data-del aria-label="Delete column ' + esc(c.name) + '">' + ICON.x + '</button>') + '</li>';
      }).join('') + '</ul>' +
        '<form class="row" id="col-add" style="margin-top:14px"><input type="text" id="col-new" maxlength="60" placeholder="New column" aria-label="New column name"><button class="btn primary">Add</button></form>' +
        '<p class="hint">Need to be done is where cards go when a column is deleted. Completed is where finished cards live, and Tonight hides them.</p></div>';
    }
    var d = dialog('Edit columns', draw(), '<span class="r"><button class="btn primary" data-close>Done</button></span>');
    function bind() {
      var b = $('.dlg-b', d);
      $$('li', b).forEach(function (li) {
        var id = li.dataset.id, inp = $('input', li);
        inp.onchange = function () {
          var res = wedge.renameColumn(S.columns, id, inp.value);
          if (!res.ok) { toast('A column needs a name.'); refresh(); return; }
          S.columns = res.columns; save(); refresh();
        };
        inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } };
        var up = $('[data-up]', li), dn = $('[data-down]', li), del = $('[data-del]', li);
        if (up) up.onclick = function () { S.columns = wedge.reorderVisible(S.columns, S.proctorCol, id, -1); save(); refresh(); };
        if (dn) dn.onclick = function () { S.columns = wedge.reorderVisible(S.columns, S.proctorCol, id, 1); save(); refresh(); };
        if (del) del.onclick = function () {
          var col = colById(id);
          if (!confirm('Delete column "' + (col ? col.name : 'this column') + '"? Its cards move to Need to be done.')) return;
          var res = wedge.deleteColumn(S.columns, S.status, id);
          if (!res.ok) return;
          S.columns = res.columns; S.status = res.status;
          if (id === 'proctor') S.proctorCol = false;
          save(); refresh();
        };
      });
      $('#col-add', b).onsubmit = function (e) {
        e.preventDefault();
        var before = (S.columns || []).length;
        S.columns = wedge.addColumn(S.columns, $('#col-new', b).value);
        if (S.columns.length === before) { toast('12 columns is the limit.'); return; }
        save(); refresh();
      };
    }
    function refresh() {
      // Wait until the rename field's change/blur finishes. Rewriting the dialog during that event
      // detaches the field the browser is still updating.
      setTimeout(function () {
        if (!d.open) return;
        var body = $('.dlg-b', d);
        if (!body) return;
        body.innerHTML = draw();
        bind();
        renderBoard();
      }, 0);
    }
    bind();
  }
  function stripLabel(id) {
    function drop(bag) {
      if (!bag || !Array.isArray(bag.labels)) return;
      bag.labels = bag.labels.filter(function (x) { return x !== id; });
      if (!bag.labels.length) delete bag.labels;
    }
    Object.keys(S.custom).forEach(function (k) { drop(S.custom[k]); });
    Object.keys(S.ov).forEach(function (k) { drop(S.ov[k]); });
    if (S.prefs.label === id) S.prefs.label = null;
  }
  function openCard(id) {
    var swPick = 1;
    function cur() { return itemById(id); }
    function saveNote() {
      var el = $('#cd-note', d); if (!el) return;
      var it = cur(); if (!it) return;
      writeCardField(it, 'note', el.value.trim());
      save();
    }
    function draw() {
      var it = cur(); if (!it) return '<p>That card is gone.</p>';
      var checks = it.checks || [];
      var on = {}; (it.labels || []).forEach(function (x) { on[x] = 1; });
      return '<div class="cd"><p class="cd-t">' + esc(it.title) + '</p>' +
        '<div class="dim">Labels</div><ul class="cd-ll">' + (S.labels || []).map(function (l) {
          return '<li><button type="button" class="lb' + (on[l.id] ? ' on' : '') + '" data-lb="' + esc(l.id) + '" style="background:var(--swatch-' + l.swatch + ');color:var(--swatch-' + l.swatch + '-ink)">' + esc(l.name) + '</button>' +
            '<button type="button" class="btn ghost" data-lbr="' + esc(l.id) + '">Rename</button>' +
            '<button type="button" class="btn ghost" data-lbd="' + esc(l.id) + '" aria-label="Delete label ' + esc(l.name) + '">' + ICON.x + '</button></li>';
        }).join('') + '</ul>' +
        '<form class="row" id="cd-lb"><input type="text" id="cd-lbn" maxlength="40" placeholder="New label" aria-label="New label name">' +
        '<span class="sws">' + [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) {
          return '<button type="button" class="sw' + (n === swPick ? ' on' : '') + '" data-sw="' + n + '" style="background:var(--swatch-' + n + ')" aria-label="Color ' + n + '"></button>';
        }).join('') + '</span><button class="btn">Add</button></form>' +
        '<label for="cd-note">Note</label><textarea id="cd-note" rows="3">' + esc(it.note || '') + '</textarea>' +
        '<div class="cd-cks"><div class="dim">Checklist</div><ul>' + checks.map(function (c) {
          return '<li><label><input type="checkbox" data-ck="' + esc(c.id) + '"' + (c.done ? ' checked' : '') + '> ' + esc(c.text) + '</label>' +
            '<button type="button" class="btn ghost" data-ckdel="' + esc(c.id) + '" aria-label="Remove checklist item">' + ICON.x + '</button></li>';
        }).join('') + '</ul>' +
        '<form class="row" id="cd-ck"><input type="text" id="cd-ckn" maxlength="200" placeholder="Add a checklist item" aria-label="New checklist item"><button class="btn">Add</button></form></div></div>';
    }
    var it0 = cur(); if (!it0) return;
    var d = dialog(it0.title, draw(), '<button class="btn" type="button" id="cd-done">' + (it0.col === 'done' ? 'Mark not done' : 'Mark done') + '</button><span class="r"><button class="btn primary" data-close>Done</button></span>');
    function refresh() { saveNote(); $('.dlg-b', d).innerHTML = draw(); bind(); renderBoard(); }
    function bind() {
      $$('.sw', d).forEach(function (b) { b.onclick = function () { swPick = +b.dataset.sw; $$('.sw', d).forEach(function (x) { x.classList.toggle('on', +x.dataset.sw === swPick); }); }; });
      $$('[data-lb]', d).forEach(function (b) { b.onclick = function () {
        var it = cur(); if (!it) return;
        var labs = (it.labels || []).slice();
        var i = labs.indexOf(b.dataset.lb);
        if (i >= 0) labs.splice(i, 1); else labs.push(b.dataset.lb);
        writeCardField(it, 'labels', labs);
        save(); refresh();
      }; });
      $$('[data-lbr]', d).forEach(function (b) { b.onclick = function () {
        var l = null; (S.labels || []).forEach(function (x) { if (x.id === b.dataset.lbr) l = x; });
        if (!l) return;
        var name = prompt('Label name', l.name);
        if (name == null) return;
        var res = wedge.renameLabel(S.labels, l.id, name);
        if (!res.ok) { toast('A label needs a name.'); return; }
        S.labels = res.labels; save(); refresh();
      }; });
      $$('[data-lbd]', d).forEach(function (b) { b.onclick = function () {
        var l = null; (S.labels || []).forEach(function (x) { if (x.id === b.dataset.lbd) l = x; });
        if (!l || !confirm('Delete label "' + l.name + '"?')) return;
        S.labels = wedge.deleteLabel(S.labels, l.id);
        stripLabel(l.id); save(); refresh();
      }; });
      var lf = $('#cd-lb', d);
      if (lf) lf.onsubmit = function (e) {
        e.preventDefault();
        var res = wedge.addLabel(S.labels, $('#cd-lbn', d).value, swPick);
        if (!res.ok) { toast(res.error === 'full' ? '8 labels is the limit.' : 'Name the label first.'); return; }
        S.labels = res.labels;
        var it = cur();
        if (it) { var labs = (it.labels || []).slice(); labs.push(res.id); writeCardField(it, 'labels', labs); }
        save(); refresh();
      };
      $$('[data-ck]', d).forEach(function (box) { box.onchange = function () {
        var it = cur(); if (!it) return;
        var checks = wedge.sanitizeChecks(it.checks).map(function (c) { if (c.id === box.dataset.ck) c.done = box.checked; return c; });
        writeCardField(it, 'checks', checks); save(); renderBoard();
      }; });
      $$('[data-ckdel]', d).forEach(function (b) { b.onclick = function () {
        var it = cur(); if (!it) return;
        writeCardField(it, 'checks', wedge.sanitizeChecks(it.checks).filter(function (c) { return c.id !== b.dataset.ckdel; }));
        save(); refresh();
      }; });
      var cf = $('#cd-ck', d);
      if (cf) cf.onsubmit = function (e) {
        e.preventDefault();
        var text = $('#cd-ckn', d).value.trim(); if (!text) return;
        var it = cur(); if (!it) return;
        var checks = wedge.sanitizeChecks(it.checks).concat([{ id: 'k' + rid(), text: text, done: false }]);
        writeCardField(it, 'checks', wedge.sanitizeChecks(checks));
        save(); refresh();
      };
    }
    bind();
    $('#cd-done', d).onclick = function () {
      saveNote();
      var it = cur(); if (!it) return;
      setStatus(id, it.col === 'done' ? 'todo' : 'done', true);
      var now = cur();
      this.textContent = now && now.col === 'done' ? 'Mark not done' : 'Mark done';
    };
    d.addEventListener('close', function () { saveNote(); renderBoard(); });
  }

  // ---------- import ----------
  function importPanel(first) {
    var canLink = MODE === 'web' || !!CFG.proxy;
    return '<div class="imp">' +
      '<form id="imp-form" novalidate><label class="imp-l" for="imp-url">Calendar link</label>' +
      '<div class="row"><input type="url" id="imp-url" placeholder="Paste a calendar link" value="' + esc(S.feedUrl || '') + '"' + (canLink ? '' : ' disabled') + ' autocomplete="off" spellcheck="false">' +
      '<button class="btn primary" id="imp-go"' + (canLink ? '' : ' disabled') + '>' + (hasBoard() ? 'Update my board' : 'Build my board') + '</button></div>' +
      '<label class="remember"><input type="checkbox" id="imp-remember"' + (S.feedUrl || first ? ' checked' : '') + '> Remember the link on this device so the board keeps itself up to date</label>' +
      '<div class="err" id="imp-err" role="alert"></div>' +
      (MODE === 'offline' ? '<p class="hint">Needs internet: the link is opened through ' + esc(CFG.home || 'the website') + '. Offline, drop a calendar file (.ics) or a to-do list instead.</p>' : '') +
      '<details class="how"' + (first ? ' open' : '') + '><summary>Schoology</summary><ol class="how-steps">' +
      '<li>In Schoology, open <b>Calendar</b>.</li>' +
      '<li>At the bottom of the month grid, click <b>Export</b>, then <b>Share Calendar</b>.</li>' +
      '<li>Copy the link in that box (Schoology labels it \u201ciCal\u201d) and paste it above.</li></ol>' +
      '<p class="small dim">Some schools turn calendar sharing off. Treat the link like a password.</p></details>' +
      '<details class="how"><summary>Google Calendar</summary><ol class="how-steps">' +
      '<li>Open Google Calendar and choose the calendar.</li>' +
      '<li>Open <b>Settings for that calendar</b>, then <b>Integrate calendar</b>.</li>' +
      '<li>Copy the secret address and paste it above.</li></ol></details>' +
      '<details class="how"><summary>Outlook</summary><ol class="how-steps">' +
      '<li>Open the calendar in Outlook on the web.</li>' +
      '<li>Go to <b>Settings</b>, then <b>Shared calendars</b>.</li>' +
      '<li>Copy the secret address and paste it above.</li></ol></details>' +
      '<details class="how"><summary>iCloud</summary><ol class="how-steps">' +
      '<li>Open the calendar on iCloud.</li>' +
      '<li>Share it as a public calendar.</li>' +
      '<li>Copy the address and paste it above.</li></ol></details></form>' +
      '<div class="or">or</div>' +
      '<label class="drop" id="imp-drop" tabindex="0"><input type="file" id="imp-file" class="sr" tabindex="-1" multiple accept=".ics,.ical,.ifb,.pdf,.txt,.md,.markdown,text/calendar,application/pdf,text/plain,text/markdown">' +
      '<span class="drop-ic">' + BIG_UPLOAD + '</span><span class="drop-t">Drop any calendar file (.ics), a to-do list (.txt or .md), or a Course Assignment Sheet (CAS) PDF</span>' +
      '<span class="drop-s">or click to choose files \u00b7 PDFs are read here in your browser, never uploaded</span></label>' +
      '<div class="err" id="imp-ferr" role="alert"></div>' +
      '<form id="imp-todo-form" class="todo-imp"><label class="imp-l" for="imp-todos">To-do list</label>' +
      '<textarea id="imp-todos" rows="4" placeholder="One task per line"></textarea>' +
      '<button class="btn" id="imp-todo-go" type="submit">Add these tasks</button>' +
      '<div class="err" id="imp-terr" role="alert"></div></form></div>';
  }
  function bindImport(root, onDone) {
    $('#imp-form', root).onsubmit = function (e) {
      e.preventDefault();
      var url = $('#imp-url', root).value.trim();
      if (!url) { $('#imp-err', root).textContent = 'Paste a calendar link first.'; $('#imp-url', root).focus(); return; }
      importLink(url, $('#imp-remember', root).checked, root, onDone);
    };
    var todoForm = $('#imp-todo-form', root);
    if (todoForm) todoForm.onsubmit = function (e) {
      e.preventDefault();
      var errEl = $('#imp-terr', root);
      var text = $('#imp-todos', root).value;
      if (!text.trim()) { if (errEl) errEl.textContent = 'Paste a to-do list first.'; return; }
      try { applyTodos(wedge.parseTodos(text)); if (onDone) onDone(); }
      catch (ex) { if (errEl) errEl.textContent = (ex && ex.message) || 'No tasks found. Put one task on each line.'; }
    };
    var drop = $('#imp-drop', root), file = $('#imp-file', root);
    file.onchange = function () { var fs = Array.prototype.slice.call(file.files); file.value = ''; importFiles(fs, root, onDone); };
    drop.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) {
      var fs = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []);
      if (fs.length) { importFiles(fs, root, onDone); return; }
      var text = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
      if (!String(text || '').trim()) return;
      var errEl = $('#imp-terr', root) || $('#imp-ferr', root);
      try {
        if (/^\s*(\uFEFF)?BEGIN:VCALENDAR/i.test(String(text).slice(0, 2048))) applyIcs(text, 'file');
        else applyTodos(wedge.parseTodos(text));
        if (onDone) onDone();
      } catch (ex) { if (errEl) errEl.textContent = (ex && ex.message) || 'Could not read that list.'; }
    });
  }
  function openImport() {
    var d = dialog('Import tasks', importPanel(false), '');
    bindImport(d, function () { if (d.open) d.close(); });
  }

  function renderFirstRun() {
    closeMenu(false);
    var two = !!CFG.preview;
    app.innerHTML = '<div class="hero' + (two ? ' two' : '') + '"><div class="hero-l">' +
      '<h2>Know what to do tonight without opening Schoology.</h2>' +
      '<p class="lead">Paste a calendar link, drop a calendar file, or paste a to-do list. Get tonight\u2019s plan: what to do first, how long it takes, and when you\u2019ll be done. Everything stays in your browser.</p>' +
      (CFG.sampleUrl ? '<button class="btn" id="imp-sample">See a sample plan ' + ICON.arrow + '</button>' : '') +
      importPanel(true) + '</div>' +
      (two ? '<div class="hero-r" aria-hidden="true"><img src="' + esc(CFG.preview) + '" alt="" width="1200" height="750" decoding="async"></div>' : '') +
      '</div><footer class="foot fr"><span>' + (MODE === 'web' ? 'Free and open source. Not affiliated with Schoology or PowerSchool.' : 'Offline copy of Schoology Board.') + '</span>' +
      '<a class="btn small" href="' + REPO + '" target="_blank" rel="noopener">' + ICON.star + ' Star on GitHub</a></footer>';
    bindImport(app, null);
    if ($('#imp-sample')) $('#imp-sample').onclick = loadSample;
  }

  function busy(root, on, msg) {
    var b = root && $('#imp-go', root);
    if (b) { b.disabled = on; b.innerHTML = on ? '<span class="spinner"></span> ' + esc(msg || 'Loading\u2026') : (hasBoard() ? 'Update my board' : 'Build my board'); }
  }
  function normalizeFeedUrl(u) {
    u = u.trim().replace(/^webcals?:\/\//i, 'https://');
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }
  // ---------- calendar link (fetched through the relay; the link lives only in this browser) ----------
  var syncing = false;
  // A stalled connection gives up after 20 s (the relay itself gives Schoology 12 s), so "Syncing…" never hangs.
  var RELAY_TIMEOUT_MS = 20000;
  function reachCopy(url, timedOut) {
    var cal = wedge.hostKind(url) === 'calendar';
    if (timedOut) return cal ? 'Couldn\u2019t reach your calendar. It took too long to answer. Try again.' : 'Couldn\u2019t reach Schoology. It took too long to answer. Try again.';
    return cal ? 'Couldn\u2019t reach your calendar. Check your connection and try again.' : 'Couldn\u2019t reach Schoology. Check your connection and try again.';
  }
  function relayFetch(url) {
    var proxy = MODE === 'web' ? (CFG.proxy || '/api/feed') : CFG.proxy;
    var ctl = typeof AbortController === 'function' ? new AbortController() : null, timedOut = false;
    var timer = setTimeout(function () { timedOut = true; if (ctl) ctl.abort(); }, RELAY_TIMEOUT_MS);
    var unreachable = function () { var e = new Error(reachCopy(url, timedOut)); e.retry = true; return e; };
    return fetch(proxy, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url }), cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { var e = new Error(j.error || ('Couldn\u2019t get the calendar (error ' + r.status + '). Try again.')); e.retry = r.status >= 500; throw e; });
        return r.arrayBuffer();
      }, function () { throw unreachable(); })
      .then(function (buf) { clearTimeout(timer); return buf; }, function (e) { clearTimeout(timer); throw timedOut ? unreachable() : e; });
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
        var msg = e && e.message && !/Failed to fetch|NetworkError|Load failed/i.test(e.message) ? e.message : reachCopy(url, false);
        if (!errEl) return toastErr(msg);
        errEl.textContent = msg;
        if (e && e.retry) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.id = 'imp-retry'; b.textContent = 'Retry';
          b.onclick = function () { importLink(url, remember, root, onDone); };
          errEl.appendChild(document.createTextNode(' ')); errEl.appendChild(b);
        }
      })
      .then(function () { busy(root, false); });
  }
  // Refresh on open: quietly re-fetch the saved link and merge like a re-import; keep the cached board on failure.
  // Background refresh: every ~15 min while the tab is visible, and on return/focus when the last update is
  // older than ~5 min. Failures back off (1, 2, 4 ... 60 min) and stay quiet.
  var BG = { fails: 0, next: 0, tries: 0 };
  function refreshFeed(manual) {
    if (MODE !== 'web' || !S.feedUrl || syncing) return;
    syncing = true; BG.tries++; renderSync();
    var wasLoading = !Object.keys(S.ics).length;
    var url = S.feedUrl;
    relayFetch(url)
      .then(function (buf) { if (S.feedUrl !== url) return; applyIcs(ics.decodeBytes(buf), 'refresh', { quiet: true }); S.lastFetch = { at: Date.now(), ok: true }; BG.fails = 0; BG.next = 0; save(); })
      .catch(function (e) {
        BG.fails++; BG.next = Date.now() + Math.min(60, Math.pow(2, BG.fails - 1)) * 60000;
        // Network trouble and timeouts stay generic. When the site did answer (link reset, not a calendar), say why.
        var why = e && !e.retry && e.message ? e.message : '';
        S.lastFetch = { at: (S.lastFetch && S.lastFetch.at) || null, ok: false, failedAt: Date.now() }; if (why) S.lastFetch.why = why; save();
        if (manual) toastErr(why || (wedge.hostKind(url) === 'calendar' ? 'Still couldn\u2019t reach your calendar. Your check-offs still save on this device.' : 'Still couldn\u2019t reach Schoology. Your check-offs still save on this device.'));
      })
      .then(function () { syncing = false; if (wasLoading && S.prefs.tab !== 'board') renderBoard(); else renderSync(); });
  }
  function maybeRefresh(minAgeMs) {
    if (MODE !== 'web' || !S || !S.feedUrl || syncing || document.hidden) return;
    var now = Date.now(), last = S.lastFetch ? Math.max(S.lastFetch.at || 0, S.lastFetch.failedAt || 0) : 0;
    if (now < BG.next || now - last < minAgeMs) return;
    refreshFeed();
  }
  function ago(t) {
    var m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    if (m < 24 * 60) return Math.floor(m / 60) + 'h ago';
    return 'on ' + fmtShort(new Date(t));
  }
  // The freshness pill is on every view; the error/stale banner sits right under the page header.
  function renderSync() {
    if (!$('#sb-main') || !app) return;
    $$('.fresh', app).forEach(function (el) { var t = document.createElement('div'); t.innerHTML = freshHtml(); el.replaceWith(t.firstChild); });
    if ($('#sb-msub', app) && $('#sb-vchip', app)) phoneSub();
    var head = $('.thero', app) || $('.bhead', app);
    if (head && !loadingNow()) {
      var host = $('#sb-banner', app), b = bannerHtml();
      if (host) host.innerHTML = b;
      else { var old = $('.banner.ferr, .banner.stale', app); if (old) old.remove(); if (b) head.insertAdjacentHTML('afterend', b); }
    }
    bindFresh(app);
  }

  // ---------- move to phone: the board travels in the link's #fragment, which browsers never send to a server ----------
  var MOVE_KEY = '#move=', QR_MAX = 1200;
  // Payload key -> state map. Keys may be hashed calendar ids ('~...'; sdone keys end in '@YYYY-MM-DD').
  var MOVE_MAPS = [['st', 'status'], ['ov', 'ov'], ['hd', 'hidden'], ['es', 'est'], ['ty', 'ttype'], ['ac', 'actual'], ['sd', 'sdone'], ['pu', 'pulled'], ['ep', 'earlyPin'], ['ok', 'checked']];
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
    var remapDay = function (m) { var o = {}; Object.keys(m).forEach(function (k) { var at = k.lastIndexOf('@'); o[key(k.slice(0, at)) + k.slice(at)] = m[k]; }); return o; };
    var p = prune({
      f: feed, c: S.createdAt, pc: S.proctorCol ? 1 : 0, st: remap(S.status), ov: remap(S.ov), hd: remap(S.hidden),
      cu: S.custom, ca: S.cats, or: S.order, rn: S.rename, ru: S.rules, cm: S.classMap, cas: S.cas,
      es: remap(S.est), ty: remap(S.ttype), ac: remap(S.actual), sd: remapDay(S.sdone), pu: remap(S.pulled), ok: remap(S.checked), co: S.colors, ka: S.colorAuto,
      pr: prune({ hp: S.prefs.hidePast ? 1 : 0, sp: S.prefs.showPre ? 1 : 0, th: S.prefs.theme !== 'sticker' ? S.prefs.theme : '', md: S.prefs.mode || '', lf: S.prefs.label || '' })
    });
    var cols = wedge.columnsForMove(S.columns);
    if (cols) p.cols = cols;
    var lbs = wedge.sanitizeLabels(S.labels);
    if (lbs.length) p.lb = lbs;
    if (S.pending) MOVE_MAPS.map(function (x) { return x[0]; }).forEach(function (k) { if (S.pending[k]) p[k] = Object.assign({}, S.pending[k], p[k] || {}); });
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
    ctx.fillStyle = themeVar('--qr-light', 'white'); ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = themeVar('--qr-dark', 'black');
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    canvas.dataset.modules = n;
    return true;
  }
  function openMove() {
    var p = movePayload();
    encodeMove(p).then(function (code) {
      var url = moveBase() + MOVE_KEY + code, fits = url.length <= QR_MAX;
      var what = 'progress, your own tasks and categories, class names and settings';
      var other = sheetMode() ? 'the other device' : 'your phone';
      var body = '<p class="mv-intro">' + (fits ? (sheetMode() ? 'Scan this with the other device\u2019s camera, or send yourself the link.' : 'Scan this with your phone\u2019s camera, or send yourself the link.') : 'This board is too big for a QR code that phones read reliably. Copy or share the link to ' + other + ' instead.') +
        ' ' + (sheetMode() ? 'The other device' : 'Your phone') + ' gets this board: ' + what + '.</p>' +
        (fits ? '<div class="mv-qr"><canvas id="mv-qr" role="img" aria-label="QR code with the move link"></canvas></div>' : '') +
        '<div class="mv-link"><input type="text" id="mv-url" readonly value="' + esc(url) + '" aria-label="Move link"><button class="btn" id="mv-copy">Copy link</button>' +
        (navigator.share ? '<button class="btn" id="mv-share">Share link</button>' : '') + '</div>' +
        '<p class="mv-note">' + ICON.lock + '<span>' + (p.f ? 'The link includes your calendar link, so treat it like a password. ' : 'The link contains your board, so only send it to yourself. ') +
        'Everything sits after the \u201c#\u201d, which your browser never sends to any server. Nothing is uploaded.' +
        (p.f ? '' : ' Your phone won\u2019t update on its own until you paste a calendar link there.') + '</span></p>';
      var d = dialog(sheetMode() ? 'Send this board to another device' : 'Move this board to your phone', body, '<span class="r"><button class="btn primary" data-close>Done</button></span>');
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
    var st = { status: {}, ov: {}, hidden: {}, est: {}, ttype: {}, actual: {}, sdone: {}, pulled: {}, earlyPin: {}, checked: {}, pending: null, ics: {} };
    MOVE_MAPS.forEach(function (pair) {
      var m = p[pair[0]] || {};
      Object.keys(m).forEach(function (k) {
        if (k[0] === '~') { st.pending = st.pending || {}; (st.pending[pair[0]] = st.pending[pair[0]] || {})[k] = m[k]; }
        else st[pair[1]][k] = m[k];
      });
    });
    (p.ev || []).forEach(function (e) { st.ics[e[0]] = { uid: e[0], title: e[1], course: e[6] || null, due: e[2], allDay: !!e[3], url: e[4], desc: '', kind: e[5] || 'assignment', source: 'ics' }; });
    st.custom = p.cu || {}; st.cats = p.ca || []; st.order = p.or || []; st.rename = p.rn || {}; st.rules = p.ru || [];
    st.classMap = p.cm || {}; st.cas = p.cas || {}; st.proctorCol = !!p.pc; st.createdAt = p.c || null; st.feedUrl = p.f || '';
    st.prefs = { hidePast: !!(p.pr && p.pr.hp), showPre: !!(p.pr && p.pr.sp), theme: (p.pr && p.pr.th) || 'sticker', mode: (p.pr && p.pr.md) || '' };
    st.colors = p.co || {}; st.colorAuto = p.ka || {};
    if (p.cols) st.columns = p.cols;
    if (p.lb) st.labels = p.lb;
    if (p.pr && p.pr.lf) st.prefs.label = p.pr.lf;
    return st;
  }
  function resolvePending() {
    if (!S.pending) return;
    var byHash = {};
    Object.keys(S.ics).forEach(function (id) { byHash['~' + ics.hash(id)] = id; });
    MOVE_MAPS.forEach(function (pair) {
      var m = S.pending[pair[0]]; if (!m) return;
      Object.keys(m).forEach(function (h) {
        var at = pair[0] === 'sd' ? h.lastIndexOf('@') : -1, base = at > 0 ? h.slice(0, at) : h, tail = at > 0 ? h.slice(at) : '';
        if (byHash[base]) { S[pair[1]][byHash[base] + tail] = m[h]; delete m[h]; }
      });
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
      ['status', 'ov', 'hidden', 'custom', 'cas', 'rename', 'classMap', 'ics', 'namingSeen', 'est', 'ttype', 'actual', 'sdone', 'pulled', 'earlyPin', 'checked'].forEach(function (k) { if (inc[k]) cur[k] = Object.assign({}, cur[k], inc[k]); });
      if (inc.colors) Object.keys(inc.colors).forEach(function (t) { cur.colors[t] = Object.assign({}, cur.colors[t], inc.colors[t]); });
      if (inc.colorAuto) Object.keys(inc.colorAuto).forEach(function (t) { cur.colorAuto[t] = Object.assign({}, inc.colorAuto[t], cur.colorAuto[t]); });
      if (inc.prefs && inc.prefs.theme) { cur.prefs.theme = inc.prefs.theme; cur.prefs.mode = inc.prefs.mode || ''; }
      (inc.cats || []).forEach(function (c) { if (cur.cats.indexOf(c) < 0) cur.cats.push(c); });
      (inc.order || []).forEach(function (c) { if (cur.order.indexOf(c) < 0) cur.order.push(c); });
      var seenR = {}; cur.rules = (cur.rules || []).concat(inc.rules || []).filter(function (r) { var j = JSON.stringify(r); if (seenR[j]) return false; seenR[j] = 1; return true; });
      if (inc.createdAt) cur.createdAt = cur.createdAt ? Math.min(cur.createdAt, inc.createdAt) : inc.createdAt;
      cur.proctorCol = !!(cur.proctorCol || inc.proctorCol);
      if (inc.feedUrl && MODE === 'web') cur.feedUrl = inc.feedUrl;
      if (inc.pending) { cur.pending = cur.pending || {}; Object.keys(inc.pending).forEach(function (k) { cur.pending[k] = Object.assign({}, cur.pending[k], inc.pending[k]); }); }
      if (inc.columns) cur.columns = wedge.mergeColumns(cur.columns, inc.columns);
      if (inc.labels) cur.labels = wedge.mergeLabels(cur.labels, inc.labels);
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
    var es = Object.keys(inc.est || {}).length + Object.keys(inc.ttype || {}).length + (inc.pending ? Object.keys(inc.pending.es || {}).length + Object.keys(inc.pending.ty || {}).length : 0);
    if (es) parts.push(es + ' time estimate' + (es === 1 ? '' : 's'));
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
    if (!data || typeof data !== 'object' || !(data.ics || data.custom || data.status || data.cas || data.columns)) throw new Error('That file isn\u2019t a Schoology Board backup.');
    delete data.boardId; delete data.seenExport; delete data.feedUrl;
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
      (nd.unsorted.length ? '<h4 class="nm-h">Not sorted yet <span class="dim">\u00b7 ' + nd.unsortedTotal + ' assignment' + (nd.unsortedTotal === 1 ? '' : 's') + '</span></h4><div class="nm-list">' + nd.unsorted.map(function (it) {
        return '<div class="nm-row" data-id="' + esc(it.id) + '"><div class="nm-l"><span class="nm-t">' + esc(it.title) + '</span><div class="nm-s">' + esc(it.d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })) + '</div></div>' +
          '<input type="text" class="nm-in" list="nm-cats" placeholder="Unsorted" aria-label="Class for ' + esc(it.title) + '"></div>';
      }).join('') + (nd.unsortedTotal > nd.unsorted.length ? '<p class="hint">Showing the first ' + nd.unsorted.length + '. You can sort the rest from each card\u2019s \u22ef menu.</p>' : '') + '</div>' : '') +
      '<datalist id="nm-cats">' + sugg.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>';
    var d = dialog('Name your classes', body, '<button class="btn ghost" id="nm-skip">' + (fromMenu ? 'Cancel' : 'Skip for now') + '</button><span class="r"><button class="btn primary" id="nm-done">Save class names</button></span>', true);
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
    if (!$('#sb-main')) renderShell();
    renderBoard();
    if (!(opts && opts.quiet)) toast('Imported ' + items.length + ' calendar item' + (items.length === 1 ? '' : 's') + (Object.keys(before).length ? ' (' + fresh + ' new)' : '') + '.');
  }
  function applyTodos(tasks) {
    tasks = tasks || [];
    if (!tasks.length) throw new Error('No tasks found. Put one task on each line.');
    markCreated();
    tasks.forEach(function (t) {
      var id = 'custom-' + rid();
      var rec = { id: id, source: 'custom', title: t.title, course: UNSORTED, url: null, note: '', created: Date.now() };
      if (t.due) { rec.due = t.due + 'T23:59'; rec.allDay = true; }
      else { rec.due = ''; rec.allDay = true; rec.undated = true; }
      S.custom[id] = rec;
      if (t.done) S.status[id] = 'done';
    });
    S.lastImport = { at: Date.now(), source: 'todo', count: tasks.length };
    save();
    if (!$('#sb-main')) renderShell();
    renderBoard();
    toast('Added ' + tasks.length + ' task' + (tasks.length === 1 ? '' : 's') + '.');
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
    var icsFiles = files.filter(function (f) { return /\.(ics|ical|ifb)$/i.test(f.name) || (/calendar/.test(f.type || '') && !/\.(txt|md|markdown|pdf)$/i.test(f.name)); });
    var pdfs = files.filter(function (f) { return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; });
    var todoFiles = files.filter(function (f) { return icsFiles.indexOf(f) < 0 && pdfs.indexOf(f) < 0 && (/\.(txt|md|markdown)$/i.test(f.name) || f.type === 'text/plain' || f.type === 'text/markdown'); });
    if (!icsFiles.length && !pdfs.length && !todoFiles.length) { if (errEl) errEl.textContent = 'Use a calendar file (.ics), a to-do list (.txt or .md), or a Course Assignment Sheet PDF.'; return; }
    var chain = Promise.resolve();
    var wantNaming = !!icsFiles.length;
    icsFiles.forEach(function (f) { chain = chain.then(function () { return readFile(f); }).then(function (b) { applyIcs(ics.decodeBytes(b), 'file'); }); });
    todoFiles.forEach(function (f) {
      chain = chain.then(function () { return readFile(f, true); }).then(function (text) {
        if (/^\s*(\uFEFF)?BEGIN:VCALENDAR/i.test(String(text).slice(0, 2048))) { wantNaming = true; applyIcs(text, 'file'); }
        else applyTodos(wedge.parseTodos(text));
      });
    });
    if (pdfs.length) {
      chain = chain.then(function () {
        if (errEl) errEl.innerHTML = '<span class="loadmsg"><span class="spinner"></span> Reading ' + pdfs.length + ' PDF' + (pdfs.length > 1 ? 's' : '') + '\u2026</span>';
        return Promise.all(pdfs.map(parseCasFile));
      }).then(function (results) {
        if (errEl) errEl.textContent = '';
        if (onDone) onDone();
        openCasPreview(results);
      });
    } else chain = chain.then(function () { if (onDone) onDone(); if (wantNaming) maybeNaming(); });
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
        throw new Error('This offline copy can\u2019t read PDFs. Import Course Assignment Sheet PDFs on the website.');
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
          '<button class="btn ghost small cas-all">Select all</button><button class="btn ghost small cas-none">Select none</button></header>' +
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
          S.cas[it.id] = { id: it.id, source: 'cas', course: r.course, title: it.title, due: it.due, classDate: it.classDate, kind: it.kind, note: it.explicitDue ? '' : 'Before class', dueWord: !it.explicitDue && /\bdue\b/i.test(it.raw || '') ? 1 : 0 };
          delete S.hidden[it.id];
          added++;
        });
      });
      save(); d.close();
      if (!$('#sb-main')) renderShell();
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
    }).catch(function (e) { toastErr(e.message); if (btn) { btn.disabled = false; btn.innerHTML = 'See a sample plan ' + ICON.arrow; } });
  }

  // ---------- offline download ----------
  function scriptSafe(s) { return String(s).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--'); }
  // ---------- theme ----------
  function activeTheme() { return document.documentElement.getAttribute('data-theme') || 'sticker'; }
  // The backup carries the theme in use: the default tokens plus the active theme, with any
  // url(...) assets (fonts, textures) turned into data: URIs so the file works offline.
  function themeCss() {
    var baked = document.querySelector('style#sb-theme'); // (the web page's palette button shares the id)
    if (baked) return Promise.resolve(baked.textContent);
    // Shared tokens, the Tonight layout, then only the theme in use (with its fonts).
    var name = activeTheme(), names = ['theme/default.css', 'tonight.css'];
    if (name !== 'default') names.push('theme/' + name + '.css');
    return Promise.all(names.map(function (n) { return getSrc(n).then(function (css) { return inlineUrls(css, BASE + n); }); }))
      .then(function (parts) { return parts.join('\n'); }, function () { return ''; });
  }
  function inlineUrls(css, from) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, ''); // comments may mention url(...)
    var refs = [], re = /url\((['"]?)([^'")]+)\1\)/g, m;
    while ((m = re.exec(css))) if (!/^(data:|#)/.test(m[2])) refs.push(m[2]);
    return Promise.all(refs.map(function (u) {
      var abs = new URL(u, new URL(from, location.href)).href;
      return fetch(abs).then(function (r) { if (!r.ok) throw new Error(); return r.blob(); }).then(function (b) {
        return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res([u, fr.result]); }; fr.readAsDataURL(b); });
      }).catch(function () { return [u, null]; });
    })).then(function (pairs) {
      pairs.forEach(function (p) { if (p[1]) css = css.split(p[0]).join(p[1]); });
      return css;
    });
  }
  function getSrc(name, id) {
    var el = id && document.getElementById(id);
    if (el) return Promise.resolve(el.textContent);
    return fetch(BASE + name, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('missing ' + name); return r.text(); });
  }
  function buildOfflineHtml() {
    var files = {};
    return Promise.all([
      getSrc('board.css', 'sb-css').then(function (t) { files.css = t; }),
      themeCss().then(function (t) { files.theme = t; }),
      getSrc('ics.js', 'sb-src-ics').then(function (t) { files.ics = t; }),
      getSrc('cas.js', 'sb-src-cas').then(function (t) { files.cas = t; }),
      getSrc('plan.js', 'sb-src-plan').then(function (t) { files.plan = t; }),
      getSrc('wedge.js', 'sb-src-wedge').then(function (t) { files.wedge = t; }),
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
      return '<!doctype html>\n<html lang="en" data-theme="' + esc(activeTheme()) + '"' + (document.documentElement.getAttribute('data-mode') ? ' data-mode="dark"' : '') + '><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Schoology Board (backup)</title><meta name="color-scheme" content="light dark"><meta name="theme-color" content="">' +
        '<style id="sb-theme">' + files.theme.replace(/<\/style/gi, '<\\/style') + '</style><style id="sb-css">' + files.css.replace(/<\/style/gi, '<\\/style') + '</style></head><body>' +
        '<div id="app"><div class="loading">Loading your board\u2026</div></div>\n' +
        '<script id="sb-config" type="application/json">' + j(cfg) + '</script>\n' +
        '<script id="sb-data" type="application/json">' + j(snap) + '</script>\n' +
        (files.pdf && files.worker ? '<script id="sb-pdfjs" type="text/plain">' + scriptSafe(files.pdf) + '</script>\n<script id="sb-pdfworker" type="text/plain">' + scriptSafe(files.worker) + '</script>\n' : '') +
        (files.qr ? '<script id="sb-src-qr">' + scriptSafe(files.qr) + '</script>\n' : '') +
        '<script id="sb-src-ics">' + scriptSafe(files.ics) + '</script>\n' +
        '<script id="sb-src-cas">' + scriptSafe(files.cas) + '</script>\n' +
        '<script id="sb-src-plan">' + scriptSafe(files.plan) + '</script>\n' +
        '<script id="sb-src-wedge">' + scriptSafe(files.wedge) + '</script>\n' +
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
    applyTheme();
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
    setInterval(function () { maybeRefresh(15 * 60000); }, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { renderSync(); maybeRefresh(5 * 60000); } });
    window.addEventListener('focus', function () { maybeRefresh(5 * 60000); });
    setInterval(tickTimer, 1000);
    registerSw();
    window.addEventListener('hashchange', function () { if (MODE === 'web') takeMoveFromUrl(); });
    setInterval(renderSync, 30000);
    // Keep times fresh (the plan follows the clock) unless the student is in the middle of something.
    setInterval(function () {
      var ae = document.activeElement;
      if (!drag && !tdrag.on && !tnBusy && !document.querySelector('dialog[open]') && !openMenu && $('#sb-main') && !(ae && (ae.classList.contains('card') || isTyping({ target: ae })))) renderBoard();
    }, 60000);
    window.addEventListener('storage', function (e) { if (e.key === K) { S = load(); delete S._migrated; delete S._needsProctorCheck; applyTheme(); render(); } });
  }
  // ---------- installable app: the service worker keeps the app shell for offline use (never your calendar data) ----------
  function registerSw() {
    if (MODE !== 'web' || !('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost')) return;
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (updateAsked && !reloading) { reloading = true; location.reload(); } });
    navigator.serviceWorker.register('/sw.js').then(function (reg) {
      function offer(w) {
        if (!w || !navigator.serviceWorker.controller) return; // first install: nothing to update
        showUpdate(function () { updateAsked = true; w.postMessage({ type: 'SKIP_WAITING' }); });
      }
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing; if (!w) return;
        w.addEventListener('statechange', function () { if (w.state === 'installed') offer(w); });
      });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) reg.update().catch(function () { }); });
    }).catch(function () { });
  }
  var updateAsked = false;
  function showUpdate(apply) {
    if ($('#sb-update')) return;
    var bar = document.createElement('div');
    bar.id = 'sb-update'; bar.className = 'update-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>Update ready</span><button type="button" class="btn small primary">Reload to update</button><button type="button" class="btn small ghost" aria-label="Later: update next time you open the app">Later</button>';
    bar.querySelector('.primary').onclick = apply;
    bar.querySelector('.ghost').onclick = function () { bar.remove(); };
    document.body.appendChild(bar);
  }
  window.SchoologyBoard = { state: function () { return S; }, bg: function () { return BG; }, plan: function () { return lastPlan; },
    estimate: function (id) { var items = allItems(), it = items.filter(function (i) { return i.id === id; })[0]; return it ? plan.estimate(it, pctx(), plan.learnedTable(items, pctx())) : null; }, render: render, matches: sameish, buildOfflineHtml: buildOfflineHtml, movePayload: function () { return movePayload(); }, theme: setTheme, items: function () { return allItems(); }, week: function () { var now = new Date(); return plan.weekAhead(allItems(), pctx(), ics.defaultWeekStart(now), now); }, version: '1.11.0' };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
