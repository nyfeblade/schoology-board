/* Column migration, labels, and to-do list parsing. Plain browser script + CommonJS.
   No DOM. Host names here are for on-screen wording only; the relay allowlist lives in app/api/feed/guard.js. */
(function (root) {
  'use strict';

  var BUILTIN = [
    { id: 'todo', name: 'Need to be done', kind: 'active' },
    { id: 'started', name: 'Started', kind: 'active' },
    { id: 'proctor', name: 'Needs to be proctored', kind: 'active' },
    { id: 'done', name: 'Completed', kind: 'done' }
  ];
  var BUILTIN_NAME = {};
  BUILTIN.forEach(function (c) { BUILTIN_NAME[c.id] = c.name; });
  var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  var CAL_HOSTS = {
    'calendar.google.com': 1, 'www.google.com': 1,
    'outlook.live.com': 1, 'outlook.office365.com': 1, 'outlook.office.com': 1,
    'calendar.icloud.com': 1
  };
  var MONTH = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };

  function cloneCol(c) { return { id: c.id, name: c.name, kind: c.kind === 'done' ? 'done' : 'active' }; }
  function defaultColumns() { return BUILTIN.map(cloneCol); }
  function cleanName(name, fallback) {
    var n = String(name == null ? '' : name).trim().replace(/\s+/g, ' ').slice(0, 60);
    return n || fallback;
  }
  function sanitizeColumns(list) {
    var out = [], seen = {};
    (Array.isArray(list) ? list : []).forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      var id = String(c.id || '');
      if (!ID_RE.test(id) || seen[id]) return;
      seen[id] = 1;
      out.push({ id: id, name: cleanName(c.name, BUILTIN_NAME[id] || 'Column'), kind: id === 'done' ? 'done' : 'active' });
    });
    if (!seen.todo) out.unshift(cloneCol(BUILTIN[0]));
    if (!seen.done) out.push(cloneCol(BUILTIN[3]));
    return out;
  }
  function migrateColumns(st) {
    var list = st && st.columns;
    var had = Array.isArray(list) && list.length > 0;
    return { columns: had ? sanitizeColumns(list) : defaultColumns() };
  }
  function visibleColumns(columns, proctorOn) {
    return sanitizeColumns(columns).filter(function (c) { return c.id !== 'proctor' || proctorOn; });
  }
  function addColumn(columns, name) {
    var cols = sanitizeColumns(columns).map(cloneCol);
    if (cols.length >= 12) return cols;
    var n = 1;
    while (cols.some(function (c) { return c.id === 'c' + n; })) n++;
    var col = { id: 'c' + n, name: cleanName(name, 'New column'), kind: 'active' };
    var at = -1;
    for (var i = 0; i < cols.length; i++) if (cols[i].kind === 'done') at = i;
    if (at < 0) cols.push(col); else cols.splice(at, 0, col);
    return cols;
  }
  function renameColumn(columns, id, name) {
    var cols = sanitizeColumns(columns).map(cloneCol);
    var nm = cleanName(name, '');
    if (!nm) return { ok: false, error: 'empty', columns: cols };
    var hit = false;
    cols.forEach(function (c) { if (c.id === id) { c.name = nm; hit = true; } });
    return { ok: hit, error: hit ? null : 'missing', columns: cols };
  }
  function copyStatus(status) {
    var st = {};
    if (status && typeof status === 'object') Object.keys(status).forEach(function (k) { st[k] = status[k]; });
    return st;
  }
  function deleteColumn(columns, status, id) {
    var cols = sanitizeColumns(columns).map(cloneCol);
    var st = copyStatus(status);
    var col = null;
    for (var i = 0; i < cols.length; i++) if (cols[i].id === id) col = cols[i];
    if (id === 'todo') return { ok: false, error: 'home', columns: cols, status: st, moved: 0 };
    if (!col) return { ok: false, error: 'missing', columns: cols, status: st, moved: 0 };
    if (col.kind === 'done') return { ok: false, error: 'done', columns: cols, status: st, moved: 0 };
    var moved = 0;
    Object.keys(st).forEach(function (k) { if (st[k] === id) { st[k] = 'todo'; moved++; } });
    return { ok: true, error: null, columns: cols.filter(function (c) { return c.id !== id; }), status: st, moved: moved };
  }
  function reorderVisible(columns, proctorOn, id, dir) {
    var cols = sanitizeColumns(columns).map(cloneCol);
    var vis = cols.filter(function (c) { return c.id !== 'proctor' || proctorOn; });
    var i = -1;
    for (var a = 0; a < vis.length; a++) if (vis[a].id === id) i = a;
    var j = i + dir;
    if (i < 0 || j < 0 || j >= vis.length) return cols;
    var ia = -1, ib = -1;
    for (var b = 0; b < cols.length; b++) { if (cols[b].id === vis[i].id) ia = b; if (cols[b].id === vis[j].id) ib = b; }
    var tmp = cols[ia]; cols[ia] = cols[ib]; cols[ib] = tmp;
    if (!proctorOn) {
      var pi = -1;
      for (var c = 0; c < cols.length; c++) if (cols[c].id === 'proctor') pi = c;
      if (pi >= 0) {
        var p = cols.splice(pi, 1)[0];
        var di = cols.length;
        for (var d = 0; d < cols.length; d++) if (cols[d].id === 'done') { di = d; break; }
        cols.splice(di, 0, p);
      }
    }
    return cols;
  }
  function ensureProctor(columns, on) {
    var cols = sanitizeColumns(columns).map(cloneCol);
    if (!on || cols.some(function (c) { return c.id === 'proctor'; })) return cols;
    var p = cloneCol(BUILTIN[2]);
    var di = cols.length;
    for (var i = 0; i < cols.length; i++) if (cols[i].id === 'done') { di = i; break; }
    cols.splice(di, 0, p);
    return cols;
  }
  function columnsForMove(columns) {
    var cols = sanitizeColumns(Array.isArray(columns) && columns.length ? columns : defaultColumns());
    if (JSON.stringify(cols) === JSON.stringify(defaultColumns())) return null;
    return cols;
  }
  function mergeColumns(current, incoming) {
    if (!Array.isArray(incoming) || !incoming.length) return sanitizeColumns(Array.isArray(current) && current.length ? current : defaultColumns());
    var a = sanitizeColumns(Array.isArray(current) && current.length ? current : defaultColumns()).map(cloneCol);
    var b = sanitizeColumns(incoming);
    var seen = {};
    a.forEach(function (c) { seen[c.id] = c; });
    b.forEach(function (c) {
      if (seen[c.id]) { seen[c.id].name = c.name; return; }
      var col = cloneCol(c);
      var di = a.length;
      for (var i = 0; i < a.length; i++) if (a[i].kind === 'done') { di = i; break; }
      a.splice(di, 0, col);
      seen[c.id] = col;
    });
    return a;
  }

  function sanitizeLabels(list) {
    if (!Array.isArray(list)) return [];
    var out = [], seen = {};
    list.forEach(function (l) {
      if (!l || out.length >= 8) return;
      var id = String(l.id || '');
      if (!ID_RE.test(id) || seen[id]) return;
      var name = cleanName(l.name, '').slice(0, 40);
      if (!name) return;
      var sw = parseInt(l.swatch, 10);
      if (!(sw >= 1 && sw <= 8)) sw = 1;
      seen[id] = 1;
      out.push({ id: id, name: name, swatch: sw });
    });
    return out;
  }
  function addLabel(labels, name, swatch) {
    var list = sanitizeLabels(labels);
    var nm = cleanName(name, '').slice(0, 40);
    if (!nm) return { ok: false, error: 'empty', labels: list };
    if (list.length >= 8) return { ok: false, error: 'full', labels: list };
    var n = 1;
    while (list.some(function (l) { return l.id === 'l' + n; })) n++;
    var sw = parseInt(swatch, 10);
    if (!(sw >= 1 && sw <= 8)) sw = 1;
    var id = 'l' + n;
    list.push({ id: id, name: nm, swatch: sw });
    return { ok: true, error: null, labels: list, id: id };
  }
  function renameLabel(labels, id, name) {
    var list = sanitizeLabels(labels);
    var nm = cleanName(name, '').slice(0, 40);
    if (!nm) return { ok: false, error: 'empty', labels: list };
    var hit = false;
    list.forEach(function (l) { if (l.id === id) { l.name = nm; hit = true; } });
    return { ok: hit, error: hit ? null : 'missing', labels: list };
  }
  function deleteLabel(labels, id) {
    return sanitizeLabels(labels).filter(function (l) { return l.id !== id; });
  }
  function mergeLabels(current, incoming) {
    var a = sanitizeLabels(current);
    var seen = {};
    a.forEach(function (l) { seen[l.id] = l; });
    sanitizeLabels(incoming).forEach(function (l) {
      if (seen[l.id]) { seen[l.id].name = l.name; seen[l.id].swatch = l.swatch; return; }
      if (a.length >= 8) return;
      a.push({ id: l.id, name: l.name, swatch: l.swatch });
      seen[l.id] = a[a.length - 1];
    });
    return a;
  }
  function sanitizeChecks(list) {
    if (!Array.isArray(list)) return [];
    var out = [], seen = {};
    list.forEach(function (c) {
      if (!c || out.length >= 40) return;
      var text = String(c.text == null ? '' : c.text).trim().slice(0, 200);
      if (!text) return;
      var id = String(c.id || '');
      if (!ID_RE.test(id) || seen[id]) {
        var n = out.length + 1;
        id = 'k' + n;
        while (seen[id]) { n++; id = 'k' + n; }
      }
      seen[id] = 1;
      out.push({ id: id, text: text, done: !!c.done });
    });
    return out;
  }

  function pad2(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
  function isoDate(y, m, d) {
    y = +y; m = +m; d = +d;
    if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    var dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return y + '-' + pad2(m) + '-' + pad2(d);
  }
  function cleanTitle(s) { return String(s || '').replace(/[,\s]+$/, '').trim(); }
  function trailingDate(s) {
    var m, iso;
    m = /^(.*\S)\s+(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m && (iso = isoDate(m[2], m[3], m[4]))) return { title: cleanTitle(m[1]), due: iso };
    m = /^(.*\S)\s+(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
    if (m && (iso = isoDate(m[2], m[3], m[4]))) return { title: cleanTitle(m[1]), due: iso };
    m = /^(.*\S)\s+([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s);
    if (m && MONTH[m[2].toLowerCase()] && (iso = isoDate(m[4], MONTH[m[2].toLowerCase()], m[3]))) return { title: cleanTitle(m[1]), due: iso };
    m = /^(.*\S)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m && (iso = isoDate(m[4], m[2], m[3]))) return { title: cleanTitle(m[1]), due: iso };
    return null;
  }
  function onlyDate(s) {
    return !!(trailingDate('x ' + s) && trailingDate('x ' + s).title === 'x');
  }
  function parseTodos(text) {
    var out = [];
    String(text == null ? '' : text).replace(/^\uFEFF/, '').split(/\r?\n/).forEach(function (line) {
      var s = line.trim();
      if (!s || /^#{1,6}\s+/.test(s)) return;
      var done = false;
      s = s.replace(/^(?:[-*+\u2022\u2013\u2014]|\d+[.)])\s+/, '');
      var box = /^\[([ xX])\]\s+([\s\S]+)$/.exec(s);
      if (box) { done = box[1].toLowerCase() === 'x'; s = box[2].trim(); }
      if (!s || onlyDate(s)) return;
      var due = null;
      var split = trailingDate(s);
      if (split) {
        if (!split.title) return;
        s = split.title;
        due = split.due;
      }
      if (!s) return;
      out.push({ title: s, done: done, due: due });
    });
    return out;
  }

  function hostKind(url) {
    var h = '';
    try {
      var s = String(url || '').trim().replace(/^webcals?:\/\//i, 'https://').replace(/^http:\/\//i, 'https://');
      if (!/^https?:\/\//i.test(s)) return 'other';
      h = new URL(s).hostname.toLowerCase().replace(/\.$/, '');
    } catch (e) { return 'other'; }
    if (!h || h.indexOf('..') >= 0) return 'other';
    if (h === 'schoology.com' || h.endsWith('.schoology.com')) return 'schoology';
    if (CAL_HOSTS[h]) return 'calendar';
    return 'other';
  }

  var api = {
    defaultColumns: defaultColumns, migrateColumns: migrateColumns, sanitizeColumns: sanitizeColumns, visibleColumns: visibleColumns,
    addColumn: addColumn, renameColumn: renameColumn, deleteColumn: deleteColumn, reorderVisible: reorderVisible, ensureProctor: ensureProctor,
    columnsForMove: columnsForMove, mergeColumns: mergeColumns,
    sanitizeLabels: sanitizeLabels, addLabel: addLabel, renameLabel: renameLabel, deleteLabel: deleteLabel, mergeLabels: mergeLabels,
    sanitizeChecks: sanitizeChecks, parseTodos: parseTodos, hostKind: hostKind
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SBwedge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
