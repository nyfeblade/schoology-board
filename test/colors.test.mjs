// Color rules (hard rules from the design brief):
//  - no orange (hue ~15-46 deg) and no cyan / teal / blue-green (hue ~160-200 deg) with real color in them,
//  - no pink as UI chrome: pink may only be an optional class swatch (--swatch-8), never a token the UI uses,
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
test('pink is never UI chrome: only the optional --swatch-8 may be pink', () => {
  const bad = [];
  for (const f of walk(join(root, 'public', 'board', 'theme'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/(--[\w-]+)\s*:([^;}]*)/g)) {
      if (/^--swatch-8/.test(m[1])) continue;
      for (const c of m[2].match(COLOR) || []) {
        const rgb = toRgb(c); if (!rgb) continue;
        const { h, c: ch } = hueChroma(rgb);
        if (h >= 290 && h <= 345 && ch >= 0.3) bad.push(`${relative(root, f)} ${m[1]}: ${c}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
test('no hearts or sparkles in icons, emoji or copy', () => {
  const RX = /[\u2665\u2661\u2764\u2763\u{1F493}-\u{1F49F}\u{1F5A4}\u{1F90D}\u{1F90E}\u{1F9E1}\u2728\u2726\u2727\u2734\u2747\u{1F31F}\u2B50\u{1F4AB}]|\b(heart|sparkle|sparkles|twinkle)\b/iu;
  const bad = [];
  for (const f of [...ours, ...theirs].filter((f) => !/\.py$/.test(f))) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (RX.test(l)) bad.push(`${f}:${i + 1} ${l.trim().slice(0, 80)}`); });
  assert.deepEqual(bad, []);
});
