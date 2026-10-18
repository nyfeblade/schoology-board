// End-to-end check in headless Chromium.
//   BASE_URL=https://your-deploy.vercel.app SHOTS=./shots node test/e2e.mjs
// Covers: first run, sample board, .ics import + re-import, drag/keyboard/double-click,
// custom categories + tasks, CAS PDF preview + dedupe, backup opened from file://,
// a 517-item year frozen at several moments (creation day, weekday, Friday 5/7 PM, Sunday),
// Tonight (verdict, estimates, timer, finish + undo, reorder, pull in, flags, all states), themes,
// PWA, background refresh, and phone long-press drag in EMULATED Android Chrome + iPhone WebKit.
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
  page.on('console', (m) => { if (m.type() === 'error' && !(tag === 'link' && /status of 422/.test(m.text())) && !(tag === 'refresh' && /status of 502/.test(m.text())) && !(tag === 'bg-refresh' && /status of 502/.test(m.text())) && !(tag === 'pwa' && /status of (400|405|504)/.test(m.text()))) errors.push(`${tag} console: ${m.text()}`); }); // deliberate probes: the 422 bad link, stubbed 502 failures, and the pwa test's relay calls (405 GET; 504 unreachable host locally, 400 rejected host on the live relay)
  page.on('dialog', (d) => d.accept());
}
const state = (page) => page.evaluate(() => window.SchoologyBoard.state());
// The ⋯ menu closes if an async import finishes and re-renders right as it opens; open it again in that case.
const more = async (page, id) => { for (let k = 0; ; k++) { await page.click('#sb-more'); try { await page.click(id, { timeout: k < 2 ? 2500 : 30000 }); return; } catch (e) { if (k >= 2) throw e; await page.keyboard.press('Escape'); await page.waitForTimeout(300); } } };
const newCtx = async (opts = {}) => { const c = await browser.newContext({ timezoneId: 'America/New_York', acceptDownloads: true, viewport: { width: 1440, height: 900 }, ...opts }); await c.clock.setFixedTime(opts.now || NOW); return c; };
const cardByTitle = (page, t) => page.locator('.card', { hasText: t }).first();
// The "Name your classes" step opens after a user import; skip it when a test isn't about it.
const skipNaming = async (page, wait = 1200) => { try { await page.waitForSelector('dialog.naming', { timeout: wait }); await page.click('#nm-skip'); await page.waitForTimeout(150); return true; } catch { return false; } };
const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
// Returning students open on Now; most checks here are about the Board tab, so switch to it (works under a modal too).
async function board(page, sel = '', opts) {
  await page.waitForSelector('#sb-tabs', { state: 'attached', ...(opts || {}) });
  await page.evaluate(() => { const b = document.querySelector('#sb-tabs [data-tab=board]'); if (b && b.getAttribute('aria-current') !== 'page') b.click(); });
  await page.waitForSelector('#sb-board' + sel, opts);
}
// Views: the top nav hides on phones (bottom bar there), so click through the DOM.
async function tab(page, t) { await page.evaluate((t) => document.querySelector(`#sb-tabs [data-tab=${t}]`).click(), t); await page.waitForTimeout(80); }
const pill = (page) => page.locator('.fpill:visible').first().innerText();
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
      let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return { h, s: d / mx, c: d }; };
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      for (const p of ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor', 'outlineColor', 'fill', 'stroke']) {
        const m = (cs[p] || '').match(/rgba?\((\d+), (\d+), (\d+)/); if (!m) continue;
        const v = hue(+m[1], +m[2], +m[3]); if (v && ((v.h >= 150 && v.h <= 210 && v.s > 0.2) || (v.h >= 15 && v.h < 46 && v.c >= 0.15))) bad.push(`${el.tagName}.${el.className} ${p} ${cs[p]}`);
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
await board(page, ' .card');
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
await mpage.goto(BASE + '/'); await mpage.click('#imp-sample'); await board(mpage, ' .card'); await mpage.waitForTimeout(3500);
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
  ok('mobile: ⋯ opens a bottom sheet with Import tasks, Edit categories and Save a backup file', /Import tasks/.test(sheetText) && /Edit categories/.test(sheetText) && /Save a backup file/.test(sheetText) && !/Download for offline/.test(sheetText) && !/Keyboard/.test(sheetText));
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
await board(page, ' .card');
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
ok('desktop ⋯ menu holds Edit categories, Name your classes, Save a backup file and Show keyboard shortcuts', /Edit categories[\s\S]*Name your classes[\s\S]*Save a backup file[\s\S]*Show keyboard shortcuts/.test(await page.locator('.menu').innerText()));
ok('"Save a backup" is not red', await page.locator('#sb-backup').evaluate((e) => !/255, 62, 81/.test(getComputedStyle(e).backgroundColor + getComputedStyle(e).color)));
await page.keyboard.press('Escape');
ok('one labelled button in the header (Add task); the rest are quiet icons', (await page.locator('.topbar .btn').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.id).join())) === 'sb-add');
await page.screenshot({ path: join(SHOTS, 'board-after-flow.png') });

