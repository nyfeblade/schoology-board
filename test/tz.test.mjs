// Time zones: Tonight works in the student's own wall-clock time, across DST changes and in any zone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
// Runs one planning scenario in a child process with its own TZ and returns wall-clock results.
function run(tz, scenario) {
  const code = `
    const P = require(${JSON.stringify(here + '../public/board/plan.js')});
    const L = (s) => { const [d, t] = s.split('T'); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(y, m - 1, dd, h, mi); };
    const fmt = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const sc = ${JSON.stringify(scenario)};
    const ctx = { est: {}, ttype: {}, actual: {}, sdone: {}, timer: null, isWork: () => true };
    const items = sc.items.map((it, i) => ({ id: 'i' + i, title: it[0], course: 'Biology', d: L(it[1]), kind: 'assignment', source: 'ics', col: 'todo', pre: false }));
    const p = P.tonight(items, ctx, L(sc.now), {});
    process.stdout.write(JSON.stringify({ wEnd: fmt(p.windowEnd), start: fmt(p.start), tasks: p.tasks.map((t) => t.kind + ':' + t.item.title + ':' + t.min + (t.overdue ? ':late' : '')), blocks: p.blocks.map((b) => fmt(b.start) + '-' + fmt(b.end)) }));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: tz } }).toString());
}
const ZONES = ['America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Pacific/Honolulu', 'Europe/London', 'UTC', 'Asia/Kolkata'];

test('same wall-clock evening gives the same Tonight in every zone', () => {
  const sc = { now: '2026-10-20T16:30', items: [['Problem Set 4.2', '2026-10-20T23:59'], ['Lab Report', '2026-10-21T08:00'], ['Old worksheet', '2026-10-19T23:59'], ['Unit 3 Test', '2026-10-22T09:00'], ['Next week essay', '2026-10-27T23:59']] };
  const ref = run('America/New_York', sc);
  assert.equal(ref.wEnd, '2026-10-22T00:00');
  for (const z of ZONES) assert.deepEqual(run(z, sc), ref, z);
});

test('DST ends (Sun Nov 1 2026): window, start time and blocks stay on wall-clock time', () => {
  const sc = { now: '2026-11-01T18:00', items: [['Problem Set', '2026-11-02T23:59'], ['Essay', '2026-11-02T08:00'], ['Quiz 5', '2026-11-03T09:00']] };
  const r = run('America/New_York', sc);
  assert.equal(r.wEnd, '2026-11-03T00:00', 'Monday is the next school day; the window ends at Tuesday midnight local');
  assert.equal(r.start, '2026-11-01T18:00');
  assert.ok(r.tasks.some((t) => t.startsWith('study:Quiz 5')), 'study night for the Tuesday quiz is tonight');
  assert.equal(r.blocks[0], '2026-11-01T18:00-2026-11-01T19:00', 'Essay (due first, 60 min) is a real 60 minutes on the night the clocks change');
  for (const z of ['America/Los_Angeles', 'Europe/London']) assert.deepEqual(run(z, sc), r, z);
});

test('DST starts (Sun Mar 14 2027): no lost or doubled hour in the plan', () => {
  const sc = { now: '2027-03-14T19:00', items: [['Problem Set', '2027-03-15T23:59'], ['Reading ch. 4', '2027-03-15T08:00']] };
  const r = run('America/New_York', sc);
  assert.equal(r.wEnd, '2027-03-16T00:00');
  assert.equal(r.blocks[0], '2027-03-14T19:00-2027-03-14T19:30', 'Reading (due first, 30 min)');
  assert.deepEqual(run('America/Chicago', sc), r);
});

test('Friday evening: the window runs through Monday, in a zone without DST too', () => {
  const sc = { now: '2026-10-23T17:00', items: [['Weekend reading', '2026-10-26T08:00'], ['Monday set', '2026-10-26T23:59'], ['Tuesday set', '2026-10-27T23:59']] };
  const r = run('Pacific/Honolulu', sc);
  assert.equal(r.wEnd, '2026-10-27T00:00');
  assert.deepEqual(r.tasks.map((t) => t.split(':')[1]), ['Weekend reading', 'Monday set']);
  assert.deepEqual(run('Asia/Kolkata', sc), r);
});
