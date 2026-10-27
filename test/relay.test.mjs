// The feed relay only talks to Schoology, and only over public addresses (checked on every hop, at connect time).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { hostAllowed, checkUrl, blockedIp, makeSafeLookup, relay, httpsGet, MSG } from '../app/api/feed/guard.js';

test('host rule: Schoology subdomains plus known calendar hosts, nothing else', () => {
  for (const h of ['schoology.com', 'app.schoology.com', 'lms.district.schoology.com', 'APP.SCHOOLOGY.COM', 'calendar.google.com', 'www.google.com', 'outlook.live.com', 'outlook.office365.com', 'outlook.office.com', 'calendar.icloud.com']) assert.ok(hostAllowed(h), h);
  for (const h of ['evilschoology.com', 'schoology.com.evil.example', 'schoology.co', 'example.com', 'app.schoology.com.', 'xschoology.com', '', 'schoology.com@evil.example', 'a..schoology.com', 'google.com', 'www.icloud.com', 'icloud.com', 'evil.google.com', 'calendar.google.com.evil.example', 'localhost', 'evil.test'])
    assert.ok(!hostAllowed(h), h);
});

test('pasted links: webcal/http become https; other sites, ports, user:pass and junk are refused with a plain message', () => {
  assert.equal(checkUrl('webcal://app.schoology.com/calendar/feed/ical/1/x/ical.ics').url.href, 'https://app.schoology.com/calendar/feed/ical/1/x/ical.ics');
  assert.equal(checkUrl('webcals://app.schoology.com/a.ics').url.protocol, 'https:');
  assert.equal(checkUrl('http://app.schoology.com/a.ics').url.protocol, 'https:');
  assert.equal(checkUrl('  https://app.schoology.com./a.ics ').url.hostname, 'app.schoology.com');
  assert.equal(checkUrl('https://app.schoology.com:443/a.ics').url.port, '');
  assert.equal(checkUrl('https://calendar.google.com/calendar/ical/x/basic.ics').url.href, 'https://calendar.google.com/calendar/ical/x/basic.ics');
  assert.equal(checkUrl('https://www.google.com/calendar/ical/abc/public/basic.ics').url.hostname, 'www.google.com');
  assert.equal(checkUrl('https://outlook.office365.com/owa/calendar/x.ics').url.hostname, 'outlook.office365.com');
  assert.equal(checkUrl('https://outlook.live.com/calendar/published/x').url.hostname, 'outlook.live.com');
  assert.equal(checkUrl('https://outlook.office.com/secret.ics').url.pathname, '/secret.ics');
  assert.equal(checkUrl('https://calendar.icloud.com/published/2/abc').url.hostname, 'calendar.icloud.com');
  assert.equal(checkUrl('webcal://calendar.google.com/calendar/ical/x/basic.ics').url.protocol, 'https:');
  assert.equal(checkUrl('https://calendar.google.com/').error, MSG.notFeed);
  assert.equal(checkUrl('https://www.google.com/search').error, MSG.notFeed);
  assert.equal(checkUrl('https://outlook.office.com/mail/').error, MSG.notFeed);
  assert.equal(checkUrl('https://calendar.icloud.com/').error, MSG.notFeed);
  assert.equal(checkUrl('https://www.icloud.com/calendar/').error, MSG.notAllowed);
  assert.equal(checkUrl('https://u:p@calendar.google.com/calendar/ical/x/basic.ics').error, MSG.oddLink);
  assert.equal(checkUrl('https://calendar.google.com:8443/calendar/ical/x/basic.ics').error, MSG.oddLink);
  assert.equal(checkUrl('https://schoology.com.evil.example/a.ics').error, MSG.notAllowed);
  assert.equal(checkUrl('https://169.254.169.254/latest/meta-data').error, MSG.notAllowed);
  assert.equal(checkUrl('https://[::1]/a').error, MSG.notAllowed);
  assert.equal(checkUrl('https://evil.test/calendar.ics').error, MSG.notAllowed);
  assert.match(MSG.notAllowed, /isn\u2019t supported/);
  assert.match(MSG.notAllowed, /Google Calendar/);
  assert.equal(checkUrl('https://app.schoology.com:8443/a.ics').error, MSG.oddLink);
  assert.equal(checkUrl('https://u:p@app.schoology.com/a.ics').error, MSG.oddLink);
  assert.equal(checkUrl('ftp://app.schoology.com/a.ics').error, MSG.notLink);
  assert.equal(checkUrl('not a link').error, MSG.notLink);
  assert.equal(checkUrl(undefined).error, MSG.notLink);
});

