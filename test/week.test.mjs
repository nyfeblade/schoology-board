// The default Week view: Mon-Sun, switching to the coming week from Friday 6 PM local time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ics = require('../public/board/ics.js');
const at = (s) => new Date(s); // TZ=America/New_York (npm test sets it)
const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('weekdays open on the current Monday-Sunday', () => {
  for (const s of ['2026-10-19T00:00', '2026-10-21T10:00', '2026-10-23T17:59']) {
    assert.equal(ics.weekendMode(at(s)), false, s);
    assert.equal(day(ics.defaultWeekStart(at(s))), '2026-10-19', s);
  }
});
test('Friday 6 PM through Sunday opens on next week', () => {
  for (const s of ['2026-10-23T18:00', '2026-10-23T19:00', '2026-10-24T09:00', '2026-10-25T23:59']) {
    assert.equal(ics.weekendMode(at(s)), true, s);
    assert.equal(day(ics.defaultWeekStart(at(s))), '2026-10-26', s);
  }
});
test('Monday midnight is back to normal; DST change weekend is fine', () => {
  assert.equal(day(ics.defaultWeekStart(at('2026-10-26T00:00'))), '2026-10-26');
  assert.equal(day(ics.defaultWeekStart(at('2026-10-31T12:00'))), '2026-11-02'); // DST ends Nov 1
  assert.equal(ics.defaultWeekStart(at('2026-10-31T12:00')).getHours(), 0);
});
