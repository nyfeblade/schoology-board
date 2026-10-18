// Copies the pdf.js browser build (and the QR generator) into public/board/vendor so the board (and the
// offline download) can read CAS PDFs locally. Runs before dev and build.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const root = dirname(require.resolve('pdfjs-dist/package.json'));
const out = join(process.cwd(), 'public', 'board', 'vendor');
mkdirSync(out, { recursive: true });
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) copyFileSync(join(root, 'build', f), join(out, f));
// QR codes for "Move to phone" are drawn in the browser (MIT, Kazuhiko Arase); no external service.
copyFileSync(require.resolve('qrcode-generator/qrcode.js'), join(out, 'qrcode.js'));
console.log('pdf.js + qrcode-generator copied to public/board/vendor');
