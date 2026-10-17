/* Schoology Board: Course Assignment Sheet (CAS) PDF parser.
   Works on positioned text items (from pdf.js getTextContent), so it runs in
   the browser and in Node tests. No network, no dependencies. */
(function (root) {
  'use strict';

  var DATE_RE = /^(Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)[a-z]*\.?,?\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/i;
  var BULLETS = /^[\u2751\u2752\u274F\u2610\u25A1\u25AA\u25CF\u2022\u25E6\u2023\u2043\uF06F\uF0A7\uF0B7\uF071\uF0FC\u2713\u2714-]$/;
  var BULLET_PREFIX = /^[\u2751\u2752\u274F\u2610\u25A1\u25AA\u25CF\u2022\u25E6\uF06F\uF0A7\uF0B7\uF071]\s*/;
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  function clean(s) { return String(s || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' '); }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function fixYear(y, fallback) {
    y = String(y);
    if (y.length === 2) return 2000 + +y;
    if (y.length === 4) return +y;
    if (y.length > 4 && /^20/.test(y)) { // typo like "20256": prefer the fallback year if it fits
      if (fallback) return fallback;
      return +y.slice(0, 4);
    }
    return fallback || +y;
  }
  function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function addDays(dateStr, n) {
    var p = dateStr.split('-').map(Number), t = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  /** Group raw items into visual lines per column. */
  function toLines(items) {
    var sorted = items.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var lines = [];
    sorted.forEach(function (it) {
      var ln = null;
      for (var i = lines.length - 1; i >= 0 && i >= lines.length - 3; i--) {
        if (Math.abs(lines[i].y - it.y) <= 2.2) { ln = lines[i]; break; }
      }
      if (!ln) { ln = { y: it.y, h: it.h, items: [] }; lines.push(ln); }
      ln.items.push(it);
      ln.h = Math.max(ln.h, it.h);
    });
    lines.forEach(function (ln) {
      ln.items.sort(function (a, b) { return a.x - b.x; });
      var text = '', prevEnd = null, bullet = false;
      ln.items.forEach(function (it, idx) {
        var s = it.str;
        if (idx === 0 && BULLETS.test(s.trim())) { bullet = true; prevEnd = it.x + it.w; return; }
        if (!text && BULLET_PREFIX.test(s)) { bullet = true; s = s.replace(BULLET_PREFIX, ''); }
        if (prevEnd !== null && text && it.x - prevEnd > 1.2 && !/\s$/.test(text) && !/^\s/.test(s)) text += ' ';
        text += s;
        prevEnd = it.x + it.w;
      });
      ln.text = text.replace(/\s+/g, ' ').trim();
      if (isNoise(ln.text)) { ln.text = ''; bullet = false; }
      ln.bullet = bullet;
      ln.x = ln.items[0].x;
    });
    return lines.filter(function (l) { return l.text || l.bullet; });
  }

  function findHeader(pages) {
    for (var p = 0; p < pages.length; p++) {
      var its = pages[p].items, obj = null, task = null, dates = null, yh = null;
      its.forEach(function (it) {
        var s = it.str.trim();
        if (/^Students will learn|^Daily Learning Objectives/i.test(s)) { obj = obj === null ? it.x : Math.min(obj, it.x); yh = yh === null ? it.y : Math.min(yh, it.y); }
        if (/^All assignments\b|^Assignments?\b/i.test(s) && it.x > 120) { task = it.x; yh = yh === null ? it.y : Math.min(yh, it.y); }
        if (/^Class Dates?$|^Dates?$/i.test(s)) dates = it.x;
      });
      if (task !== null) return { page: p, objX: obj, taskX: task, dateX: dates, headerY: yh };
    }
    return null;
  }

  // Fall back when no header row is found: cluster bullet x positions.
  function inferColumns(pages) {
    var xs = [];
    pages.forEach(function (pg) { pg.items.forEach(function (it) { if (BULLETS.test(it.str.trim())) xs.push(Math.round(it.x)); }); });
    if (!xs.length) return null;
    xs.sort(function (a, b) { return a - b; });
    var clusters = [];
    xs.forEach(function (x) {
      var c = clusters[clusters.length - 1];
      if (c && x - c.max < 12) { c.max = x; c.n++; } else clusters.push({ min: x, max: x, n: 1 });
    });
    clusters = clusters.filter(function (c) { return c.n >= 2; });
    if (!clusters.length) return null;
    var task = clusters[clusters.length - 1].min - 4;
    var obj = clusters.length > 1 ? clusters[clusters.length - 2].min - 4 : null;
    return { page: -1, objX: obj, taskX: task, dateX: null, headerY: null };
  }

  function isNoise(s) {
    return /^\d{4}\s*-\s*\d{4} Academic Year$|^Page \d+( of \d+)?$/i.test(s);
  }

  // ---------- due-date extraction ----------
  var WD = '(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\\.?,?\\s*';
  var TIME = '(\\d{1,2})\\s*(?:[:.]\\s*(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?|(noon|midnight)';
  var NUM_DATE = '(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,5}))?';
  var NAME_DATE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?(?:\\s+(\\d{4}))?';
  var WDF = '(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?\\.?,?\\s*';
  var TAIL = '(?:' + NUM_DATE + '|' + NAME_DATE + ')(?:\\s*,?\\s*(?:at|by|@)?\\s*(?:' + TIME + '))?';
  var DUE_RE = new RegExp('(?:\\b(due|by|on)\\b[:\\s]*(?:the\\s+)?(?:' + WD + ')?|\\b' + WDF + ')' + TAIL, 'ig');

  function parseTime(h, mi, ap, word) {
    if (word) return /noon/i.test(word) ? '12:00' : '23:59';
    if (h === undefined || h === null || h === '') return null;
    h = +h; mi = mi ? +mi : 0;
    if (h > 23 || mi > 59) return null;
    if (ap) { var pm = /p/i.test(ap); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
    else if (h >= 1 && h <= 11) h += 12; // deadlines without am/pm are evenings ("by 11:59 ET")
    return pad(h) + ':' + pad(mi);
  }

  function extractDue(text, classDate) {
    var cy = +classDate.slice(0, 4), cm = +classDate.slice(5, 7);
    var best = null, m;
    DUE_RE.lastIndex = 0;
    var t = text.replace(/(\d)\s*:\s+(\d{2})/g, '$1:$2'); // "11: 55 pm"
    while ((m = DUE_RE.exec(t))) {
      var mo, d, y;
      if (m[3]) { mo = +m[3]; d = +m[4]; y = m[5] ? fixYear(m[5], cy) : null; }
      else if (m[6]) { mo = MONTHS[m[6].toLowerCase().slice(0, 4)] || MONTHS[m[6].toLowerCase().slice(0, 3)]; d = +m[7]; y = m[8] ? +m[8] : null; }
      else continue;
      if (!mo || mo > 12 || !d || d > 31) continue;
      if (!y) y = (mo < cm - 6) ? cy + 1 : cy;
      var time = parseTime(m[9], m[10], m[11], m[12]) || '23:59';
      var kw = m[1] ? m[1].toLowerCase() : 'wd';
      var hit = { date: ymd(y, mo, d), time: time, kw: kw, index: m.index };
      var rank = { due: 3, wd: 2, by: 2, on: 1 };
      if (!best || rank[kw] > rank[best.kw] || (rank[kw] === rank[best.kw] && kw !== 'due')) best = hit;
    }
    if (best) return { due: best.date + 'T' + best.time, explicit: true, index: best.index, kw: best.kw };
    if (/by midnight the (evening|night) (prior|before)/i.test(text)) return { due: addDays(classDate, -1) + 'T23:59', explicit: true, index: -1 };
    return null;
  }

  function classify(text) {
    var s = text.trim();
    if (/\b(upload|submit)\b/i.test(s) && !/^(the teacher|teacher\b)/i.test(s)) return 'submit';
    if (/^(the teacher|teacher\b|allow time|explain\b|discuss\b|class discussion|we will|in[- ]class\b|students (will|may)\b)/i.test(s)) return 'class';
    if (/^(read|watch|listen|review|study|view|preview)\b/i.test(s)) return 'read';
    if (/^(submit|upload|turn in|hw upload|homework upload|quiz|test|exam|post|take)\b/i.test(s)) return 'submit';
    if (/\bupload\b|\bsubmit\b/i.test(s)) return 'submit';
    return 'do';
  }

  function tidyTitle(text, due) {
    var s = text;
    if (due && (due.kw === 'due' || due.kw === 'wd') && due.index > 8) s = s.slice(0, due.index);
    s = s.replace(/\s*\((?:by midnight[^)]*)\)\s*/i, ' ');
    s = s.replace(/^(READ|SUBMIT|UPLOAD|COMPLETE|REFLECT|WATCH|REVIEW|PERFORM|PREPARE|BEGIN|WRITE|STUDY)\b(:?)/, function (_, w, c) {
      return w.charAt(0) + w.slice(1).toLowerCase() + c;
    });
    s = s.replace(/\s+J$/, '').replace(/[\s.,;:–-]+$/, '').replace(/\s+/g, ' ').trim();
    return s;
  }

  /**
   * pages: [{ items: [{str, x, y, w, h}] }]  (PDF coordinates, y grows upward)
   * opts: { fileName, classTime:'08:00' }
   * returns { course, items:[...], rows, warnings:[] }
   */
  function parseCas(pages, opts) {
    opts = opts || {};
    var classTime = opts.classTime || '08:00';
    var warnings = [];
    pages = pages.map(function (pg) {
      return { items: pg.items.map(function (it) {
        return { str: clean(it.str), x: it.x, y: it.y, w: it.w || 0, h: it.h || 10 };
      }).filter(function (it) { return it.str.trim(); }) };
    });

    // Course name
    var course = null;
    pages.slice(0, 2).forEach(function (pg) {
      if (course) return;
      var lines = toLines(pg.items);
      for (var i = 0; i < lines.length; i++) {
        var m = lines[i].text.match(/Course Name\s*:\s*(.+)$/i) || lines[i].text.match(/^Course\s*:\s*(.+)$/i);
        if (m && m[1].trim()) { course = m[1].trim(); break; }
      }
    });
    if (!course && opts.fileName) {
      course = decodeURIComponent(String(opts.fileName).replace(/\+/g, ' '))
        .replace(/\.pdf$/i, '').replace(/[-_ ]*Course Assignment Sheet.*$/i, '').replace(/[_+]/g, ' ').trim() || null;
      if (/^COURSE[ _]NAME$/i.test(course || '')) course = null;
    }
    if (!course) { course = 'Unsorted'; warnings.push('Could not find the course name; using "Unsorted".'); }

    var hdr = findHeader(pages) || inferColumns(pages);
    if (!hdr) return { course: course, items: [], rows: [], warnings: ['No assignment table found in this PDF.'] };
    var taskX = hdr.taskX - 6;
    var objX = hdr.objX !== null && hdr.objX !== undefined ? hdr.objX - 6 : null;

    var rows = []; // {date, day, page, lines:[]}
    var lastRow = null;
    for (var p = 0; p < pages.length; p++) {
      var its = pages[p].items;
      // vertical limits
      var top = Infinity, bottom = -Infinity;
      if (p === hdr.page && hdr.headerY !== null) top = hdr.headerY - 2;
      if (p < hdr.page) continue;
      its.forEach(function (it) {
        var s = it.str.trim();
        if (/^KEY$/.test(s) && it.x < 120) bottom = Math.max(bottom, it.y + 1);
      });
      var stop = bottom; // ignore everything at/below KEY
      var dates = [], dayNums = [], content = [];
      its.forEach(function (it) {
        if (it.y >= top || it.y <= stop) return;
        var s = it.str.trim();
        var ctr = it.x;
        if (ctr >= taskX) content.push({ col: 'task', it: it });
        else if (objX !== null && ctr >= objX) content.push({ col: 'obj', it: it });
        else {
          var dm = s.match(DATE_RE);
          if (dm) dates.push({ y: it.y, yc: it.y + it.h / 2, m: dm });
          else if (/^\d{1,3}$/.test(s)) dayNums.push({ y: it.y, n: +s });
        }
      });
      // footer guard: drop lines in the bottom 50pt that are centered noise
      var taskLines = toLines(content.filter(function (c) { return c.col === 'task'; }).map(function (c) { return c.it; }))
        .map(function (l) { l.col = 'task'; return l; });
      var objLines = toLines(content.filter(function (c) { return c.col === 'obj'; }).map(function (c) { return c.it; }))
        .map(function (l) { l.col = 'obj'; return l; });
      dates.sort(function (a, b) { return b.y - a.y; });

      // Merge obj+task lines into "bands" (same y) to find row boundaries.
      var bands = [];
      taskLines.concat(objLines).sort(function (a, b) { return b.y - a.y; }).forEach(function (l) {
        var b = bands[bands.length - 1];
        if (b && Math.abs(b.y - l.y) <= 2.2) b.lines.push(l);
        else bands.push({ y: l.y, h: l.h, lines: [l] });
      });
      bands.forEach(function (b) {
        b.top = b.y + b.h; b.bottom = b.y;
        b.objBullet = b.lines.some(function (l) { return l.col === 'obj' && l.bullet; });
        b.taskBullet = b.lines.some(function (l) { return l.col === 'task' && l.bullet; });
        b.hasObj = b.lines.some(function (l) { return l.col === 'obj'; });
      });

      var n = dates.length;
      var assign = new Array(bands.length);
      if (!n) {
        // No dates on this page: everything above KEY continues the previous row.
        bands.forEach(function (b, i) { assign[i] = -1; });
      } else {
        // Candidate boundary k means bands[k] is the first band of the lower row.
        // gaps: region above dates[0] (g=0), between dates[i-1] and dates[i] (g=i)
        var region = function (g) { // [startIdx, endIdx) of bands in gap g
          var hi = g === 0 ? Infinity : dates[g - 1].yc, lo = g < n ? dates[g].yc : -Infinity;
          var s = -1, e = -1;
          for (var i = 0; i < bands.length; i++) {
            var mid = bands[i].y + bands[i].h / 2;
            if (mid < hi && mid >= lo) { if (s < 0) s = i; e = i + 1; }
          }
          return s < 0 ? null : [s, e];
        };
        var regionOf = [];
        for (var g = 0; g <= n; g++) regionOf.push(region(g));
        // choices for gap g: boundary index k in [s, e] (k=e means all bands go to upper row)
        var choices = [];
        for (g = 0; g < n; g++) {
          var r = regionOf[g], ch = [];
          var firstBandAfter = function () { // index of first band below dates[g]
            for (var i = 0; i < bands.length; i++) if (bands[i].y + bands[i].h / 2 < dates[g].yc) return i;
            return bands.length;
          };
          if (!r) { var fb = firstBandAfter(); ch.push(fb); }
          else { for (var k = r[0]; k <= r[1]; k++) ch.push(k); }
          if (g === 0 && (p === hdr.page || !lastRow)) ch = [r ? r[0] : firstBandAfter()];
          choices.push(ch);
        }
        var bonus = function (k, g) {
          if (k >= bands.length) return 0;
          var b = bands[k], prev = bands[k - 1], s = 0;
          if (b.objBullet && b.taskBullet) s -= 10;
          else if (b.objBullet || (b.taskBullet && !b.hasObj && (!prev || prev.hasObj))) s -= 3;
          if (prev) { var gap = prev.bottom - b.top; if (gap > 6) s -= Math.min(6, gap / 3); }
          if (b.hasObj && !b.objBullet) s += 6; // never split inside an objective paragraph
          return s;
        };
        var rowCost = function (i, kTop, kBot) {
          // row i spans bands[kTop .. kBot-1] plus its date
          var t = dates[i].yc + 5, bt = dates[i].yc - 5;
          for (var j = kTop; j < kBot; j++) { t = Math.max(t, bands[j].top); bt = Math.min(bt, bands[j].bottom); }
          var w = (i === n - 1 || (i === 0 && p !== hdr.page)) ? 0.25 : 1;
          return w * Math.abs((t + bt) / 2 - dates[i].yc);
        };
        // DP over boundaries b_0..b_{n-1}; b_n fixed = bands.length
        var dp = [], back = [];
        for (g = 0; g < n; g++) {
          dp.push({}); back.push({});
          choices[g].forEach(function (k) {
            if (g === 0) { dp[0][k] = bonus(k, 0) * (k > 0 ? 1 : 0); back[0][k] = null; return; }
            var best = Infinity, arg = null;
            Object.keys(dp[g - 1]).forEach(function (pk) {
              pk = +pk; if (pk > k) return;
              var c = dp[g - 1][pk] + rowCost(g - 1, pk, k) + bonus(k, g);
              if (c < best) { best = c; arg = pk; }
            });
            if (arg !== null) { dp[g][k] = best; back[g][k] = arg; }
          });
        }
        var endBest = Infinity, endK = null;
        Object.keys(dp[n - 1]).forEach(function (k) {
          var c = dp[n - 1][k] + rowCost(n - 1, +k, bands.length);
          if (c < endBest) { endBest = c; endK = +k; }
        });
        var bounds = new Array(n); bounds[n - 1] = endK;
        for (g = n - 1; g > 0; g--) bounds[g - 1] = back[g][bounds[g]];
        bands.forEach(function (b, i) {
          var r = -1;
          for (var q = 0; q < n; q++) if (i >= bounds[q]) r = q;
          assign[i] = r;
        });
      }
      var pageRows = dates.map(function (d) {
        var mo = +d.m[2], da = +d.m[3], yr = fixYear(d.m[4]);
        var dn = dayNums.filter(function (x) { return Math.abs(x.y - d.y) < 3; })[0];
        return { date: ymd(yr, mo, da), day: dn ? dn.n : null, page: p + 1, lines: [] };
      });
      bands.forEach(function (b, i) {
        var target = assign[i] === -1 ? lastRow : pageRows[assign[i]];
        if (!target) return;
        b.lines.forEach(function (l) { if (l.col === 'task') target.lines.push(l); });
      });
      pageRows.forEach(function (r) { rows.push(r); });
      if (pageRows.length) lastRow = pageRows[pageRows.length - 1];
    }

    // Build tasks from task lines
    var items = [];
    rows.forEach(function (r) {
      var tasks = [];
      r.lines.forEach(function (l) {
        if (l.bullet || !tasks.length) tasks.push(l.text);
        else tasks[tasks.length - 1] += ' ' + l.text;
      });
      tasks.forEach(function (raw, idx) {
        var text = raw.replace(/\s+/g, ' ').trim();
        if (!text || text.length < 3) return;
        if (/^All assignments due/i.test(text)) return;
        var due = extractDue(text, r.date);
        var kind = classify(text);
        var title = tidyTitle(text, due);
        var dueStr = due ? due.due : r.date + 'T' + classTime;
        items.push({
          id: 'cas-' + hash(course + '|' + r.date + '|' + title.toLowerCase()),
          course: course, title: title, raw: text, classDate: r.date, day: r.day,
          due: dueStr, explicitDue: !!due, kind: kind,
          selected: kind !== 'class', source: 'cas'
        });
      });
    });
    if (!rows.length) warnings.push('No class dates (like "Tue 9/8/2026") found.');
    return { course: course, items: items, rows: rows.map(function (r) { return { date: r.date, day: r.day, page: r.page, tasks: r.lines.length }; }), warnings: warnings };
  }

  /** pdf.js document -> pages for parseCas */
  async function pagesFromPdf(pdfDoc) {
    var out = [];
    for (var i = 1; i <= pdfDoc.numPages; i++) {
      var pg = await pdfDoc.getPage(i);
      var tc = await pg.getTextContent();
      out.push({ items: tc.items.filter(function (t) { return t.str && t.transform; }).map(function (t) {
        return { str: t.str, x: t.transform[4], y: t.transform[5], w: t.width, h: t.height || Math.abs(t.transform[3]) || 10 };
      }) });
    }
    return out;
  }

  var api = { parseCas: parseCas, pagesFromPdf: pagesFromPdf, extractDue: extractDue, classify: classify, toLines: toLines, tidyTitle: tidyTitle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SBcas = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
