import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ics = require('../public/board/ics.js');
const read = (p) => ics.decodeBytes(readFileSync(new URL(p, import.meta.url)));

test('sample feed: every event parsed with title, due, link, uid', () => {
  const items = ics.parseIcs(read('../public/sample/schoology-sample.ics'));
  assert.equal(items.length, 19);
  for (const it of items) {
    assert.ok(it.uid && it.title && it.due, JSON.stringify(it));
    assert.match(it.url, /^https:\/\/example\.schoology\.com\//);
  }
  const ps = items.find((i) => i.uid === 'sb-sample-002@example.invalid');
  assert.equal(ps.title, 'Problem Set 4.2');
  assert.equal(ps.due, '2026-10-20T03:59:00.000Z'); // 11:59 PM EDT on Oct 19
  assert.equal(ps.kind, 'assignment');
  assert.equal(ps.desc, 'Section 4.2, problems 1-29 odd. Show your work.');
  assert.equal(ps.course, null); // Schoology feeds carry no course field
  const allDay = items.find((i) => i.title === 'Picture Day');
  assert.equal(allDay.allDay, true);
  assert.equal(allDay.due, '2026-10-23T23:59');
  assert.equal(allDay.kind, 'event');
});

test('messy feed: folding, escapes, TZID, all-day, missing fields, cancelled, VALARM', () => {
  const items = ics.parseIcs(read('./fixtures/messy.ics'));
  const by = Object.fromEntries(items.map((i) => [i.uid, i]));
  assert.equal(by['messy-1@example.invalid'].title, 'Essay, part 2; final draft \\ revisions');
  assert.equal(by['messy-1@example.invalid'].desc, 'Line one\nLine two');
  assert.equal(by['messy-1@example.invalid'].url, 'https://example.schoology.com/assignment/2000000001/info');
  assert.equal(by['messy-1@example.invalid'].due, '2026-10-21T04:59:00.000Z'); // 23:59 CDT
  assert.equal(by['messy-2@example.invalid'].allDay, true);
  assert.equal(by['messy-4@example.invalid'].due, '2026-10-22T12:00:00.000Z'); // Windows zone name
  assert.equal(by['messy-4@example.invalid'].kind, 'assessment');
  assert.equal(by['messy-5@example.invalid'], undefined, 'cancelled events are skipped');
  assert.equal(by['messy-6@example.invalid'].due, '2026-10-24T09:00'); // floating stays local
  assert.equal(by['messy-6@example.invalid'].course, 'Chemistry, Honors'); // CATEGORIES with escaped comma
  assert.equal(by['messy-7@example.invalid'].due, '2026-10-25T03:59:00.000Z'); // DUE property
  assert.equal(by['messy-7@example.invalid'].course, 'Physics A'); // repeated "(Course)" suffix
  assert.equal(by['messy-7@example.invalid'].title, 'Lab 3 write-up');
  assert.equal(by['messy-10@example.invalid'].title, 'Read pp 10-20 (pp 10-20)'); // page ranges are not courses
  assert.equal(by['messy-10@example.invalid'].desc, 'Unicode folding test café done'); // fold inside a UTF-8 char
  assert.ok(!items.some((i) => i.title === 'No date at all'));
  const gen = items.find((i) => i.title === 'Event with no UID or link');
  assert.match(gen.uid, /^gen-/);
  assert.equal(gen.url, null);
  // the alarm's DESCRIPTION must not leak into the event
  assert.ok(!items.some((i) => /Reminder/.test(i.desc)));
});

test('uids are stable across re-imports', () => {
  const a = ics.parseIcs(read('./fixtures/messy.ics')).map((i) => i.uid);
  const b = ics.parseIcs(read('./fixtures/messy.ics')).map((i) => i.uid);
  assert.deepEqual(a, b);
});

test('rejects non-calendar input', () => {
  assert.throws(() => ics.parseIcs('<html>nope</html>'), /calendar/);
});

test('parseDate edge cases', () => {
  assert.deepEqual(ics.parseDate({ params: { VALUE: 'DATE' }, value: '20261101' }), { due: '2026-11-01T23:59', allDay: true });
  assert.equal(ics.parseDate({ params: {}, value: '20261101T130000Z' }).due, '2026-11-01T13:00:00.000Z');
  // DST change: 1:30 AM on Nov 1 2026 in New York is ambiguous; just make sure it resolves
  assert.ok(ics.parseDate({ params: { TZID: 'America/New_York' }, value: '20261101T013000' }).due);
  assert.equal(ics.parseDate({ params: { TZID: 'Not/AZone' }, value: '20261101T090000' }).due, '2026-11-01T09:00');
  assert.equal(ics.parseDate({ params: {}, value: 'garbage' }), null);
});

test('splitDescription finds the Schoology link', () => {
  assert.deepEqual(ics.splitDescription('Do it - Link: https://x.schoology.com/assignment/1/info'), { text: 'Do it', link: 'https://x.schoology.com/assignment/1/info' });
  assert.deepEqual(ics.splitDescription(' - Link: https://x.schoology.com/event/1/profile'), { text: '', link: 'https://x.schoology.com/event/1/profile' });
  assert.equal(ics.splitDescription('See https://example.org/page.').link, 'https://example.org/page');
});