test('redirect hops: must stay https on an allowlisted calendar path (no downgrade, no other site)', () => {
  assert.ok(checkUrl('https://app.schoology.com/login?d=1', { hop: true }).url);
  assert.equal(checkUrl('http://app.schoology.com/a.ics', { hop: true }).error, MSG.offSite);
  assert.equal(checkUrl('https://evil.example/a.ics', { hop: true }).error, MSG.offSite);
  assert.equal(checkUrl('https://169.254.169.254/', { hop: true }).error, MSG.offSite);
  assert.equal(checkUrl('https://calendar.google.com/', { hop: true }).error, MSG.offSite);
  assert.ok(checkUrl('https://calendar.google.com/calendar/ical/x/basic.ics', { hop: true }).url);
});

test('non-public addresses are blocked (IPv4, IPv6 and IPv4 hidden inside IPv6)', () => {
  const bad = ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.100.100.200', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.0.170',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd00:ec2::254', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '64:ff9b::a9fe:a9fe', '2002:a9fe:a9fe::1', '2001:db8::1', 'not-an-ip'];
  for (const ip of bad) assert.ok(blockedIp(ip), ip);
  for (const ip of ['8.8.8.8', '52.20.1.1', '172.32.0.1', '2606:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808']) assert.ok(!blockedIp(ip), ip);
});

const fakeResolve = (map) => (host, opts, cb) => { const a = map[host]; if (!a) return cb(Object.assign(new Error('nx'), { code: 'ENOTFOUND' })); cb(null, a.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))); };

test('the safe lookup refuses a name if any of its addresses is private (both callback shapes)', async () => {
  const lk = makeSafeLookup(fakeResolve({ 'ok.schoology.com': ['52.20.1.1'], 'mix.schoology.com': ['52.20.1.1', '10.0.0.5'] }));
  await new Promise((done) => lk('ok.schoology.com', {}, (e, a, f) => { assert.equal(e, null); assert.equal(a, '52.20.1.1'); assert.equal(f, 4); done(); }));
  await new Promise((done) => lk('ok.schoology.com', { all: true }, (e, a) => { assert.equal(e, null); assert.equal(a[0].address, '52.20.1.1'); done(); }));
  await new Promise((done) => lk('mix.schoology.com', {}, (e) => { assert.equal(e.code, 'EBLOCKED'); done(); }));
});

test('a Schoology name that resolves to a private address is refused on the real connection, before any bytes are sent', async () => {
  const r = await relay('https://app.schoology.com/calendar.ics', { resolve: fakeResolve({ 'app.schoology.com': ['127.0.0.1'] }), timeoutMs: 3000 });
  assert.deepEqual(r, { status: 400, error: MSG.blocked });
  const r2 = await relay('https://app.schoology.com/calendar.ics', { resolve: fakeResolve({ 'app.schoology.com': ['169.254.169.254'] }), timeoutMs: 3000 });
  assert.equal(r2.error, MSG.blocked);
});

// A pretend network: each hop runs the real safe lookup first (as the socket would), then answers from a script.
function scripted(pages, resolveMap) {
  const seen = [];
  const get = (url, { lookup }) => new Promise((ok, no) => lookup(url.hostname, {}, (e) => {
    if (e) return no(e);
    seen.push(url.href);
    const p = pages[url.href] || { status: 404 };
    const res = Readable.from(p.body ? [Buffer.from(p.body)] : []);
    res.statusCode = p.status; res.headers = p.headers || {};
    ok(res);
  }));
  return { get, seen, resolve: fakeResolve(resolveMap) };
}
const CAL = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
const PUB = { 'app.schoology.com': ['52.20.1.1'], 'cdn.schoology.com': ['52.20.1.2'], 'evil.example': ['52.20.9.9'], 'inner.schoology.com': ['10.0.0.7'] };

test('relay: a Schoology calendar comes back as-is; redirects within Schoology are followed', async () => {
  const n = scripted({ 'https://app.schoology.com/a.ics': { status: 302, headers: { location: 'https://cdn.schoology.com/b.ics' } }, 'https://cdn.schoology.com/b.ics': { status: 200, body: CAL } }, PUB);
  const r = await relay('webcal://app.schoology.com/a.ics', n);
  assert.equal(r.status, 200); assert.equal(r.body.toString(), CAL); assert.equal(n.seen.length, 2);
});

test('relay: every redirect hop gets the host rule and the address check', async () => {
  let n = scripted({ 'https://app.schoology.com/a.ics': { status: 302, headers: { location: 'https://evil.example/x' } } }, PUB);
  assert.deepEqual(await relay('https://app.schoology.com/a.ics', n), { status: 502, error: MSG.offSite }); assert.equal(n.seen.length, 1);
  n = scripted({ 'https://app.schoology.com/a.ics': { status: 301, headers: { location: 'http://app.schoology.com/a.ics' } } }, PUB);
  assert.equal((await relay('https://app.schoology.com/a.ics', n)).error, MSG.offSite);
  n = scripted({ 'https://app.schoology.com/a.ics': { status: 302, headers: { location: 'https://inner.schoology.com/a.ics' } } }, PUB);
  assert.deepEqual(await relay('https://app.schoology.com/a.ics', n), { status: 400, error: MSG.blocked }); assert.equal(n.seen.length, 1);
  n = scripted({ 'https://app.schoology.com/a.ics': { status: 302, headers: { location: '/a.ics' } } }, PUB);
  assert.equal((await relay('https://app.schoology.com/a.ics', n)).error, MSG.tooMany);
});

