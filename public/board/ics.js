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
      if ((p.name === 'CATEGORIES' || p.name === 'EXDATE') && cur.props[p.name]) cur.props[p.name].value += ',' + p.value;
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
    var items = [], seen = {}, overrides = {};
    // RECURRENCE-ID components replace one occurrence of a recurring event.
    comps.forEach(function (c) {
      var P = c.props;
      if (P['RECURRENCE-ID'] && P.UID) overrides[P.UID.value.trim() + '|' + dateKeyOf(P['RECURRENCE-ID'].value)] = c;
    });
    function push(c, uid, when) {
      var P = c.props;
      var title = unescapeText(P.SUMMARY ? P.SUMMARY.value : '').replace(/\s+/g, ' ').trim() || 'Untitled';
      var d = splitDescription(P.DESCRIPTION ? P.DESCRIPTION.value : '');
      var url = (P.URL && P.URL.value.trim()) || d.link || null;
      if (url && !/^https?:\/\//i.test(url)) url = null;
      var cats = P.CATEGORIES ? unescapeText(P.CATEGORIES.value.replace(/\\,/g, '\u0000'))
        .split(',').map(function (x) { return x.replace(/\u0000/g, ',').trim(); }).filter(Boolean) : [];
      if (!uid) uid = 'gen-' + hash(title + '|' + when.due + '|' + (url || ''));
      if (seen[uid]) {
        var prev = seen[uid];
        if (prev.title === title && prev.due === when.due) return; // an exact duplicate VEVENT
        uid = uid + '#' + hash(when.due + title);
        if (seen[uid]) return;
      }
      var it = {
        uid: uid, title: title, course: cats[0] || null, due: when.due, allDay: when.allDay,
        url: url, desc: d.text.slice(0, 600), kind: kindFromUrl(url).kind, source: 'ics'
      };
      seen[uid] = it;
      items.push(it);
    }
    comps.forEach(function (c) {
      var P = c.props;
      if (P['RECURRENCE-ID']) return; // handled as an override of its series
      var status = P.STATUS ? String(P.STATUS.value).toUpperCase() : '';
      if (status === 'CANCELLED') return;
      var base = P.DUE || P.DTSTART || P.DTEND;
      var when = parseDate(base);
      if (!when) return;
      var uid = P.UID ? P.UID.value.trim() : '';
      if (P.RRULE && uid) {
        expandRule(base, P.RRULE.value, P.EXDATE ? P.EXDATE.value : '').forEach(function (occ) {
          var ov = overrides[uid + '|' + occ.key];
          if (ov) {
            var OP = ov.props;
            if (OP.STATUS && String(OP.STATUS.value).toUpperCase() === 'CANCELLED') return;
            var ow = parseDate(OP.DUE || OP.DTSTART || OP.DTEND); if (!ow) return;
            var merged = { props: Object.assign({}, P, OP) };
            push(merged, uid + '#' + occ.key, ow);
          } else push(c, uid + '#' + occ.key, occ.when);
        });
        return;
      }
      push(c, uid, when);
    });
    // Some feeds put a "(Course Name)" suffix or CATEGORIES on items, but schools also use both
    // for audience tags on school events ("Grades 7-12", "FT Students Only", "this week only").
    // A tag becomes a class only if it is not an audience tag, repeats (suffixes), and is
    // carried by at least one item that looks like assigned work.
    var counts = {}, workTags = {};
    items.forEach(function (it) {
      var t = trailingCourse(it.title); it._suffix = t;
      if (t) counts[t] = (counts[t] || 0) + 1;
      var w = isWork(it);
      if (t && w) workTags[t] = 1;
      if (it.course && w) workTags[it.course] = 1;
    });
    items.forEach(function (it) {
      var t = it._suffix; delete it._suffix;
      if (it.course && (isAudienceTag(it.course) || !workTags[it.course])) { it.tag = it.course; it.course = null; }
      if (it.course) return;
      if (t && counts[t] >= 2 && workTags[t] && !isAudienceTag(t)) { it.course = t; it.title = it.title.replace(TRAIL_RE, '').trim(); }
    });
    return items;
  }

  // ---------- course helpers (pure, shared by the board and the tests) ----------
  // Audience / school-event tags that are never classes.
  var AUDIENCE_RE = /\b(only|students?|parents?|famil(y|ies)|grades?\s*[k\d]|k\s*-\s*\d+|\d+(st|nd|rd|th)?\s*-\s*\d+(st|nd|rd|th)?\s+grade|including|everyone|all[- ]school|school[- ]wide|staff|faculty|teachers|seniors|juniors|sophomores|freshmen|upper school|lower school|middle school|high school|elementary|campus|optional|required|mandatory|week|day|days|night|morning|afternoon|evening|ft|pt|full[- ]time|part[- ]time|in[- ]person)\b/i;
  function isAudienceTag(s) {
    s = String(s || '').trim();
    if (!s) return true;
    if (/^[a-z]/.test(s) && !/^(ap|ib|hon)\b/i.test(s)) return true; // "first week only", "including Omnibus"
    return AUDIENCE_RE.test(s);
  }
  // Words that name a kind of work rather than a class.
  var TYPE_WORDS = 'hw homework quiz quizzes test tests exam exams module modules chapter chapters ch unit units lesson lessons activities activity exercise exercises lab labs labster upload uploads reading readings read worksheet worksheets project projects essay essays assignment assignments day days week weeks review notes discussion discussions practice problem problems set sets packet presentation presentations paper papers journal vocab vocabulary final finals midterm midterms due submit submission video videos workbook study guide check checkpoint assessment speech draft outline report recitation memory memorization write writeup write-up reflection response analysis portfolio poster slides seminar ' +
    'online live class session section period meeting conference intro introduction';
  var TYPE = {}; TYPE_WORDS.split(/\s+/).forEach(function (w) { if (w) TYPE[w] = 1; });
  function isWork(it) {
    if (it.kind && it.kind !== 'event' && it.kind !== 'page' && it.kind !== 'course') return true;
    if (it.url) return false; // linked Schoology events are events, whatever their title says
    return String(it.title || '').toLowerCase().split(/[^a-z-]+/).some(function (w) { return TYPE[w]; });
  }
  var ABBR = { alg: 'algebra', calc: 'calculus', precalc: 'precalculus', chem: 'chemistry', bio: 'biology', geom: 'geometry', eng: 'english', engl: 'english', hist: 'history', lit: 'literature',
    govt: 'government', gov: 'government', econ: 'economics', psych: 'psychology', phys: 'physics', span: 'spanish', esp: 'spanish', lang: 'language', sci: 'science', comp: 'computer',
    stats: 'statistics', stat: 'statistics', trig: 'trigonometry', anat: 'anatomy', lat: 'latin', theo: 'theology', rhet: 'rhetoric', omni: 'omnibus', bib: 'bible', math: 'math', maths: 'math', mathematics: 'math' };
  var ROMAN = { i: '1', ii: '2', iii: '3', iv: '4' };
  var FILLER = { and: 1, of: 1, the: 1, a: 1, an: 1, for: 1, to: 1, in: 1, course: 1, class: 1, quarter: 1, semester: 1, sem: 1, q1: 1, q2: 1, q3: 1, q4: 1, s1: 1, s2: 1, ed: 1, edition: 1 };
  // "ALG2" -> ["algebra","2"], "Spanish I" -> ["spanish","1"], "Apologia Chem" -> ["apologia","chemistry"]
  function courseTokens(name) {
    var out = [];
    String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2')
      .split(/[^a-z0-9]+/).forEach(function (w, i) {
        if (!w || FILLER[w]) return;
        if (/^(st|nd|rd|th)$/.test(w)) return;
        if (/^\d+$/.test(w)) { out.push(String(+w)); return; }
        if (ROMAN[w] && i > 0) { out.push(ROMAN[w]); return; }
        out.push(ABBR[w] || w);
      });
    return out;
  }
  function courseKey(name) { return courseTokens(name).join(' '); }
  // Leading class-like words of a title: "Omnibus Primary HW Upload Day 11" -> "Omnibus Primary".
  function titlePrefix(title) {
    var seg = String(title || '').split(/\s[-\u2013\u2014]\s|:|\(|\[|\|/)[0].trim();
    var words = seg.split(/\s+/).filter(Boolean), keep = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i].toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (TYPE[w]) break;
      if (/^\d+$/.test(w) && i > 0 && keep.length && (i + 1 >= words.length || !TYPE[(words[i + 1] || '').toLowerCase()]) && !/^\d$/.test(w)) break; // "Day 11" style numbers end it
      keep.push(words[i]);
      if (keep.length > 4) return null;
    }
    var stopped = keep.length < words.length || seg.length < String(title || '').trim().length;
    if (!keep.length || !stopped) return null;
    var raw = keep.join(' ').replace(/[,.;]+$/, ''), key = courseKey(raw);
    if (!key || !/[a-z]{2,}/.test(key)) return null;
    return { raw: raw, key: key };
  }
  var GENERIC = {}; ('quiz test exam homework upload reading read module chapter lesson review submit complete before class with from into about this that your their what week day days unit notes practice ' +
    'activities activity exercise worksheet assignment final midterm study guide check part pages page section answer answers questions question chapter online first second third three two four five').split(' ').forEach(function (w) { GENERIC[w] = 1; });
  function keywords(title) {
    return String(title || '').toLowerCase().split(/[^a-z]+/).filter(function (w) { return w.length >= 4 && !GENERIC[w] && !FILLER[w]; });
  }
  function sameCourse(aTok, bTok) {
    var A = aTok.filter(function (w) { return !/^\d+$/.test(w); }), B = bTok.filter(function (w) { return !/^\d+$/.test(w); });
    var nA = aTok.filter(function (w) { return /^\d+$/.test(w); }), nB = bTok.filter(function (w) { return /^\d+$/.test(w); });
    if (!A.length || !B.length) return 0;
    if (nA.length && nB.length && !nA.some(function (n) { return nB.indexOf(n) >= 0; })) return 0;
    var inB = A.every(function (w) { return B.indexOf(w) >= 0; }), inA = B.every(function (w) { return A.indexOf(w) >= 0; });
    if (inA && inB) return 3;
    if (inA || inB) return (nA.length && nB.length) ? 2 : 1;
    return 0;
  }
  /**
   * Build a title -> class guesser.
   *   known:    class names the user already has (CAS sheets, own categories, earlier choices)
   *   examples: [{title, course}] labelled items (CAS tasks, user-sorted items) to learn words from
   *   titles:   all calendar items [{title, kind}] (repeated title prefixes become classes)
   * Order: title prefix matches a known class > distinctive words learned from examples >
   *        a prefix shared by 2+ assignments > null (Unsorted).
   */
  // From Friday 6 PM (local) through Sunday, "this week" means the coming Monday-Sunday.
  function weekendMode(now) { var d = now.getDay(); return d === 6 || d === 0 || (d === 5 && now.getHours() >= 18); }
  function defaultWeekStart(now) {
    var m = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7) + (weekendMode(now) ? 7 : 0));
    return m;
  }
  function buildClassifier(known, examples, titles) {
    known = (known || []).filter(Boolean);
    var kTok = known.map(courseTokens);
    var kw = {};
    (examples || []).forEach(function (e) {
      if (!e.course) return;
      keywords(e.title).forEach(function (w) { (kw[w] = kw[w] || {})[e.course] = 1; });
    });
    var clusters = {};
    (titles || []).forEach(function (t) {
      if (!isWork(t)) return;
      var p = titlePrefix(t.title); if (!p) return;
      var c = clusters[p.key] = clusters[p.key] || { n: 0, names: {} };
      c.n++; c.names[p.raw] = (c.names[p.raw] || 0) + 1;
    });
    function matchKnown(tok) {
      var best = null, bs = 0, tie = false;
      kTok.forEach(function (kt, i) { var sc = sameCourse(tok, kt); if (sc > bs) { bs = sc; best = known[i]; tie = false; } else if (sc && sc === bs && known[i] !== best) tie = true; });
      return tie ? null : best;
    }
    return function classify(title, kind) {
      var p = titlePrefix(title);
      if (p) { var m = matchKnown(courseTokens(p.raw)); if (m) return { course: m, why: 'prefix' }; }
      var votes = {};
      keywords(title).forEach(function (w) { if (kw[w]) { var cs = Object.keys(kw[w]); if (cs.length === 1) votes[cs[0]] = (votes[cs[0]] || 0) + 1; } });
      var vk = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; });
      if (vk.length && (vk.length === 1 || votes[vk[0]] > votes[vk[1]])) return { course: vk[0], why: 'words' };
      if (p && clusters[p.key] && clusters[p.key].n >= 2 && isWork({ title: title, kind: kind })) {
        var names = clusters[p.key].names, name = Object.keys(names).sort(function (a, b) { return names[b] - names[a] || a.localeCompare(b); })[0];
        return { course: name, why: 'cluster' };
      }
      return null;
    };
  }

  // ---------- recurring events (RRULE) ----------
  function dateKeyOf(v) { var m = String(v || '').match(/(\d{4})-?(\d{2})-?(\d{2})/); return m ? m[1] + m[2] + m[3] : ''; }
  var WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  /**
   * Expand an RRULE into occurrences, in the wall-clock of the original date (so DST and
   * all-day dates never shift). Supports FREQ DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL,
   * COUNT, UNTIL, BYDAY (incl. "2MO"/"-1FR" for monthly), BYMONTHDAY and EXDATE.
   * Capped at 2 years / 800 occurrences so a runaway rule can't flood the board.
   */
  function expandRule(prop, rule, exdates) {
    var v = String(prop.value).trim(), m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})(T(\d{2}):?(\d{2}):?(\d{2})?(Z)?)?/i);
    if (!m) return [];
    var r = {}; String(rule).split(';').forEach(function (kv) { var p = kv.split('='); if (p[1]) r[p[0].toUpperCase()] = p[1].toUpperCase(); });
    var freq = r.FREQ, interval = Math.max(1, +r.INTERVAL || 1), count = +r.COUNT || 0;
    if (!/^(DAILY|WEEKLY|MONTHLY|YEARLY)$/.test(freq || '')) return [{ key: m[1] + m[2] + m[3], when: parseDate(prop) }];
    var y0 = +m[1], mo0 = +m[2] - 1, d0 = +m[3], tail = m[4] || '';
    var start = Date.UTC(y0, mo0, d0), limit = Date.UTC(y0 + 2, mo0, d0);
    var until = null;
    if (r.UNTIL) { var u = r.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/); if (u) until = Date.UTC(+u[1], +u[2] - 1, +u[3]); }
    var ex = {}; String(exdates || '').split(',').forEach(function (x) { var k = dateKeyOf(x); if (k) ex[k] = 1; });
    var byday = r.BYDAY ? r.BYDAY.split(',').map(function (x) { var mm = x.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/); return mm ? { n: mm[1] ? +mm[1] : 0, wd: WD[mm[2]] } : null; }).filter(Boolean) : null;
    var bymd = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null;
    var days = [], DAY = 864e5;
    function key(t) { var dt = new Date(t); return dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate()); }
    function ok(t) { return t >= start && t <= limit && (until === null || t <= until); }
    function nthWeekday(y, mo, wd, n) {
      if (n > 0) { var f = new Date(Date.UTC(y, mo, 1)).getUTCDay(); var dd = 1 + ((wd - f + 7) % 7) + (n - 1) * 7; return dd <= new Date(Date.UTC(y, mo + 1, 0)).getUTCDate() ? Date.UTC(y, mo, dd) : null; }
      var last = new Date(Date.UTC(y, mo + 1, 0)), ld = last.getUTCDate(), lw = last.getUTCDay();
      var d2 = ld - ((lw - wd + 7) % 7) + (n + 1) * 7; return d2 >= 1 ? Date.UTC(y, mo, d2) : null;
    }
    var guard = 0;
    if (freq === 'DAILY') {
      for (var t = start; t <= limit && guard++ < 2000; t += interval * DAY) {
        if (byday && !byday.some(function (b) { return b.wd === new Date(t).getUTCDay(); })) continue;
        days.push(t);
      }
    } else if (freq === 'WEEKLY') {
      var wkStart = start - new Date(start).getUTCDay() * DAY; // week containing DTSTART (Sunday-based is fine for stepping)
      var wds = byday ? byday.map(function (b) { return b.wd; }) : [new Date(start).getUTCDay()];
      for (var w = wkStart; w <= limit && guard++ < 400; w += interval * 7 * DAY) {
        wds.slice().sort().forEach(function (wd) { days.push(w + wd * DAY); });
      }
    } else if (freq === 'MONTHLY') {
      for (var k = 0; guard++ < 60; k += interval) {
        var yy = y0 + Math.floor((mo0 + k) / 12), mm = (mo0 + k) % 12;
        if (Date.UTC(yy, mm, 1) > limit) break;
        if (byday) byday.forEach(function (b) { if (b.n) { var x = nthWeekday(yy, mm, b.wd, b.n); if (x !== null) days.push(x); } else { for (var dd = 1; dd <= 31; dd++) { var tt = Date.UTC(yy, mm, dd); if (new Date(tt).getUTCMonth() === mm && new Date(tt).getUTCDay() === b.wd) days.push(tt); } } });
        else (bymd || [d0]).forEach(function (dd) { var tt = Date.UTC(yy, mm, dd); if (new Date(tt).getUTCMonth() === mm) days.push(tt); });
      }
    } else {
      for (var yk = 0; guard++ < 10; yk += interval) { var ty = Date.UTC(y0 + yk, mo0, d0); if (new Date(ty).getUTCMonth() === mo0) days.push(ty); }
    }
    days.sort(function (a, b) { return a - b; });
    var out = [], n = 0, last = null;
    for (var i = 0; i < days.length; i++) {
      var t2 = days[i]; if (t2 === last || !ok(t2)) continue; last = t2;
      n++; if (count && n > count) break;
      var kk = key(t2); if (ex[kk]) continue;
      var occ = parseDate({ params: prop.params, value: kk + tail });
      if (occ) out.push({ key: kk, when: occ });
      if (out.length >= 800) break;
    }
    return out;
  }

  var api = {
    unfold: unfold, decodeBytes: decodeBytes, unescapeText: unescapeText, parseLine: parseLine, parseComponents: parseComponents,
    parseDate: parseDate, splitDescription: splitDescription, kindFromUrl: kindFromUrl,
    parseIcs: parseIcs, zonedToUtc: zonedToUtc, hash: hash,
    expandRule: expandRule, isAudienceTag: isAudienceTag, isWork: isWork, courseTokens: courseTokens, courseKey: courseKey, titlePrefix: titlePrefix, buildClassifier: buildClassifier,
    weekendMode: weekendMode, defaultWeekStart: defaultWeekStart
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SBics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
