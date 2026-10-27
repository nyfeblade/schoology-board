// Safety rules for the calendar relay, kept apart from the route so they can be unit tested.
// 1. Allowlist: https on Schoology (and its subdomains) or a known calendar host, port 443, no user:pass@.
//    Google, Outlook, and iCloud are path-gated so the rest of those sites is not fetched.
// 2. The address check happens on the real connection: DNS is resolved inside the socket's own lookup,
//    and private, loopback, link-local, metadata and other non-public addresses are refused there.
// 3. Redirects are followed by hand, and every hop goes through rules 1 and 2 again.
// Nothing here stores or logs the link. Keep this host list aligned with hostKind in public/board/wedge.js.
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

export const ALLOWED_HOST = 'schoology.com';
const HOST_RULES = [
  { host: 'schoology.com', subs: true },
  { host: 'calendar.google.com', path: /^\/calendar\/ical\//i },
  { host: 'www.google.com', path: /^\/calendar\/ical\//i },
  { host: 'outlook.live.com', path: /\/calendar\/|\.ics$/i },
  { host: 'outlook.office365.com', path: /\/calendar\/|\.ics$/i },
  { host: 'outlook.office.com', path: /\/calendar\/|\.ics$/i },
  { host: 'calendar.icloud.com', path: /^\/published\/|\.ics$/i },
];

export const MSG = {
  notLink: 'That doesn\u2019t look like a link. Paste a calendar link. It starts with https://.',
  notAllowed: 'That calendar link isn\u2019t supported. Paste a link from Schoology (Calendar, Export, then Share Calendar), Google Calendar, Outlook, or iCloud.',
  notFeed: 'That link doesn\u2019t look like a calendar. Copy the secret address from the calendar\u2019s settings.',
  oddLink: 'That link has extra parts a calendar link doesn\u2019t have. Copy it again.',
  blocked: 'Couldn\u2019t reach Schoology at that address. Copy the link again from Schoology.',
  blockedOther: 'Couldn\u2019t reach that calendar at that address. Copy the link again.',
  dns: 'Couldn\u2019t reach Schoology. Check your link and try again.',
  dnsOther: 'Couldn\u2019t reach that calendar. Check your link and try again.',
  timeout: 'Schoology took too long to answer. Try again.',
  timeoutOther: 'That calendar took too long to answer. Try again.',
  network: 'Couldn\u2019t reach Schoology. Try again in a minute.',
  networkOther: 'Couldn\u2019t reach that calendar. Try again in a minute.',
  offSite: 'That link sent the request to a different website, so it was stopped. Copy the link again.',
  tooMany: 'That link redirected too many times. Copy it again.',
  signIn: 'Schoology asked for a sign-in instead of sending your calendar. The link may be wrong or reset. Copy it again from Schoology (Calendar, Export, Share Calendar).',
  signInOther: 'The site asked for a sign-in instead of sending your calendar. The link may be wrong or reset. Copy the address again.',
  notFound: 'Schoology couldn\u2019t find that calendar. The link may have been reset. Copy it again from Schoology.',
  notFoundOther: 'That calendar could not be found. The link may have been reset. Copy the address again.',
  refused: 'Schoology refused the link. It may have been reset. Copy it again from Schoology.',
  refusedOther: 'The calendar site refused the link. It may have been reset. Copy the address again.',
  tooBig: 'That calendar is larger than 5 MB.',
  notCalendar: 'That link didn\u2019t send back a calendar. Copy the calendar link from Schoology (Calendar, Export, Share Calendar).',
  notCalendarOther: 'That link didn\u2019t send back a calendar. Copy the secret address from the calendar\u2019s settings.',
  upstream: (s) => `Schoology answered with an error (${s}). Try again later.`,
  upstreamOther: (s) => `The calendar site answered with an error (${s}). Try again later.`,
};

function hostMatch(h, rule) {
  if (rule.subs) return h === rule.host || h.endsWith('.' + rule.host);
  return h === rule.host;
}
function ruleFor(host) {
  const h = String(host || '').toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(h) || h.includes('..') || h.endsWith('.')) return null;
  return HOST_RULES.find((r) => hostMatch(h, r)) || null;
}
export function hostAllowed(host) { return !!ruleFor(host); }
function pathAllowed(host, pathname) {
  const rule = ruleFor(host);
  if (!rule) return false;
  if (!rule.path) return true;
  return rule.path.test(pathname || '/');
}
function isSchool(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  return h === ALLOWED_HOST || (h.endsWith('.' + ALLOWED_HOST) && !h.includes('..'));
}

// Parse a pasted link (or a redirect target when `hop` is set) and apply the host rule.
// Pasted webcal:// and http:// links are upgraded to https; redirect hops must already be https.
export function checkUrl(raw, { hop = false } = {}) {
  let u;
  const s = String(raw == null ? '' : raw).trim();
  try { u = new URL(hop ? s : s.replace(/^webcals?:\/\//i, 'https://').replace(/^http:\/\//i, 'https://')); } catch { return { error: MSG.notLink }; }
  if (u.protocol !== 'https:') return { error: hop ? MSG.offSite : MSG.notLink };
  const host = u.hostname.replace(/\.$/, '');
  if (!hostAllowed(host)) return { error: hop ? MSG.offSite : MSG.notAllowed };
  if (u.username || u.password || (u.port && u.port !== '443')) return { error: MSG.oddLink };
  if (!pathAllowed(host, u.pathname)) return { error: hop ? MSG.offSite : MSG.notFeed };
  u.hostname = host;
  return { url: u };
}

// Addresses we never connect to.
const BL = new net.BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) BL.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 128], ['::1', 128], ['::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 23], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8]]) BL.addSubnet(a, p, 'ipv6');

function v4From(words, at) { return [words[at] >> 8, words[at] & 255, words[at + 1] >> 8, words[at + 1] & 255].join('.'); }
function v6Words(ip) {
  let s = ip.toLowerCase().split('%')[0];
  const m = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (m) { const p = m[1].split('.').map(Number); s = s.slice(0, -m[1].length) + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16); }
  const [l, r] = s.split('::');
  const L = l ? l.split(':') : [], R = r !== undefined ? (r ? r.split(':') : []) : [];
  const w = [...L, ...Array(r !== undefined ? 8 - L.length - R.length : 0).fill('0'), ...R].map((x) => parseInt(x, 16) || 0);
  return w.length === 8 ? w : null;
}
export function blockedIp(ip) {
  if (net.isIPv4(ip)) return BL.check(ip, 'ipv4');
  if (!net.isIPv6(ip)) return true;
  if (BL.check(ip, 'ipv6')) return true;
  const w = v6Words(ip); if (!w) return true;
  // IPv4 tucked inside IPv6: mapped (::ffff:a.b.c.d), NAT64 (64:ff9b::/96) and 6to4 (2002:abcd:efgh::) are judged by the IPv4 inside.
  if (w.slice(0, 5).every((x) => x === 0) && w[5] === 0xffff) return blockedIp(v4From(w, 6));
  if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every((x) => x === 0)) return blockedIp(v4From(w, 6));
  if (w[0] === 0x2002) return blockedIp(v4From(w, 1));
  return false;
}

// A socket lookup that refuses non-public addresses. `resolve` is swappable for tests.
export function makeSafeLookup(resolve = dns.lookup) {
  return function safeLookup(hostname, options, cb) {
    if (typeof options === 'function') { cb = options; options = {}; }
    resolve(hostname, { all: true, family: (options && options.family) || 0 }, (err, addrs) => {
      if (err) return cb(err);
      if (!addrs || !addrs.length) return cb(Object.assign(new Error('no address'), { code: 'ENOTFOUND' }));
      if (addrs.some((a) => blockedIp(a.address))) return cb(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }));
      if (options && options.all) return cb(null, addrs);
      cb(null, addrs[0].address, addrs[0].family);
    });
  };
}

