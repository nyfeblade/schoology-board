// Pixel diff two snapshot folders. Fails if any image differs by more than TOL (fraction of pixels).
//   node scripts/visual-diff.mjs before/ after/ [diffOut/]
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
const [A, B, D] = process.argv.slice(2);
const TOL = +(process.env.TOL || 0.0005), CH = +(process.env.CHANNEL_TOL || 8);
if (D) mkdirSync(D, { recursive: true });
let bad = 0;
for (const f of readdirSync(A).filter((x) => x.endsWith('.png')).sort()) {
  const a = PNG.sync.read(readFileSync(join(A, f))), b = PNG.sync.read(readFileSync(join(B, f)));
  if (a.width !== b.width || a.height !== b.height) { console.log(`FAIL ${f} size ${a.width}x${a.height} vs ${b.width}x${b.height}`); bad++; continue; }
  const out = new PNG({ width: a.width, height: a.height }); let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d > CH) { n++; out.data[i] = 255; out.data[i + 3] = 255; } else { out.data[i] = out.data[i + 1] = out.data[i + 2] = a.data[i] >> 2; out.data[i + 3] = 255; }
  }
  const frac = n / (a.width * a.height), ok = frac <= TOL;
  if (!ok) bad++;
  if (D && n) writeFileSync(join(D, f), PNG.sync.write(out));
  console.log(`${ok ? 'PASS' : 'FAIL'} ${f}  ${n} px differ (${(frac * 100).toFixed(4)}%)`);
}
process.exit(bad ? 1 : 0);
