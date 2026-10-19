// Records docs/demo.gif with made-up data only: first run -> sample (Tonight) -> board -> drag -> done -> CAS preview.
//   BASE_URL=http://localhost:3000 node scripts/record-demo.mjs   (needs ffmpeg)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const OUT = process.env.OUT || join(root, 'docs', 'demo.gif');
const dir = mkdtempSync(join(tmpdir(), 'sb-demo-'));
const W = 1280, H = 800;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, timezoneId: 'America/New_York', recordVideo: { dir, size: { width: W, height: H } } });
await ctx.clock.setFixedTime(new Date('2026-10-19T17:02:00-04:00'));
// a visible pointer, since headless video has none
await ctx.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;z-index:99999;left:0;top:0;width:18px;height:18px;pointer-events:none;transform:translate(-3px,-2px);transition:transform .05s';
    c.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L9.5 21z" fill="#F2F2F3" stroke="#000" stroke-width="1.5"/></svg>';
    document.body.appendChild(c);
    addEventListener('pointermove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('pointerdown', () => (c.style.transform = 'translate(-3px,-2px) scale(.85)'), true);
    addEventListener('pointerup', () => (c.style.transform = 'translate(-3px,-2px)'), true);
  });
});
const page = await ctx.newPage();
const glide = async (x, y, steps = 18) => page.mouse.move(x, y, { steps });
const center = async (loc) => { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
await page.goto(BASE + '/'); await page.waitForSelector('#imp-sample');
await page.mouse.move(700, 500); await page.waitForTimeout(1200);
let [x, y] = await center(page.locator('#imp-sample')); await glide(x, y); await page.waitForTimeout(250);
await page.mouse.down(); await page.mouse.up();
await page.waitForSelector('#tnList .trow'); await page.waitForTimeout(1800);
[x, y] = await center(page.locator('#sb-tabs [data-tab=board]')); await glide(x, y); await page.waitForTimeout(200);
await page.mouse.down(); await page.mouse.up();
await page.waitForSelector('#sb-board .card'); await page.waitForTimeout(1300);
// drag "DBQ" to Started
const card = page.locator('.card', { hasText: 'DBQ' }).first();
[x, y] = await center(card); await glide(x, y); await page.waitForTimeout(250);
await page.mouse.down();
const col = await page.locator('.col[data-col="started"]').boundingBox();
await glide(x + 40, y + 10, 6); await glide(col.x + col.width / 2, col.y + 140, 30); await page.waitForTimeout(150);
await page.mouse.up(); await page.waitForTimeout(900);
// double-click to mark done
const c2 = page.locator('.col[data-col="todo"] .card', { hasText: 'Cell Organelles' }).first();
[x, y] = await center(c2); await glide(x, y); await page.waitForTimeout(250);
await page.mouse.dblclick(x, y); await page.waitForTimeout(1200);
// import a Course Assignment Sheet
[x, y] = await center(page.locator('#sb-more')); await glide(x, y); await page.waitForTimeout(200);
await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(500);
[x, y] = await center(page.locator('#sb-import')); await glide(x, y, 10); await page.waitForTimeout(200);
await page.mouse.down(); await page.mouse.up(); await page.waitForSelector('dialog #imp-file', { state: 'attached' }); await page.waitForTimeout(600);
await page.setInputFiles('dialog #imp-file', join(root, 'test', 'fixtures', 'sample-cas.pdf'));
await page.waitForSelector('.cas-table'); await page.mouse.move(640, 300, { steps: 10 }); await page.waitForTimeout(1300);
[x, y] = await center(page.locator('#cas-add')); await glide(x, y, 22); await page.waitForTimeout(250);
await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(1600);
await ctx.close(); await browser.close();
const webm = join(dir, readdirSync(dir).find((f) => f.endsWith('.webm')));
const vf = 'fps=12,scale=960:-1:flags=lanczos';
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.4', '-i', webm, '-vf', `${vf},palettegen=max_colors=96:stats_mode=diff`, join(dir, 'pal.png')]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.4', '-i', webm, '-i', join(dir, 'pal.png'), '-lavfi', `${vf}[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, OUT]);
const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', OUT]).toString().trim();
console.log(`${OUT}: ${(statSync(OUT).size / 1048576).toFixed(2)} MB, ${(+dur).toFixed(1)} s`);
rmSync(dir, { recursive: true, force: true });
