// Builds test/fixtures/year.ics: a made-up, full school year (Aug 2026 - Jun 2027) shaped like a
// real Schoology feed, plus year-expected.json: what every item should become in America/New_York.
// The expected values are computed here, independently of the app's parser.
//   node test/fixtures/make-year-feed.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const ZONE = 'America/New_York';

// ---- tiny deterministic helpers ----
let seed = 20260824;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const p2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
const iso = (d) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const day = (s) => new Date(s + 'T00:00:00Z'); // a calendar date, carried as UTC midnight
const add = (d, n) => new Date(d.getTime() + n * 864e5);
// wall time in a zone -> UTC instant (independent of the app: brute-force offset search)
function wallToUtc(dateStr, hh, mm, zone) {
  const target = Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10), hh, mm);
  for (let off = -14 * 60; off <= 14 * 60; off += 15) {
    const t = target - off * 60000;
    if (localParts(t, zone).wall === target) return t;
  }
  throw new Error('no offset');
}
function localParts(t, zone) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const o = {}; f.formatToParts(new Date(t)).forEach((x) => (o[x.type] = x.value));
  return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour}:${o.minute}`, wall: Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute) };
}
const zstamp = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
function fold(line) { // 75-octet folding that may split inside a multi-byte character, like real feeds do
  const b = Buffer.from(line, 'utf8'); if (b.length <= 75) return [b.toString('latin1')];
  const parts = []; let i = 0, first = true;
  while (i < b.length) { const n = first ? 75 : 74; parts.push((first ? '' : ' ') + b.subarray(i, i + n).toString('latin1')); i += n; first = false; }
  return parts;
}

// ---- the school year ----
const START = day('2026-08-24'), END = day('2027-06-04');
const OFF = new Set();
const offRange = (a, b) => { for (let d = day(a); d <= day(b); d = add(d, 1)) OFF.add(iso(d)); };
offRange('2026-11-23', '2026-11-27'); offRange('2026-12-21', '2027-01-01'); offRange('2027-03-22', '2027-03-26');
const schoolDays = []; for (let d = START; d <= END; d = add(d, 1)) { const w = d.getUTCDay(); if (w >= 1 && w <= 5 && !OFF.has(iso(d))) schoolDays.push(d); }

const events = [], expected = [];
let nid = 7000000;
const link = (kind) => `https://example.schoology.com/${kind}/${nid++}`;
// timing modes for an assignment due at 11:59 PM Eastern on date d
function dueProps(d, mode) {
  const ds = iso(d);
  if (mode === 'Z') { const t = wallToUtc(ds, 23, 59, ZONE); return { lines: [`DTSTART:${zstamp(t)}`], t }; }
  if (mode === 'CHI') { const t = wallToUtc(ds, 22, 59, 'America/Chicago'); return { lines: [`DTSTART;TZID=America/Chicago:${ymd(d)}T225900`], t }; }
  if (mode === 'LA') { const t = wallToUtc(ds, 21, 0, 'America/Los_Angeles'); return { lines: [`DTSTART;TZID=America/Los_Angeles:${ymd(d)}T210000`], t }; } // = midnight Eastern, next day
  if (mode === 'FLOAT') { const t = wallToUtc(ds, 23, 59, ZONE); return { lines: [`DTSTART:${ymd(d)}T235900`], t }; }
  throw new Error(mode);
}
function addItem({ title, cls, when, url, desc, extra = [], uid, expect = true }) {
  uid = uid || `sb-year-${String(events.length + 1).padStart(4, '0')}@example.invalid`;
  const lines = ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTAMP:20260801T120000Z', ...when.lines, `SUMMARY:${esc(title)}`];
  if (url) lines.push(`URL;VALUE=URI:${url}`);
  lines.push(`DESCRIPTION:${esc((desc || '') + (url ? ` - Link: ${url}` : ''))}`);
  lines.push(...extra, 'END:VEVENT');
  events.push(lines);
  if (expect) {
    if (when.allDay) expected.push({ uid, title, date: when.allDay, time: '23:59', allDay: true, cls, proctor: /\bproctor/i.test(title) });
    else { const lp = localParts(when.t, ZONE); expected.push({ uid, title, date: lp.date, time: lp.time, allDay: false, cls, proctor: /\bproctor/i.test(title) }); }
  }
  return uid;
}
const allDay = (dateStr, bare) => ({ lines: [bare ? `DTSTART:${dateStr.replace(/-/g, '')}` : `DTSTART;VALUE=DATE:${dateStr.replace(/-/g, '')}`], allDay: dateStr });

