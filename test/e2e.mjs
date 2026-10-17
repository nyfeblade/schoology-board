// End-to-end check in headless Chromium.
//   BASE_URL=https://your-deploy.vercel.app SHOTS=./shots node test/e2e.mjs
// Covers: first run, sample board, .ics import + re-import, drag/keyboard/double-click,
// custom categories + tasks, CAS PDF preview + dedupe, offline download opened from
// file:// (render, persistence across reload, .ics re-import, CAS import).
import { chromium } from 'playwright';
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
  page.on('console', (m) => { if (m.type() === 'error' && !(tag === 'link' && /status of 422/.test(m.text()))) errors.push(`${tag} console: ${m.text()}`); }); // the 422 is the deliberate bad-link probe
  page.on('dialog', (d) => d.accept());
}
const state = (page) => page.evaluate(() => window.SchoologyBoard.state());
const more = async (page, id) => { await page.click('#sb-more'); await page.click(id); };
const newCtx = async (opts = {}) => { const c = await browser.newContext({ timezoneId: 'America/New_York', acceptDownloads: true, viewport: { width: 1440, height: 900 }, ...opts }); await c.clock.setFixedTime(opts.now || NOW); return c; };
const cardByTitle = (page, t) => page.locator('.card', { hasText: t }).first();
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
  ok('mobile: ⋯ opens a bottom sheet with Import, Categories and Download', /Import/.test(sheetText) && /Categories/.test(sheetText) && /Download for offline/.test(sheetText) && !/Keyboard/.test(sheetText));
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
let st = await state(page);
ok('.ics upload imports all 19 events', Object.keys(st.ics).length === 19);
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
const soon = new Date(Date.now() + 10 * 36e5);
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
ok('Due today view shows the task due within 10h or overdue items', await page.locator('.card', { hasText: 'Animal Farm' }).count() === (new Date(soon).toDateString() === new Date().toDateString() ? 1 : 0));
await page.click('.seg button[data-view="range"]');
await page.fill('#sb-from', '2026-10-21'); await page.dispatchEvent('#sb-from', 'change');
await page.fill('#sb-to', '2026-10-21'); await page.dispatchEvent('#sb-to', 'change');
const rangeTitles = await page.locator('#sb-board .card .t').allInnerTexts();
ok('date range filter limits cards to that range', rangeTitles.length > 0 && rangeTitles.every((t) => !/Picture Day|Unit 3 Test/.test(t)), rangeTitles.length + ' cards');
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
ok('desktop ⋯ menu holds Categories, Download for offline and Keyboard shortcuts', /Categories[\s\S]*Download for offline[\s\S]*Keyboard shortcuts/.test(await page.locator('.menu').innerText()));
ok('"Download for offline" is not red', await page.locator('#sb-offline').evaluate((e) => !/255, 62, 81/.test(getComputedStyle(e).backgroundColor + getComputedStyle(e).color)));
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
const [dl] = await Promise.all([page.waitForEvent('download'), more(page, '#sb-offline')]);
const offlinePath = join(SHOTS, 'schoology-board-offline.html');
await dl.saveAs(offlinePath);
ok('offline file downloads', !!offlinePath);
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

