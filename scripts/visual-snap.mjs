// Deterministic screenshots for visual regression (theme refactors, reskins).
//   BASE_URL=http://localhost:3100 OUT=./snaps node scripts/visual-snap.mjs
// Then compare two runs: node scripts/visual-diff.mjs before/ after/
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const OUT = process.env.OUT || join(root, 'test-results', 'snaps');
mkdirSync(OUT, { recursive: true });
const NOW = new Date('2026-10-19T07:00:00-04:00');
const b = await chromium.launch();
const ctxFor = async (o = {}) => { const c = await b.newContext({ timezoneId: 'America/New_York', reducedMotion: 'reduce', acceptDownloads: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...o }); await c.clock.setFixedTime(NOW); return c; };
const settle = (p, ms = 3600) => p.waitForTimeout(ms); // toasts gone, fonts settled
const shot = (p, name) => p.screenshot({ path: join(OUT, name + '.png') });
// desktop
let c = await ctxFor(); let p = await c.newPage();
await p.goto(BASE + '/'); await p.waitForSelector('#imp-url'); await settle(p, 500); await shot(p, 'first-run');
await p.click('#imp-sample'); await p.waitForSelector('.now-hero'); await p.click('#sb-tabs [data-tab=board]'); await p.waitForSelector('#sb-board .card'); await settle(p); await shot(p, 'desktop-board');
await p.click('#sb-filter'); await settle(p, 300); await shot(p, 'desktop-filter-menu'); await p.keyboard.press('Escape');
await p.click('#sb-more'); await settle(p, 300); await shot(p, 'desktop-more-menu'); await p.keyboard.press('Escape');
await p.locator('.card').first().focus(); await p.keyboard.press('e'); await settle(p, 300); await shot(p, 'desktop-editor'); await p.keyboard.press('Escape');
await p.keyboard.press('i'); await p.setInputFiles('dialog #imp-file', join(root, 'test', 'fixtures', 'sample-cas.pdf'));
await p.waitForSelector('.cas-table', { timeout: 20000 }); await settle(p, 600); await shot(p, 'cas-preview'); await p.click('dialog [data-close]');
await settle(p);
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#sb-more').then(() => p.click('#sb-backup'))]);
const backup = join(OUT, '..', 'snap-backup.html'); await dl.saveAs(backup);
await p.click('#sb-more'); await p.click('#sb-move'); await p.waitForSelector('dialog.move'); await settle(p, 300); await shot(p, 'desktop-move');
await c.close();
// naming step
c = await ctxFor(); p = await c.newPage();
await p.goto(BASE + '/'); await p.setInputFiles('#imp-file', join(root, 'test', 'fixtures', 'year.ics'));
await p.waitForSelector('dialog.naming'); await settle(p, 600); await shot(p, 'desktop-naming'); await c.close();
// phone
c = await ctxFor({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); p = await c.newPage();
await p.goto(BASE + '/'); await p.waitForSelector('#imp-url'); await settle(p, 500); await shot(p, 'phone-first-run');
await p.click('#imp-sample'); await p.waitForSelector('.now-hero'); await p.click('#sb-tabs [data-tab=board]'); await p.waitForSelector('#sb-board .card'); await settle(p); await shot(p, 'phone-board');
await p.locator('#sb-more').tap(); await p.waitForSelector('.menu.sheet'); await settle(p, 400); await shot(p, 'phone-sheet');
await c.close();
// backup opened from disk
c = await ctxFor(); p = await c.newPage();
await p.route('**/*', (r) => (/^(file|blob|data):/.test(r.request().url()) ? r.continue() : r.abort()));
await p.goto(pathToFileURL(backup).href); await p.waitForSelector('#sb-board .card'); await settle(p, 800); await shot(p, 'backup-board');
await c.close();
await b.close();
console.log('snaps in', OUT);
