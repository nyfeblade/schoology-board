// Relays a Schoology iCal feed so the browser can read it (Schoology doesn't send
// CORS headers). Privacy: nothing is stored, cached or logged. The URL arrives in
// a POST body (so it never lands in request logs), is fetched once, and the
// response is streamed straight back.
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 12000;
const MAX_REDIRECTS = 3;

function json(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim().replace(/^webcals?:\/\//i, 'https://')); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (u.port && !['80', '443'].includes(u.port)) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host.includes('.') || /\.(local|internal|localhost)$/i.test(host) || net.isIP(host)) return null;
  try {
    const addrs = await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => privateIp(a.address))) return null;
  } catch { return null; }
  return u;
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json(400, 'Send JSON like {"url": "…"}.'); }
  let url = await checkUrl(body && body.url);
  if (!url) return json(400, "That doesn't look like a calendar link. It should start with webcal:// or https://.");

  let res;
  try {
    for (let i = 0; ; i++) {
      res = await fetch(url, {
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': 'SchoologyBoard/1.0 (+https://github.com/nyfeblade/schoology-board)', accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        if (i >= MAX_REDIRECTS) return json(502, 'The calendar link redirected too many times.');
        url = await checkUrl(new URL(res.headers.get('location'), url).href);
        if (!url) return json(400, 'The calendar link redirected somewhere unexpected.');
        continue;
      }
      break;
    }
  } catch (e) {
    return json(504, e && e.name === 'TimeoutError' ? 'Schoology took too long to answer. Try again.' : 'Could not reach that calendar link.');
  }
  if (res.status === 404 || res.status === 410) return json(404, 'Schoology says that calendar link does not exist. Copy it again from Schoology.');
  if (res.status === 401 || res.status === 403) return json(403, 'Schoology refused the link. It may have been reset; copy it again from Schoology.');
  if (!res.ok) return json(502, `Schoology answered with an error (${res.status}).`);

  // Read with a size cap.
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { reader.cancel(); return json(413, 'That calendar is larger than 5 MB.'); }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  // Pass the bytes through untouched (the browser decodes them); just check it's a calendar.
  if (!/^\s*(\uFEFF)?BEGIN:VCALENDAR/i.test(bytes.subarray(0, 2048).toString('utf8'))) {
    return json(422, "That link didn't return a calendar. Make sure you copied the iCal link from Schoology.");
  }
  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

export function GET() {
  return json(405, 'Use POST with {"url": "…"} so your private link never appears in a URL.');
}
