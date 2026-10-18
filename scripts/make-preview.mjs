// Renders the first-run preview picture (public/board/preview.webp) from the sample board's Tonight screen (Sticker Book).
//   BASE_URL=http://localhost:3000 node scripts/make-preview.mjs
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
await c.clock.setFixedTime(new Date('2026-10-19T17:02:00-04:00'));
const p = await c.newPage();
await p.goto(BASE + '/'); await p.click('#imp-sample'); await p.waitForSelector('#tnList .trow');
await p.addStyleTag({ content: '.toast,#sb-toasts{display:none!important}' });
await p.waitForTimeout(300);
const png = await p.screenshot({ type: 'png' });
const webp = await p.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d').drawImage(img, 0, 0);
  return cv.toDataURL('image/webp', 0.86).split(',')[1];
}, png.toString('base64'));
writeFileSync(new URL('../public/board/preview.webp', import.meta.url), Buffer.from(webp, 'base64'));
console.log('preview.webp written');
await b.close();
