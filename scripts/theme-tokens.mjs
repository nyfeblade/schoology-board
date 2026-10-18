// Reads the default theme's custom properties (resolving var() references) so build scripts use theme colors.
import { readFileSync } from 'node:fs';
export function tokens(file = new URL('../public/board/theme/default.css', import.meta.url)) {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
  const t = {};
  for (const m of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) t[m[1]] = m[2].trim();
  const res = (v, d = 0) => d > 8 ? v : v.replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g, (_, n) => res(t[n] || '', d + 1));
  for (const k of Object.keys(t)) t[k] = res(t[k]);
  return t;
}
