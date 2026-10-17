// Builds test/fixtures/sample-cas.pdf: a made-up Course Assignment Sheet laid out
// like a typical CAS (Day | Class Dates | Daily Learning Objectives | Assignments),
// with rows that run onto a second page. Fake class, fake tasks.
// Run: node test/fixtures/make-cas-pdf.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const B = '\u274F';
const rows = [
  [1, 'Mon 10/19/2026', ['Angles formed by parallel lines and a transversal', 'Why congruence matters in design'],
    ['READ: Lesson 4.1, pp 180-188.', 'SUBMIT: Problem Set 4.2. Due Monday 10/19/2026 at 11:59 pm ET.']],
  [2, 'Wed 10/21/2026', ['Triangle congruence: SSS and SAS'],
    ['READ: Lesson 4.2, pp 189-197.', 'SUBMIT: Problem Set 4.3. Due Wednesday 10/21/2026 at 11:59 pm ET.', 'COMPLETE: Vocabulary flashcards for chapter 4.']],
  [3, 'Fri 10/23/2026', ['Triangle congruence: ASA and AAS', 'Writing two-column proofs', 'Reading a proof backwards to plan it'],
    ['UPLOAD: Two-Column Proof Practice. Due Friday 10/23/2026 by 11:59 pm ET.', 'SUBMIT: Geometry Chapter 4 Quiz. Due Saturday 10/24/26 at 12:00 pm ET.', 'Discuss the quiz review together in class.']],
  [4, 'Mon 10/26/2026', ['CPCTC and overlapping triangles', 'Isosceles and equilateral triangles'],
    ['READ: Lesson 4.4, pp 205-214.', 'SUBMIT: Problem Set 4.4 (by midnight the evening prior to class)']],
  [5, 'Wed 10/28/2026', ['Review of chapter 4', 'Strategies for multi-step proofs and for checking each other\u2019s reasoning', 'Using congruence in real-world measuring problems', 'Preparing for the chapter test'],
    ['COMPLETE: Chapter 4 review, pp 220-222, questions 1-24.', 'Begin studying for the Chapter 4 test.']],
  [6, 'Fri 10/30/2026', ['Chapter 4 assessment'],
    ['SUBMIT: Chapter 4 Test. Due Saturday 10/31/2026 at 12:00 pm ET.', 'REFLECT: Write three sentences about what helped you most this unit.']],
];
const cell = (items) => items.map((t) => `<div class="b"><span>${B}</span><span>${t}</span></div>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: letter landscape; margin: 0.5in 0.5in 0.6in; }
body { font: 10pt Arial, Helvetica, sans-serif; color: #000; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #555; padding: 6px; vertical-align: top; text-align: left; }
th { font-weight: bold; vertical-align: bottom; }
td.c { vertical-align: middle; text-align: center; }
.b { display: flex; gap: 6px; margin-bottom: 4px; } .b span:first-child { width: 12px; flex: none; }
tr { break-inside: auto; }
.footer { position: fixed; bottom: -0.35in; left: 0; right: 0; text-align: center; font-size: 10pt; }
.top td { border: 1px solid #555; font-weight: bold; }
</style></head><body>
<div class="footer">2026-2027 Academic Year</div>
<table class="top"><tr><td>Example Academy Course Assignment Sheet<br><br>Course Name: Geometry</td></tr><tr><td>Quarter 2</td></tr></table>
<table><tr><td colspan="4" style="text-align:center"><b style="font-size:12pt">Orientation</b><br>Mon/Wed/Fri - Monday, Oct 12 at regular class time</td></tr>
<tr><th style="width:4%">Day</th><th style="width:12%">Class Dates</th><th style="width:18%">Daily Learning Objectives<br>Students will learn:</th><th>All assignments due by the start of class unless otherwise indicated.</th></tr>
${rows.map(([d, date, obj, tasks]) => `<tr><td class="c">${d}</td><td class="c">${date}</td><td>${cell(obj)}</td><td>${cell(tasks)}</td></tr>`).join('')}
</table>
<div style="margin-top:24px"><b>KEY</b><br>READ: Read before class.<br>SUBMIT: Submit in Schoology.<br>UPLOAD: Complete outside Schoology, then upload.</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
await page.pdf({ path: join(here, 'sample-cas.pdf'), format: 'Letter', landscape: true, printBackground: true, displayHeaderFooter: false, margin: { top: '0.5in', bottom: '0.6in', left: '0.5in', right: '0.5in' } });
await browser.close();
console.log('wrote', join(here, 'sample-cas.pdf'));
