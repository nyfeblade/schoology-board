// Relays a Schoology iCal feed so the browser can read it (Schoology doesn't send
// CORS headers). Privacy: nothing is stored, cached or logged. The URL arrives in
// a POST body (so it never lands in request logs), is fetched once, and the
// response is sent straight back. Only Schoology links are fetched; see guard.js.
import { relay } from './guard.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json(400, 'Send JSON like {"url": "…"}.'); }
  const r = await relay(body && body.url);
  if (r.error) return json(r.status, r.error);
  return new Response(r.body, {
    status: 200,
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

export function GET() {
  return json(405, 'Use POST with {"url": "…"} so your private link never appears in a URL.');
}