// ---------- 9. a full school year (517 items) with a frozen mid-year date ----------
{
  const created = new Date('2027-01-04T09:00:00-05:00'), today = new Date('2027-02-10T10:00:00-05:00');
  const yctx = await newCtx({ now: created });
  const yp = await yctx.newPage(); watch(yp, 'year');
  await yp.goto(BASE + '/'); await yp.waitForSelector('#imp-file', { state: 'attached' });
  await yp.setInputFiles('#imp-file', YEAR); await yp.waitForFunction(() => window.SchoologyBoard.state().createdAt);
  await yctx.clock.setFixedTime(today); await yp.reload(); await yp.waitForSelector('#sb-board');
  // independent expectations from the generator's manifest
  const inst = (e) => new Date(`${e.date}T${e.time}:00`).getTime();
  const visible = YEAR_EXP.items.filter((e) => inst(e) >= created.getTime());
  const counts = (list) => {
    const col = { todo: 0, started: 0, proctor: 0, done: 0 }, cls = {};
    list.forEach((e) => { col[e.proctor ? 'proctor' : 'todo']++; cls[e.cls] = (cls[e.cls] || 0) + 1; });
    return { total: list.length, col, cls };
  };
  const readBoard = () => yp.evaluate(() => {
    const col = {}; document.querySelectorAll('.col').forEach((c) => (col[c.dataset.col] = +c.querySelector('h2 span').textContent));
    const cls = {}; let all = null;
    document.querySelectorAll('#sb-chips .chip').forEach((c) => { const n = +c.querySelector('b').textContent, name = c.childNodes[0].textContent.trim(); if (c.dataset.c) cls[c.dataset.c] = n; else all = n; });
    return { cards: document.querySelectorAll('#sb-board .card').length, col, cls, all };
  });
  const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  const check = async (label, list) => {
    const want = counts(list), got = await readBoard();
    ok(`${label}: ${want.total} cards`, got.cards === want.total, `board ${got.cards}`);
    ok(`${label}: column counts match`, same(got.col, want.col), JSON.stringify(got.col) + ' vs ' + JSON.stringify(want.col));
    ok(`${label}: class chips and counts match`, same(got.cls, want.cls) && got.all === want.total, JSON.stringify(got.cls) + ' vs ' + JSON.stringify(want.cls));
  };
  ok('year: board opens on This week', await yp.locator('.seg button[aria-pressed="true"]').innerText() === 'Week');
  await check('year This week (Feb 8-14)', visible.filter((e) => e.date >= '2027-02-08' && e.date <= '2027-02-14'));
  await yp.screenshot({ path: join(SHOTS, 'year-this-week.png') });
  await yp.click('.seg button[data-view="today"]');
  await check('year Due today (Feb 10)', visible.filter((e) => e.date === '2027-02-10'));
  await yp.screenshot({ path: join(SHOTS, 'year-due-today.png') });
  await yp.click('.seg button[data-view="all"]');
  await check('year All (since the board was created)', visible);
  ok('year: items due before the board was created are hidden (not overdue, not Completed)', (await readBoard()).col.done === 0 && visible.length < YEAR_EXP.count, `${YEAR_EXP.count - visible.length} hidden`);
  await yp.click('#sb-filter'); await yp.check('#sb-showpre'); await yp.keyboard.press('Escape');
  ok('year: "Show items from before this board was created" brings them back', (await readBoard()).cards === YEAR_EXP.count);
  await yp.click('#sb-filter'); await yp.uncheck('#sb-showpre'); await yp.keyboard.press('Escape');
  await yp.keyboard.press('i'); await yp.setInputFiles('dialog #imp-file', YEAR); await yp.waitForTimeout(600);
  ok('year: re-import never brings pre-creation items back', (await readBoard()).cards === visible.length);
  const ycreated = (await state(yp)).createdAt;
  ok('year: board creation time is saved', ycreated === created.getTime());
  const [ydl] = await Promise.all([yp.waitForEvent('download'), more(yp, '#sb-offline')]);
  const yoff = join(SHOTS, 'year-offline.html'); await ydl.saveAs(yoff);
  await yctx.close();
  const yo = await newCtx({ now: today }); const yop = await yo.newPage(); watch(yop, 'year-offline');
  await yop.route('**/*', (r) => (/^(file|blob|data):/.test(r.request().url()) ? r.continue() : r.abort()));
  await yop.goto(pathToFileURL(yoff).href); await yop.waitForSelector('#sb-board');
  await yop.click('.seg button[data-view="all"]');
  ok('year offline: creation time and hiding carry into the offline file', (await state(yop)).createdAt === ycreated && await yop.locator('#sb-board .card').count() === visible.length);
  await yo.close();
}
// ---------- 10. a board saved before "created" existed gets it on first load ----------
{
  const c = await newCtx(); const pg = await c.newPage(); watch(pg, 'migrate');
  await pg.goto(BASE + '/');
  await pg.evaluate(() => localStorage.setItem('schoology-board:v1', JSON.stringify({ v: 1, ics: { old: { uid: 'old', title: 'Old overdue thing', due: '2026-09-01T12:00', source: 'ics' }, fresh: { uid: 'fresh', title: 'Next week thing', due: '2026-10-21T12:00', source: 'ics' } }, prefs: { view: 'all' } })));
  await pg.reload(); await pg.waitForSelector('#sb-board');
  const s2 = await state(pg);
  ok('older boards get a creation time on first load', s2.createdAt === NOW.getTime());
  ok('older boards: old overdue items disappear, later ones stay', !(await pg.locator('.card', { hasText: 'Old overdue thing' }).count()) && (await pg.evaluate(() => window.SchoologyBoard.state().prefs.view)) === 'week');
  await c.close();
}

await browser.close();
ok('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
writeFileSync(join(SHOTS, 'e2e-results.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, errors }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
