// Renders the app icons (PNG) from the theme's colors. Run once after a theme change: node scripts/make-icons.mjs
// Plain icons keep the rounded tile; maskable icons fill the square and keep the glyph inside the 80% safe zone.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { tokens } from './theme-tokens.mjs';
const t = tokens();
const glyph = (s, pad) => {
  const u = (s - pad * 2) / 64, x = (v) => pad + v * u;
  return `<rect x="${x(10)}" y="${x(14)}" width="${12 * u}" height="${36 * u}" rx="${3 * u}" fill="${t['--surface-3']}"/>` +
    `<rect x="${x(26)}" y="${x(14)}" width="${12 * u}" height="${24 * u}" rx="${3 * u}" fill="${t['--surface-3']}"/>` +
    `<rect x="${x(42)}" y="${x(14)}" width="${12 * u}" height="${16 * u}" rx="${3 * u}" fill="${t['--accent']}"/>`;
};
const svg = (s, maskable) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
  (maskable ? `<rect width="${s}" height="${s}" fill="${t['--bg']}"/>` + glyph(s, s * 0.2) : `<rect width="${s}" height="${s}" rx="${s * 0.22}" fill="${t['--bg']}"/>` + glyph(s, s * 0.06)) + '</svg>';
const out = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-192.png', 192, true], ['maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]];
const b = await chromium.launch();
const p = await b.newPage();
for (const [name, s, m] of out) {
  await p.setViewportSize({ width: s, height: s });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg(s, m)}</body></html>`);
  await p.locator('svg').screenshot({ path: `public/icons/${name}`, omitBackground: true });
}
await b.close();
console.log('icons written');
