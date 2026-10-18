// Color rules (hard rules from the design brief):
//  - no orange (hue ~15-46 deg) and no cyan / teal / blue-green (hue ~160-200 deg) with real color in them,
//  - no pink anywhere: not in UI chrome and not in the class palettes,
//  - each theme's 8 class swatches are clearly different from each other (no near-duplicate hues),
//  - no hearts or sparkles in icons, emoji or copy.
// Scans every theme and layout file, and the designer's reference files when they are on this machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!/^(vendor|node_modules|fonts|shots)$/.test(f)) walk(p, out); } else if (/\.(css|m?js|jsx|html|py)$/.test(f)) out.push(p);
  }
  return out;
}
const DESIGN = process.env.SB_DESIGN_DIR || '/workspace/schoology-board-fun';
const ours = [...walk(join(root, 'public')), ...walk(join(root, 'app')), ...walk(join(root, 'scripts'))].filter((f) => !/\/(sw\.js|manifest\.webmanifest)$/.test(f));
const theirs = walk(DESIGN);

export function toRgb(s) {
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
    else if (h.length === 8) h = h.slice(0, 6);
    else if (h.length !== 6) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (m) return [+m[1], +m[2], +m[3]];
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i.exec(s);
  if (m) { // convert hsl -> rgb
    const h = +m[1] / 360, sat = +m[2] / 100, l = +m[3] / 100;
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  return null;
}
export function hueChroma([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = (mx - mn) / 255;
  if (mx === mn) return { h: 0, c: 0 };
  let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
  h *= 60; if (h < 0) h += 360;
  return { h, c };
}
const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
export function banned(s) {
  const rgb = toRgb(s); if (!rgb) return null;
  const { h, c } = hueChroma(rgb);
  if (c < 0.15) return null; // greys, creams and near-blacks are fine
  if (h >= 15 && h < 46) return 'orange';
  if (h >= 160 && h <= 200) return 'cyan/teal';
  return null;
}
function scan(files) {
  const bad = [];
  for (const f of files) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(COLOR)) {
        if (/^#[0-9a-f]{3,8}$/i.test(m[0]) && !/[:\s,'"(=]$|^$/.test(line.slice(Math.max(0, m.index - 1), m.index))) continue; // ids like #fx
        const why = banned(m[0]);
        if (why) bad.push(`${f}:${i + 1} ${why} ${m[0]}`);
      }
    });
  }
  return bad;
}
test('hue check flags orange and teal but not yellow, red, blue or cream', () => {
  for (const c of ['#FF8C00', '#F2D480', '#7A5A00', '#14B8A6', '#00CED1', 'rgb(255,140,0)', 'hsl(30, 90%, 50%)']) assert.ok(banned(c), c);
  for (const c of ['#FFE14D', '#E23B4A', '#6FA3FF', '#F4E9DA', '#1E1612', '#5BC25B', '#B6F23A', '#FFFFFF', 'rgba(0,0,0,.4)']) assert.equal(banned(c), null, c);
});
test('no orange or cyan/teal in any theme or layout file', () => {
  const bad = scan(ours).map((b) => relative(root, b));
  assert.deepEqual(bad, []);
});
test('no orange or cyan/teal in the designer reference files', { skip: !existsSync(DESIGN) && 'reference files not on this machine' }, () => {
  assert.deepEqual(scan(theirs), []);
});
test('no pink anywhere: no theme token (class swatches included) is pink', () => {
  const bad = [];
  for (const f of walk(join(root, 'public', 'board', 'theme'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/(--[\w-]+)\s*:([^;}]*)/g)) {
      for (const c of m[2].match(COLOR) || []) {
        const rgb = toRgb(c); if (!rgb) continue;
        const { h, c: ch } = hueChroma(rgb);
        if (h >= 290 && h <= 345 && ch >= 0.3) bad.push(`${relative(root, f)} ${m[1]}: ${c}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
// OKLab / OKLCH, for "are these two class colors too alike?"
export function oklab([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  [r, g, b] = [r, g, b].map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
export function tooAlike(x, y) {
  const A = oklab(toRgb(x)), B = oklab(toRgb(y)), de = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
  const C1 = Math.hypot(A[1], A[2]), C2 = Math.hypot(B[1], B[2]), dL = Math.abs(A[0] - B[0]);
  let dh = Math.abs(Math.atan2(A[2], A[1]) - Math.atan2(B[2], B[1])) * 180 / Math.PI; dh = Math.min(dh, 360 - dh);
  return de < 0.11 || (C1 >= 0.05 && C2 >= 0.05 && dh < 30 && dL < 0.22) || (C1 < 0.05 && C2 < 0.05 && dL < 0.22);
}
test('palette check catches near-duplicates (two greens, two violets) and passes distinct colors', () => {
  assert.ok(tooAlike('#A8E05F', '#5BC25B')); assert.ok(tooAlike('#E0C3FF', '#A98BFF')); assert.ok(tooAlike('#A78BFA', '#6F8CFF'));
  assert.ok(!tooAlike('#6FA3FF', '#FFE14D')); assert.ok(!tooAlike('#6FA3FF', '#3049B8')); assert.ok(!tooAlike('#5BC25B', '#FF5A5F'));
});
test('every theme has 8 clearly different class swatches, each with readable text on it', () => {
  const lum = (h) => { const [r, g, b] = toRgb(h).map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const cr = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
  const bad = []; let themes = 0;
  for (const f of walk(join(root, 'public', 'board', 'theme'))) {
    const t = readFileSync(f, 'utf8'); if (!/data-theme="\w+"\]/.test(t)) continue; themes++;
    const pal = []; for (let i = 1; i <= 8; i++) { const m = new RegExp(`--swatch-${i}:(#[0-9A-Fa-f]{6});--swatch-${i}-ink:(#[0-9A-Fa-f]{6})`).exec(t); assert.ok(m, `${relative(root, f)} swatch ${i}`); pal.push(m[1]); if (cr(m[1], m[2]) < 4.5) bad.push(`${relative(root, f)} swatch ${i} text contrast ${cr(m[1], m[2]).toFixed(2)}`); }
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (tooAlike(pal[i], pal[j])) bad.push(`${relative(root, f)} swatches ${i + 1} and ${j + 1} look alike: ${pal[i]} ${pal[j]}`);
  }
  assert.equal(themes, 6); assert.deepEqual(bad, []);
});
test('no hearts or sparkles in icons, emoji or copy', () => {
  const RX = /[\u2665\u2661\u2764\u2763\u{1F493}-\u{1F49F}\u{1F5A4}\u{1F90D}\u{1F90E}\u{1F9E1}\u2728\u2726\u2727\u2734\u2747\u{1F31F}\u2B50\u{1F4AB}]|\b(heart|sparkle|sparkles|twinkle)\b/iu;
  const bad = [];
  for (const f of [...ours, ...theirs].filter((f) => !/\.py$/.test(f))) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (RX.test(l)) bad.push(`${f}:${i + 1} ${l.trim().slice(0, 80)}`); });
  assert.deepEqual(bad, []);
});

test('no hearts or sparkles anywhere in the UI or themes', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../public/board/', import.meta.url);
  const files = ['board.js', 'board.css', 'tonight.css', 'plan.js'].map((f) => new URL(f, dir)).concat(readdirSync(new URL('theme/', dir)).filter((f) => f.endsWith('.css')).map((f) => new URL('theme/' + f, dir)), [new URL('../public/index.html', import.meta.url)]);
  const bad = /[\u2661\u2665\u2764\u2763\u{1F493}-\u{1F49F}\u{1F9E1}\u{1F90D}\u{1F90E}\u2728\u2726\u2727\u{1F31F}\u{1F4AB}]|\bheart\b|\bsparkle/iu;
  for (const f of files) { const t = readFileSync(f, 'utf8'); const m = t.match(bad); assert.equal(m, null, `${f.pathname.split('/').pop()}: ${m && m[0]}`); }
});
