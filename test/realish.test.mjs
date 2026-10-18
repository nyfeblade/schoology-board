// A made-up feed shaped like a real Schoology export (see test/fixtures/realish.ics).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ics = require('../public/board/ics.js');
const items = ics.parseIcs(ics.decodeBytes(readFileSync(new URL('./fixtures/realish.ics', import.meta.url))));
const by = (t) => items.find((i) => i.title.startsWith(t));
const classify = ics.buildClassifier([], [], items);
const cls = (t) => { const r = classify(by(t).title, by(t).kind); return r ? r.course : 'Unsorted'; };

test('every VEVENT becomes one card, dated at its start', () => {
  assert.equal(items.length, 23);
  const local = (i) => new Date(i.due).toLocaleString('en-US', { timeZone: 'America/New_York', hourCycle: 'h23' });
  assert.match(local(by('GEOM1 - Quiz 01')), /^10\/20\/2026, 12:00/);
  assert.match(local(by('Humanities Primary HW Upload Day 01')), /^10\/19\/2026, 23:59/);
  assert.equal(by('Spirit Week').allDay, true); assert.equal(by('Spirit Week').due, '2026-10-19T23:59'); // 5-day all-day event: start day
  assert.match(local(by('Fall Break Week')), /^10\/19\/2026, 00:00/); // multi-day timed event: start
});
test('http:// Schoology links are upgraded to https, kinds come from the URL', () => {
  assert.ok(items.every((i) => i.url.startsWith('https://example.schoology.com/')));
  assert.equal(by('Peer Review').kind, 'discussion');
  assert.ok(ics.isWork(by('Peer Review')));
  assert.ok(!ics.isWork(by('Spirit Week')));
});
test('audience-tag suffixes never become classes; titles keep them', () => {
  assert.ok(items.every((i) => !i.course));
  assert.equal(by('Open House').title, 'Open House (8:00 - 2:30 pm ET)');
  assert.equal(by('Spirit Week').title, 'Spirit Week (Full-Time Students Only)');
});
test('the trailing " - Link: …" is stripped from descriptions', () => {
  assert.ok(!/Link:/.test(by('Spirit Week').desc));
});
test('prefix spellings of one class merge into the bigger group', () => {
  assert.equal(cls('Humanities III Primary Project 01'), cls('Humanities Primary HW Upload Day 01'));
  assert.equal(cls('Humanities Primary HW Upload Day 01'), 'Humanities Primary');
  assert.equal(cls('Biology: Exploration'), 'Discovery Bio');
  assert.equal(cls('French I Quiz 1'), 'French 1');
  assert.equal(cls('GEOM1 Homework 1'), 'GEOM1');
  assert.equal(cls('Composition Assignment (Drafting): Made-up Essay, DRAFT'), 'Composition');
});
test('titles with no class prefix stay Unsorted', () => {
  for (const t of ['Unit 1 Reading Check', 'Proctor Note for Unit Two Quiz', 'Peer Review Discussion Board']) assert.equal(cls(t), 'Unsorted', t);
});
test('different numbers never merge', () => {
  const c = ics.buildClassifier([], [], [{ title: 'Spanish 1 Quiz 1', kind: 'assignment' }, { title: 'Spanish 1 Quiz 2', kind: 'assignment' }, { title: 'Spanish 2 Quiz 1', kind: 'assignment' }, { title: 'Spanish 2 Quiz 2', kind: 'assignment' }, { title: 'Spanish 2 Quiz 3', kind: 'assignment' }]);
  assert.equal(c('Spanish 1 Quiz 1', 'assignment').course, 'Spanish 1');
  assert.equal(c('Spanish 2 Quiz 1', 'assignment').course, 'Spanish 2');
});
