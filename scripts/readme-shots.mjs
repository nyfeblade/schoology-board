// Refreshes the README screenshots in docs/ with the default Sticker Book theme and made-up data only
// (the built-in sample calendar and test/fixtures/sample-cas.pdf). No real feeds, names or PDFs.
//   BASE_URL=http://localhost:3000 node scripts/readme-shots.mjs
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const OUT = process.env.OUT || join(root, 'docs');
const ICS = join(root, 'public', 'sample', 'schoology-sample.ics'), CAS = join(root, 'test', 'fixtures', 'sample-cas.pdf');
const FAKE = 'https://app.schoology.com/calendar/feed/ical/0000000000/made-up-example/ical.ics';
const MON = new Date('2026-10-19T17:02:00-04:00'), FRI = new Date('2026-10-23T19:10:00-04:00');
const browser = await chromium.launch();
const errors = [];
async function open({ now = MON, phone = false, sample = true } = {}) {
  const ctx = await browser.newContext({ timezoneId: 'America/New_York', serviceWorkers: 'block', ...(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } }) });
  await ctx.clock.setFixedTime(now);
  await ctx.route('**/api/feed', async (r) => r.fulfill({ status: 200, contentType: 'text/calendar', body: await (await import('node:fs')).promises.readFile(ICS) }));
  const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/'); await page.waitForSelector('#imp-url');
  if (sample) { await page.click('#imp-sample'); await page.waitForSelector('#tnList .trow'); }
  await page.addStyleTag({ content: '.toast,#sb-toasts{display:none!important}' });
  return [ctx, page];
}
const tab = (page, t) => page.evaluate((t) => document.querySelector(`#sb-tabs [data-tab=${t}]`).click(), t);
const shot = async (page, name) => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); await page.screenshot({ path: join(OUT, name) }); console.log(name); };

{ const [c, p] = await open({ sample: false }); await shot(p, 'first-run.png'); await c.close(); }
{ const [c, p] = await open(); await shot(p, 'tonight.png'); await tab(p, 'board'); await p.waitForSelector('#sb-board .card'); await shot(p, 'board.png');
  // A linked board moves as a small QR code; the link here is made up, and the relay is stubbed with the sample calendar.
  await p.evaluate((u) => { const S = window.SchoologyBoard.state(); S.feedUrl = u; S.lastFetch = { at: Date.now() - 4 * 60e3, ok: true }; window.SchoologyBoard.render(); }, FAKE);
  await p.locator('#sb-more').click(); await p.click('#sb-move'); await p.waitForSelector('dialog.move #mv-qr'); await shot(p, 'move-to-phone.png');
  const link = await p.inputValue('#mv-url'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.keyboard.press('i'); await p.setInputFiles('dialog #imp-file', CAS); await p.waitForSelector('.cas-table', { timeout: 20000 }); await shot(p, 'cas-preview.png'); await c.close();
  const [c2, p2] = await open({ phone: true, sample: false }); await p2.goto(link); await p2.waitForSelector('dialog #mv-replace'); await p2.click('#mv-replace'); await p2.waitForSelector('#tnList .trow'); await shot(p2, 'phone-after-move.png'); await c2.close(); }
{ const [c, p] = await open({ sample: false }); await p.setInputFiles('#imp-file', ICS); await p.waitForSelector('dialog.naming', { timeout: 8000 }); await shot(p, 'class-naming.png'); await c.close(); }
{ const [c, p] = await open({ now: FRI }); await tab(p, 'board'); await p.waitForSelector('#sb-board .card'); await shot(p, 'weekend-week.png'); await c.close(); }
{ const [c, p] = await open({ phone: true }); await tab(p, 'board'); await p.waitForSelector('#sb-board .card'); await shot(p, 'mobile.png');
  await p.locator('.col[data-col="todo"] .card').first().locator('.more').tap(); await p.waitForSelector('.menu.sheet'); await shot(p, 'mobile-menu.png'); await c.close(); }
await browser.close();
if (errors.length) { console.error('page errors:', errors.slice(0, 3)); process.exit(1); }
