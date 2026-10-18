// End-to-end check in headless Chromium.
//   BASE_URL=https://your-deploy.vercel.app SHOTS=./shots node test/e2e.mjs
// Covers: first run, sample board, .ics import + re-import, drag/keyboard/double-click,
// custom categories + tasks, CAS PDF preview + dedupe, backup opened from file://,
// a 517-item year frozen at several moments (creation day, weekday, Friday 5/7 PM, Sunday),
// class naming, optional proctor column, migrations, refresh on open with a stub relay.
import { chromium } from 'playwright';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SHOTS = resolve(process.env.SHOTS || join(here, '..', 'test-results'));
const LIVE_LINK = process.env.LIVE_LINK !== '0' && !/localhost|127\.0\.0\.1/.test(BASE);
mkdirSync(SHOTS, { recursive: true });
const ICS = join(here, '..', 'public', 'sample', 'schoology-sample.ics');
const CASPDF = join(here, 'fixtures', 'sample-cas.pdf');
const results = [];
const YEAR = join(here, 'fixtures', 'year.ics');
const YEAR_EXP = JSON.parse(readFileSync(join(here, 'fixtures', 'year-expected.json'), 'utf8'));
if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'America/New_York') { console.error('Run with TZ=America/New_York (npm run test:e2e does).'); process.exit(2); }
// A fixed "now" keeps the run deterministic: early Monday of the sample week.
const NOW = new Date('2026-10-19T07:00:00-04:00');
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond, extra }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

const browser = await chromium.launch();
const errors = [];
function watch(page, tag) {
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !(tag === 'link' && /status of 422/.test(m.text())) && !(tag === 'refresh' && /status of 502/.test(m.text()))) errors.push(`${tag} console: ${m.text()}`); }); // the 422 is the deliberate bad-link probe
  page.on('dialog', (d) => d.accept());
}
const state = (page) => page.evaluate(() => window.SchoologyBoard.state());
const more = async (page, id) => { await page.click('#sb-more'); await page.click(id); };
const newCtx = async (opts = {}) => { const c = await browser.newContext({ timezoneId: 'America/New_York', acceptDownloads: true, viewport: { width: 1440, height: 900 }, ...opts }); await c.clock.setFixedTime(opts.now || NOW); return c; };
const cardByTitle = (page, t) => page.locator('.card', { hasText: t }).first();
// The "Name your classes" step opens after a user import; skip it when a test isn't about it.
const skipNaming = async (page, wait = 1200) => { try { await page.waitForSelector('dialog.naming', { timeout: wait }); await page.click('#nm-skip'); await page.waitForTimeout(150); return true; } catch { return false; } };
const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
async function dragTo(page, card, col) {
  const a = await card.boundingBox(), b = await page.locator(`.col[data-col="${col}"]`).boundingBox();
  await page.mouse.move(a.x + 30, a.y + 12);
  await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y + 30, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + 80, { steps: 12 });
  await page.mouse.up();
}
async function noCyan(page) {
  return page.evaluate(() => {
    const bad = [];
    const hue = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 0.08) return null;
      let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return { h, s: d / mx }; };
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      for (const p of ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor', 'outlineColor', 'fill', 'stroke']) {
        const m = (cs[p] || '').match(/rgba?\((\d+), (\d+), (\d+)/); if (!m) continue;
        const v = hue(+m[1], +m[2], +m[3]); if (v && v.h >= 150 && v.h <= 210 && v.s > 0.2) bad.push(`${el.tagName}.${el.className} ${p} ${cs[p]}`);
      }
    }
    return bad;
  });
}

// ---------- 1. first run + sample board ----------
let ctx = await newCtx();
let page = await ctx.newPage(); watch(page, 'web');
const resp = await page.goto(BASE + '/', { waitUntil: 'networkidle' });
ok('home page returns 200', resp.status() === 200, `status ${resp.status()}`);
await page.waitForSelector('#imp-url');
ok('first-run screen shows link box, drop zone and sample button', await page.locator('#imp-drop').isVisible() && await page.locator('#imp-sample').isVisible());
await page.screenshot({ path: join(SHOTS, 'first-run.png') });
await page.click('#imp-sample');
await page.waitForSelector('#sb-board .card');
await page.waitForTimeout(3500); // let the import toast fade for the screenshot
const sampleCount = await page.locator('#sb-board .card').count();
ok('sample board renders cards', sampleCount > 5, `${sampleCount} cards in view`);
ok('four columns with the right names', (await page.locator('.col h2').allInnerTexts()).map((t) => t.split('\n')[0].trim()).join('|').toLowerCase() === 'need to be done|started|needs to be proctored|completed');
ok('to-do grouped by class then date', await page.locator('.col[data-col="todo"] .cls').count() >= 3 && await page.locator('.col[data-col="todo"] .day').count() >= 3);
await page.screenshot({ path: join(SHOTS, 'board-sample.png') });
await page.screenshot({ path: join(SHOTS, 'board-sample-full.png'), fullPage: true });
const cyan1 = await noCyan(page);
ok('no cyan/teal colors on the board', cyan1.length === 0, cyan1.slice(0, 3).join('; '));
// mobile width
const mctx = await newCtx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mpage = await mctx.newPage(); watch(mpage, 'mobile');
await mpage.goto(BASE + '/'); await mpage.click('#imp-sample'); await mpage.waitForSelector('#sb-board .card'); await mpage.waitForTimeout(3500);
await mpage.screenshot({ path: join(SHOTS, 'mobile-board.png') });
// touch drag: long-press then move
{
  const card = mpage.locator('.col[data-col="todo"] .card').first(); const id = await card.getAttribute('data-id');
  const a = await card.boundingBox();
  const cdp = await mctx.newCDPSession(mpage);
  const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await tp('touchStart', a.x + 40, a.y + 15); await mpage.waitForTimeout(400);
  for (let i = 1; i <= 10; i++) await tp('touchMove', a.x + 40 + i * 30, a.y + 15);
  // the Started column is off-screen to the right on phones; drop on the right edge zone which autoscrolls, then on whatever column is under the finger
  await mpage.waitForTimeout(500);
  await tp('touchEnd', 0, 0); await mpage.waitForTimeout(200);
  const st = await state(mpage);
  ok('touch long-press drag moves a card on mobile', st.status[id] && st.status[id] !== 'todo', `now ${st.status[id]}`);
}
// mobile layout + menus
{
  const chipTops = await mpage.locator('#sb-chips .chip').evaluateAll((els) => [...new Set(els.map((e) => e.offsetTop))].length);
  ok('mobile: class chips stay on one scrolling row', chipTops === 1);
  ok('mobile: column strip shows 4 columns with counts', (await mpage.locator('#sb-colnav button').count()) === 4);
  await mpage.locator('#sb-colnav button[data-col="done"]').tap(); await mpage.waitForTimeout(700);
  ok('mobile: tapping a column name jumps there and underlines it', await mpage.locator('#sb-colnav button[data-col="done"]').getAttribute('aria-current') === 'true');
  await mpage.locator('#sb-colnav button[data-col="todo"]').tap(); await mpage.waitForTimeout(700);
  await mpage.locator('#sb-more').tap(); await mpage.waitForSelector('.menu.sheet');
  const sheetText = await mpage.locator('.menu.sheet').innerText();
  ok('mobile: ⋯ opens a bottom sheet with Import, Categories and Save a backup', /Import/.test(sheetText) && /Categories/.test(sheetText) && /Save a backup/.test(sheetText) && !/Download for offline/.test(sheetText) && !/Keyboard/.test(sheetText));
  await mpage.locator('.scrim').tap({ position: { x: 20, y: 20 } }); await mpage.waitForTimeout(200);
  const card = mpage.locator('.col[data-col="todo"] .card').first(); const cid = await card.getAttribute('data-id');
  await card.locator('.more').tap(); await mpage.waitForSelector('.menu.sheet');
  await mpage.screenshot({ path: join(SHOTS, 'mobile-menu.png') });
  await mpage.locator('.menu.sheet .menu-i.move', { hasText: 'Needs to be proctored' }).tap(); await mpage.waitForTimeout(250);
  ok('mobile: card ⋯ "Move to…" moves the card', (await state(mpage)).status[cid] === 'proctor');
  ok('mobile: menu closes after choosing', await mpage.locator('.menu').count() === 0);
}
await mctx.close();

