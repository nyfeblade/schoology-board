import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const w = require('../public/board/wedge.js');

test('columns: missing defs become the four built-in lists, Completed stays the done kind', () => {
  const d = w.migrateColumns({}).columns;
  assert.deepEqual(d.map((c) => c.id), ['todo', 'started', 'proctor', 'done']);
  assert.equal(d[3].kind, 'done');
  assert.equal(d[0].kind, 'active');
  assert.deepEqual(w.migrateColumns({ columns: [] }).columns.map((c) => c.id), d.map((c) => c.id));
  assert.deepEqual(w.visibleColumns(d, false).map((c) => c.id), ['todo', 'started', 'done']);
  assert.deepEqual(w.visibleColumns(d, true).map((c) => c.id), ['todo', 'started', 'proctor', 'done']);
});

test('columns: sanitize keeps todo and done, drops bad ids, and only Completed is done', () => {
  const cols = w.sanitizeColumns([
    { id: 'done', name: 'Finished', kind: 'active' },
    { id: 'bad id', name: 'Nope' },
    { id: 'c1', name: '  Lab  ', kind: 'done' },
    { id: 'c1', name: 'Dupe' },
    { id: 'started', name: '' }
  ]);
  assert.deepEqual(cols.map((c) => [c.id, c.name, c.kind]), [
    ['todo', 'Need to be done', 'active'],
    ['done', 'Finished', 'done'],
    ['c1', 'Lab', 'active'],
    ['started', 'Started', 'active']
  ]);
});

test('columns: add, rename, reorder, and delete migrate cards to Need to be done', () => {
  let cols = w.defaultColumns();
  cols = w.addColumn(cols, 'Waiting');
  assert.deepEqual(cols.map((c) => c.id), ['todo', 'started', 'proctor', 'c1', 'done']);
  assert.equal(cols[3].name, 'Waiting');
  const renamed = w.renameColumn(cols, 'c1', 'Later');
  assert.equal(renamed.ok, true);
  assert.equal(renamed.columns[3].name, 'Later');
  assert.equal(w.renameColumn(cols, 'c1', '   ').ok, false);
  const moved = w.reorderVisible(renamed.columns, false, 'c1', -1);
  assert.deepEqual(w.visibleColumns(moved, false).map((c) => c.id), ['todo', 'c1', 'started', 'done']);
  assert.ok(moved.some((c) => c.id === 'proctor'), 'hidden proctor column is kept');
  const status = { a: 'c1', b: 'started', c: 'done' };
  const del = w.deleteColumn(moved, status, 'c1');
  assert.equal(del.ok, true);
  assert.equal(del.moved, 1);
  assert.equal(del.status.a, 'todo');
  assert.equal(status.a, 'c1');
  assert.equal(del.status.b, 'started');
  assert.equal(w.deleteColumn(del.columns, del.status, 'todo').error, 'home');
  assert.equal(w.deleteColumn(del.columns, del.status, 'done').error, 'done');
  const back = w.ensureProctor(del.columns.filter((c) => c.id !== 'proctor'), true);
  assert.equal(back.filter((c) => c.id === 'proctor').length, 1);
  assert.equal(back[back.length - 1].id, 'done');
  assert.equal(w.columnsForMove(w.defaultColumns()), null);
  assert.ok(w.columnsForMove(renamed.columns));
});

test('columns: merge keeps current order and lets incoming names win', () => {
  const cur = w.addColumn(w.defaultColumns(), 'Mine');
  const inc = w.renameColumn(w.defaultColumns(), 'started', 'Doing').columns;
  const merged = w.mergeColumns(cur, inc);
  assert.equal(merged.find((c) => c.id === 'started').name, 'Doing');
  assert.ok(merged.some((c) => c.id === 'c1' && c.name === 'Mine'));
  assert.equal(merged[merged.length - 1].kind, 'done');
  assert.deepEqual(w.mergeColumns(cur, null).map((c) => c.id), cur.map((c) => c.id));
});

test('todo lists: markers stripped, checked lines done, trailing dates only when safe', () => {
  const tasks = w.parseTodos([
    '# Shopping',
    '',
    '- [ ] Buy milk',
    '- [x] Eggs 2026-10-26',
    '* [ ] Read chapter 3',
    '1. Chapter outline Oct 26, 2026',
    '2) Lab report 2/28/2026',
    '+ Call home',
    '• Pack bag',
    '[X] Caps lock',
    'Meet at 3',
    'Pay rent 2026-13-01',
    'Short year 1/2/26',
    '2026-01-01',
    'Notes about 2026-01-01 meeting',
    'Essay October 26th, 2026'
  ].join('\n'));
  assert.deepEqual(tasks.map((t) => [t.title, t.done, t.due]), [
    ['Buy milk', false, null],
    ['Eggs', true, '2026-10-26'],
    ['Read chapter 3', false, null],
    ['Chapter outline', false, '2026-10-26'],
    ['Lab report', false, '2026-02-28'],
    ['Call home', false, null],
    ['Pack bag', false, null],
    ['Caps lock', true, null],
    ['Meet at 3', false, null],
    ['Pay rent 2026-13-01', false, null],
    ['Short year 1/2/26', false, null],
    ['Notes about 2026-01-01 meeting', false, null],
    ['Essay', false, '2026-10-26']
  ]);
});

test('host kind for on-screen wording: Schoology, other calendars, and unknown hosts', () => {
  assert.equal(w.hostKind('https://app.schoology.com/calendar/feed/ical/1/x/ical.ics'), 'schoology');
  assert.equal(w.hostKind('webcal://calendar.google.com/calendar/ical/x/basic.ics'), 'calendar');
  assert.equal(w.hostKind('https://outlook.office365.com/calendar/published/x.ics'), 'calendar');
  assert.equal(w.hostKind('https://calendar.icloud.com/published/2/abc'), 'calendar');
  assert.equal(w.hostKind('https://feed.example.invalid/calendar/sample.ics'), 'other');
  assert.equal(w.hostKind('https://schoology.com.evil.example/a.ics'), 'other');
  assert.equal(w.hostKind(''), 'other');
});