// ---------- 7. live link import through the proxy ----------
if (LIVE_LINK) {
  // separate context so the main board's storage is untouched
  const lctx = await newCtx();
  const lp = await lctx.newPage(); watch(lp, 'link');
  await lp.goto(BASE + '/');
  await lp.fill('#imp-url', BASE.replace(/^https:/, 'webcal:') + '/sample/schoology-sample.ics');
  await lp.click('#imp-go');
  await board(lp, ' .card', { timeout: 20000 });
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
{ const h = readFileSync(offlinePath, 'utf8'); ok('backup inlines the active theme (tokens + data-theme)', /<html lang="en" data-theme="sticker"/.test(h) && /<style id="sb-theme">[\s\S]*--bgc:/.test(h)); }
await ctx.close();

const octx = await newCtx();
const op = await octx.newPage(); watch(op, 'offline');
await op.route('**/*', (r) => (r.request().url().startsWith('file:') || r.request().url().startsWith('blob:') || r.request().url().startsWith('data:') ? r.continue() : r.abort()));
await op.goto(pathToFileURL(offlinePath).href);
await board(op, ' .card');
await op.click('.seg button[data-view="all"]');
let ost = await state(op);
ok('offline file renders from file:// with no network', await op.locator('#sb-board .card').count() > 10);
ok('offline file carries custom category + task', ost.cats.includes('Reading') && Object.values(ost.custom).some((c) => c.title.includes('Animal Farm')));
ok('offline file carries CAS tasks', Object.keys(ost.cas).length === casTitles.length);
ok('offline file carries progress', ost.status[id] === 'started');
ok('offline file does not contain the calendar link', !JSON.stringify(ost).includes('feedUrl":"http'));
ok('backup says "Offline copy" and does not try to refresh', /Saved copy from/.test(await pill(op)));
await op.screenshot({ path: join(SHOTS, 'offline-board.png') });
const oc = cardByTitle(op, 'Two-Column Proof'); const ocid = await oc.getAttribute('data-id');
await dragTo(op, oc, 'done');
await op.reload(); await board(op, ' .card');
ost = await state(op);
ok('offline: drag persists in localStorage across reload', ost.status[ocid] === 'done');
await more(op, '#sb-import'); await op.setInputFiles('dialog #imp-file', ICS); await op.waitForTimeout(400);
ost = await state(op);
ok('offline: .ics re-import works and keeps custom + CAS + progress', Object.keys(ost.ics).length === 19 && ost.status[ocid] === 'done' && Object.keys(ost.custom).length === 1 && Object.keys(ost.cas).length === casTitles.length);
await more(op, '#sb-import'); await op.setInputFiles('dialog #imp-file', CASPDF);
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
  const at = async (t) => { await yctx.clock.setFixedTime(t); await yp.reload(); await board(yp, ''); };
  // creation day
  ok('year: cutoff is the start of the creation day', (await state(yp)).createdAt === cutoff);
  await board(yp, '');
  await yp.click('.seg button[data-view="today"]');
  let g = await check('creation day, Due today (3 due 23:59, before the board existed)', visible.filter((e) => e.date === '2027-01-04'));
  ok('creation day: no note when nothing is hidden in view', g.note === '');
  await yp.click('.seg button[data-view="all"]');
  g = await readBoard();
  ok(`creation day: All shows the note "${hiddenTotal} earlier items hidden · Show"`, g.note.replace(/\s+/g, ' ') === `${hiddenTotal} earlier items hidden · Show`, g.note);
  const ncs = await yp.locator('#sb-note').evaluate((e) => ({ fs: getComputedStyle(e).fontSize, c: getComputedStyle(e).color }));
  ok('hidden note is quiet: 13px in the theme\'s muted ink', ncs.fs === '13px' && ncs.c === await yp.evaluate(() => { const i = document.createElement('i'); i.style.color = 'var(--mut)'; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; }), JSON.stringify(ncs));
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
  await yop.goto(pathToFileURL(yoff).href); await board(yop, '');
  await yop.click('.seg button[data-view="all"]');
  const os = await state(yop);
  ok('backup: creation cutoff, hiding and proctor column carry over', os.createdAt === cutoff && os.proctorCol === true && await yop.locator('#sb-board .card').count() === visible.length);
  ok('backup: class names carry over (mapping + chip)', JSON.stringify(os.classMap) === JSON.stringify(ystate.classMap) && await yop.locator('#sb-chips .chip[data-c="Algebra II"]').count() === 1);
  ok('backup: hidden note works offline', ((await yop.locator('#sb-note').textContent()) || '').startsWith(hiddenTotal + ' earlier items hidden'));
  await more(yop, '#sb-import'); await yop.setInputFiles('dialog #imp-file', YEAR); await yop.waitForTimeout(600);
  ok('backup: re-import there keeps the class names', await yop.locator('#sb-chips .chip[data-c="Algebra II"]').count() === 1 && await yop.locator('#sb-chips .chip[data-c="ALG2"]').count() === 0);
  await yo.close();
}
// ---------- 10. migrations from older saved boards ----------
{
  const c = await newCtx(); const pg = await c.newPage(); watch(pg, 'migrate');
  await pg.goto(BASE + '/');
  await pg.evaluate(() => localStorage.setItem('schoology-board:v1', JSON.stringify({ v: 1, ics: { old: { uid: 'old', title: 'Old overdue thing', due: '2026-09-01T12:00', source: 'ics' }, early: { uid: 'early', title: 'Due at 6am today', due: '2026-10-19T06:00', source: 'ics' }, fresh: { uid: 'fresh', title: 'Next week thing', due: '2026-10-21T12:00', source: 'ics' } }, prefs: { view: 'range', from: '2026-10-01', to: '2026-10-31' } })));
  await pg.reload(); await board(pg, '');
  const s2 = await state(pg);
  ok('older boards get a creation cutoff at the start of today', s2.createdAt === sod(NOW));
  ok('older boards: old items hide, work due earlier today stays', !(await pg.locator('.card', { hasText: 'Old overdue thing' }).count()) && await pg.locator('.card', { hasText: 'Due at 6am today' }).count() === 1);
  ok('saved "range" view migrates to Week', s2.prefs.view === 'week' && (await pg.locator('.seg button[aria-pressed="true"]').innerText()) === 'Week');
  ok('boards without proctor items get no proctor column', s2.proctorCol === false && await pg.locator('.col').count() === 3);
  // a mid-day createdAt moves to that day's midnight; a board using the proctor column keeps it
  await pg.evaluate(() => localStorage.setItem('schoology-board:v1', JSON.stringify({ v: 1, createdAt: new Date('2026-10-19T09:30:00-04:00').getTime(), ics: { a: { uid: 'a', title: 'Unit 2 Test (proctored)', due: '2026-10-20T12:00', source: 'ics' }, b: { uid: 'b', title: 'Morning quiz', due: '2026-10-19T08:00', source: 'ics' } } })));
  await pg.reload(); await board(pg, '');
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
  await board(rp, ' .card'); await skipNaming(rp, 3000);
  let rs = await state(rp);
  ok('link import remembers the link in this browser only', rs.feedUrl === FEED && rs.lastFetch && rs.lastFetch.ok === true && relayHits === 1);
  ok('refresh: "Synced with Schoology just now" after import', /Synced with Schoology just now/.test(await pill(rp)));
  const wk = await rp.evaluate(() => document.querySelectorAll('#sb-board .card').length);
  ok('creation-day cutoff: Week hides 4 earlier items and keeps the 8 AM item due today', (await rp.locator('#sb-note').innerText()).replace(/\s+/g, ' ') === '4 earlier items hidden · Show' && await rp.locator('.card', { hasText: 'Osmosis' }).count() === 1, await rp.locator('#sb-note').innerText());
  await cardByTitle(rp, 'Osmosis').dblclick();
  mode = 'B';
  await rctx.clock.setFixedTime(new Date(wed.getTime() + 60e3));
  await rp.reload(); await board(rp, ' .card'); await rp.waitForSelector('.bhead .fpill.ok');
  rs = await state(rp);
  ok('refresh on open re-fetches through the relay and merges', relayHits === 2 && !!rs.ics['sb-sample-new@example.invalid'] && !Object.values(rs.ics).some((e) => /Picture Day/.test(e.title)) && await rp.locator('.card', { hasText: 'Field Trip Permission Form' }).count() === 1);
  ok('refresh keeps progress (status survives)', Object.entries(rs.status).some(([k, v]) => v === 'done' && /Osmosis/.test((rs.ics[k] || {}).title || '')));
  ok('auto-refresh does not open the naming step or a toast', await rp.locator('dialog.naming').count() === 0 && await rp.locator('.toast', { hasText: 'Imported' }).count() === 0);
  await rctx.clock.setFixedTime(new Date(wed.getTime() + 4 * 60e3));
  await rp.click('.seg button[data-view="week"]');
  ok('"Synced with Schoology 3m ago" ticks with the clock', /Synced with Schoology 3m ago/.test(await pill(rp)), await pill(rp));
  ok('the freshness pill sits in the board header', await rp.locator('.bhead .fpill').isVisible());
  await rp.screenshot({ path: join(SHOTS, 'board-hidden-note-updated.png') });
  mode = 'fail';
  const before = await rp.locator('#sb-board .card').count();
  await rp.reload(); await board(rp, ' .card');
  await rp.waitForSelector('.banner.ferr', { timeout: 5000 });
  const failTxt = (await rp.locator('.banner.ferr').innerText()).replace(/\s+/g, ' ');
  ok('failed refresh: a loud banner (Retry, Open Schoology, "Your check-offs still save on this device"), cached board kept, no toast', /Retry/.test(failTxt) && /Open Schoology/.test(failTxt) && /Your check-offs still save on this device/.test(failTxt) && await rp.locator('#sb-board .card').count() === before && await rp.locator('.toast').count() === 0, failTxt);
  ok('failed refresh: the pill turns to "Sync failed · last good …"', /Sync failed · last good/.test(await pill(rp)) && await rp.locator('.bhead .fpill.ferr').count() === 1, await pill(rp));
  mode = 'B';
  await rp.click('.banner.ferr [data-refresh]'); await rp.waitForSelector('.bhead .fpill.ok');
  ok('Retry recovers', /Synced with Schoology just now/.test(await pill(rp)) && await rp.locator('.banner.ferr').count() === 0);
  ok('the link only travels in the relay request body', bodiesSeen.every((b) => JSON.parse(b).url === FEED));
  // phone width
  const pctx = await newCtx({ now: new Date(wed.getTime() + 4 * 60e3), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pctx.route('**/api/feed', (r) => r.fulfill({ status: 200, contentType: 'text/calendar', body: B }));
  await pctx.addInitScript((st) => { if (!localStorage.getItem('schoology-board:v1')) localStorage.setItem('schoology-board:v1', st); }, JSON.stringify({ ...rs, lastFetch: { at: wed.getTime() + 60e3, ok: true } }));
  const pp = await pctx.newPage(); watch(pp, 'phone');
  await pp.goto(BASE + '/'); await board(pp, ' .card'); await pp.waitForSelector('.bhead .fpill.ok'); await pp.waitForTimeout(400);
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
  await bop.goto(pathToFileURL(rpath).href); await board(bop, ' .card'); await bop.waitForTimeout(500);
  ok('backup opened from disk: "Saved copy from …", no refresh attempt', /Saved copy from/.test(await pill(bop)) && net === 0 && (await state(bop)).feedUrl === '');
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
  await dctx.clock.setFixedTime(when); await dp.reload(); await board(dp, ' .card'); await dp.waitForSelector('.fpill.ok');
  await dp.click('#sb-filter'); await dp.check('#sb-proctorcol'); await dp.keyboard.press('Escape');
  await dp.locator('.col[data-col="todo"] .card').nth(0).dblclick();
  await dp.locator('.col[data-col="todo"] .card').nth(0).focus(); await dp.keyboard.press('2');
  await dp.locator('.col[data-col="todo"] .card').nth(1).focus(); await dp.keyboard.press('3');
  await more(dp, '#sb-cats'); await dp.fill('#cat-new', 'Piano'); await dp.press('#cat-new', 'Enter'); await dp.click('dialog [data-close]');
  // planner state that must travel: estimates, a one-tap test mark, timed minutes, a finished study night
  await dp.evaluate(() => { const S = window.SchoologyBoard.state(), ids = Object.keys(S.ics).sort().slice(0, 3); S.est[ids[0]] = 90; S.ttype[ids[1]] = 'test'; S.actual[ids[2]] = 25; S.sdone[ids[1] + '@2027-02-10'] = 1; });
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
  await pp.waitForSelector('.fpill.ok', { timeout: 15000 });
  await pp.waitForTimeout(3500);
  const ps = await state(pp);
  const pick = (x) => ({ status: x.status, custom: x.custom, cats: x.cats, classMap: x.classMap, proctorCol: x.proctorCol, createdAt: x.createdAt, feedUrl: x.feedUrl, ov: x.ov, hidden: x.hidden, rules: x.rules, est: x.est, ttype: x.ttype, actual: x.actual, sdone: x.sdone });
  ok('Move to phone: planner state (estimates, test mark, timed minutes, study night) is in the payload', Object.keys(ds.est).length === 1 && Object.keys(ds.ttype).length === 1 && Object.keys(ds.actual).length === 1 && Object.keys(ds.sdone).length === 1);
  ok('phone: state matches the desktop (progress by UID, tasks, categories, class names, columns, created, link, planner)', JSON.stringify(pick(ps)) === JSON.stringify(pick(ds)), JSON.stringify(pick(ps)).slice(0, 160));
  ok('phone: refetched the events from the calendar link', Object.keys(ps.ics).length === Object.keys(ds.ics).length && !ps.pending);
  await board(pp, ' .card');
  ok('phone: board shows the same progress', await pp.locator('.col[data-col="done"] .card').count() === await dp.locator('.col[data-col="done"] .card').count() && await pp.locator('#sb-chips .chip[data-c="Algebra II"]').count() === 1);
  ok('the fragment never reaches any server request', seen.length > 0 && seen.every((u) => !u.includes(fragment.slice(0, 40)) && !u.includes('move=')), seen.length + ' requests');
  ok('the relay only ever receives {url}', relayBodies.length >= 1 && relayBodies.every((b) => JSON.stringify(Object.keys(JSON.parse(b))) === '["url"]'));
  await pp.screenshot({ path: join(SHOTS, 'phone-after-move.png') });
  await pc.close();
  // phone with a board already: Replace / Merge
  const mc = await newCtx(phoneOpts); await stub(mc, YEARTXT);
  const mp = await mc.newPage(); watch(mp, 'move-merge');
  await mp.goto(BASE + '/'); await mp.click('#imp-sample'); await board(mp, ' .card');
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
  await np.goto(BASE + '/'); await np.setInputFiles('#imp-file', ICS); await board(np, ' .card'); await skipNaming(np);
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
  await rp2.goto(bigLink); await rp2.click('#mv-replace'); await board(rp2, ' .card');
  const r2 = await state(rp2);
  ok('no-link move carries the events still in play and progress', Object.keys(r2.ics).length === evCount && evCount < Object.keys(nps.ics).length && Object.keys(nps.status).every((k) => r2.status[k] === nps.status[k]) && r2.feedUrl === '', evCount + ' of ' + Object.keys(nps.ics).length + ' events');
  ok('no-link move: no relay request at all', !rq.some((u) => /api\/feed/.test(u)));
  await rc.close();
  // Import a backup: the .html from "Save a backup" into a fresh web board
  const yoff = join(SHOTS, 'year-offline.html');
  const baked = JSON.parse(readFileSync(yoff, 'utf8').match(/<script id="sb-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const ic = await newCtx({ now: when }); const ip = await ic.newPage(); watch(ip, 'restore');
  await ip.goto(BASE + '/'); await ip.click('#imp-sample'); await board(ip, ' .card');
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
  await op2.goto(pathToFileURL(join(SHOTS, 'schoology-board-offline.html')).href); await board(op2, ' .card');
  const ob = await state(op2);
  const [fc2] = await Promise.all([op2.waitForEvent('filechooser'), more(op2, '#sb-restore')]);
  await fc2.setFiles(jpath); await op2.waitForSelector('dialog #mv-merge'); await op2.click('#mv-merge'); await op2.waitForTimeout(300);
  const os2 = await state(op2);
  ok('backup file: Import a backup (.json) merges, keeps its own items, no link', os2.cats.includes('Piano') && os2.cats.includes('Reading') && Object.keys(ob.custom).every((k) => os2.custom[k]) && os2.classMap && Object.values(os2.classMap).includes('Algebra II') && os2.feedUrl === '');
  await op2.reload(); await board(op2, ' .card');
  ok('backup file: the restore persists across reload', (await state(op2)).cats.includes('Piano'));
  ok('backup file: merged planner state (estimates, timed minutes) arrives', Object.keys(ds.est).every((k) => os2.est[k] === ds.est[k]) && Object.keys(ds.actual).every((k) => os2.actual[k] === ds.actual[k]));
  await oc2.close();
}

// ---------- 13. Tonight (home): verdict, rows, estimates, timer, finish + undo, study nights, start-early, Sunday plan ----------
{
  const PNOW = new Date('2026-10-19T17:02:00-04:00'); // Monday afternoon
  const hm = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  const nc = await newCtx({ now: PNOW }); const np = await nc.newPage(); watch(np, 'planner');
  await np.goto(BASE + '/'); await np.click('#imp-sample'); await np.waitForSelector('#tnList .trow');
  ok('after import the home screen is Tonight: verdict, then the Tonight list, then Coming up',
    await np.locator('#sb-tabs [data-tab=now][aria-current=page]').count() === 1 && await np.locator('#tn-main .thero + .sec.tonight').count() === 1 && await np.locator('#tn-main .sec.coming').count() === 1);
  const hero = (await np.locator('#tn-main .thero').innerText()).replace(/\s+/g, ' ');
  ok('verdict: "2 things tonight, about 1h 45m", the first step and a done-by time',
    /2 things tonight, about 1h 45m/.test(hero) && /First up: Problem Set 4\.2, due tonight 11:59 PM\. Done by about 7:00 PM\./.test(hero), hero.slice(0, 200));
  ok('the freshness pill is on Tonight', await np.locator('#tn-main .fpill').isVisible());
  const plan0 = await np.evaluate(() => { const p = window.SchoologyBoard.plan(); return { blocks: p.blocks.map((b) => [b.kind, b.min, b.task ? b.task.item.title : '']), finish: p.finish && p.finish.toISOString(), start: p.start.toISOString() }; });
  ok('Tonight: starts now rounded up to 5 minutes (5:05 PM), ordered by due date, with a 10-minute break after ~50 minutes',
    hm(new Date(plan0.start)) === '5:05 PM' && JSON.stringify(plan0.blocks) === JSON.stringify([['work', 45, 'Problem Set 4.2'], ['break', 10, ''], ['work', 60, 'DBQ: Causes of the French Revolution']]), JSON.stringify(plan0.blocks));
  ok('rows show their planned time, the list says when you will be done', /5:05–5:50 PM/.test(await np.locator('#tnList').innerText()) && /done by about 7:00 PM/.test(await np.locator('.tn-when').innerText()));
  ok('guessed estimates are dashed chips, explained by a legend', await np.locator('#tnList .estb.guess').count() === 2 && /Dashed times are our guesses/.test(await np.locator('.legend').innerText()));
  await np.screenshot({ path: join(SHOTS, 'now-desktop.png') });
  // a time chip: quick times, or the full editor
  await np.locator('#tnList .estb').first().click(); await np.waitForSelector('#sb-menu');
  ok('tapping a time chip offers quick times (15 min to 2 h) and "More options…"', await np.locator('#sb-menu .menu-i.radio').count() === 6 && await np.locator('#sb-menu .menu-i', { hasText: 'More options' }).count() === 1);
  await np.locator('#sb-menu .menu-i', { hasText: 'More options' }).click(); await np.waitForSelector('dialog.est');
  ok('estimate editor: quick chips 15–180 min, a custom field and the kind of work', await np.locator('dialog.est [data-m]').count() === 7 && await np.locator('#est-custom').count() === 1 && await np.locator('dialog.est [data-t]').count() === 6);
  await np.locator('dialog.est [data-m="90"]').click();
  await np.screenshot({ path: join(SHOTS, 'estimate-editor.png') });
  await np.click('#est-save'); await np.waitForTimeout(150);
  const p1 = await np.evaluate(() => { const p = window.SchoologyBoard.plan(); return { finish: p.finish.toISOString(), parts: p.blocks[0].parts }; });
  ok('a new estimate recalculates the plan live (90 min splits around a break; finishes later; chip no longer dashed)', p1.parts === 2 && new Date(p1.finish) > new Date(plan0.finish) && await np.locator('#tnList .trow').first().locator('.estb.guess').count() === 0);
  await np.locator('#tnList .estb').nth(1).click(); await np.locator('#sb-menu .menu-i', { hasText: /^30 min$/ }).click(); await np.waitForTimeout(150);
  ok('one tap on a quick time sets it (30 min) and the plan follows', await np.evaluate(() => window.SchoologyBoard.plan().tasks[1].min) === 30);
  await np.locator('#tnList .estb').nth(1).click(); await np.locator('#sb-menu .menu-i', { hasText: /^1 h$/ }).click(); await np.waitForTimeout(150);
  // timer
  await np.click('#tnList [data-timer]');
  ok('Start timer: the first row shows a running clock and "Stop timer"', await np.locator('#tnList .run-t').count() === 1 && await np.locator('#tnList [data-stop]').count() === 1);
  await nc.clock.setFixedTime(new Date(PNOW.getTime() + 20 * 60e3)); await np.waitForTimeout(1200);
  ok('timer counts up', /20:0\d/.test(await np.locator('#tnList .run-t').innerText()), await np.locator('#tnList .run-t').innerText());
  await np.screenshot({ path: join(SHOTS, 'timer-running.png') });
  await np.click('#tnList [data-stop]'); await np.waitForTimeout(150);
  let st = await state(np); const psId = Object.keys(st.ics).find((k) => /Problem Set 4\.2/.test(st.ics[k].title));
  ok('Stop timer records actual minutes and takes them off the remaining time', st.actual[psId] === 20 && !st.timer && await np.evaluate(() => window.SchoologyBoard.plan().tasks[0].min) === 70);
  // check it off, undo, check it off again
  await np.locator('#tnList .trow', { hasText: 'Problem Set 4.2' }).locator('.bigchk').click(); await np.waitForTimeout(1100);
  st = await state(np);
  ok('check-off: it moves to Completed, leaves the list and the verdict counts down', st.status[psId] === 'done' && await np.locator('#tnList .trow', { hasText: 'Problem Set 4.2' }).count() === 0 && /1 thing tonight/.test(await np.locator('#verdict').innerText()));
  ok('finished items are hidden with "Hiding N finished · Show"', /Hiding \d+ finished items? · Show/.test((await np.locator('.hid.fin').innerText()).replace(/\s+/g, ' ')));
  await np.locator('.toast', { hasText: 'Done: Problem Set 4.2' }).locator('button').click(); await np.waitForTimeout(250);
  ok('Undo puts it back on tonight\'s list', (await state(np)).status[psId] !== 'done' && await np.locator('#tnList .trow', { hasText: 'Problem Set 4.2' }).count() === 1);
  await np.locator('#tnList .trow', { hasText: 'Problem Set 4.2' }).locator('.bigchk').click(); await np.waitForTimeout(1100);
  await np.click('[data-showdone]');
  ok('"Show" lists the finished items (crossed out)', await np.locator('.donel .trow.tdone', { hasText: 'Problem Set 4.2' }).count() === 1);
  await np.click('[data-showdone]');
  // learning: two timed, finished Geometry homework tasks replace the default
  await np.evaluate(() => { const S = window.SchoologyBoard.state(); const g = Object.keys(S.ics).filter((k) => /Problem Set 4\.[13]/.test(S.ics[k].title)); g.forEach((k) => { S.status[k] = 'done'; S.actual[k] = 30; }); });
  await tab(np, 'board'); await tab(np, 'now');
  const learned = await np.evaluate(() => { const S = window.SchoologyBoard.state(); const id = Object.keys(S.ics).find((k) => /Two-Column/.test(S.ics[k].title)); return window.SchoologyBoard.estimate(id); });
  ok('learning: after 2 timed Geometry homework tasks, the next one uses the smoothed average', learned && learned.src === 'learned' && learned.min === 30, JSON.stringify(learned));
  // one-tap "this is a test": the DBQ becomes study sessions on the nights before it
  await np.locator('#tnList .trow', { hasText: 'DBQ' }).locator('.estb').click(); await np.locator('#sb-menu .menu-i', { hasText: 'More options' }).click();
  await np.locator('dialog.est [data-t="test"]').click(); await np.click('#est-save'); await np.waitForTimeout(150);
  const tn = await np.evaluate(() => window.SchoologyBoard.plan().tasks.map((t) => t.kind + ':' + t.item.title));
  ok('marking an item as a test turns it into a study session tonight (the night before)', tn.some((x) => /^study:DBQ/.test(x)) && !tn.some((x) => /^work:DBQ/.test(x)), tn.join(' | '));
  ok('study sessions are labeled in the list', await np.locator('#tnList .pin', { hasText: 'Study session' }).count() >= 1);
  await np.screenshot({ path: join(SHOTS, 'test-block-night.png') });
  // start-early: a 3-hour project due in 4 days gets a board flag and a 45-minute chunk tonight
  await np.keyboard.press('n'); await np.fill('#ed-title', 'Science Fair Project'); await np.fill('#ed-date', '2026-10-23'); await np.fill('#ed-time', '08:00'); await np.click('#ed-save'); await np.waitForTimeout(150);
  await np.evaluate(() => { const S = window.SchoologyBoard.state(); const id = Object.keys(S.custom).find((k) => S.custom[k].title === 'Science Fair Project'); S.est[id] = 180; });
  await tab(np, 'board'); await tab(np, 'now'); await np.waitForTimeout(100);
  const early = await np.evaluate(() => window.SchoologyBoard.plan().tasks.filter((t) => t.kind === 'early').map((t) => t.item.title + ':' + t.min));
  ok('start-early: 2h+ due in 3–5 days puts a 45-minute first chunk in tonight\'s list', JSON.stringify(early) === JSON.stringify(['Science Fair Project:45']) && await np.locator('#tnList .pin.early', { hasText: 'Start early' }).count() === 1, JSON.stringify(early));
  await board(np, ' .card');
  ok('start-early: the card gets a subtle "Start early" flag on the board', await cardByTitle(np, 'Science Fair Project').locator('.flag.early').count() === 1);
  await cardByTitle(np, 'Science Fair Project').scrollIntoViewIfNeeded();
  await np.screenshot({ path: join(SHOTS, 'start-early-flag.png') });
  // overflow
  await tab(np, 'now');
  await np.fill('#tn-start', '22:30'); await np.locator('#tn-start').dispatchEvent('change'); await np.waitForTimeout(150);
  ok('overloaded night: an honest "won\'t fit before 11:00 PM" note, and the rows that spill say so', /Won’t fit before 11:00 PM/.test(await np.locator('.spill').innerText()) && await np.locator('#tnList .when.late').count() >= 1);
  ok('the verdict and the start line both say what won\'t fit (no "done by" promise)', /more than fits tonight: \d+ things? won’t fit before 11:00 PM/.test(await np.locator('.nudge').innerText()) && /won’t fit before 11:00 PM/.test(await np.locator('.tn-when').innerText()) && !/done by/.test(await np.locator('.tn-when').innerText()));
  await np.click('#tn-now');
  // persistence: reload and the backup file
  await np.reload(); await np.waitForSelector('#tnList .trow');
  st = await state(np);
  ok('planner state survives a reload (estimates, test mark, timed minutes)', Object.keys(st.est).length >= 2 && Object.values(st.ttype).includes('test') && st.actual[psId] === 20);
  const [bdl] = await Promise.all([np.waitForEvent('download'), more(np, '#sb-backup')]);
  const bpath = join(SHOTS, 'planner-backup.html'); await bdl.saveAs(bpath);
  const bk = JSON.parse(readFileSync(bpath, 'utf8').match(/<script id="sb-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  ok('backup file carries the planner state and the planner code', JSON.stringify(bk.est) === JSON.stringify(st.est) && JSON.stringify(bk.actual) === JSON.stringify(st.actual) && /<script id="sb-src-plan">/.test(readFileSync(bpath, 'utf8')));
  const bo = await newCtx({ now: new Date(PNOW.getTime() + 25 * 60e3) }); const bop = await bo.newPage(); watch(bop, 'planner-backup');
  await bop.route('**/*', (r) => (/^(file|blob|data):/.test(r.request().url()) ? r.continue() : r.abort()));
  await bop.goto(pathToFileURL(bpath).href); await bop.waitForSelector('#tn-main');
  ok('the backup opens on Tonight with the same plan, offline', JSON.stringify(await bop.evaluate(() => window.SchoologyBoard.plan().tasks.map((t) => t.kind + t.item.title + t.min))) === JSON.stringify(await np.evaluate(() => window.SchoologyBoard.plan().tasks.map((t) => t.kind + t.item.title + t.min))));
  ok('the backup shows "Saved copy" in the freshness pill', /Saved copy from/.test(await pill(bop)));
  await bo.close();
  // Sunday plan + share card
  ok('the nav reads Tonight · Board · Calendar (Soon) · Sunday plan', (await np.locator('#sb-tabs').innerText()).replace(/\s+/g, ' ').trim().toLowerCase() === 'tonight board calendar soon sunday plan', await np.locator('#sb-tabs').innerText());
  await tab(np, 'ahead'); await np.waitForSelector('.wk');
  const wk = (await np.locator('#sb-main main').innerText()).replace(/\s+/g, ' ');
  ok('Sunday plan: quizzes and tests, the busiest day and what to start early', /Quizzes and tests/.test(wk) && /busiest day/.test(wk) && /Science Fair Project/.test(wk) && await np.locator('.wk-bars li').count() === 7 && await np.locator('.wk-bars li.heavy').count() === 1, wk.slice(0, 200));
  ok('Sunday plan has the freshness pill too', await np.locator('#sb-main main .fpill').isVisible());
  await np.screenshot({ path: join(SHOTS, 'week-ahead.png'), fullPage: true });
  const [img] = await Promise.all([np.waitForEvent('download'), np.click('#wk-img')]);
  const ipath = join(SHOTS, 'week-ahead-card.png'); await img.saveAs(ipath);
  const card = PNG.sync.read(readFileSync(ipath));
  ok('Save as image: a 1080×1350 PNG made in the browser (no network)', card.width === 1080 && card.height === 1350);
  // Calendar is announced, not a dead end
  await tab(np, 'cal'); await np.waitForSelector('.stub');
  ok('Calendar says "Coming soon", explains itself and has a way back', /coming soon/i.test(await np.locator('.stub').innerText()) && await np.locator('.stub [data-go=now]').count() === 1 && await np.locator('.stub [data-go=board]').count() === 1 && await np.locator('#tn-main .fpill').isVisible());
  await np.click('.stub [data-go=now]'); await np.waitForSelector('#tnList .trow');
  ok('"Back to Tonight" goes home', await np.locator('#sb-tabs [data-tab=now][aria-current=page]').count() === 1);
  // phone width
  const pc = await newCtx({ now: PNOW, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pp = await pc.newPage(); watch(pp, 'planner-phone');
  await pp.goto(BASE + '/'); await pp.click('#imp-sample'); await pp.waitForSelector('#tnList .trow'); await pp.waitForTimeout(3500);
  const tb = await pp.locator('#sb-botnav').boundingBox();
  ok('phone: Tonight, Board, Calendar and Sunday plan sit in a bottom bar; the top tabs hide', tb && tb.y + tb.height >= 843 && await pp.locator('#sb-botnav a').count() === 4 && !(await pp.locator('#sb-tabs').isVisible()));
  ok('phone: Tonight fits without horizontal overflow', await pp.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  ok('phone: the theme button lives in the ⋯ menu', !(await pp.locator('#sb-theme').isVisible()) && (await pp.click('#sb-more'), await pp.locator('#sb-theme-m').isVisible()));
  await pp.keyboard.press('Escape');
  await pp.screenshot({ path: join(SHOTS, 'now-phone.png'), fullPage: true });
  await pc.close();
  await nc.close();
}

// ---------- 14. plain English: no jargon in the rendered UI ----------
{
  const BANNED = /\b(iCal|ical|feeds?|webcal|RRULE|UIDs?|relay|fragment)\b/;
  const ALLOWED = [/Schoology labels it “iCal”/g];
  const texts = [];
  const grab = async (pg, where) => {
    let t = await pg.evaluate(() => {
      const parts = [document.body.innerText];
      document.querySelectorAll('[placeholder],[title],[aria-label]').forEach((e) => { ['placeholder', 'title', 'aria-label'].forEach((a) => { if (e.getAttribute(a)) parts.push(e.getAttribute(a)); }); });
      return parts.join('\n');
    });
    for (const a of ALLOWED) t = t.replace(a, '');
    texts.push([where, t]);
  };
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const c = await newCtx({ now: new Date('2026-10-19T17:02:00-04:00'), viewport: vp, isMobile: vp.width < 500, hasTouch: vp.width < 500 }); const pg = await c.newPage(); watch(pg, 'jargon');
    await pg.goto(BASE + '/'); await pg.waitForSelector('#imp-url'); await grab(pg, 'first run');
    await pg.click('#imp-sample'); await pg.waitForSelector('#tnList .trow'); await grab(pg, 'Tonight');
    await tab(pg, 'board'); await pg.waitForSelector('#sb-board .card'); await grab(pg, 'Board');
    await pg.click('#sb-more'); await grab(pg, 'More menu'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
    await tab(pg, 'ahead'); await grab(pg, 'Sunday plan');
    await tab(pg, 'cal'); await grab(pg, 'Calendar (soon)');
    await more(pg, '#sb-import'); await pg.waitForSelector('dialog #imp-url'); await grab(pg, 'Import dialog'); await pg.keyboard.press('Escape');
    await pg.click('#sb-more'); await pg.click('#sb-move'); await pg.waitForSelector('dialog.move'); await grab(pg, 'Move dialog'); await pg.keyboard.press('Escape');
    await tab(pg, 'now'); await pg.locator('#tnList .estb').first().click(); await grab(pg, 'Time menu'); await pg.locator('#sb-menu .menu-i', { hasText: 'More options' }).click(); await pg.waitForSelector('dialog.est'); await grab(pg, 'Estimate editor'); await pg.keyboard.press('Escape');
    await pg.evaluate(() => { const S = window.SchoologyBoard.state(); S.lastFetch = { at: Date.now() - 3600e3, ok: false }; S.feedUrl = 'https://feed.example.invalid/x.ics'; window.SchoologyBoard.render(); }); await grab(pg, 'Error banner');
    await pg.evaluate(() => document.querySelector(innerWidth < 900 ? '#sb-more' : '#sb-theme').click()); if (vp.width < 900) await pg.click('#sb-theme-m'); await pg.waitForSelector('dialog .thgrid'); await grab(pg, 'Theme picker'); await pg.keyboard.press('Escape');
    await c.close();
  }
  const hits = texts.flatMap(([w, t]) => (t.match(new RegExp(BANNED.source, 'g')) || []).map((m) => w + ': ' + m));
  ok('plain English: no iCal/feed/webcal/RRULE/UID/relay/fragment in any screen\'s text, labels or tooltips', hits.length === 0, hits.slice(0, 6).join(' | '));
  const casBare = texts.filter(([, t]) => /\bCAS\b/.test(t) && !/Course Assignment Sheet \(CAS\)/.test(t)).map(([w]) => w);
  ok('plain English: "CAS" only appears next to "Course Assignment Sheet (CAS)"', casBare.length === 0, casBare.join(', '));
}

// ---------- 15. installable app: manifest, icons, service worker, offline load, update flow ----------
{
  const c = await newCtx({ now: new Date('2026-10-19T17:02:00-04:00'), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await c.newPage(); watch(pg, 'pwa');
  await pg.goto(BASE + '/'); await pg.click('#imp-sample'); await pg.waitForSelector('#tn-main');
  await pg.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await pg.reload(); await pg.waitForSelector('#tn-main');
  ok('service worker installs on the first visit and controls the next load', await pg.evaluate(() => !!navigator.serviceWorker.controller));
  const man = await pg.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  const icons = man.icons || [];
  ok('manifest: name, short name, standalone, opens on Tonight, theme colors, 192 and 512 icons incl. maskable',
    man.name === 'Schoology Board' && man.short_name && man.short_name.length <= 12 && man.display === 'standalone' && /view=now/.test(man.start_url) && man.theme_color && man.background_color &&
    ['192x192', '512x512'].every((sz) => icons.some((i) => i.sizes === sz && i.purpose === 'any') && icons.some((i) => i.sizes === sz && i.purpose === 'maskable')), JSON.stringify(man).slice(0, 200));
  let iconsOk = true;
  for (const i of icons.concat([{ src: '/icons/apple-touch-icon.png', sizes: '180x180' }])) {
    const r = await c.request.get(BASE + i.src); const png = PNG.sync.read(await r.body());
    if (!r.ok() || `${png.width}x${png.height}` !== i.sizes) iconsOk = false;
  }
  ok('icons load at their stated sizes (plus a 180px apple-touch-icon)', iconsOk);
  ok('iOS home screen tags: apple-touch-icon, apple-mobile-web-app-capable and title', await pg.evaluate(() => !!document.querySelector('link[rel=apple-touch-icon]') && !!document.querySelector('meta[name=apple-mobile-web-app-capable]') && !!document.querySelector('meta[name=apple-mobile-web-app-title]')));
  const cdp = await c.newCDPSession(pg);
  const inst = await cdp.send('Page.getInstallabilityErrors').catch((e) => ({ installabilityErrors: [{ errorId: 'cdp: ' + e.message }] }));
  ok('Chrome installability check passes (no installability errors)', inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors));
  // relay traffic never lands in the cache
  await pg.evaluate(async () => { await fetch('/api/feed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"url":"https://example.invalid/x"}' }).catch(() => 0); await fetch('/api/feed').catch(() => 0); });
  // offline
  await c.setOffline(true);
  await pg.reload(); await pg.waitForSelector('#tn-main', { timeout: 10000 });
  ok('offline: the app opens from the service worker and shows Tonight from saved data', /things? tonight/.test(await pg.locator('#verdict').innerText()) && await pg.locator('#tnList .trow').count() > 0);
  await pg.screenshot({ path: join(SHOTS, 'offline-load.png') });
  await tab(pg, 'board');
  ok('offline: the Board tab works too', await pg.locator('#sb-board .card').count() > 5);
  const urls = await pg.evaluate(async () => { const out = []; for (const k of await caches.keys()) { const ch = await caches.open(k); (await ch.keys()).forEach((r) => out.push(r.url)); } return out; });
  ok('service worker cache holds only the app shell: no relay responses, nothing that looks like a calendar link', urls.length >= 8 && !urls.some((u) => /\/api\/|feed|ical|webcal|\.ics/i.test(u)), urls.length + ' entries');
  await c.setOffline(false);
  // a new version: "Update ready · Reload to update", then the new worker takes over
  await pg.evaluate(() => navigator.serviceWorker.register('/sw.js?next=1'));
  await pg.waitForSelector('#sb-update', { timeout: 15000 });
  ok('a new version shows "Update ready · Reload to update" (or applies next time it opens)', /Update ready/.test(await pg.locator('#sb-update').innerText()) && /Reload to update/.test(await pg.locator('#sb-update').innerText()));
  await Promise.all([pg.waitForEvent('load'), pg.click('#sb-update .primary')]);
  await pg.waitForSelector('#tn-main');
  ok('Reload to update swaps in the new version', /next=1/.test(await pg.evaluate(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL)));
  await c.close();
}

// ---------- 16. background refresh: every ~15 min while visible, on focus after ~5 min, quiet backoff ----------
{
  const SAMPLE = readFileSync(ICS, 'utf8');
  const FEED = 'https://feed.example.invalid/calendar/bg.ics';
  const c = await browser.newContext({ timezoneId: 'America/New_York', viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
  await c.clock.install({ time: new Date('2026-10-19T16:00:00-04:00') });
  let hits = 0, mode = 'ok';
  await c.route('**/api/feed', (r) => { hits++; return mode === 'fail' ? r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"x"}' }) : r.fulfill({ status: 200, contentType: 'text/calendar', body: SAMPLE }); });
  const pg = await c.newPage(); watch(pg, 'bg-refresh');
  await pg.goto(BASE + '/'); await pg.fill('#imp-url', FEED); await pg.click('#imp-go'); await pg.waitForSelector('#tn-main .trow'); await skipNaming(pg, 3000);
  const idle = async () => { await pg.waitForFunction(() => !document.querySelector('.fpill.fsync')); await pg.waitForTimeout(50); };
  await pg.clock.fastForward('10:00'); await idle();
  ok('background refresh: nothing before ~15 minutes', hits === 1, 'hits ' + hits);
  await pg.clock.fastForward('06:00'); await idle();
  ok('background refresh: re-fetches after ~15 minutes while the tab is visible', hits === 2, 'hits ' + hits);
  ok('"Synced with Schoology just now" after a background refresh', /Synced with Schoology just now/.test(await pill(pg)));
  await pg.clock.fastForward('03:00'); await pg.evaluate(() => window.dispatchEvent(new Event('focus'))); await idle();
  ok('focus within 5 minutes of the last update does not refetch', hits === 2);
  await pg.clock.fastForward('03:00'); await pg.evaluate(() => window.dispatchEvent(new Event('focus'))); await idle();
  ok('focus after ~5 minutes refetches', hits === 3, 'hits ' + hits);
  await pg.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); });
  await pg.clock.fastForward('20:00'); await idle();
  ok('hidden tab: no background refresh', hits === 3, 'hits ' + hits);
  await pg.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); }); await idle();
  ok('coming back to the tab after a while refetches', hits === 4, 'hits ' + hits);
  mode = 'fail';
  const gaps = [];
  for (let i = 0; i < 6; i++) {
    await pg.clock.fastForward('16:00'); await idle();
    gaps.push(await pg.evaluate(() => { const b = window.SchoologyBoard.bg(); return Math.round((b.next - Date.now()) / 60000); }));
  }
  ok('failures back off (1, 2, 4, 8, 16, 32 minutes) and never toast (the banner says it instead)', JSON.stringify(gaps) === JSON.stringify([1, 2, 4, 8, 16, 32]) && await pg.locator('.toast.err').count() === 0, JSON.stringify(gaps));
  await pg.clock.fastForward('16:00'); await idle();
  ok('while backing off, no extra requests', hits === 4 + 6, 'hits ' + hits);
  ok('the pill stays honest after failures (when it last worked) and the banner offers Retry', /Sync failed · last good \d/.test(await pill(pg)) && await pg.locator('.banner.ferr [data-refresh]').count() === 1, await pill(pg));
  await c.close();
}

// ---------- 17. Tonight states, reorder (mouse + keyboard), pull in, flags, all-done, themes ----------
{
  const PNOW = new Date('2026-10-19T17:02:00-04:00');
  const c = await newCtx({ now: PNOW }); const pg = await c.newPage(); watch(pg, 'tonight');
  await pg.goto(BASE + '/'); await pg.click('#imp-sample'); await pg.waitForSelector('#tnList .trow');
  await pg.keyboard.press('n'); await pg.fill('#ed-title', 'Lab Questions 1-5'); await pg.fill('#ed-date', '2026-10-19'); await pg.fill('#ed-time', '21:00'); await pg.click('#ed-save'); await pg.waitForTimeout(200);
  const order = () => pg.$$eval('#tnList .trow', (rs) => rs.map((r) => r.querySelector('.rt').textContent.trim()));
  const o0 = await order();
  ok('three things tonight, in suggested order (by due time)', JSON.stringify(o0) === JSON.stringify(['Lab Questions 1-5', 'Problem Set 4.2', 'DBQ: Causes of the French Revolution']), o0.join(' | '));
  const g = await pg.locator('#tnList .trow').nth(2).locator('.grip').boundingBox(), top = await pg.locator('#tnList .trow').nth(0).boundingBox();
  await pg.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await pg.mouse.down();
  await pg.mouse.move(g.x + g.width / 2, g.y - 12, { steps: 3 }); await pg.mouse.move(g.x + g.width / 2, top.y + 6, { steps: 14 }); await pg.mouse.up(); await pg.waitForTimeout(300);
  const o1 = await order(); let st = await state(pg);
  ok('drag with a mouse: the row moves to the top, the order is saved and the plan follows it', o1[0] === o0[2] && st.tnOrder && st.tnOrder.ids.length === 3 && await pg.evaluate(() => window.SchoologyBoard.plan().tasks[0].item.title) === o0[2], o1.join(' | '));
  ok('a custom order offers "Back to suggested"', await pg.locator('[data-resetorder]').count() === 1);
  await pg.locator('#tnList .trow').nth(0).locator('.grip').focus(); await pg.keyboard.press('ArrowDown'); await pg.waitForTimeout(150);
  const o2 = await order();
  ok('keyboard: arrow keys on the grip move a row and keep focus on it', o2[1] === o1[0] && await pg.evaluate(() => document.activeElement.classList.contains('grip')), o2.join(' | '));
  await pg.reload(); await pg.waitForSelector('#tnList .trow');
  ok('the custom order survives a reload', JSON.stringify(await order()) === JSON.stringify(o2));
  await pg.click('[data-resetorder]'); await pg.waitForTimeout(150);
  ok('"Back to suggested" restores the suggested order', JSON.stringify(await order()) === JSON.stringify(o0) && !(await state(pg)).tnOrder);
  // pull into tonight / put back
  const cu = pg.locator('.sec.coming .cu').first(); const cuTitle = (await cu.locator('.ct').innerText()).trim();
  await cu.locator('[data-pull]').click(); await pg.waitForTimeout(200);
  ok('"Pull into tonight": it joins tonight\'s list marked "Pulled in" and leaves Coming up', await pg.locator('#tnList .trow.pulled', { hasText: cuTitle }).count() === 1 && await pg.locator('.sec.coming .ct', { hasText: cuTitle }).count() === 0, cuTitle);
  ok('the verdict counts the pulled-in item', /^4 things tonight/.test(await pg.locator('#verdict').innerText()), await pg.locator('#verdict').innerText());
  await pg.locator('#tnList .trow.pulled [data-back]').click(); await pg.waitForTimeout(200);
  ok('"Put back" returns it to Coming up', await pg.locator('#tnList .trow.pulled').count() === 0 && await pg.locator('.sec.coming .ct', { hasText: cuTitle }).count() === 1);
  // flagged: a calendar item whose title says quiz AND practice
  await pg.evaluate(() => { const S = window.SchoologyBoard.state(); const id = Object.keys(S.ics).find((k) => /Problem Set 4\.3/.test(S.ics[k].title)); S.ov[id] = Object.assign({}, S.ov[id], { title: 'Practice Quiz 4.3' }); window.SchoologyBoard.render(); });
  await pg.waitForTimeout(150);
  const fb = pg.locator('#tn-main .flagbox').first();
  const ftxt = (await fb.innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok('"Double-check this": the reason, where it came from, and an "It\'s right" button', /Double-check this/.test(ftxt) && /quiz or test but also “practice”/.test(ftxt) && /Schoology calendar/.test(ftxt) && await fb.locator('[data-ok]').count() === 1, ftxt.slice(0, 220));
  ok('the verdict says how many items to double-check', /1 item to double-check/.test(await pg.locator('.thero').innerText()));
  await pg.screenshot({ path: join(SHOTS, 'state-flagged.png') });
  await fb.locator('[data-ok]').click(); await pg.waitForTimeout(150);
  ok('"It\'s right" clears the flag and remembers it', await pg.locator('#tn-main .flagbox').count() === 0 && Object.keys((await state(pg)).checked).length === 1);
  // all done: the finish moment (≤1.2 s), then "You're free tonight" with a peek at what's next
  let guard = 0, celMs = -1;
  while (await pg.locator('#tn-main .trow:not(.tdone) .bigchk').count() && guard++ < 8) {
    const last = await pg.locator('#tn-main .trow:not(.tdone) .bigchk').count() === 1;
    await pg.locator('#tn-main .trow:not(.tdone) .bigchk').first().click();
    if (last) { await pg.waitForSelector('#cel', { timeout: 2000 }); const t0 = Date.now(); await pg.waitForSelector('#cel', { state: 'detached', timeout: 3000 }); celMs = Date.now() - t0; }
    else await pg.waitForTimeout(950);
  }
  await pg.waitForTimeout(200);
  ok('the last check-off plays a short finish moment (gone within ~1.2 s)', celMs > 0 && celMs <= 1300, celMs + ' ms');
  const fr = (await pg.locator('#tn-main').innerText()).replace(/\s+/g, ' ');
  ok('all done: "You\'re free tonight" with a peek at what\'s next', /You’re free tonight/.test(await pg.locator('#verdict').innerText()) && await pg.locator('.free.done').count() === 1 && await pg.locator('#tn-main .peek').count() >= 1, fr.slice(0, 200));
  await pg.screenshot({ path: join(SHOTS, 'state-alldone.png') });
  // the board shares the same data: everything due tonight is in Completed there
  await board(pg, ' .card');
  ok('Tonight and the Board share one data model (tonight\'s items are Completed on the board)', await pg.locator('.col[data-col=done] .card', { hasText: 'Problem Set 4.2' }).count() === 1 && await pg.locator('.col[data-col=done] .card', { hasText: 'Lab Questions 1-5' }).count() === 1);
  ok('the freshness pill is on the Board too', await pg.locator('.bhead .fpill').isVisible());
  // themes
  await pg.click('#sb-theme'); await pg.waitForSelector('dialog .thgrid');
  ok('theme picker: six themes with live previews, Sticker Book selected by default', await pg.locator('dialog .thp').count() === 6 && await pg.evaluate(() => document.documentElement.dataset.theme) === 'sticker');
  await pg.locator('dialog .thp[data-theme=arcade]').click(); await pg.waitForTimeout(100);
  ok('choosing a theme applies it at once and saves it on this device', await pg.evaluate(() => document.documentElement.dataset.theme) === 'arcade' && /"t":"arcade"/.test(await pg.evaluate(() => localStorage.getItem('sb-theme'))));
  await pg.keyboard.press('Escape');
  await pg.reload(); const early = await pg.evaluate(() => document.documentElement.dataset.theme);
  ok('the theme is set before first paint on reload (no flash)', early === 'arcade');
  for (const t of ['sticker', 'arcade', 'notebook', 'varsity', 'riso', 'cafe']) {
    await pg.evaluate((t) => { window.SchoologyBoard.theme(t, t === 'notebook' ? 'dark' : ''); }, t);
    await pg.evaluate(() => document.querySelector('#sb-tabs [data-tab=now]').click()); await pg.waitForTimeout(150);
    const bad = await noCyan(pg);
    ok(`theme ${t}${t === 'notebook' ? ' (dark)' : ''}: no cyan/teal/blue-green or orange on Tonight`, bad.length === 0, bad.slice(0, 3).join(' ; '));
  }
  // per-theme class colors
  await pg.evaluate(() => { window.SchoologyBoard.theme('notebook', 'dark'); });
  await board(pg, ' .card');
  const gc = cardByTitle(pg, 'Two-Column'); await gc.hover(); await gc.locator('.more').click(); await pg.waitForSelector('#sb-menu');
  await pg.locator('#sb-menu .menu-i', { hasText: /Change .* color/ }).click(); await pg.waitForTimeout(100);
  ok('class color: the theme\'s 8 swatches', await pg.locator('#sb-menu .msw').count() === 8);
  await pg.locator('#sb-menu .menu-i').nth(5).click(); await pg.waitForTimeout(150);
  st = await state(pg);
  ok('class color is saved for this theme only', st.colors.notebook && Object.values(st.colors.notebook)[0] === 6 && !st.colors.sticker && /swatch-6/.test(await cardByTitle(pg, 'Two-Column').getAttribute('style')), JSON.stringify(st.colors));
  ok('the default class colors never use the optional pink swatch', await pg.evaluate(() => [...document.querySelectorAll('.card')].every((e) => !/swatch-8/.test(e.getAttribute('style') || ''))));
  // backup carries the theme, its fonts and works offline; Move carries it too
  const [bd] = await Promise.all([pg.waitForEvent('download'), more(pg, '#sb-backup')]);
  const bp = join(SHOTS, 'theme-backup.html'); await bd.saveAs(bp); const bh = readFileSync(bp, 'utf8');
  ok('the backup file opens in the chosen theme with its CSS and fonts inlined', /<html[^>]*data-theme="notebook"/.test(bh) && /data-mode="dark"/.test(bh) && /url\(data:font\/woff2;base64,/.test(bh) && /main\.tnm/.test(bh) && !/<link[^>]+stylesheet/.test(bh));
  const oc = await newCtx({ now: PNOW }); const op = await oc.newPage(); watch(op, 'theme-backup');
  const net = []; await op.route('**/*', (r) => (/^(file|blob|data):/.test(r.request().url()) ? r.continue() : (net.push(r.request().url()), r.abort())));
  await op.goto(pathToFileURL(bp).href); await op.waitForSelector('#tn-main');
  ok('the themed backup works offline (no network requests)', net.length === 0 && await op.evaluate(() => document.fonts.check('16px Caveat') || [...document.fonts].some((f) => /Caveat/i.test(f.family))), net.join(' '));
  await oc.close();
  const mp = await pg.evaluate(() => window.SchoologyBoard.movePayload());
  ok('Move to phone carries the theme, the mode and the class colors', mp.pr && mp.pr.th === 'notebook' && mp.pr.md === 'dark' && mp.co && mp.co.notebook);
  await c.close();
}
// ---------- 17b. empty, loading (slow), error and stale states ----------
{
  const LNOW = new Date('2026-11-02T17:00:00-05:00');
  const ec = await newCtx({ now: LNOW }); const ep = await ec.newPage(); watch(ep, 'empty');
  // (the sample is always "this week", so build a board whose only task is 10 days out)
  await ec.addInitScript(([n, due]) => { if (!localStorage.getItem('schoology-board:v1')) localStorage.setItem('schoology-board:v1', JSON.stringify({ v: 1, custom: { 'c-book': { id: 'c-book', title: 'Book report', course: 'English', due, allDay: false, source: 'custom', created: n }, 'c-late': { id: 'c-late', title: 'Map worksheet', course: 'History', due: due - 15 * 864e5, allDay: false, source: 'custom', created: n - 30 * 864e5 } }, createdAt: n - 30 * 864e5 })); }, [sod(LNOW), LNOW.getTime() + 10 * 864e5]);
  await ep.goto(BASE + '/'); await ep.waitForSelector('#tn-main');
  ok('empty: "Nothing due tonight" with a clear next step (no dead end)', /Nothing due tonight/.test(await ep.locator('#verdict').innerText()) && await ep.locator('.free.empty').count() === 1 && await ep.locator('#tn-main [data-go=board], #tn-main [data-go=ahead]').count() >= 1);
  ok('no silent hiding: work more than 2 days late is named, with a way to the board', /1 older overdue item \(more than 2 days late\) is on the board/.test(await ep.locator('.hid.older').innerText()) && await ep.locator('.hid.older [data-go=board]').count() === 1);
  await ep.screenshot({ path: join(SHOTS, 'state-empty.png') }); await ec.close();

  const PNOW = new Date('2026-10-19T17:02:00-04:00');
  const ICSTXT = readFileSync(ICS, 'utf8');
  const lc = await newCtx({ now: PNOW }); let mode = 'slow';
  await lc.addInitScript(([n]) => { if (!localStorage.getItem('schoology-board:v1')) localStorage.setItem('schoology-board:v1', JSON.stringify({ v: 1, feedUrl: 'https://feed.example.invalid/calendar/slow.ics', createdAt: n })); }, [sod(PNOW)]);
  await lc.route('**/api/feed**', async (r) => { if (mode === 'slow') { await new Promise((ok) => setTimeout(ok, 9000)); return r.fulfill({ status: 200, contentType: 'text/calendar', body: ICSTXT }); } if (mode === 'fail') return r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"unreachable"}' }); return r.fulfill({ status: 200, contentType: 'text/calendar', body: ICSTXT }); });
  const lp = await lc.newPage(); watch(lp, 'refresh');
  await lp.goto(BASE + '/'); await lp.waitForSelector('#tn-main .skrow', { timeout: 3000 });
  ok('loading: a skeleton of Tonight and "Syncing with Schoology…"', await lp.locator('#tn-main .skrow').count() >= 3 && /Syncing with Schoology/.test(await pill(lp)));
  await lp.screenshot({ path: join(SHOTS, 'state-loading.png') });
  ok('loading: no "slow" note before 8 seconds', await lp.locator('.banner.slow').count() === 0);
  await lc.clock.setFixedTime(new Date(PNOW.getTime() + 8500)); // the page clock is frozen; move it past 8 s so the real 8 s check sees the wait
  await lp.waitForSelector('.banner.slow', { timeout: 9000 });
  ok('loading: after 8 seconds a calm "still working" note appears', /Still/.test(await lp.locator('.banner.slow').innerText()));
  await lp.waitForSelector('#tnList .trow', { timeout: 6000 });
  ok('loading: the real list replaces the skeleton', await lp.locator('.skrow').count() === 0 && /Synced with Schoology just now/.test(await pill(lp)));
  mode = 'fail';
  await lp.locator('[data-refresh]').first().click(); await lp.waitForSelector('.banner.ferr', { timeout: 5000 });
  const ban = (await lp.locator('.banner.ferr').innerText()).replace(/\s+/g, ' ');
  ok('error: a banner with Retry and Open Schoology, saying check-offs still save; the list stays', /Retry/.test(ban) && /Open Schoology/.test(ban) && /Your check-offs still save on this device/.test(ban) && await lp.locator('#tnList .trow').count() >= 2 && await lp.locator('#tn-main .fpill.ferr').count() === 1, ban);
  ok('error: the pill names the last good sync', /Sync failed · last good/.test(await pill(lp)), await pill(lp));
  await lp.screenshot({ path: join(SHOTS, 'state-error.png') });
  mode = 'ok';
  await lp.locator('.banner.ferr [data-refresh]').click(); await lp.waitForSelector('#tn-main .fpill.ok', { timeout: 5000 });
  ok('Retry recovers: the banner goes away', await lp.locator('.banner.ferr').count() === 0);
  await lp.evaluate(() => { const S = window.SchoologyBoard.state(); S.lastFetch = { at: Date.now() - 7 * 36e5, ok: true }; window.SchoologyBoard.render(); });
  ok('stale: more than 6 hours since the last sync turns the pill yellow with a Refresh banner', await lp.locator('#tn-main .fpill.stale').count() === 1 && await lp.locator('.banner.stale').count() === 1, await pill(lp));
  await lp.screenshot({ path: join(SHOTS, 'state-stale.png') });
  await lc.close();

  // reduced motion: no confetti, a plain message instead
  const rc = await newCtx({ now: PNOW, reducedMotion: 'reduce' }); const rp = await rc.newPage(); watch(rp, 'reduced');
  await rp.goto(BASE + '/'); await rp.click('#imp-sample'); await rp.waitForSelector('#tnList .trow');
  let n = 0; while (await rp.locator('#tn-main .trow:not(.tdone) .bigchk').count() && n++ < 6) { await rp.locator('#tn-main .trow:not(.tdone) .bigchk').first().click(); await rp.waitForTimeout(150); }
  ok('reduced motion: finishing everything shows a message, no animation', await rp.locator('#cel').count() === 0 && /You’re free tonight/.test(await rp.locator('.toast').last().innerText().catch(() => '')) && await rp.locator('.toast', { hasText: 'Marked done' }).count() === 0 && await rp.evaluate(() => getComputedStyle(document.querySelector('#tn-main button')).transitionDuration.split(',').every((d) => parseFloat(d) <= 0.01)));
  await rp.locator('.toast', { hasText: 'free tonight' }).locator('button').click(); await rp.waitForTimeout(200);
  ok('the last check-off can be undone too', await rp.locator('#tnList .trow').count() === 1);
  await rc.close();
}
// ---------- 18. phone long-press drag (EMULATED touch: Chromium Android profile + WebKit iPhone profile) ----------
{
  const { webkit, devices } = await import('playwright');
  const PNOW = new Date('2026-10-19T17:02:00-04:00');
  for (const [label, bt, dev] of [['Android Chrome (emulated)', 'chromium', devices['Pixel 7']], ['iPhone Safari (emulated WebKit)', 'webkit', devices['iPhone 14']]]) {
    const br = bt === 'chromium' ? browser : await webkit.launch();
    const c = await br.newContext({ ...dev, timezoneId: 'America/New_York' }); await c.clock.setFixedTime(PNOW);
    const p = await c.newPage(); watch(p, 'touch-' + bt);
    await p.goto(BASE + '/'); await p.click('#imp-sample'); await p.waitForSelector('#tnList .trow');
    await p.evaluate(() => { const S = window.SchoologyBoard.state(); S.custom.lab = { id: 'lab', title: 'Lab Questions 1-5', course: 'Biology', due: new Date(2026, 9, 19, 21, 0).getTime(), allDay: false, source: 'custom' }; window.SchoologyBoard.render(); });
    await p.waitForTimeout(200);
    const ord = () => p.$$eval('#tnList .trow', (rs) => rs.map((r) => r.querySelector('.rt').textContent.trim()));
    const o0 = await ord();
    let x, y0, y1;
    const aim = async () => {
      await p.evaluate(() => { const l = document.querySelector('#tnList'); window.scrollBy(0, l.getBoundingClientRect().top - 90); }); await p.waitForTimeout(300);
      const r2 = await p.locator('#tnList .trow').nth(2).boundingBox(), r0 = await p.locator('#tnList .trow').nth(0).boundingBox();
      x = r2.x + r2.width * 0.55; y0 = r2.y + r2.height / 2; y1 = r0.y + 4;
    };
    await aim();
    // a quick swipe (no hold) must scroll, not drag
    const swipe = async (hold) => {
      if (bt === 'chromium') {
        const s = await c.newCDPSession(p);
        await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
        if (hold) await p.waitForTimeout(400);
        for (let i = 1; i <= 12; i++) await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / 12 }] });
        await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await p.evaluate(async ([x, y0, y1, hold]) => {
          const el = document.elementFromPoint(x, y0); const ev = (t, y, tgt) => (tgt || el).dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
          ev('pointerdown', y0); if (hold) await new Promise((r) => setTimeout(r, 400));
          for (let i = 1; i <= 12; i++) { ev('pointermove', y0 + (y1 - y0) * i / 12, document.elementFromPoint(x, y0 + (y1 - y0) * i / 12) || el); await new Promise((r) => setTimeout(r, 16)); }
          ev('pointerup', y1, document.elementFromPoint(x, y1) || el);
        }, [x, y0, y1, hold]);
      }
      await p.waitForTimeout(400);
    };
    const sy0 = await p.evaluate(() => scrollY);
    await swipe(false);
    const scrolled = bt === 'chromium' ? (await p.evaluate(() => scrollY)) !== sy0 : true; // synthetic WebKit events can't scroll; there we check only that nothing moved
    ok(`${label}: a quick swipe scrolls instead of dragging`, JSON.stringify(await ord()) === JSON.stringify(o0) && scrolled && await p.locator('.trow.lift').count() === 0);
    await aim();
    await swipe(true);
    const o1 = await ord();
    ok(`${label}: long-press then drag moves the row to the top`, o1[0] === o0[2] && !!(await state(p)).tnOrder, o1.join(' | '));
    ok(`${label}: rows let the page scroll vertically (touch-action: pan-y)`, await p.evaluate(() => getComputedStyle(document.querySelector('#tnList .trow')).touchAction) === 'pan-y');
    await p.screenshot({ path: join(SHOTS, `touch-drag-${bt}.png`) });
    await c.close(); if (bt !== 'chromium') await br.close();
  }
}

await browser.close();
ok('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
writeFileSync(join(SHOTS, 'e2e-results.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, errors }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