// ---------- 2. fresh board from the .ics file ----------
await page.evaluate(() => localStorage.clear());
await page.goto(BASE + '/'); await page.waitForSelector('#imp-file', { state: 'attached' });
await page.setInputFiles('#imp-file', ICS);
await page.waitForSelector('#sb-board .card');
ok('first import offers the "Name your classes" step (skippable)', await skipNaming(page, 3000));
let st = await state(page);
ok('.ics upload imports all 19 events', Object.keys(st.ics).length === 19);
ok('new boards start without the proctor column (3 columns)', st.proctorCol === false && (await page.locator('.col').count()) === 3 && await page.locator('.col[data-col="todo"] .card', { hasText: 'Proctor Note' }).count() === 1);
ok('no Range view any more', await page.locator('.seg button').allInnerTexts().then((t) => t.join('|') === 'Due today|Week|All'));
await page.click('#sb-filter'); await page.check('#sb-proctorcol'); await page.keyboard.press('Escape');
ok('Filter & settings turns the proctor column on', (await page.locator('.col').count()) === 4 && (await state(page)).proctorCol === true);
await page.click('.seg button[data-view="all"]');
// drag + double-click + keyboard
let card = cardByTitle(page, 'DBQ: Causes');
let id = await card.getAttribute('data-id');
await dragTo(page, card, 'started');
st = await state(page); ok('mouse drag moves a card to Started', st.status[id] === 'started');
await cardByTitle(page, 'Problem Set 4.3').dblclick();
st = await state(page); ok('double-click marks done', st.status['sb-sample-006@example.invalid'] === 'done');
await cardByTitle(page, 'Problem Set 4.3').dblclick();
st = await state(page); ok('double-click again un-does', st.status['sb-sample-006@example.invalid'] === 'todo');
await cardByTitle(page, 'Cell Organelles').focus(); await page.keyboard.press('3');
st = await state(page); ok('keyboard 3 moves focused card to proctor column', st.status['sb-sample-009@example.invalid'] === 'proctor');
ok('focus stays on the moved card', await page.evaluate(() => document.activeElement.dataset.id) === 'sb-sample-009@example.invalid');
ok('proctor-note assignment lands in Needs to be proctored', await page.locator('.col[data-col="proctor"] .card', { hasText: 'Proctor Note' }).count() === 1);
// due-soon red edge (at least: the card class logic runs; check a synthetic card due in 10h)
// ---------- 3. custom category + custom task ----------
await more(page, '#sb-cats'); await page.fill('#cat-new', 'Reading list'); await page.press('#cat-new', 'Enter');
await page.fill('#cat-new', 'Temp category'); await page.press('#cat-new', 'Enter');
await page.click('dialog [data-close]');
await page.keyboard.press('n'); await page.waitForSelector('#ed-title');
await page.fill('#ed-title', 'Read Animal Farm ch 1-3');
await page.selectOption('#ed-cat', 'Reading list');
const soon = new Date(NOW.getTime() + 10 * 36e5); // relative to the frozen page clock
const pad = (n) => String(n).padStart(2, '0');
await page.fill('#ed-date', `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`);
await page.fill('#ed-time', `${pad(soon.getHours())}:${pad(soon.getMinutes())}`);
await page.fill('#ed-note', 'For Friday seminar');
await page.click('#ed-save');
const custom = cardByTitle(page, 'Animal Farm');
ok('custom task added under custom category', await custom.isVisible() && (await custom.innerText()).includes('Reading list'));
ok('task due within 36h gets the red edge', (await custom.getAttribute('class')).includes('late'));
// edit it
await custom.focus(); await page.keyboard.press('e'); await page.fill('#ed-title', 'Read Animal Farm ch 1-4'); await page.click('#ed-save');
ok('custom task can be edited', await cardByTitle(page, 'Animal Farm ch 1-4').count() === 1);
// edit a calendar item's class (override survives re-import)
await cardByTitle(page, 'Picture Day').focus(); await page.keyboard.press('e'); await page.selectOption('#ed-cat', 'Reading list'); await page.click('#ed-save');
// ---------- 4. re-import ----------
await page.keyboard.press('i'); await page.setInputFiles('dialog #imp-file', ICS); await page.waitForTimeout(500);
st = await state(page);
ok('re-import keeps custom category', st.cats.includes('Reading list'));
ok('re-import keeps custom task', Object.values(st.custom).some((c) => c.title === 'Read Animal Farm ch 1-4'));
ok('re-import keeps progress keyed by UID', st.status[id] === 'started' && st.status['sb-sample-009@example.invalid'] === 'proctor');
ok('re-import keeps edits to calendar items', (await cardByTitle(page, 'Picture Day').innerText()).includes('Reading list'));
// ---------- 5. CAS import ----------
await page.keyboard.press('i'); await page.setInputFiles('dialog #imp-file', CASPDF);
await page.waitForSelector('.cas-table', { timeout: 20000 });
const casRows = await page.locator('.cas-table tr').count();
const dupRows = await page.locator('.cas-table td.dup .pill', { hasText: 'Already on calendar' }).count();
ok('CAS preview lists the parsed tasks', casRows === 14, `${casRows} rows`);
ok('CAS items already on the calendar are flagged and unchecked', dupRows >= 4, `${dupRows} flagged`);
await page.screenshot({ path: join(SHOTS, 'cas-preview.png') });
// deselect one, edit one title
await page.locator('.cas-table tr', { has: page.locator('input[value*="Vocabulary flashcards"]') }).locator('input[type=checkbox]').uncheck();
await page.locator('.cas-table input[value*="Lesson 4.2"]').fill('Read: Lesson 4.2 (edited in preview)');
await page.locator('.cas-table input[value*="Lesson 4.2"]').dispatchEvent('change');
await page.click('#cas-add');
await page.waitForTimeout(300);
st = await state(page);
const casTitles = Object.values(st.cas).map((c) => c.title);
ok('CAS import adds selected tasks only', casTitles.length >= 6 && !casTitles.some((t) => /flashcards/.test(t)), `${casTitles.length} added`);
ok('CAS preview edits are kept', casTitles.includes('Read: Lesson 4.2 (edited in preview)'));
ok('CAS readings become cards', await cardByTitle(page, 'Lesson 4.1').count() === 1);
ok('calendar duplicates borrow the CAS class', (await cardByTitle(page, 'Problem Set 4.2').innerText()).includes('Geometry'));
ok('no duplicate card for Problem Set 4.2', await page.locator('.card', { hasText: 'Problem Set 4.2' }).count() === 1);
// re-import again: CAS survives
await page.keyboard.press('i'); await page.setInputFiles('dialog #imp-file', ICS); await page.waitForTimeout(400);
st = await state(page);
ok('CAS tasks survive .ics re-import', Object.keys(st.cas).length === casTitles.length);
// ---------- 6. rename + delete categories ----------
await more(page, '#sb-cats');
await page.locator('.cats li[data-c="Reading list"] input').fill('Reading');
await page.locator('.cats li[data-c="Reading list"] input').press('Enter');
await page.waitForTimeout(150);
await page.locator('.cats li[data-c="Reading"] input').blur();
await page.waitForTimeout(150);
await page.locator('.cats li[data-c="Temp category"] [data-del]').click();
await page.waitForTimeout(150);
await page.click('dialog [data-close]');
st = await state(page);
ok('rename category updates tasks', st.cats.includes('Reading') && !st.cats.includes('Reading list') && Object.values(st.custom)[0].course === 'Reading');
ok('delete category removes it', !st.cats.includes('Temp category'));
// filters
await page.click('.seg button[data-view="today"]');
ok('Due today view shows the task due within 10h or overdue items', await page.locator('.card', { hasText: 'Animal Farm' }).count() === 1);
await page.click('.seg button[data-view="all"]');
await page.click('#sb-filter'); await page.check('#sb-hidepast');
const hp = await page.locator('#sb-board .card').count();
await page.uncheck('#sb-hidepast'); await page.keyboard.press('Escape');
ok('hide past toggle works (count changes or stays when nothing is past)', hp <= await page.locator('#sb-board .card').count());
// empty states
await page.fill('#sb-search', 'zzzz-no-such-task');
ok('search with no results shows "No matches" and a Clear button', await page.locator('.empty-state', { hasText: 'No matches for' }).isVisible());
await page.click('#sb-clearq');
ok('Clear search restores the board', await page.locator('#sb-board .card').count() === hp || await page.locator('#sb-board .card').count() > 0);
// desktop menu + toast placement
await page.click('#sb-more');
ok('desktop ⋯ menu holds Categories, Name your classes, Save a backup and Keyboard shortcuts', /Categories[\s\S]*Name your classes[\s\S]*Save a backup[\s\S]*Keyboard shortcuts/.test(await page.locator('.menu').innerText()));
ok('"Save a backup" is not red', await page.locator('#sb-backup').evaluate((e) => !/255, 62, 81/.test(getComputedStyle(e).backgroundColor + getComputedStyle(e).color)));
await page.keyboard.press('Escape');
ok('only one red button in the header (Add)', await page.locator('.sb-head .btn').evaluateAll((els) => els.filter((e) => /255, 62, 81/.test(getComputedStyle(e).backgroundColor)).map((e) => e.id).join()) === 'sb-add');
await page.screenshot({ path: join(SHOTS, 'board-after-flow.png') });