// ---- classes (title prefixes, no course field: just like Schoology) ----
let alg = 1, algQ = 1, spQ = 1, spEx = 1, chem = 1, omni = 1, wr = 1, fri = 0;
const DESCS = ['Show all work, then upload a photo.', 'Use the "notes" template; cite page numbers, please.', 'Read §2.3 — answer 1–12 (odds).', 'Café-style seminar prep: bring 2 questions, 1 quote.'];
for (const d of schoolDays) {
  const w = d.getUTCDay();
  const missing = rnd() < 0.08; // some items come without any link
  if (w >= 1 && w <= 4) addItem({ title: `ALG2 Homework ${alg++}`, cls: 'ALG2', when: dueProps(d, 'Z'), url: missing ? null : link('assignment'), desc: DESCS[alg % 4] });
  if (w === 5 && (fri++ % 2 === 0)) addItem({ title: `ALG2 Quiz ${algQ++}`, cls: 'ALG2', when: dueProps(d, 'CHI'), url: link('assessment') });
  if (w === 1 || w === 5) addItem({ title: `Spanish I Quiz ${spQ++}`, cls: 'Spanish I', when: dueProps(d, 'Z'), url: link('assignment') });
  if (w === 3) addItem({ title: `Spanish 1 Activities (3rd ed.) Exercise 03-${p2(spEx++)}`, cls: 'Spanish I', when: dueProps(d, 'FLOAT'), url: link('assignment') });
  if (w === 2) { const n = chem++; addItem({ title: `Apologia Chem - Module ${p2(Math.ceil(n / 2))} ${n % 2 ? 'Quiz' : 'Lab'}`, cls: 'Apologia Chem', when: dueProps(d, 'CHI'), url: link(n % 2 ? 'assessment' : 'assignment') }); }
  if (w === 1 || w === 3) addItem({ title: `Omnibus Primary HW Upload Day ${omni++}`, cls: 'Omnibus Primary', when: dueProps(d, 'Z'), url: link('assignment'), desc: DESCS[omni % 4] });
  if (w === 4) addItem({ title: `Writing Assignment (Writing Process): Resume, Cover Letter; Job Call #${wr++}`, cls: 'Writing', when: dueProps(d, 'LA'), url: link('assignment') });
}
// proctored tests: DTSTART is the class period, DUE is the real deadline the next day
['2026-09-17', '2026-11-12', '2027-02-11', '2027-04-29'].forEach((ds, i) => {
  const due = add(day(ds), 1), t = wallToUtc(iso(due), 23, 59, ZONE);
  addItem({ title: `Apologia Chem - Module ${p2(4 * i + 4)} Test (proctored)`, cls: 'Apologia Chem', url: link('assessment'),
    when: { lines: [`DTSTART;TZID=America/New_York:${ds.replace(/-/g, '')}T080000`, `DUE:${zstamp(t)}`], t } });
});
['One', 'Two', 'Three', 'Four', 'Five'].forEach((w, i) => addItem({ title: `Presentation ${w}`, cls: 'Unsorted', when: dueProps(day(['2026-10-09', '2026-12-11', '2027-02-12', '2027-04-16', '2027-05-21'][i]), 'Z'), url: link('assignment') }));

