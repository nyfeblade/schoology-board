// Tonight planner, estimates, learning, study nights, start-early and week ahead. Frozen times, TZ=America/New_York.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../public/board/plan.js');
const at = (s) => new Date(s);
const hm = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
let n = 0;
const item = (title, due, extra = {}) => ({ id: 'i' + (++n), title, course: 'Biology', d: at(due), kind: 'assignment', source: 'ics', col: 'todo', pre: false, ...extra });
const ctx = (o = {}) => ({ est: {}, ttype: {}, actual: {}, sdone: {}, timer: null, isWork: () => true, ...o });
const SUN = at('2026-10-18T15:00'); // Sunday afternoon
const MON = at('2026-10-19T17:02');

test('types are inferred from titles and link types', () => {
  const t = (title, kind) => P.inferType({ id: 'x', title, kind });
  assert.equal(t('Read Chapter 4'), 'reading');
  assert.equal(t('Animal Farm ch. 3-4'), 'reading');
  assert.equal(t('Problem Set 4.2'), 'homework');
  assert.equal(t('Unit 3 Test'), 'test');
  assert.equal(t('Vocab Quiz 6'), 'quiz');
  assert.equal(t('Online check', 'assessment'), 'quiz');
  assert.equal(t('Test Corrections'), 'homework');
  assert.equal(t('Lab Report: Osmosis'), 'lab');
  assert.equal(t('Persuasive Essay Draft'), 'writing');
  assert.equal(t('Pages 40-52', 'read'), 'reading');
  assert.equal(P.inferType({ id: 'x', title: 'Problem Set' }, { x: 'test' }), 'test', 'one-tap override wins');
});

test('defaults by type, then a set estimate wins', () => {
  const it = item('Problem Set 1', '2026-10-19T23:59');
  assert.deepEqual(P.estimate(it, ctx(), {}), { min: 45, src: 'est', type: 'homework' });
  assert.equal(P.estimate(item('Read ch 2', '2026-10-19T23:59'), ctx(), {}).min, 30);
  assert.equal(P.estimate(item('Lab 3', '2026-10-19T23:59'), ctx(), {}).min, 60);
  assert.deepEqual(P.estimate(it, ctx({ est: { [it.id]: 90 } }), {}), { min: 90, src: 'set', type: 'homework' });
});

test('learned averages need 2 samples and are smoothed toward the default', () => {
  const a = item('Problem Set 1', '2026-10-12T23:59', { col: 'done' });
  const b = item('Problem Set 2', '2026-10-13T23:59', { col: 'done' });
  const c = item('Problem Set 3', '2026-10-20T23:59');
  const other = item('Problem Set X', '2026-10-20T23:59', { course: 'Geometry' });
  let cx = ctx({ actual: { [a.id]: 75 } });
  assert.equal(P.estimate(c, cx, P.learnedTable([a, b, c], cx)).src, 'est', 'one sample is not enough');
  cx = ctx({ actual: { [a.id]: 75, [b.id]: 90 } });
  const L = P.learnedTable([a, b, c, other], cx);
  const e = P.estimate(c, cx, L);
  assert.equal(e.src, 'learned');
  assert.equal(e.min, 70); // (75 + 90 + 45) / 3 = 70
  assert.equal(P.estimate(other, cx, L).src, 'est', 'per class');
  assert.equal(P.estimate(c, ctx({ ...cx, est: { [c.id]: 20 } }), L).src, 'set');
});

test('default start: now rounded up to 5 minutes, never before 4:00 PM', () => {
  assert.equal(hm(P.defaultStart(at('2026-10-19T13:10'))), '16:00');
  assert.equal(hm(P.defaultStart(at('2026-10-19T17:02'))), '17:05');
  assert.equal(hm(P.defaultStart(at('2026-10-19T17:05'))), '17:05');
  assert.equal(hm(P.defaultStart(at('2026-10-19T17:05:30'))), '17:10');
  assert.equal(hm(P.defaultStart(at('2026-10-19T17:58'))), '18:00');
});

test('plan orders by due date, then bigger first, with breaks after ~50 minutes', () => {
  n = 0;
  const items = [
    item('Read ch 5', '2026-10-20T08:00', { kind: 'read', source: 'cas' }), // 30
    item('Essay outline', '2026-10-20T08:00'), // writing 60
    item('Problem Set 2', '2026-10-19T23:59'), // 45, due tonight -> first
    item('Next week thing', '2026-10-27T23:59') // outside the window
  ];
  const p = P.tonight(items, ctx(), MON);
  const work = p.blocks.filter((b) => b.kind !== 'break');
  assert.deepEqual(work.map((b) => b.task.item.title + ' ' + b.min), ['Problem Set 2 45', 'Essay outline 60', 'Read ch 5 30']);
  assert.deepEqual(p.blocks.map((b) => b.kind + '@' + hm(b.start)), ['work@17:05', 'break@17:50', 'work@18:00', 'break@19:00', 'work@19:10']);
  assert.equal(hm(p.finish), '19:40');
  assert.equal(p.workMin, 135);
  assert.equal(p.spill.length, 0);
});

