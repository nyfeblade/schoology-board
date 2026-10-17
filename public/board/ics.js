/* Schoology Board: iCalendar (RFC 5545) parser tuned for Schoology feeds.
   Plain browser script + CommonJS module, no dependencies. */
(function (root) {
  'use strict';

  function unfold(text) {
    return String(text || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/\n[ \t]/g, '');
  }

  /** Unfold at the byte level, then decode UTF-8, so a fold inside a multi-byte
      character (which some generators produce) doesn't corrupt it. */
  function decodeBytes(buf) {
    var b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var out = new Uint8Array(b.length), n = 0;
    for (var i = 0; i < b.length; i++) {
      if (b[i] === 13 && b[i + 1] === 10 && (b[i + 2] === 32 || b[i + 2] === 9)) { i += 2; continue; }
      if (b[i] === 10 && (b[i + 1] === 32 || b[i + 1] === 9)) { i += 1; continue; }
      out[n++] = b[i];
    }
    return new TextDecoder('utf-8').decode(out.subarray(0, n));
  }

  function unescapeText(s) {
    return String(s || '').replace(/\\([\\;,nN:])/g, function (_, c) {
      return c === 'n' || c === 'N' ? '\n' : c;
    });
  }

  // Split "NAME;P1=a;P2="x:y":value" at the first colon outside quotes.
  function parseLine(line) {
    var inQ = false, idx = -1;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (ch === ':' && !inQ) { idx = i; break; }
    }
    if (idx < 0) return null;
    var left = line.slice(0, idx), value = line.slice(idx + 1);
    var parts = [], cur = '', q = false;
    for (var j = 0; j < left.length; j++) {
      var c = left[j];
      if (c === '"') q = !q;
      if (c === ';' && !q) { parts.push(cur); cur = ''; } else cur += c;
    }
    parts.push(cur);
    var params = {};
    for (var k = 1; k < parts.length; k++) {
      var eq = parts[k].indexOf('=');
      if (eq > 0) params[parts[k].slice(0, eq).toUpperCase()] = parts[k].slice(eq + 1).replace(/^"|"$/g, '');
    }
    return { name: parts[0].trim().toUpperCase(), params: params, value: value };
  }

  /** Raw components: [{ type:'VEVENT'|'VTODO', props:{NAME:{params,value}} }] */
  function parseComponents(text) {
    var lines = unfold(text).split('\n');
    var out = [], cur = null, depth = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\s+$/, '');
      if (!line) continue;
      var up = line.toUpperCase();
      if (up === 'BEGIN:VEVENT' || up === 'BEGIN:VTODO') { cur = { type: up.slice(6), props: {} }; depth = 0; continue; }
      if (cur && up.indexOf('BEGIN:') === 0) { depth++; continue; } // VALARM etc.
      if (cur && up.indexOf('END:') === 0) {
        if (depth > 0) { depth--; continue; }
        out.push(cur); cur = null; continue;
      }
      if (!cur || depth > 0) continue;
      var p = parseLine(line);
      if (!p) continue;
      if (p.name === 'CATEGORIES' && cur.props.CATEGORIES) cur.props.CATEGORIES.value += ',' + p.value;
      else if (!cur.props[p.name]) cur.props[p.name] = { params: p.params, value: p.value };
    }
    return out;
  }

  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  function tzOffsetMs(ts, tz) {
    var f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    var parts = {};
    f.formatToParts(new Date(ts)).forEach(function (p) { parts[p.type] = p.value; });
    var h = +parts.hour % 24;
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, h, +parts.minute, +parts.second) - ts;
  }

  function zonedToUtc(y, mo, d, h, mi, s, tz) {
    var wall = Date.UTC(y, mo - 1, d, h, mi, s);
    var ts = wall - tzOffsetMs(wall, tz);
    var off = tzOffsetMs(ts, tz);
    if (wall - off !== ts) ts = wall - off;
    return new Date(ts);
  }

  // Windows zone names that show up in exported calendars.
  var WIN_TZ = {
    'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago',
    'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles',
    'US Mountain Standard Time': 'America/Phoenix', 'Alaskan Standard Time': 'America/Anchorage',
    'Hawaiian Standard Time': 'Pacific/Honolulu', 'GMT Standard Time': 'Europe/London'
  };

  function validTz(tz) {
    if (!tz) return null;
    tz = WIN_TZ[tz] || tz.replace(/^\/+/, '');
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch (e) { return null; }
  }

  /**
   * Parse an ICS date property.
   * Returns { due: string, allDay: bool } where due is either an ISO UTC string
   * ("2026-10-20T03:59:00.000Z") or a floating local "YYYY-MM-DDTHH:MM".
   * All-day dates become 11:59 PM local on that day.
   */
  function parseDate(prop) {
    if (!prop || !prop.value) return null;
    var v = String(prop.value).trim();
    var m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
    if (m || (prop.params && prop.params.VALUE === 'DATE' && (m = v.match(/^(\d{4})(\d{2})(\d{2})/)))) {
      return { due: m[1] + '-' + m[2] + '-' + m[3] + 'T23:59', allDay: true };
    }
    m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})T(\d{2}):?(\d{2}):?(\d{2})?(Z)?$/i);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], s = +(m[6] || 0);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 24 || mi > 59) return null;
    if (m[7]) return { due: new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString(), allDay: false };
    var tz = validTz(prop.params && prop.params.TZID);
    if (tz) return { due: zonedToUtc(y, mo, d, h, mi, s, tz).toISOString(), allDay: false };
    return { due: m[1] + '-' + m[2] + '-' + m[3] + 'T' + pad(h) + ':' + pad(mi), allDay: false };
  }

  var URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

  /** Schoology DESCRIPTION ends with " - Link: <url>". Split text and link. */
  function splitDescription(desc) {
    var text = unescapeText(desc || '');
    var m = text.match(/^([\s\S]*?)\s*-?\s*Link:\s*(https?:\/\/\S+)\s*$/i);
    if (m) return { text: m[1].trim(), link: m[2].replace(/[.,;]+$/, '') };
    var u = text.match(URL_RE);
    return { text: text.trim(), link: u ? u[0].replace(/[.,;]+$/, '') : null };
  }

  function kindFromUrl(url) {
    var m = String(url || '').match(/\/(assignment|assessment|common_assessment|discussion|event|page|external_tool|course)\/(\d+)/i);
    if (!m) return { kind: 'event', id: null };
    var k = m[1].toLowerCase();
    if (k === 'common_assessment') k = 'assessment';
    return { kind: k, id: m[2] };
  }

  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  var TRAIL_RE = /\s*\(([^()]{2,48})\)\s*$/;
  function trailingCourse(title) {
    var m = title.match(TRAIL_RE);
    if (!m) return null;
    var inner = m[1].trim();
    if (/^\d/.test(inner) || /\b(pp?|pages?|ch|chap|chapter|due|optional|part|odds?|evens?)\b\.?/i.test(inner)) return null;
    if (!/[A-Za-z]{2,}/.test(inner)) return null;
    return inner;
  }

  /**
   * Parse a Schoology (or any) iCal feed into board items.
   * item: { uid, title, course, due, allDay, url, desc, kind, source:'ics' }
   */
  function parseIcs(text) {
    if (!/BEGIN:VCALENDAR/i.test(String(text || ''))) {
      throw new Error("That doesn't look like a calendar file (no BEGIN:VCALENDAR).");
    }
    var comps = parseComponents(text);
    var items = [], seen = {};
    comps.forEach(function (c) {
      var P = c.props;
      var status = P.STATUS ? String(P.STATUS.value).toUpperCase() : '';
      if (status === 'CANCELLED') return;
      var when = parseDate(P.DUE) || parseDate(P.DTSTART) || parseDate(P.DTEND);
      if (!when) return;
      var title = unescapeText(P.SUMMARY ? P.SUMMARY.value : '').replace(/\s+/g, ' ').trim() || 'Untitled';
      var d = splitDescription(P.DESCRIPTION ? P.DESCRIPTION.value : '');
      var url = (P.URL && P.URL.value.trim()) || d.link || null;
      if (url && !/^https?:\/\//i.test(url)) url = null;
      var cats = P.CATEGORIES ? unescapeText(P.CATEGORIES.value.replace(/\\,/g, '\u0000'))
        .split(',').map(function (s) { return s.replace(/\u0000/g, ',').trim(); }).filter(Boolean) : [];
      var uid = P.UID ? P.UID.value.trim() : '';
      if (!uid) uid = 'gen-' + hash(title + '|' + when.due + '|' + (url || ''));
      if (seen[uid]) uid = uid + '#' + hash(when.due + title);
      seen[uid] = 1;
      items.push({
        uid: uid, title: title, course: cats[0] || null, due: when.due, allDay: when.allDay,
        url: url, desc: d.text.slice(0, 600), kind: kindFromUrl(url).kind, source: 'ics'
      });
    });
    // Some feeds append "(Course Name)" to every title. Trust it only if it repeats.
    var counts = {};
    items.forEach(function (it) { var t = trailingCourse(it.title); if (t) counts[t] = (counts[t] || 0) + 1; });
    items.forEach(function (it) {
      if (it.course) return;
      var t = trailingCourse(it.title);
      if (t && counts[t] >= 2) { it.course = t; it.title = it.title.replace(TRAIL_RE, '').trim(); }
    });
    return items;
  }

  var api = {
    unfold: unfold, decodeBytes: decodeBytes, unescapeText: unescapeText, parseLine: parseLine, parseComponents: parseComponents,
    parseDate: parseDate, splitDescription: splitDescription, kindFromUrl: kindFromUrl,
    parseIcs: parseIcs, zonedToUtc: zonedToUtc, hash: hash
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SBics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