// One GET over https with the safe lookup. Resolves with the response (body not read yet).
export function httpsGet(url, { signal, lookup, headers, port } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: 'https:', hostname: url.hostname, port: port || 443, path: url.pathname + url.search, method: 'GET',
      headers, lookup, signal, agent: false, servername: url.hostname,
    }, resolve);
    req.on('error', reject);
    req.end();
  });
}

export async function readCapped(res, max) {
  const chunks = []; let size = 0;
  for await (const c of res) { size += c.length; if (size > max) { res.destroy(); return null; } chunks.push(c); }
  return Buffer.concat(chunks);
}

// Fetch a pasted link: host rule + connection-time address check on every hop.
// Returns { status: 200, body } or { status, error }.
export async function relay(raw, { timeoutMs = 12000, maxRedirects = 3, maxBytes = 5 * 1024 * 1024, resolve, get = httpsGet, port } = {}) {
  const first = checkUrl(raw);
  if (first.error) return { status: 400, error: first.error };
  let url = first.url, res, signIn = false, school = false;
  const signal = AbortSignal.timeout(timeoutMs), lookup = makeSafeLookup(resolve);
  const headers = { 'user-agent': 'SchoologyBoard/1.11 (+https://github.com/nyfeblade/schoology-board)', accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5' };
  const say = (a, b) => (school ? a : b);
  try {
    for (let i = 0; ; i++) {
      school = isSchool(url.hostname);
      res = await get(url, { signal, lookup, headers, port });
      const loc = res.statusCode >= 300 && res.statusCode < 400 && res.headers.location;
      if (!loc) break;
      res.resume();
      if (i >= maxRedirects) return { status: 502, error: MSG.tooMany };
      let next; try { next = new URL(loc, url).href; } catch { return { status: 502, error: MSG.offSite }; }
      const c = checkUrl(next, { hop: true });
      if (c.error) return { status: 502, error: c.error };
      url = c.url;
      if (/^\/login\b/.test(url.pathname)) signIn = true;
    }
    if (res.statusCode === 404 || res.statusCode === 410) { res.resume(); return { status: 404, error: say(MSG.notFound, MSG.notFoundOther) }; }
    if (res.statusCode === 401 || res.statusCode === 403) { res.resume(); return { status: 403, error: say(MSG.refused, MSG.refusedOther) }; }
    if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return { status: 502, error: say(MSG.upstream, MSG.upstreamOther)(res.statusCode) }; }
    const body = await readCapped(res, maxBytes);
    if (!body) return { status: 413, error: MSG.tooBig };
    if (!/^\s*(\uFEFF)?BEGIN:VCALENDAR/i.test(body.subarray(0, 2048).toString('utf8'))) return { status: 422, error: signIn ? say(MSG.signIn, MSG.signInOther) : say(MSG.notCalendar, MSG.notCalendarOther) };
    return { status: 200, body };
  } catch (e) {
    const code = e && (typeof e.code === 'string' ? e.code : e.name);
    if (code === 'EBLOCKED') return { status: 400, error: say(MSG.blocked, MSG.blockedOther) };
    if (signal.aborted || code === 'TimeoutError' || code === 'AbortError' || code === 'ABORT_ERR') return { status: 504, error: say(MSG.timeout, MSG.timeoutOther) };
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { status: 502, error: say(MSG.dns, MSG.dnsOther) };
    return { status: 502, error: say(MSG.network, MSG.networkOther) };
  }
}