// ---------- 7. live link import through the proxy ----------
if (LIVE_LINK) {
  // separate context so the main board's storage is untouched
  const lctx = await newCtx();
  const lp = await lctx.newPage(); watch(lp, 'link');
  await lp.goto(BASE + '/');
  await lp.fill('#imp-url', BASE.replace(/^https:/, 'webcal:') + '/sample/schoology-sample.ics');
  await lp.click('#imp-go');
  await lp.waitForSelector('#sb-board .card', { timeout: 20000 });
  const n = Object.keys((await state(lp)).ics).length;
  ok('paste-a-link import works through the serverless proxy (webcal:// link)', n === 19, `${n} events`);
  const bad = await lp.evaluate(async () => (await fetch('/api/feed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/' }) })).status);
  ok('proxy refuses non-calendar responses', bad === 422, `status ${bad}`);
  await lctx.close();
}

// ---------- 8. offline download ----------
const [dl] = await Promise.all([page.waitForEvent('download'), more(page, '#sb-backup')]);
const offlinePath = join(SHOTS, 'schoology-board-offline.html');
await dl.saveAs(offlinePath);
ok('offline file downloads', !!offlinePath);
{ const h = readFileSync(offlinePath, 'utf8'); ok('backup inlines the active theme (tokens + data-theme)', /<html lang="en" data-theme="default">/.test(h) && /<style id="sb-theme">[\s\S]*--accent:#FF3E51/.test(h)); }
await ctx.close();

const octx = await newCtx();
const op = await octx.newPage(); watch(op, 'offline');
await op.route('**/*', (r) => (r.request().url().startsWith('file:') || r.request().url().startsWith('blob:') || r.request().url().startsWith('data:') ? r.continue() : r.abort()));
await op.goto(pathToFileURL(offlinePath).href);
await op.waitForSelector('#sb-board .card');
await op.click('.seg button[data-view="all"]');
let ost = await state(op);
ok('offline file renders from file:// with no network', await op.locator('#sb-board .card').count() > 10);
ok('offline file carries custom category + task', ost.cats.includes('Reading') && Object.values(ost.custom).some((c) => c.title.includes('Animal Farm')));
ok('offline file carries CAS tasks', Object.keys(ost.cas).length === casTitles.length);
ok('offline file carries progress', ost.status[id] === 'started');
ok('offline file does not contain the calendar link', !JSON.stringify(ost).includes('feedUrl":"http'));
ok('backup says "Offline copy" and does not try to refresh', (await op.locator('#sb-sync').innerText()).includes('Offline copy'));
await op.screenshot({ path: join(SHOTS, 'offline-board.png') });
const oc = cardByTitle(op, 'Two-Column Proof'); const ocid = await oc.getAttribute('data-id');
await dragTo(op, oc, 'done');
await op.reload(); await op.waitForSelector('#sb-board .card');
ost = await state(op);
ok('offline: drag persists in localStorage across reload', ost.status[ocid] === 'done');
await op.click('#sb-import'); await op.setInputFiles('dialog #imp-file', ICS); await op.waitForTimeout(400);
ost = await state(op);
ok('offline: .ics re-import works and keeps custom + CAS + progress', Object.keys(ost.ics).length === 19 && ost.status[ocid] === 'done' && Object.keys(ost.custom).length === 1 && Object.keys(ost.cas).length === casTitles.length);
await op.click('#sb-import'); await op.setInputFiles('dialog #imp-file', CASPDF);
let casOffline = false;
try { await op.waitForSelector('.cas-table', { timeout: 20000 }); casOffline = (await op.locator('.cas-table tr').count()) === 14; } catch { }
ok('offline: CAS PDF import works from file:// (pdf.js bundled inline)', casOffline);
if (casOffline) { await op.screenshot({ path: join(SHOTS, 'offline-cas-preview.png') }); await op.click('dialog [data-close]'); }
const cyan2 = await noCyan(op);
ok('no cyan/teal colors in the offline file', cyan2.length === 0, cyan2.slice(0, 3).join('; '));
await octx.close();

// ---------- 9. a full school year (517 items), frozen at several moments ----------
{
  // Created late on Jan 4: three assignments were due at 23:59 earlier that day and must still show.
  const created = new Date('2027-01-04T23:59:30-05:00'), cutoff = sod(created);
  const weekday = new Date('2027-02-10T10:00:00-05:00'), fri5 = new Date('2027-02-12T17:00:00-05:00'), fri7 = new Date('2027-02-12T19:00:00-05:00'), sun = new Date('2027-02-14T15:00:00-05:00');
  const yctx = await newCtx({ now: created });
  const yp = await yctx.newPage(); watch(yp, 'year');
  await yp.goto(BASE + '/'); await yp.waitForSelector('#imp-file', { state: 'attached' });
  await yp.setInputFiles('#imp-file', YEAR); await yp.waitForFunction(() => window.SchoologyBoard.state().createdAt);
  // the class-naming step
  await yp.waitForSelector('dialog.naming', { timeout: 5000 });
  const groups = await yp.locator('dialog.naming .nm-row[data-k] .nm-l b').allInnerTexts();
  ok('naming step lists the detected title prefixes', ['ALG2', 'Spanish I', 'Omnibus Primary', 'Apologia Chem', 'Writing'].every((g) => groups.includes(g)), groups.join(', '));
  ok('naming step lists Unsorted items to assign', await yp.locator('dialog.naming .nm-row[data-id]').count() > 0);
  const alg = yp.locator('dialog.naming .nm-row', { has: yp.locator('b', { hasText: /^ALG2$/ }) });
  ok('naming step shows the group size', /ALG2 · \d+ items/.test((await alg.innerText()).replace(/\s+/g, ' ')));
  await alg.locator('input').fill('Algebra II');
  await yp.waitForTimeout(300); await yp.screenshot({ path: join(SHOTS, 'class-naming.png') });
  await yp.click('#nm-done'); await yp.waitForTimeout(200);
  ok('naming: the prefix→class mapping is saved', (await state(yp)).classMap.alg2 === 'Algebra II' || Object.values((await state(yp)).classMap).includes('Algebra II'), JSON.stringify((await state(yp)).classMap));
  const RN = { ALG2: 'Algebra II' };
  const inst = (e) => new Date(`${e.date}T${e.time}:00`).getTime();
  const visible = YEAR_EXP.items.filter((e) => inst(e) >= cutoff);
  const hiddenTotal = YEAR_EXP.count - visible.length;
  const counts = (list, proctorOn) => {
    const col = proctorOn ? { todo: 0, started: 0, proctor: 0, done: 0 } : { todo: 0, started: 0, done: 0 }, cls = {};
    list.forEach((e) => { col[e.proctor && proctorOn ? 'proctor' : 'todo']++; const c = RN[e.cls] || e.cls; cls[c] = (cls[c] || 0) + 1; });
    return { total: list.length, col, cls };
  };
  const readBoard = () => yp.evaluate(() => {
    const col = {}; document.querySelectorAll('.col').forEach((c) => (col[c.dataset.col] = +c.querySelector('h2 span').textContent));
    const cls = {}; let all = null;
    document.querySelectorAll('#sb-chips .chip').forEach((c) => { const n = +c.querySelector('b').textContent; if (c.dataset.c) cls[c.dataset.c] = n; else all = n; });
    const note = document.querySelector('#sb-note');
    return { cards: document.querySelectorAll('#sb-board .card').length, col, cls, all, note: note.hidden ? '' : note.textContent, week: document.querySelector('#sb-week').textContent };
  });
  const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  const check = async (label, list, proctorOn = false) => {
    const want = counts(list, proctorOn), got = await readBoard();
    ok(`${label}: ${want.total} cards`, got.cards === want.total, `board ${got.cards}`);
    ok(`${label}: column counts match`, same(got.col, want.col), JSON.stringify(got.col) + ' vs ' + JSON.stringify(want.col));
    ok(`${label}: class chips and counts match`, same(got.cls, want.cls) && got.all === want.total, JSON.stringify(got.cls) + ' vs ' + JSON.stringify(want.cls));
    return got;
  };
  const at = async (t) => { await yctx.clock.setFixedTime(t); await yp.reload(); await yp.waitForSelector('#sb-board'); };
  // creation day
  ok('year: cutoff is the start of the creation day', (await state(yp)).createdAt === cutoff);
  await yp.click('.seg button[data-view="today"]');
  let g = await check('creation day, Due today (3 due 23:59, before the board existed)', visible.filter((e) => e.date === '2027-01-04'));
  ok('creation day: no note when nothing is hidden in view', g.note === '');
  await yp.click('.seg button[data-view="all"]');
  g = await readBoard();
  ok(`creation day: All shows the note "${hiddenTotal} earlier items hidden · Show"`, g.note.replace(/\s+/g, ' ') === `${hiddenTotal} earlier items hidden · Show`, g.note);
  const ncs = await yp.locator('#sb-note').evaluate((e) => ({ fs: getComputedStyle(e).fontSize, c: getComputedStyle(e).color }));
  ok('hidden note is quiet: 13px #6E6E76', ncs.fs === '13px' && ncs.c === 'rgb(110, 110, 118)', JSON.stringify(ncs));
  // a weekday
  await at(weekday);
  ok('year: board opens on Week', await yp.locator('.seg button[aria-pressed="true"]').innerText() === 'Week');
  g = await check('weekday Wed Feb 10, Week (Feb 8-14)', visible.filter((e) => e.date >= '2027-02-08' && e.date <= '2027-02-14'));
  ok('weekday: label "This week · Feb 8–14", no note', g.week === 'This week · Feb 8–14' && g.note === '', g.week + ' / ' + g.note);
  await yp.screenshot({ path: join(SHOTS, 'year-this-week.png') });
  await yp.click('.seg button[data-view="today"]');
  await check('weekday Due today (Feb 10)', visible.filter((e) => e.date === '2027-02-10'));
  await yp.screenshot({ path: join(SHOTS, 'year-due-today.png') });
  await yp.click('.seg button[data-view="all"]');
  await check('weekday All (since the creation day)', visible);
  ok('year: hidden items are not overdue or Completed', (await readBoard()).col.done === 0);
  await yp.click('#sb-note a');
  g = await readBoard();
  ok('note "Show" turns on earlier items', g.cards === YEAR_EXP.count && (await state(yp)).prefs.showPre === true && /^Showing \d+ items from before this board · Hide$/.test(g.note.replace(/\s+/g, ' ')), g.note);
  await yp.click('#sb-note a');
  ok('note "Hide" hides them again', (await readBoard()).cards === visible.length);
  // proctor column toggle
  await yp.click('#sb-filter'); await yp.waitForSelector('#sb-proctorcol'); await yp.waitForTimeout(350);
  await yp.screenshot({ path: join(SHOTS, 'settings-proctor-toggle.png') });
  await yp.check('#sb-proctorcol'); await yp.keyboard.press('Escape'); await yp.waitForTimeout(100);
  await check('All with the proctor column on', visible, true);
  await yp.click('#sb-filter'); await yp.uncheck('#sb-proctorcol'); await yp.keyboard.press('Escape'); await yp.waitForTimeout(100);
  await check('All with the proctor column off again (lossless)', visible);
  await yp.click('#sb-filter'); await yp.check('#sb-proctorcol'); await yp.keyboard.press('Escape');
  // re-import keeps everything, including class names
  await yp.keyboard.press('i'); await yp.setInputFiles('dialog #imp-file', YEAR); await yp.waitForTimeout(600);
  ok('re-import does not nag with the naming step again', await yp.locator('dialog.naming').count() === 0);
  await check('All after re-import (class names + proctor kept, pre-creation still hidden)', visible, true);
  // Friday 5 PM: still this week. Friday 7 PM and Sunday: next week.
  await at(fri5);
  ok('Friday 5 PM: Week is still this week', (await readBoard()).week === 'This week · Feb 8–14');
  await at(fri7);
  g = await check('Friday 7 PM, Week = next week (Feb 15-21)', visible.filter((e) => e.date >= '2027-02-15' && e.date <= '2027-02-21'), true);
  ok('Friday 7 PM: label "Next week · Feb 15–21"', g.week === 'Next week · Feb 15–21', g.week);
  await yp.screenshot({ path: join(SHOTS, 'weekend-week.png') });
  await at(sun);
  g = await check('Sunday, Week = next week (Feb 15-21)', visible.filter((e) => e.date >= '2027-02-15' && e.date <= '2027-02-21'), true);
  await yp.click('#sb-prev');
  g = await check('Sunday, ← goes to this week (Feb 8-14)', visible.filter((e) => e.date >= '2027-02-08' && e.date <= '2027-02-14'), true);
  ok('Sunday: arrows navigate normally', g.week === 'This week · Feb 8–14', g.week);
  await yp.click('#sb-thisweek');
  ok('Sunday: the jump-back button returns to next week', (await readBoard()).week === 'Next week · Feb 15–21');
  // reopen from the menu
  await more(yp, '#sb-naming'); await yp.waitForSelector('dialog.naming');
  ok('"Name your classes" reopens from ⋯ with the saved name', await yp.locator('dialog.naming input[value="Algebra II"]').count() === 1);
  await yp.click('#nm-skip');
  const ystate = await state(yp);
  const [ydl] = await Promise.all([yp.waitForEvent('download'), more(yp, '#sb-backup')]);
  ok('backup file is named schoology-board-backup-YYYY-MM-DD.html', /^schoology-board-backup-\d{4}-\d\d-\d\d\.html$/.test(ydl.suggestedFilename()), ydl.suggestedFilename());
  const yoff = join(SHOTS, 'year-offline.html'); await ydl.saveAs(yoff);
  await yctx.close();
  const yo = await newCtx({ now: weekday }); const yop = await yo.newPage(); watch(yop, 'year-offline');
  await yop.route('**/*', (r) => (/^(file|blob|data):/.test(r.request().url()) ? r.continue() : r.abort()));
  await yop.goto(pathToFileURL(yoff).href); await yop.waitForSelector('#sb-board');
  await yop.click('.seg button[data-view="all"]');
  const os = await state(yop);
  ok('backup: creation cutoff, hiding and proctor column carry over', os.createdAt === cutoff && os.proctorCol === true && await yop.locator('#sb-board .card').count() === visible.length);
  ok('backup: class names carry over (mapping + chip)', JSON.stringify(os.classMap) === JSON.stringify(ystate.classMap) && await yop.locator('#sb-chips .chip[data-c="Algebra II"]').count() === 1);
  ok('backup: hidden note works offline', ((await yop.locator('#sb-note').textContent()) || '').startsWith(hiddenTotal + ' earlier items hidden'));
  await yop.click('#sb-import'); await yop.setInputFiles('dialog #imp-file', YEAR); await yop.waitForTimeout(600);
  ok('backup: re-import there keeps the class names', await yop.locator('#sb-chips .chip[data-c="Algebra II"]').count() === 1 && await yop.locator('#sb-chips .chip[data-c="ALG2"]').count() === 0);
  await yo.close();
}
// ---------- 10. migrations from older saved boards ----------
{
  const c = await newCtx(); const pg = await c.newPage(); watch(pg, 'migrate');
  await pg.goto(BASE + '/');
  await pg.evaluate(() => localStorage.setItem('schoology-board:v1', JSON.stringify({ v: 1, ics: { old: { uid: 'old', title: 'Old overdue thing', due: '2026-09-01T12:00', source: 'ics' }, early: { uid: 'early', title: 'Due at 6am today', due: '2026-10-19T06:00', source: 'ics' }, fresh: { uid: 'fresh', title: 'Next week thing', due: '2026-10-21T12:00', source: 'ics' } }, prefs: { view: 'range', from: '2026-10-01', to: '2026-10-31' } })));
  await pg.reload(); await pg.waitForSelector('#sb-board');
  const s2 = await state(pg);
  ok('older boards get a creation cutoff at the start of today', s2.createdAt === sod(NOW));
  ok('older boards: old items hide, work due earlier today stays', !(await pg.locator('.card', { hasText: 'Old overdue thing' }).count()) && await pg.locator('.card', { hasText: 'Due at 6am today' }).count() === 1);
  ok('saved "range" view migrates to Week', s2.prefs.view === 'week' && (await pg.locator('.seg button[aria-pressed="true"]').innerText()) === 'Week');
  ok('boards without proctor items get no proctor column', s2.proctorCol === false && await pg.locator('.col').count() === 3);
  // a mid-day createdAt moves to that day's midnight; a board using the proctor column keeps it
  await pg.evaluate(() => localStorage.setItem('schoology-board:v1', JSON.stringify({ v: 1, createdAt: new Date('2026-10-19T09:30:00-04:00').getTime(), ics: { a: { uid: 'a', title: 'Unit 2 Test (proctored)', due: '2026-10-20T12:00', source: 'ics' }, b: { uid: 'b', title: 'Morning quiz', due: '2026-10-19T08:00', source: 'ics' } } })));
  await pg.reload(); await pg.waitForSelector('#sb-board');
  const s3 = await state(pg);
  ok('mid-day creation time migrates to local midnight', s3.createdAt === sod(NOW));
  ok('existing board with a proctor item gets the column on', s3.proctorCol === true && await pg.locator('.col[data-col="proctor"] .card', { hasText: 'Unit 2 Test' }).count() === 1);
  ok('creation-day item due before the creation time shows', await pg.locator('.card', { hasText: 'Morning quiz' }).count() === 1);
  await c.close();
}
// ---------- 11. refresh on open (stub relay whose feed changes between loads) ----------
{
  const A = readFileSync(ICS, 'utf8');
  const B = A.replace(/BEGIN:VEVENT\r?\n(?:(?!END:VEVENT)[\s\S])*?SUMMARY:Picture Day[\s\S]*?END:VEVENT\r?\n/, '')
    .replace('END:VCALENDAR', 'BEGIN:VEVENT\r\nUID:sb-sample-new@example.invalid\r\nDTSTAMP:20261020T120000Z\r\nDTSTART;VALUE=DATE-TIME:20261023T035900Z\r\nSUMMARY:Field Trip Permission Form\r\nEND:VEVENT\r\nEND:VCALENDAR');
  const FEED = 'https://feed.example.invalid/calendar/sample.ics';
  let mode = 'A', relayHits = 0, bodiesSeen = [];
  const wed = new Date('2026-10-21T10:00:00-04:00');
  const rctx = await newCtx({ now: wed });
  await rctx.route('**/api/feed', async (r) => {
    relayHits++; bodiesSeen.push(r.request().postData() || '');
    if (mode === 'fail') return r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Schoology did not answer.' }) });
    return r.fulfill({ status: 200, contentType: 'text/calendar', body: mode === 'A' ? A : B });
  });
  const rp = await rctx.newPage(); watch(rp, 'refresh');
  await rp.goto(BASE + '/'); await rp.fill('#imp-url', FEED); await rp.click('#imp-go');
  await rp.waitForSelector('#sb-board .card'); await skipNaming(rp, 3000);
  let rs = await state(rp);
  ok('link import remembers the link in this browser only', rs.feedUrl === FEED && rs.lastFetch && rs.lastFetch.ok === true && relayHits === 1);
  ok('refresh: "Updated just now" after import', /Updated just now/.test(await rp.locator('#sb-sync').innerText()));
  const wk = await rp.evaluate(() => document.querySelectorAll('#sb-board .card').length);
  ok('creation-day cutoff: Week hides 4 earlier items and keeps the 8 AM item due today', (await rp.locator('#sb-note').innerText()).replace(/\s+/g, ' ') === '4 earlier items hidden · Show' && await rp.locator('.card', { hasText: 'Osmosis' }).count() === 1, await rp.locator('#sb-note').innerText());
  await cardByTitle(rp, 'Osmosis').dblclick();
  mode = 'B';
  await rctx.clock.setFixedTime(new Date(wed.getTime() + 60e3));
  await rp.reload(); await rp.waitForSelector('#sb-board .card'); await rp.waitForFunction(() => /Updated/.test(document.querySelector('#sb-sync').textContent));
  rs = await state(rp);
  ok('refresh on open re-fetches through the relay and merges', relayHits === 2 && !!rs.ics['sb-sample-new@example.invalid'] && !Object.values(rs.ics).some((e) => /Picture Day/.test(e.title)) && await rp.locator('.card', { hasText: 'Field Trip Permission Form' }).count() === 1);
  ok('refresh keeps progress (status survives)', Object.entries(rs.status).some(([k, v]) => v === 'done' && /Osmosis/.test((rs.ics[k] || {}).title || '')));
  ok('auto-refresh does not open the naming step or a toast', await rp.locator('dialog.naming').count() === 0 && await rp.locator('.toast', { hasText: 'Imported' }).count() === 0);
  await rctx.clock.setFixedTime(new Date(wed.getTime() + 4 * 60e3));
  await rp.click('.seg button[data-view="week"]');
  ok('"Updated 3m ago" ticks with the clock', /Updated 3m ago/.test(await rp.locator('#sb-sync').innerText()), await rp.locator('#sb-sync').innerText());
  const sc = await rp.locator('#sb-sync').evaluate((e) => getComputedStyle(e).color);
  ok('sync status is neutral grey', /^rgb\((\d+), \1, \1\)$/.test(sc) || /rgb\((1[0-4]\d), (1[0-4]\d), (1[0-4]\d)\)/.test(sc), sc);
  await rp.screenshot({ path: join(SHOTS, 'board-hidden-note-updated.png') });
  mode = 'fail';
  const before = await rp.locator('#sb-board .card').count();
  await rp.reload(); await rp.waitForSelector('#sb-board .card'); await rp.waitForFunction(() => /Couldn/.test(document.querySelector('#sb-sync').textContent));
  ok('failed refresh: quiet "Couldn\'t refresh · Retry", cached board kept', (await rp.locator('#sb-sync').innerText()).replace(/\s+/g, ' ').includes('Couldn’t refresh · Retry') && await rp.locator('#sb-board .card').count() === before && await rp.locator('.toast').count() === 0);
  mode = 'B';
  await rp.click('#sb-retry'); await rp.waitForFunction(() => /Updated/.test(document.querySelector('#sb-sync').textContent));
  ok('Retry recovers', /Updated just now/.test(await rp.locator('#sb-sync').innerText()));
  ok('the link only travels in the relay request body', bodiesSeen.every((b) => JSON.parse(b).url === FEED));
  // phone width
  const pctx = await newCtx({ now: new Date(wed.getTime() + 4 * 60e3), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pctx.route('**/api/feed', (r) => r.fulfill({ status: 200, contentType: 'text/calendar', body: B }));
  await pctx.addInitScript((st) => { if (!localStorage.getItem('schoology-board:v1')) localStorage.setItem('schoology-board:v1', st); }, JSON.stringify({ ...rs, lastFetch: { at: wed.getTime() + 60e3, ok: true } }));
  const pp = await pctx.newPage(); watch(pp, 'phone');
  await pp.goto(BASE + '/'); await pp.waitForSelector('#sb-board .card'); await pp.waitForFunction(() => /Updated/.test(document.querySelector('#sb-sync').textContent)); await pp.waitForTimeout(400);
  ok('phone: note and status fit without horizontal overflow', await pp.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await pp.screenshot({ path: join(SHOTS, 'phone-board.png') });
  await pctx.close();
  // backup from a linked board: no link inside, "Offline copy", no refresh
  const [rdl] = await Promise.all([rp.waitForEvent('download'), more(rp, '#sb-backup')]);
  const rpath = join(SHOTS, 'refresh-backup.html'); await rdl.saveAs(rpath);
  const html = readFileSync(rpath, 'utf8');
  ok('backup file never contains the calendar link', !html.includes('feed.example.invalid'));
  await rctx.close();
  const bo = await newCtx({ now: wed }); const bop = await bo.newPage(); watch(bop, 'refresh-backup');
  let net = 0; await bop.route('**/*', (r) => (/^(file|blob|data):/.test(r.request().url()) ? r.continue() : (net++, r.abort())));
  await bop.goto(pathToFileURL(rpath).href); await bop.waitForSelector('#sb-board .card'); await bop.waitForTimeout(500);
  ok('backup opened from disk: "Offline copy", no refresh attempt', (await bop.locator('#sb-sync').innerText()).includes('Offline copy') && net === 0 && (await state(bop)).feedUrl === '');
  await bo.close();
}

// ---------- 12. Move to phone (state in the #fragment) + Import a backup ----------
{
  const YEARTXT = readFileSync(YEAR, 'utf8');
  const FEED = 'https://feed.example.invalid/calendar/year.ics';
  const when = new Date('2027-02-10T10:00:00-05:00');
  const phoneOpts = { now: when, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const stub = (c, body, log) => c.route('**/api/feed', (r) => { if (log) log.push(r.request().postData() || ''); return r.fulfill({ status: 200, contentType: 'text/calendar', body }); });
  const dctx = await newCtx({ now: new Date('2027-01-04T09:00:00-05:00') }); await stub(dctx, YEARTXT);
  const dp = await dctx.newPage(); watch(dp, 'move-desktop');
  await dp.goto(BASE + '/'); await dp.fill('#imp-url', FEED); await dp.click('#imp-go');
  await dp.waitForSelector('dialog.naming', { timeout: 8000 });
  await dp.locator('dialog.naming .nm-row', { has: dp.locator('b', { hasText: /^ALG2$/ }) }).locator('input').fill('Algebra II');
  await dp.click('#nm-done');
  await dctx.clock.setFixedTime(when); await dp.reload(); await dp.waitForSelector('#sb-board .card'); await dp.waitForFunction(() => /Updated/.test(document.querySelector('#sb-sync').textContent));
  await dp.click('#sb-filter'); await dp.check('#sb-proctorcol'); await dp.keyboard.press('Escape');
  await dp.locator('.col[data-col="todo"] .card').nth(0).dblclick();
  await dp.locator('.col[data-col="todo"] .card').nth(0).focus(); await dp.keyboard.press('2');
  await dp.locator('.col[data-col="todo"] .card').nth(1).focus(); await dp.keyboard.press('3');
  await more(dp, '#sb-cats'); await dp.fill('#cat-new', 'Piano'); await dp.press('#cat-new', 'Enter'); await dp.click('dialog [data-close]');
  await dp.keyboard.press('n'); await dp.fill('#ed-title', 'Practice scales'); await dp.selectOption('#ed-cat', 'Piano'); await dp.fill('#ed-date', '2027-02-11'); await dp.click('#ed-save');
  const ds = await state(dp);
  await more(dp, '#sb-move'); await dp.waitForSelector('dialog.move #mv-qr'); await dp.waitForTimeout(300);
  const link = await dp.inputValue('#mv-url');
  ok('Move to phone: link carries the board in the #fragment', link.startsWith(BASE + '/#move=z'), link.length + ' chars');
  ok('Move to phone: payload stays small with a calendar link (UID hashes, no events)', link.length <= 1200, link.length + ' chars');
  const png = PNG.sync.read(await dp.locator('#mv-qr').screenshot());
  const qr = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  ok('QR code decodes to exactly the link', !!qr && qr.data === link, qr ? qr.data.length + ' chars decoded' : 'no decode');
  const qcols = await dp.locator('#mv-qr').evaluate((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const set = new Set(); for (let i = 0; i < d.length; i += 4) set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return [...set]; });
  ok('QR is pure black on white (high contrast)', qcols.length === 2 && qcols.includes('0,0,0') && qcols.includes('255,255,255'), qcols.join(' '));
  ok('privacy note: treat it like a password', /treat it like a password/.test(await dp.locator('dialog.move .mv-note').innerText()));
  await dp.screenshot({ path: join(SHOTS, 'move-to-phone.png') });
  const mcy = await noCyan(dp); ok('no cyan/teal in the Move to phone dialog', mcy.length === 0, mcy.slice(0, 2).join('; '));
  await dp.click('dialog.move [data-close]');
  // phone, fresh: open the link
  const fragment = link.split('#')[1];
  const pc = await newCtx(phoneOpts); const relayBodies = []; await stub(pc, YEARTXT, relayBodies);
  const seen = []; pc.on('request', (r) => seen.push(r.url() + ' ' + (r.postData() || '')));
  const pp = await pc.newPage(); watch(pp, 'move-phone');
  await pp.goto(link); await pp.waitForSelector('dialog #mv-replace');
  ok('phone: confirm step before anything changes', /Move this board here\?/.test(await pp.locator('dialog h3').innerText()) && Object.keys((await state(pp)).ics).length === 0);
  ok('phone: fragment stripped from the address bar immediately', !(await pp.evaluate(() => location.href)).includes('#'));
  await pp.click('#mv-replace');
  await pp.waitForFunction(() => /Updated/.test((document.querySelector('#sb-sync') || {}).textContent || ''), null, { timeout: 15000 });
  await pp.waitForTimeout(3500);
  const ps = await state(pp);
  const pick = (x) => ({ status: x.status, custom: x.custom, cats: x.cats, classMap: x.classMap, proctorCol: x.proctorCol, createdAt: x.createdAt, feedUrl: x.feedUrl, ov: x.ov, hidden: x.hidden, rules: x.rules });
  ok('phone: state matches the desktop (progress by UID, tasks, categories, class names, columns, created, link)', JSON.stringify(pick(ps)) === JSON.stringify(pick(ds)), JSON.stringify(pick(ps)).slice(0, 160));
  ok('phone: refetched the events from the calendar link', Object.keys(ps.ics).length === Object.keys(ds.ics).length && !ps.pending);
  ok('phone: board shows the same progress', await pp.locator('.col[data-col="done"] .card').count() === await dp.locator('.col[data-col="done"] .card').count() && await pp.locator('#sb-chips .chip[data-c="Algebra II"]').count() === 1);
  ok('the fragment never reaches any server request', seen.length > 0 && seen.every((u) => !u.includes(fragment.slice(0, 40)) && !u.includes('move=')), seen.length + ' requests');
  ok('the relay only ever receives {url}', relayBodies.length >= 1 && relayBodies.every((b) => JSON.stringify(Object.keys(JSON.parse(b))) === '["url"]'));
  await pp.screenshot({ path: join(SHOTS, 'phone-after-move.png') });
  await pc.close();
  // phone with a board already: Replace / Merge
  const mc = await newCtx(phoneOpts); await stub(mc, YEARTXT);
  const mp = await mc.newPage(); watch(mp, 'move-merge');
  await mp.goto(BASE + '/'); await mp.click('#imp-sample'); await mp.waitForSelector('#sb-board .card');
  const before = await state(mp);
  await mp.goto(link); await mp.waitForSelector('dialog #mv-merge');
  ok('phone with a board: asks "Replace this board?" with a Merge option', /Replace this board\?/.test(await mp.locator('dialog h3').innerText()));
  await mp.screenshot({ path: join(SHOTS, 'phone-move-confirm.png') });
  await mp.click('#mv-merge'); await mp.waitForFunction(() => !window.SchoologyBoard.state().pending, null, { timeout: 15000 });
  const ms = await state(mp);
  ok('merge keeps the old board and adds the moved one', Object.keys(before.status).every((k) => ms.status[k] === before.status[k]) && Object.keys(ds.status).every((k) => ms.status[k] === ds.status[k]) && ms.cats.includes('Piano') && ms.feedUrl === FEED);
  await mc.close();
  // damaged link
  const bc = await newCtx(phoneOpts); const bp = await bc.newPage(); watch(bp, 'move-bad');
  await bp.goto(BASE + '/#move=zAAAAbrokenbroken'); await bp.waitForSelector('.toast');
  ok('damaged link: friendly error, fragment stripped', /damaged/.test(await bp.locator('.toast').innerText()) && !(await bp.evaluate(() => location.href)).includes('#'));
  await bc.close();
  // no calendar link: minimal events travel; too big for a QR -> link only
  const nc = await newCtx(); const np = await nc.newPage(); watch(np, 'move-nolink');
  await np.goto(BASE + '/'); await np.setInputFiles('#imp-file', ICS); await np.waitForSelector('#sb-board .card'); await skipNaming(np);
  await np.locator('.card').first().dblclick();
  const ns = await state(np);
  await more(np, '#sb-move'); await np.waitForSelector('dialog.move');
  const smallLink = await np.inputValue('#mv-url');
  const npng = await np.locator('#mv-qr').count() ? PNG.sync.read(await np.locator('#mv-qr').screenshot()) : null;
  const nqr = npng && jsQR(new Uint8ClampedArray(npng.data), npng.width, npng.height);
  ok('no calendar link: small board still gets a scannable QR', !!nqr && nqr.data === smallLink, smallLink.length + ' chars');
  await np.click('dialog.move [data-close]');
  await np.keyboard.press('i'); await np.setInputFiles('dialog #imp-file', YEAR); await np.waitForTimeout(800); await skipNaming(np, 800);
  await more(np, '#sb-move'); await np.waitForSelector('dialog.move');
  const bigLink = await np.inputValue('#mv-url');
  ok('too big for a reliable QR: link only, with Copy (and Share where supported)', await np.locator('#mv-qr').count() === 0 && /too big for a QR code/.test(await np.locator('dialog.move').innerText()) && await np.locator('#mv-copy').count() === 1, bigLink.length + ' chars');
  await np.screenshot({ path: join(SHOTS, 'move-link-only.png') });
  const nps = await state(np); const evCount = await np.evaluate(() => window.SchoologyBoard.movePayload().ev.length);
  await nc.close();
  const rc = await newCtx({ ...phoneOpts, now: NOW }); const rq = []; rc.on('request', (r) => rq.push(r.url()));
  const rp2 = await rc.newPage(); watch(rp2, 'move-nolink-phone');
  await rp2.goto(bigLink); await rp2.click('#mv-replace'); await rp2.waitForSelector('#sb-board .card');
  const r2 = await state(rp2);
  ok('no-link move carries the events still in play and progress', Object.keys(r2.ics).length === evCount && evCount < Object.keys(nps.ics).length && Object.keys(nps.status).every((k) => r2.status[k] === nps.status[k]) && r2.feedUrl === '', evCount + ' of ' + Object.keys(nps.ics).length + ' events');
  ok('no-link move: no relay request at all', !rq.some((u) => /api\/feed/.test(u)));
  await rc.close();
  // Import a backup: the .html from "Save a backup" into a fresh web board
  const yoff = join(SHOTS, 'year-offline.html');
  const baked = JSON.parse(readFileSync(yoff, 'utf8').match(/<script id="sb-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const ic = await newCtx({ now: when }); const ip = await ic.newPage(); watch(ip, 'restore');
  await ip.goto(BASE + '/'); await ip.click('#imp-sample'); await ip.waitForSelector('#sb-board .card');
  const [fc] = await Promise.all([ip.waitForEvent('filechooser'), more(ip, '#sb-restore')]);
  await fc.setFiles(yoff); await ip.waitForSelector('dialog #mv-replace');
  ok('Import a backup: confirm step names the file', /year-offline\.html/.test(await ip.locator('dialog').innerText()) && /Replace this board\?/.test(await ip.locator('dialog h3').innerText()));
  await ip.click('#mv-replace'); await ip.waitForTimeout(300);
  const is = await state(ip);
  ok('Import a backup (.html): state restored exactly', JSON.stringify(pick({ ...is, feedUrl: '' })) === JSON.stringify(pick({ ...baked, feedUrl: '' })) && Object.keys(is.ics).length === Object.keys(baked.ics).length && await ip.locator('#sb-chips .chip[data-c="Algebra II"]').count() === 1);
  await ic.close();
  // ... and a .json export into the backup file opened from disk (merge)
  const jpath = join(SHOTS, 'board-export.json'); writeFileSync(jpath, JSON.stringify({ state: { ...ds, feedUrl: '' } }));
  const oc2 = await newCtx(); const op2 = await oc2.newPage(); watch(op2, 'restore-offline');
  await op2.route('**/*', (r) => (/^(file|blob|data):/.test(r.request().url()) ? r.continue() : r.abort()));
  await op2.goto(pathToFileURL(join(SHOTS, 'schoology-board-offline.html')).href); await op2.waitForSelector('#sb-board .card');
  const ob = await state(op2);
  const [fc2] = await Promise.all([op2.waitForEvent('filechooser'), more(op2, '#sb-restore')]);
  await fc2.setFiles(jpath); await op2.waitForSelector('dialog #mv-merge'); await op2.click('#mv-merge'); await op2.waitForTimeout(300);
  const os2 = await state(op2);
  ok('backup file: Import a backup (.json) merges, keeps its own items, no link', os2.cats.includes('Piano') && os2.cats.includes('Reading') && Object.keys(ob.custom).every((k) => os2.custom[k]) && os2.classMap && Object.values(os2.classMap).includes('Algebra II') && os2.feedUrl === '');
  await op2.reload(); await op2.waitForSelector('#sb-board .card');
  ok('backup file: the restore persists across reload', (await state(op2)).cats.includes('Piano'));
  await oc2.close();
}

await browser.close();
ok('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
writeFileSync(join(SHOTS, 'e2e-results.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, errors }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
