// Theme separation guard: colors live only in public/board/theme/*.css.
// Fails if layout CSS, board JS, the HTML shell or the Next app hardcode a color.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!/^(theme|vendor|node_modules)$/.test(f)) walk(p, out); } else out.push(p);
  }
  return out;
}
const files = [...walk(join(root, 'public', 'board')), ...walk(join(root, 'app')), join(root, 'public', 'index.html')]
  .filter((f) => /\.(css|js|mjs|jsx|html)$/.test(f));
const NAMED = 'white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|cyan|teal|magenta|navy|maroon|silver|gold';
const checks = [
  ['rgb()/hsl() color', /\b(rgba?|hsla?)\s*\(/],
  ['hex color in a CSS value', /:[^;{}\n]*#[0-9a-fA-F]{3,8}\b/, /\.css$/],
  ['hex color string', /['"`]\s*#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\s*['"`]/, /\.(m?js|jsx)$/],
  ['hex color attribute', /(content|color|fill|stroke|background)=["']#[0-9a-fA-F]{3,8}/i, /\.html$/],
  ['named color in a CSS value', new RegExp(`(?:^|[;{\\s])(?:color|background(?:-color)?|border(?:-[a-z]+)?|fill|stroke|outline(?:-color)?|box-shadow)\\s*:[^;{}]*\\b(?:${NAMED})\\b`, 'i'), /\.css$/]
];
test('no hardcoded colors outside theme files', () => {
  const bad = [];
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const [what, re, only] of checks) {
        if (only && !only.test(f)) continue;
        if (re.test(line)) bad.push(`${relative(root, f)}:${i + 1} ${what}: ${line.trim().slice(0, 100)}`);
      }
    });
  }
  assert.deepEqual(bad, [], 'Move these values into public/board/theme/default.css:\n' + bad.join('\n'));
});
test('the default theme defines every variable the layout uses', () => {
  const theme = readFileSync(join(root, 'public', 'board', 'theme', 'default.css'), 'utf8');
  const defined = new Set([...theme.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set();
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/var\((--[\w-]+)/g)) used.add(m[1]);
  const local = new Set(['--ci']); // set per element by board.js
  const missing = [...used].filter((v) => !v.endsWith('-') && !defined.has(v) && !local.has(v));
  assert.deepEqual(missing, []);
});
test('layout CSS has no fonts, durations or literal shadows', () => {
  const css = readFileSync(join(root, 'public', 'board', 'board.css'), 'utf8').replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '');
  assert.ok(!/font-family:\s*(?!var\()[A-Za-z"']/.test(css), 'font-family must use var(--font-*)');
  assert.ok(!/font:[^;}]*\b(Inter|monospace|sans-serif)\b/.test(css), 'font shorthand must use var(--font-*)');
  assert.ok(!/\b\d*\.?\d+m?s\b(?![\w-])/.test(css.replace(/var\([^)]*\)/g, '')), 'durations must use var(--dur-*) / var(--anim-*)');
  assert.ok(!/box-shadow:\s*(inset\s+)?\d/.test(css), 'shadows must use a var()');
});