test('long tasks split into parts around a break; picked start time is used', () => {
  n = 0;
  const big = item('Research paper', '2026-10-20T08:00');
  const p = P.tonight([big], ctx({ est: { [big.id]: 120 } }), MON, { start: '19:00' });
  assert.deepEqual(p.blocks.map((b) => `${b.kind} ${hm(b.start)}-${hm(b.end)}`), ['work 19:00-19:50', 'break 19:50-20:00', 'work 20:00-20:50', 'break 20:50-21:00', 'work 21:00-21:20']);
  assert.deepEqual(p.blocks.filter((b) => b.kind !== 'break').map((b) => `${b.part}/${b.parts}`), ['1/3', '2/3', '3/3']);
  const early = P.tonight([big], ctx(), MON, { start: '15:00' });
  assert.equal(hm(early.start), '17:05', 'a start time in the past starts now');
});

test('overload past 11 PM spills honestly', () => {
  n = 0;
  const items = [1, 2, 3, 4].map((i) => item('Problem Set ' + i, '2026-10-20T08:00'));
  const p = P.tonight(items, ctx({ est: Object.fromEntries(items.map((i) => [i.id, 90])) }), at('2026-10-19T19:30'));
  assert.ok(p.finish <= at('2026-10-19T23:00'));
  assert.ok(p.spill.length >= 2);
  assert.deepEqual(p.spill.map((t) => t.item.title), items.slice(4 - p.spill.length).map((i) => i.title), 'what spills is the rest, in order');
});

test('done, pre-board and non-work items are excluded; recalculates when something is done or timed', () => {
  n = 0;
  const a = item('Problem Set A', '2026-10-20T08:00');
  const b = item('Problem Set B', '2026-10-20T08:00', { col: 'done' });
  const c = item('Problem Set C', '2026-10-20T08:00', { pre: true });
  const d = item('No School', '2026-10-20T00:00');
  const cx = ctx({ isWork: (it) => it.title !== 'No School' });
  let p = P.tonight([a, b, c, d], cx, MON);
  assert.deepEqual(p.tasks.map((t) => t.item.title), ['Problem Set A']);
  a.col = 'done';
  p = P.tonight([a, b, c, d], cx, MON);
  assert.equal(p.blocks.length, 0);
  a.col = 'todo';
  p = P.tonight([a], ctx({ actual: { [a.id]: 20 } }), MON);
  assert.equal(p.tasks[0].min, 25, 'timed minutes come off the remaining time');
  p = P.tonight([a], ctx({ timer: { id: a.id, at: at('2026-10-19T16:50').getTime() } }), MON);
  assert.equal(hm(p.start), '17:02', 'a running timer starts the plan now');
  assert.equal(p.tasks[0].min, 35);
});

test('friday night covers the weekend through Monday', () => {
  const fri = at('2026-10-23T16:00');
  assert.equal(P.dayKey(P.windowEnd(at('2026-10-23T00:00'))), '2026-10-27');
  n = 0;
  const p = P.tonight([item('Problem Set Mon', '2026-10-26T08:00'), item('Problem Set Tue', '2026-10-27T08:00')], ctx(), fri);
  assert.deepEqual(p.tasks.map((t) => t.item.title), ['Problem Set Mon']);
});

test('tests get study nights before them: 2 for a quiz, 3 for a test, 4 for a midterm', () => {
  n = 0;
  const today = at('2026-10-18T00:00');
  const quiz = item('Vocab Quiz 6', '2026-10-23T08:00');
  const tst = item('Unit 3 Test', '2026-10-23T08:00');
  const mid = item('Biology Midterm', '2026-10-23T08:00');
  const days = (it) => P.studyNights(it, P.estimate(it, ctx(), {}), today).map((x) => P.dayKey(x.day) + ' ' + x.min);
  assert.deepEqual(days(quiz), ['2026-10-21 30', '2026-10-22 30']);
  assert.deepEqual(days(tst), ['2026-10-20 30', '2026-10-21 30', '2026-10-22 30']);
  assert.deepEqual(days(mid), ['2026-10-19 25', '2026-10-20 25', '2026-10-21 25', '2026-10-22 25']);
  // Short notice: nights already gone are skipped, not piled onto tonight.
  const soon = item('Unit 4 Test', '2026-10-20T08:00');
  assert.deepEqual(P.studyNights(soon, P.estimate(soon, ctx(), {}), today).map((x) => P.dayKey(x.day) + ' ' + x.min), ['2026-10-18 30', '2026-10-19 30']);
  // They show up in the planner on those nights, and not on others.
  const wed = at('2026-10-21T16:00');
  const p = P.tonight([quiz, tst], ctx(), wed);
  assert.deepEqual(p.tasks.map((t) => t.kind + ' ' + t.item.title + ' ' + t.min), ['study Unit 3 Test 30', 'study Vocab Quiz 6 30']);
  assert.equal(P.tonight([quiz], ctx(), at('2026-10-20T16:00')).tasks.length, 0);
  assert.equal(P.tonight([quiz], ctx({ sdone: { [quiz.id + '@2026-10-21']: 1 } }), wed).tasks.length, 0, 'a finished study block stays done tonight');
  assert.equal(P.studyOn([quiz, tst], ctx(), at('2026-10-22T00:00')).length, 2);
});

