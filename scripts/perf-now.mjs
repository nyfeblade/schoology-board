// Time-to-content for the Tonight screen on a throttled phone: CPU 4x slower + DevTools "Fast 3G"
// (562.5 ms RTT, 1.44 Mb/s down, 675 kb/s up). Warm cache = second and later visits (service worker +
// saved board in localStorage). Content = the moment Tonight's verdict is drawn ('sb-content' mark).
//   BASE_URL=https://schoology-board.vercel.app node scripts/perf-now.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const RUNS = +(process.env.RUNS || 5);
const YEAR = readFileSync(new URL('../test/fixtures/year.ics', import.meta.url), 'utf8');
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/New_York' });
// A full school year with a remembered link; the relay is stubbed so only the page itself is measured.
await c.route('**/api/feed', (r) => r.fulfill({ status: 200, contentType: 'text/calendar', body: YEAR }));
const p = await c.newPage();
const cdp = await c.newCDPSession(p);
const throttle = async (on) => {
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', on ? { offline: false, latency: 562.5, downloadThroughput: 1.44e6 / 8, uploadThroughput: 675e3 / 8 } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: on ? 4 : 1 });
};
const measure = () => p.evaluate(() => {
  const m = performance.getEntriesByName('sb-content')[0], fcp = performance.getEntriesByName('first-contentful-paint')[0];
  return { content: m ? Math.round(m.startTime) : null, fcp: fcp ? Math.round(fcp.startTime) : null };
});
await throttle(true);
await p.goto(BASE + '/', { waitUntil: 'load' });
await p.waitForSelector('#imp-url');
const cold = await measure();
await throttle(false);
await p.fill('#imp-url', 'https://feed.example.invalid/calendar/year.ics'); await p.click('#imp-go');
await p.waitForSelector('#sb-main'); await p.waitForTimeout(800);
await p.keyboard.press('Escape');
await p.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
await throttle(true);
const warm = [];
for (let i = 0; i < RUNS; i++) {
  await p.reload({ waitUntil: 'load' }); await p.waitForSelector('#tn-main .thero');
  warm.push(await measure());
}
const sw = await p.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const items = await p.evaluate(() => Object.keys(window.SchoologyBoard.state().ics).length);
console.log(JSON.stringify({
  base: BASE, profile: 'Pixel-ish 390x844, CPU 4x, Fast 3G', board: items + ' calendar items', serviceWorker: sw,
  firstVisitFirstPaintMs: cold.fcp, warmRuns: warm, warmMedianContentMs: med(warm.map((w) => w.content)), warmMedianFcpMs: med(warm.map((w) => w.fcp))
}, null, 2));
await b.close();
