// Motion budget: UI motion is 0.4 s or less; celebrations and looping indicators (skeleton shimmer,
// sync sweep, spinner) are 1.2 s or less; and everything respects prefers-reduced-motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const walk = (d, o = []) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'vendor' && f !== 'fonts') walk(p, o); } else o.push(p); } return o; };
const css = walk(join(root, 'public', 'board')).filter((f) => f.endsWith('.css'));
const sec = (n, u) => (u === 'ms' ? +n / 1000 : +n);

test('CSS durations stay inside the motion budget', () => {
  const bad = [];
  for (const f of css) {
    const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // Split into declarations so each duration is judged with its own property.
    for (const decl of text.split(/[;{}]/)) {
      for (const m of decl.matchAll(/(?<![\w.#-])(\d*\.?\d+)(ms|s)\b/g)) {
        const v = sec(m[1], m[2]);
        const long = /--dur-(celebrate|loop)|infinite|--anim-spin|animation-delay/.test(decl);
        const max = long ? 1.2 : 0.4;
        if (v > max) bad.push(`${relative(root, f)}: ${decl.trim().slice(0, 90)} (${v}s > ${max}s)`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('JS animations stay inside the motion budget', () => {
  const js = readFileSync(join(root, 'public', 'board', 'board.js'), 'utf8');
  const durs = [...js.matchAll(/duration:\s*(\d+)/g)].map((m) => +m[1]);
  assert.ok(durs.length > 0);
  for (const d of durs) assert.ok(d <= 1200, `animation of ${d} ms is over 1.2 s`);
});

test('reduced motion turns animation off', () => {
  const board = readFileSync(join(root, 'public', 'board', 'board.css'), 'utf8');
  assert.match(board, /@media \(prefers-reduced-motion:reduce\)\{\*\{animation:none!important;transition:none!important/);
  const js = readFileSync(join(root, 'public', 'board', 'board.js'), 'utf8');
  assert.match(js, /prefers-reduced-motion: reduce/);
  // The finish moment and the all-done overlay both check it before animating.
  assert.match(js, /function completeRow[\s\S]*?reducedMotion\(\)/);
  assert.match(js, /function celebrateAll[\s\S]*?reducedMotion\(\)/);
});