test('relay: honest messages for not found, refused, sign-in pages, non-calendars and server errors', async () => {
  const go = async (pages) => relay('https://app.schoology.com/a.ics', scripted(pages, PUB));
  assert.deepEqual(await go({ 'https://app.schoology.com/a.ics': { status: 404 } }), { status: 404, error: MSG.notFound });
  assert.equal((await go({ 'https://app.schoology.com/a.ics': { status: 403 } })).error, MSG.refused);
  assert.equal((await go({ 'https://app.schoology.com/a.ics': { status: 302, headers: { location: 'https://app.schoology.com/login?destination=x' } }, 'https://app.schoology.com/login?destination=x': { status: 200, body: '<html>' } })).error, MSG.signIn);
  assert.equal((await go({ 'https://app.schoology.com/a.ics': { status: 200, body: '<html>' } })).error, MSG.notCalendar);
  assert.equal((await go({ 'https://app.schoology.com/a.ics': { status: 503 } })).error, 'Schoology answered with an error (503). Try again later.');
  assert.equal((await relay('https://nowhere.schoology.com/a.ics', scripted({}, PUB))).error, MSG.dns);
  assert.equal((await relay('https://example.com/', scripted({}, PUB))).error, MSG.notAllowed);
  for (const m of Object.values(MSG)) { const t = typeof m === 'function' ? m(500) : m; assert.ok(!/does not exist|Schoology says/i.test(t), t); }
});

test('relay: a stalled answer times out with a plain message', async () => {
  const get = (url, { signal, lookup }) => new Promise((ok, no) => lookup(url.hostname, {}, (e) => { if (e) return no(e); signal.addEventListener('abort', () => no(signal.reason)); }));
  const keep = setInterval(() => {}, 50); // AbortSignal.timeout doesn't hold the event loop open by itself
  const r = await relay('https://app.schoology.com/a.ics', { get, resolve: fakeResolve(PUB), timeoutMs: 200 }); clearInterval(keep);
  assert.deepEqual(r, { status: 504, error: MSG.timeout });
});

test('relay: an allowlisted Google calendar is fetched; a private redirect is blocked before it is read', async () => {
  const pub = { 'calendar.google.com': ['142.250.1.1'], 'calendar.icloud.com': ['10.1.2.3'] };
  let n = scripted({ 'https://calendar.google.com/calendar/ical/x/basic.ics': { status: 200, body: CAL } }, pub);
  const ok = await relay('https://calendar.google.com/calendar/ical/x/basic.ics', n);
  assert.equal(ok.status, 200); assert.equal(ok.body.toString(), CAL);
  n = scripted({ 'https://calendar.google.com/calendar/ical/x/basic.ics': { status: 302, headers: { location: 'https://calendar.icloud.com/published/secret.ics' } } }, pub);
  const blocked = await relay('https://calendar.google.com/calendar/ical/x/basic.ics', n);
  assert.deepEqual(blocked, { status: 400, error: MSG.blockedOther }); assert.equal(n.seen.length, 1);
  n = scripted({ 'https://calendar.google.com/calendar/ical/x/basic.ics': { status: 302, headers: { location: 'https://evil.example/x.ics' } } }, { ...pub, 'evil.example': ['52.20.9.9'] });
  assert.equal((await relay('https://calendar.google.com/calendar/ical/x/basic.ics', n)).error, MSG.offSite); assert.equal(n.seen.length, 1);
  n = scripted({ 'https://calendar.google.com/calendar/ical/x/basic.ics': { status: 503 } }, pub);
  const up = await relay('https://calendar.google.com/calendar/ical/x/basic.ics', n);
  assert.equal(up.status, 502); assert.match(up.error, /error \(503\)/); assert.doesNotMatch(up.error, /Schoology/);
  n = scripted({ 'https://app.schoology.com/a.ics': { status: 200, body: CAL + 'X'.repeat(80) } }, PUB);
  assert.equal((await relay('https://app.schoology.com/a.ics', { ...n, maxBytes: 40 })).status, 413);
});

test('httpsGet uses the given lookup for the socket', async () => {
  let asked = '';
  const lookup = (h, o, cb) => { asked = h; cb(Object.assign(new Error('blocked'), { code: 'EBLOCKED' })); };
  await assert.rejects(httpsGet(new URL('https://app.schoology.com/x'), { lookup }), (e) => e.code === 'EBLOCKED');
  assert.equal(asked, 'app.schoology.com');
});
