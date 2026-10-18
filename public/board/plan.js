/* Schoology Board: the "Tonight" planner and "Week ahead" summary.
   Pure functions (no DOM), plain browser script + CommonJS module, no dependencies.
   Items come in already normalized by board.js: { id, title, course, d: Date, kind, source, col, pre, allDay }.
   ctx = { est: {id: min}, ttype: {id: type}, actual: {id: min}, sdone: {"id@YYYY-MM-DD": 1}, timer: {id, at} | null,
           earlyPin: {id: "YYYY-MM-DD"} (a first chunk the student added to that night from the Sunday plan),
           isWork: fn(item) -> bool } */
(function (root) {
  'use strict';

  var TYPES = ['reading', 'homework', 'writing', 'lab', 'quiz', 'test'];
  var LABEL = { reading: 'Reading', homework: 'Homework', writing: 'Writing', lab: 'Lab', quiz: 'Quiz', test: 'Test' };
  // Default minutes. For quizzes and tests this is total study time, split over the nights before.
  var DEFAULTS = { reading: 30, homework: 45, writing: 60, lab: 60, quiz: 60, test: 90 };
  var STUDY_BLOCK = 30, BREAK_AFTER = 50, BREAK_MIN = 10, EARLY_CHUNK = 45, EARLY_MIN = 120;
  var DAY = 864e5;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function sod(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function addMin(d, m) { return new Date(d.getTime() + m * 60000); }
  function daysBetween(a, b) { return Math.round((sod(b) - sod(a)) / DAY); }
  function round5(m) { return Math.max(5, Math.round(m / 5) * 5); }

  function inferType(it, ttype) {
    var o = ttype && ttype[it.id];
    if (o && LABEL[o]) return o;
    var t = String(it.title || '').toLowerCase();
    if (!/correction|review sheet|study guide|retake form/.test(t)) {
      if (/\b(test|exam|midterm|finals?)\b/.test(t)) return 'test';
      if (/\bquiz(zes)?\b/.test(t) || it.kind === 'assessment' || it.kind === 'common_assessment') return 'quiz';
    }
    if (/\b(lab|labs|laboratory)\b/.test(t)) return 'lab';
    if (/\b(essay|paper|writing|write|draft|journal|reflection|report|paragraph|dbq|thesis|outline|response|summary)\b/.test(t)) return 'writing';
    if (it.kind === 'read' || /\b(read|reading|chapters?|ch\.?\s*\d|pp?\.\s*\d|pages?\s+\d)/.test(t)) return 'reading';
    return 'homework';
  }
  function isTestType(type) { return type === 'quiz' || type === 'test'; }
  function studyCount(it, type) {
    if (type === 'quiz') return 2;
    return /\b(midterm|finals?|exam)\b/i.test(it.title || '') ? 4 : 3;
  }

  // Learned averages per class + type, from finished items that have timed minutes.
  // Smoothed mean (one pseudo-sample at the default) once there are 2 or more samples.
  function learnedTable(items, ctx) {
    var acc = {};
    items.forEach(function (it) {
      var a = ctx.actual && ctx.actual[it.id];
      if (it.col !== 'done' || !(a > 0)) return;
      var type = inferType(it, ctx.ttype), k = it.course + '|' + type;
      var e = acc[k] = acc[k] || { n: 0, sum: 0, type: type };
      e.n++; e.sum += a;
    });
    var out = {};
    Object.keys(acc).forEach(function (k) {
      var e = acc[k];
      if (e.n >= 2) out[k] = { min: round5((e.sum + DEFAULTS[e.type]) / (e.n + 1)), n: e.n };
    });
    return out;
  }
  function estimate(it, ctx, learned) {
    var type = inferType(it, ctx.ttype);
    var set = ctx.est && ctx.est[it.id];
    if (set > 0) return { min: set, src: 'set', type: type };
    var l = learned && learned[it.course + '|' + type];
    if (l) return { min: l.min, src: 'learned', type: type, n: l.n };
    return { min: DEFAULTS[type], src: 'est', type: type };
  }
  function timerMin(ctx, id, now) {
    var t = ctx.timer;
    return t && t.id === id ? Math.max(0, (now - t.at) / 60000) : 0;
  }
  function remaining(it, e, ctx, now) {
    var done = (ctx.actual && ctx.actual[it.id] || 0) + timerMin(ctx, it.id, now);
    return done ? round5(Math.max(e.min - done, 5)) : e.min;
  }

  // Work counted by the planner: open, real work, not from before the board existed, not in-class time.
  function plannable(it, ctx) {
    if (it.col === 'done' || it.pre) return false;
    if (it.kind === 'class') return false;
    if (it.source === 'ics' && ctx.isWork && !ctx.isWork(it)) return false;
    return true;
  }

  // Study nights for a quiz/test: one block on each of the n nights before it. Nights already gone are
  // simply gone (the plan never piles them onto tonight).
  function studyNights(it, e, today) {
    var n = studyCount(it, e.type), per = round5(e.min / n), due = sod(it.d), out = [];
    for (var k = n; k >= 1; k--) { var day = addDays(due, -k); if (day >= today) out.push({ day: day, min: per }); }
    return out;
  }
  function isStartEarly(it, e, today) {
    if (isTestType(e.type) || e.min < EARLY_MIN) return false;
    var dd = daysBetween(today, it.d);
    return dd >= 3 && dd <= 5;
  }
  // Tonight's window: overdue from the last two days through the end of the next school day.
  function windowEnd(today) {
    var d = addDays(today, 1);
    while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
    return addDays(d, 1);
  }
  function defaultStart(now) {
    var four = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 0);
    var m = new Date(now.getTime()); m.setSeconds(0, 0);
    var r = Math.ceil(m.getMinutes() / 5) * 5; m.setMinutes(r);
    if (now.getSeconds() || now.getMilliseconds()) { if (r === now.getMinutes()) m = addMin(m, 5); }
    return m < four ? four : m;
  }
  function parseHm(s, day) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    return m ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), +m[1], +m[2]) : null;
  }

  // Everything due tonight as tasks: {id, item, kind: 'work'|'study'|'early', min, est, due}.
  function tonightTasks(items, ctx, now) {
    var today = sod(now), wEnd = windowEnd(today), learned = learnedTable(items, ctx), tk = dayKey(today), tasks = [];
    var spillAfter = addDays(today, -2);
    var pulled = ctx.pulled || {};
    items.forEach(function (it) {
      if (!plannable(it, ctx)) return;
      var e = estimate(it, ctx, learned), pin = !!pulled[it.id];
      if (isTestType(e.type)) {
        if (it.d < addDays(today, 1) || it.d >= addDays(today, 15)) return;
        if (ctx.sdone && ctx.sdone[it.id + '@' + tk]) return;
        var got = false;
        studyNights(it, e, today).forEach(function (n) {
          if (dayKey(n.day) === tk) { got = true; tasks.push({ id: it.id, item: it, kind: 'study', min: n.min, est: e, due: it.d, pulled: pin }); }
        });
        // Pulled into tonight with no study night planned for tonight: one extra study session.
        if (!got && pin) tasks.push({ id: it.id, item: it, kind: 'study', min: Math.min(STUDY_BLOCK, e.min), est: e, due: it.d, pulled: true });
        return;
      }
      if (pin && it.d >= wEnd) {
        tasks.push({ id: it.id, item: it, kind: 'work', min: remaining(it, e, ctx, now), est: e, due: it.d, pulled: true });
      } else if (it.d >= spillAfter && it.d < wEnd) {
        tasks.push({ id: it.id, item: it, kind: 'work', min: remaining(it, e, ctx, now), est: e, due: it.d, overdue: it.d < now });
      } else if ((isStartEarly(it, e, today) || (ctx.earlyPin && ctx.earlyPin[it.id] === tk)) && !(ctx.sdone && ctx.sdone[it.id + '@' + tk])) {
        tasks.push({ id: it.id, item: it, kind: 'early', min: Math.min(EARLY_CHUNK, remaining(it, e, ctx, now)), est: e, due: it.d });
      }
    });
    tasks.sort(function (a, b) { return a.due - b.due || b.min - a.min || String(a.item.title).localeCompare(String(b.item.title)); });
    // Overdue work is pinned to the top ("Do first"); the student's own order (if any) applies to the rest.
    var first = tasks.filter(function (t) { return t.overdue; }), rest = tasks.filter(function (t) { return !t.overdue; });
    var order = ctx.order && ctx.order.length ? ctx.order : null;
    if (order) {
      var pos = {}; order.forEach(function (id, i) { pos[id] = i; });
      var known = rest.filter(function (t) { return pos[t.id] !== undefined; }).sort(function (a, b) { return pos[a.id] - pos[b.id]; });
      rest = known.concat(rest.filter(function (t) { return pos[t.id] === undefined; }));
    }
    tasks = first.concat(rest);
    var run = ctx.timer && ctx.timer.id;
    if (run) { var i = tasks.findIndex(function (t) { return t.id === run; }); if (i > 0) tasks.unshift(tasks.splice(i, 1)[0]); }
    return { tasks: tasks, learned: learned, windowEnd: wEnd, custom: !!order };
  }

  // Lay tonight out as time blocks from a start time, with breaks, stopping at the end-of-night limit.
  function layout(tasks, start, endBy) {
    var t = new Date(start.getTime()), since = 0, blocks = [], spill = [];
    for (var i = 0; i < tasks.length; i++) {
      var task = tasks[i], rem = task.min, parts = [], tt = t, s = since;
      while (rem > 0) {
        if (s >= BREAK_AFTER - 5) { parts.push({ kind: 'break', start: tt, end: addMin(tt, BREAK_MIN), min: BREAK_MIN }); tt = addMin(tt, BREAK_MIN); s = 0; }
        var room = BREAK_AFTER - s, take = rem <= room + 10 ? rem : room;
        parts.push({ kind: task.kind, task: task, start: tt, end: addMin(tt, take), min: take });
        tt = addMin(tt, take); s += take; rem -= take;
      }
      if (tt > endBy) { spill = tasks.slice(i); break; }
      var work = parts.filter(function (p) { return p.kind !== 'break'; });
      work.forEach(function (p, k) { p.part = k + 1; p.parts = work.length; });
      blocks = blocks.concat(parts); t = tt; since = s;
    }
    var work = blocks.filter(function (b) { return b.kind !== 'break'; });
    return {
      blocks: blocks, spill: spill, start: start, finish: blocks.length ? blocks[blocks.length - 1].end : null,
      workMin: work.reduce(function (a, b) { return a + b.min; }, 0), endBy: endBy
    };
  }
  function tonight(items, ctx, now, opts) {
    opts = opts || {};
    var today = sod(now), endBy = new Date(today.getFullYear(), today.getMonth(), today.getDate(), opts.endHour || 23, 0);
    var picked = opts.start ? parseHm(opts.start, today) : null, def = defaultStart(now);
    var start = picked && picked > def ? picked : def;
    if (ctx.timer && ctx.timer.at) { var nowish = new Date(now.getTime()); nowish.setSeconds(0, 0); if (nowish < start) start = nowish; }
    var tt = tonightTasks(items, ctx, now), plan = layout(tt.tasks, start, endBy);
    plan.tasks = tt.tasks; plan.learned = tt.learned; plan.windowEnd = tt.windowEnd; plan.picked = picked; plan.custom = tt.custom;
    return plan;
  }

  // Board badges: start-early flags and study nights (for any day).
  function flags(items, ctx, now) {
    var today = sod(now), learned = learnedTable(items, ctx), out = {};
    items.forEach(function (it) {
      if (!plannable(it, ctx)) return;
      var e = estimate(it, ctx, learned);
      if (isStartEarly(it, e, today)) out[it.id] = { early: true, est: e };
      else if (isTestType(e.type)) out[it.id] = { test: true, est: e };
    });
    return out;
  }
  function studyOn(items, ctx, day) {
    var learned = learnedTable(items, ctx), out = [], dk = dayKey(day), today = sod(day);
    items.forEach(function (it) {
      if (!plannable(it, ctx)) return;
      var e = estimate(it, ctx, learned);
      if (!isTestType(e.type)) return;
      studyNights(it, e, today).forEach(function (n) { if (dayKey(n.day) === dk) out.push({ item: it, min: n.min, est: e }); });
    });
    return out;
  }

  // Week ahead (the Sunday plan): for the Mon-Sun week starting at weekStart -
  //  days:     estimated minutes of work due each day (quizzes and tests are not in the bars; they have study nights),
  //  tests:    quizzes and tests due that week, each with the study nights still ahead (same rule as Tonight),
  //  heaviest: the day from today on with the most minutes due (earliest wins a tie), or null,
  //  early:    what to start early, by Tonight's rule (2 h or more, not a test, due in 3 to 5 days), with the
  //            first chunk Tonight plans (45 min, or what is left if less).
  // Invariant: n + tests.length = every plannable item due that week; total = the sum of the days.
  function weekAhead(items, ctx, weekStart, now) {
    var learned = learnedTable(items, ctx), days = [], tests = [], early = [], today = sod(now), n = 0;
    for (var i = 0; i < 7; i++) days.push({ day: addDays(weekStart, i), min: 0, items: [] });
    var end = addDays(weekStart, 7);
    items.forEach(function (it) {
      if (!plannable(it, ctx)) return;
      var e = estimate(it, ctx, learned);
      if (!isTestType(e.type) && isStartEarly(it, e, today)) early.push({ item: it, est: e, startBy: today, chunk: Math.min(EARLY_CHUNK, remaining(it, e, ctx, now)) });
      if (it.d < weekStart || it.d >= end) return;
      if (isTestType(e.type)) {
        var nights = studyNights(it, e, today);
        tests.push({ item: it, est: e, nights: nights, studyFrom: nights.length ? nights[0].day : null, sessions: nights.length });
        return;
      }
      var di = daysBetween(weekStart, it.d);
      days[di].min += e.min; days[di].items.push({ item: it, est: e }); n++;
    });
    var heaviest = null;
    days.forEach(function (d) { if (d.day >= today && d.min > 0 && (!heaviest || d.min > heaviest.min)) heaviest = d; });
    var byDue = function (a, b) { return a.item.d - b.item.d || String(a.item.title).localeCompare(String(b.item.title)); };
    tests.sort(byDue); early.sort(byDue);
    return { days: days, tests: tests, early: early, heaviest: heaviest, n: n, total: days.reduce(function (a, d) { return a + d.min; }, 0) };
  }

  function fmtMin(m) {
    m = Math.round(m);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return h + ' h' + (r ? ' ' + r + ' min' : '');
  }

  var api = {
    TYPES: TYPES, LABEL: LABEL, DEFAULTS: DEFAULTS, STUDY_BLOCK: STUDY_BLOCK, EARLY_CHUNK: EARLY_CHUNK, EARLY_MIN: EARLY_MIN,
    inferType: inferType, isTestType: isTestType, studyCount: studyCount, learnedTable: learnedTable, estimate: estimate,
    remaining: remaining, plannable: plannable, studyNights: studyNights, isStartEarly: isStartEarly, windowEnd: windowEnd,
    defaultStart: defaultStart, tonightTasks: tonightTasks, layout: layout, tonight: tonight, flags: flags, studyOn: studyOn,
    weekAhead: weekAhead, fmtMin: fmtMin, dayKey: dayKey
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SBplan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
