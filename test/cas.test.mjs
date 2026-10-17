import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createRequire } from 'node:module';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
const require = createRequire(import.meta.url);
const cas = require('../public/board/cas.js');

async function parsePdf(path) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
  return cas.parseCas(await cas.pagesFromPdf(doc), { fileName: basename(path) });
}

test('synthetic CAS fixture: course, rows, tasks, due dates, kinds', async () => {
  const r = await parsePdf(new URL('./fixtures/sample-cas.pdf', import.meta.url).pathname);
  assert.equal(r.course, 'Geometry');
  assert.deepEqual(r.rows.map((x) => x.date), ['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26', '2026-10-28', '2026-10-30']);
  assert.equal(r.items.length, 14);
  const t = (s) => r.items.find((i) => i.title.includes(s));
  assert.equal(t('Problem Set 4.2').due, '2026-10-19T23:59');
  assert.equal(t('Problem Set 4.2').explicitDue, true);
  assert.equal(t('Lesson 4.1').kind, 'read');
  assert.equal(t('Lesson 4.1').due, '2026-10-19T08:00'); // start of class by default
  assert.equal(t('Chapter 4 Quiz').due, '2026-10-24T12:00'); // 2-digit year
  assert.equal(t('Problem Set 4.4').due, '2026-10-25T23:59'); // "midnight the evening prior"
  assert.equal(t('quiz review').kind, 'class');
  assert.equal(t('quiz review').selected, false);
  assert.equal(t('Begin studying').kind, 'do');
  assert.equal(t('Chapter 4 Test').classDate, '2026-10-30'); // row on page 2
  assert.equal(t('Reflect').classDate, '2026-10-30');
  // Learning objectives never become tasks
  assert.ok(!r.items.some((i) => /congruence|Angles formed/i.test(i.title)));
  // ids are stable
  const again = await parsePdf(new URL('./fixtures/sample-cas.pdf', import.meta.url).pathname);
  assert.deepEqual(again.items.map((i) => i.id), r.items.map((i) => i.id));
});

test('due-date extraction handles messy teacher phrasing', () => {
  const d = (s, c = '2026-09-10') => (cas.extractDue(s, c) || {}).due;
  assert.equal(d('Submit: Quiz 1. Due Saturday 09/12/26 at 12:00 pm ET.'), '2026-09-12T12:00');
  assert.equal(d('Submit Module 1 Test. Due Saturday, 09/19/2026 at 11: 55 pm ET.'), '2026-09-19T23:55');
  assert.equal(d('SUBMIT Ch. 1, Ex. 3 Friday 9/11/2026 by 11:59 ET'), '2026-09-11T23:59');
  assert.equal(d('SUBMIT: Quiz Chapter 1. Due Friday 9/25/20256 at 11:55 PM.', '2026-09-23'), '2026-09-25T23:55'); // typo year
  assert.equal(d('Submit your response on Saturday September 12 2026 by 11.59 PM EST'), '2026-09-12T23:59');
  assert.equal(d('upload their analysis by Friday October 23, 2026'), '2026-10-23T23:59');
  assert.equal(d('Upload Academic Integrity Statement by 9/22/26, 11:59PM'), '2026-09-22T23:59');
  assert.equal(d('SUBMIT Chapter 1 Reading Quiz (by midnight the evening prior to class)', '2026-09-08'), '2026-09-07T23:59');
  assert.equal(d('Read chapter 2'), undefined);
});

// Optional: run against real CAS PDFs you keep locally (never commit them).
//   CAS_SAMPLES_DIR=~/Downloads npm test
const dir = process.env.CAS_SAMPLES_DIR;
if (dir && existsSync(dir)) {
  test('local real CAS samples parse (counts only)', async () => {
    const files = readdirSync(dir).filter((f) => /\.pdf$/i.test(f) && /assignment sheet/i.test(f.replace(/[+_]/g, ' ')));
    assert.ok(files.length, 'no CAS PDFs found in CAS_SAMPLES_DIR');
    for (const f of files) {
      const r = await parsePdf(join(dir, f));
      console.log(`  ${r.course}: ${r.rows.length} class days, ${r.items.length} tasks${r.warnings.length ? ' ' + r.warnings.join('; ') : ''}`);
      assert.ok(r.rows.length > 0 && r.items.length > 0, f);
    }
  });
}