// ---- school events with audience tags (never classes) ----
const ev = (title, when, extra = [], o = {}) => addItem({ title, cls: 'Unsorted', when, url: o.noUrl ? null : link('event'), extra, ...o });
ev('Orientation (first week only)', { lines: ['DTSTART;TZID=America/New_York:20260824T080000', 'DTEND;TZID=America/New_York:20260824T120000'], t: wallToUtc('2026-08-24', 8, 0, ZONE) });
ev('Parent Night (new parents and students)', { lines: ['DTSTART;TZID=America/New_York:20260910T190000'], t: wallToUtc('2026-09-10', 19, 0, ZONE) });
ev('Picture Day (Grades K-6)', allDay('2026-09-15'));
ev('Picture Retakes (Grades K-6)', allDay('2026-11-03', true)); // bare 8-digit DTSTART without VALUE=DATE
ev('Thanksgiving Break (including Omnibus)', { ...allDay('2026-11-23'), lines: ['DTSTART;VALUE=DATE:20261123', 'DTEND;VALUE=DATE:20261128'] });
ev('Winter Break (Grades 7-12)', { ...allDay('2026-12-21'), lines: ['DTSTART;VALUE=DATE:20261221', 'DTEND;VALUE=DATE:20270102'] });
ev('Spring Break (Grades K-6)', { ...allDay('2027-03-22'), lines: ['DTSTART;VALUE=DATE:20270322', 'DTEND;VALUE=DATE:20270327'] });
ev('Senior Retreat (this week only)', { lines: ['DTSTART;TZID=America/New_York:20270415T080000', 'DTEND;TZID=America/New_York:20270417T150000'], t: wallToUtc('2027-04-15', 8, 0, ZONE) });
ev('Field Day (FT Students)', { lines: ['DTSTART:20270521T130000Z'], t: Date.parse('2027-05-21T13:00:00Z') }, ['CATEGORIES:FT Students']);
ev('Assembly moved (FT Students Only)', { lines: ['DTSTART:20270210T150000Z'], t: Date.parse('2027-02-10T15:00:00Z') }, ['STATUS:CANCELLED'], { expect: false });
// lunch duty: single events every other Tuesday, CATEGORIES audience tag, one with a nested alarm
schoolDays.filter((d) => d.getUTCDay() === 2).forEach((d, i) => {
  if (i % 2) return;
  const t = wallToUtc(iso(d), 12, 0, ZONE);
  ev('Lunch Duty (FT Students Only)', { lines: [`DTSTART:${zstamp(t)}`], t }, i === 4 ? ['CATEGORIES:FT Students Only', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM'] : ['CATEGORIES:FT Students Only']);
});

// ---- recurring events ----
// Chapel: weekly on Wednesdays, skipped on breaks via EXDATE; one occurrence moved by a RECURRENCE-ID.
{
  const uid = 'sb-year-chapel@example.invalid', ex = ['20261125', '20261223', '20261230', '20270324'];
  const lines = ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTART;TZID=America/New_York:20260826T100000', 'DTEND;TZID=America/New_York:20260826T104500',
    'RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20270602T235959Z', ...ex.map((x) => `EXDATE;TZID=America/New_York:${x}T100000`),
    'SUMMARY:Chapel (Grades 7-12)', `URL;VALUE=URI:${link('event')}`, 'CATEGORIES:Grades 7-12', 'END:VEVENT'];
  events.push(lines);
  for (let d = day('2026-08-26'); d <= day('2027-06-02'); d = add(d, 7)) {
    if (ex.includes(ymd(d))) continue;
    if (ymd(d) === '20270210') { expected.push({ uid: uid + '#20270210', title: 'Chapel (Grades 7-12) - moved', date: '2027-02-11', time: '09:00', allDay: false, cls: 'Unsorted', proctor: false }); continue; }
    expected.push({ uid: uid + '#' + ymd(d), title: 'Chapel (Grades 7-12)', date: iso(d), time: '10:00', allDay: false, cls: 'Unsorted', proctor: false });
  }
  events.push(['BEGIN:VEVENT', `UID:${uid}`, 'RECURRENCE-ID;TZID=America/New_York:20270210T100000', 'DTSTART;TZID=America/New_York:20270211T090000', 'SUMMARY:Chapel (Grades 7-12) - moved', 'END:VEVENT']);
}
// Advisory: every other Friday, floating 1 PM, 12 times
{
  const uid = 'sb-year-advisory@example.invalid';
  events.push(['BEGIN:VEVENT', `UID:${uid}`, 'DTSTART:20260904T130000', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;COUNT=12', 'SUMMARY:Advisory (FT Students)', 'END:VEVENT']);
  for (let i = 0, d = day('2026-09-04'); i < 12; i++, d = add(d, 14)) expected.push({ uid: uid + '#' + ymd(d), title: 'Advisory (FT Students)', date: iso(d), time: '13:00', allDay: false, cls: 'Unsorted', proctor: false });
}
// Spirit week: all-day, daily x5
{
  const uid = 'sb-year-spirit@example.invalid';
  events.push(['BEGIN:VEVENT', `UID:${uid}`, 'DTSTART;VALUE=DATE:20261005', 'DTEND;VALUE=DATE:20261006', 'RRULE:FREQ=DAILY;COUNT=5', 'SUMMARY:Spirit Week (FT Students Only)', `URL;VALUE=URI:${link('event')}`, 'END:VEVENT']);
  for (let i = 0; i < 5; i++) { const d = add(day('2026-10-05'), i); expected.push({ uid: uid + '#' + ymd(d), title: 'Spirit Week (FT Students Only)', date: iso(d), time: '23:59', allDay: true, cls: 'Unsorted', proctor: false }); }
}
// ---- exact duplicates (feeds sometimes repeat a VEVENT) ----
const dupSource = events.filter((e) => e[1].startsWith('UID:sb-year-0')).filter((_, i) => i % 41 === 7).slice(0, 12);
dupSource.forEach((e) => events.push(e.slice()));

const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Schoology Board//Synthetic school year (fake data)//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Example Student (fake)'];
events.forEach((e) => e.forEach((l) => out.push(...fold(l))));
out.push('END:VCALENDAR');
writeFileSync(join(here, 'year.ics'), Buffer.from(out.join('\r\n') + '\r\n', 'latin1'));
writeFileSync(join(here, 'year-expected.json'), JSON.stringify({ zone: ZONE, count: expected.length, duplicatesInFeed: dupSource.length, items: expected }, null, 1));
console.log(`year.ics: ${events.length} VEVENTs (${dupSource.length} exact duplicates, 1 cancelled, 3 recurring series + 1 override) -> ${expected.length} expected items`);
