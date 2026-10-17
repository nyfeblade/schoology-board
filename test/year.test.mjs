// The big synthetic school-year feed: every item lands on the right local date and time,
// audience tags never become classes, recurring events expand exactly once, and title
// prefixes sort assignments into classes. Run with TZ=America/New_York (npm test sets it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ics = require('../public/board/ics.js');
const here = new URL('./fixtures/', import.meta.url);
const exp = JSON.parse(readFileSync(new URL('year-expected.json', here), 'utf8'));
const items = ics.parseIcs(ics.decodeBytes(readFileSync(new URL('year.ics', here))));
const p2 = (n) => String(n).padStart(2, '0');
const local = (it) => { if (/Z$/.test(it.due)) { const d = new Date(it.due); return { date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, time: `${p2(d.getHours())}:${p2(d.getMinutes())}` }; } return { date: it.due.slice(0, 10), time: it.due.slice(11, 16) }; };

test('timezone is America/New_York for this suite', () => assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'America/New_York'));

test('year feed: exact item count (duplicates dropped, cancelled skipped, RRULEs expanded once)', () => {
  assert.equal(items.length, exp.count);
  assert.equal(new Set(items.map((i) => i.uid)).size, items.length, 'unique ids');
});

test('year feed: every item has the expected local date, time and title', () => {
  const key = (t, d, h) => `${t}|${d}|${h}`;
  const want = exp.items.map((e) => key(e.title, e.date, e.time)).sort();
  const got = items.map((i) => { const l = local(i); return key(i.title, l.date, l.time); }).sort();
  assert.deepEqual(got, want);
});

test('year feed: all-day dates never shift, multi-day events appear once on their start date', () => {
  const by = (t) => items.filter((i) => i.title === t);
  assert.deepEqual(by('Winter Break (Grades 7-12)').map((i) => i.due), ['2026-12-21T23:59']);
  assert.deepEqual(by('Picture Retakes (Grades K-6)').map((i) => [i.due, i.allDay]), [['2026-11-03T23:59', true]]);
  assert.equal(by('Senior Retreat (this week only)').length, 1);
  assert.equal(by('Spirit Week (FT Students Only)').length, 5);
  assert.equal(by('Chapel (Grades 7-12)').filter((i) => local(i).date === '2027-02-10').length, 0, 'moved occurrence');
  assert.equal(by('Chapel (Grades 7-12) - moved').length, 1);
  // DUE beats DTSTART
  assert.ok(items.filter((i) => /Test \(proctored\)/.test(i.title)).every((i) => local(i).time === '23:59'));
});

test('year feed: audience tags never become classes; titles keep them', () => {
  assert.equal(items.filter((i) => i.course).length, 0);
  assert.ok(items.some((i) => i.title === 'Lunch Duty (FT Students Only)'));
});

test('year feed: title prefixes sort every assignment into the expected class', () => {
  const guess = ics.buildClassifier([], [], items);
  const byUidTitle = new Map(exp.items.map((e) => [e.title + '|' + e.date + '|' + e.time, e.cls]));
  const wrong = [];
  for (const it of items) {
    const l = local(it), want = byUidTitle.get(it.title + '|' + l.date + '|' + l.time);
    const g = guess(it.title, it.kind), got = g ? g.course : 'Unsorted';
    if (got !== want) wrong.push(`${it.title}: ${got} (want ${want})`);
  }
  assert.deepEqual(wrong.slice(0, 10), []);
});

test('classifier: Course Assignment Sheets are the source of truth for class names', () => {
  const known = ['Algebra II', 'Spanish I', 'Apologia Chemistry', 'Omnibus 4 Primary', 'Business and Technical Writing'];
  const examples = [
    { title: 'Submit: Resume and cover letter draft', course: 'Business and Technical Writing' },
    { title: 'Prepare your presentation slides', course: 'Business and Technical Writing' },
    { title: 'Complete: Module 3 study guide', course: 'Apologia Chemistry' }
  ];
  const g = ics.buildClassifier(known, examples, []);
  const c = (t) => (g(t, 'assignment') || {}).course || 'Unsorted';
  assert.equal(c('ALG2 Homework 10'), 'Algebra II');
  assert.equal(c('Spanish I Quiz 2'), 'Spanish I');
  assert.equal(c('Spanish 1 Activities (3rd ed.) Exercise 03-03'), 'Spanish I');
  assert.equal(c('Apologia Chem - Module 03 Quiz'), 'Apologia Chemistry');
  assert.equal(c('Omnibus Primary HW Upload Day 11'), 'Omnibus 4 Primary');
  assert.equal(c('Writing Assignment (Writing Process): Resume and Cover Letter, Job Call'), 'Business and Technical Writing');
  assert.equal(c('Presentation Three'), 'Business and Technical Writing');
  assert.equal(c('Spanish 2 Quiz 1'), 'Unsorted', 'a different level is not the same class');
  assert.equal(c('Picture Day'), 'Unsorted');
});

test('audience tags: school-event tags are recognised, course names are not', () => {
  for (const t of ['first week only', 'FT Students', 'FT Students Only', 'Grades 7-12', 'Grades K-6', 'including Omnibus', 'new parents and students', 'this week only']) assert.ok(ics.isAudienceTag(t), t);
  for (const t of ['Physics A', 'Chemistry, Honors', 'AP Biology', 'Spanish II', 'New Testament Survey', 'Algebra II']) assert.ok(!ics.isAudienceTag(t), t);
});

test('RRULE: monthly by weekday, COUNT and UNTIL are bounded and never duplicate', () => {
  const r = ics.expandRule({ params: { TZID: 'America/New_York' }, value: '20260908T150000' }, 'FREQ=MONTHLY;BYDAY=2TU;COUNT=4', '');
  assert.deepEqual(r.map((o) => o.key), ['20260908', '20261013', '20261110', '20261208']);
  const forever = ics.expandRule({ params: {}, value: '20260901' }, 'FREQ=DAILY', '');
  assert.ok(forever.length <= 800 && forever.length > 0);
});