test('start-early: 2h+ items due in 3 to 5 days get a flag and a 45-minute chunk tonight', () => {
  n = 0;
  const proj = item('Science Fair Project', '2026-10-22T08:00'); // Thu, 3 days from Mon
  const cx = ctx({ est: { [proj.id]: 180 } });
  assert.ok(P.flags([proj], cx, MON)[proj.id].early);
  const p = P.tonight([proj], cx, MON);
  assert.deepEqual(p.tasks.map((t) => t.kind + ' ' + t.min), ['early 45']);
  assert.ok(!P.flags([proj], cx, at('2026-10-15T12:00'))[proj.id], 'not 7 days out');
  assert.ok(!P.flags([proj], ctx(), MON)[proj.id], 'not when it is small');
  assert.equal(P.tonight([proj], ctx({ ...cx, sdone: { [proj.id + '@2026-10-19']: 1 } }), MON).tasks.length, 0);
});

test('week ahead: tests, heaviest day and start-early list', () => {
  n = 0;
  const ws = at('2026-10-19T00:00');
  const items = [
    item('Problem Set 1', '2026-10-20T08:00'), item('Lab 2', '2026-10-21T08:00'), item('Essay draft', '2026-10-21T08:00'),
    item('Unit 3 Test', '2026-10-22T08:00'), item('Big Project', '2026-10-23T08:00'), item('Old', '2026-10-12T08:00')
  ];
  const cx = ctx({ est: { [items[4].id]: 150 } });
  const w = P.weekAhead(items, cx, ws, SUN);
  assert.equal(P.dayKey(w.heaviest.day), '2026-10-23');
  assert.equal(w.heaviest.min, 150);
  assert.equal(w.days[2].min, 120);
  assert.deepEqual(w.tests.map((t) => t.item.title + ' x' + t.sessions), ['Unit 3 Test x3']);
  assert.deepEqual(w.early.map((e) => e.item.title + ' ' + P.dayKey(e.startBy)), ['Big Project 2026-10-18']);
  assert.equal(w.total, 45 + 60 + 60 + 150);
});

test('minutes read in plain words', () => {
  assert.equal(P.fmtMin(45), '45 min');
  assert.equal(P.fmtMin(60), '1 h');
  assert.equal(P.fmtMin(135), '2 h 15 min');
});

test('pulling into tonight: later work joins tonight, a test gets one study session', () => {
  const a = item('Problem Set A', '2026-10-19T23:59');
  const later = item('Worksheet 7', '2026-10-22T23:59');
  const quiz = item('Vocab Quiz 9', '2026-10-30T08:00');
  const plain = P.tonight([a, later, quiz], ctx(), MON);
  assert.deepEqual(plain.tasks.map((t) => t.id), [a.id], 'nothing far off is planned by default');
  const pulled = { [later.id]: '2026-10-19', [quiz.id]: '2026-10-19' };
  const p = P.tonight([a, later, quiz], ctx({ pulled }), MON);
  const byId = Object.fromEntries(p.tasks.map((t) => [t.id, t]));
  assert.equal(byId[later.id].kind, 'work');
  assert.equal(byId[later.id].pulled, true);
  assert.equal(byId[quiz.id].kind, 'study');
  assert.equal(byId[quiz.id].min, Math.min(P.STUDY_BLOCK, P.estimate(quiz, ctx(), {}).min));
  assert.equal(p.tasks.length, 3);
});

test('custom order: overdue stays first, the student order applies to the rest, new items go last', () => {
  const late = item('Late Lab', '2026-10-18T23:59');
  const b = item('Reading B', '2026-10-19T22:00');
  const c = item('Problem Set C', '2026-10-19T23:59');
  const d = item('Essay D', '2026-10-20T08:00');
  const sug = P.tonight([late, b, c, d], ctx(), MON);
  assert.equal(sug.custom, false);
  assert.equal(sug.tasks[0].id, late.id);
  const p = P.tonight([late, b, c, d], ctx({ order: [d.id, b.id] }), MON);
  assert.equal(p.custom, true);
  assert.deepEqual(p.tasks.map((t) => t.id), [late.id, d.id, b.id, c.id]);
  // The plan's time slots follow the new order.
  const firstWork = p.blocks.filter((x) => x.kind !== 'break');
  assert.equal(firstWork[1].task.id, d.id);
});
