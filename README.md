# Schoology Board

**Your Schoology assignments on one drag-and-drop board.** Paste your Schoology calendar link (or drop an `.ics` file and your Course Assignment Sheet PDFs) and get a kanban board: **Need to be done → Started → Completed** (plus an optional **Needs to be proctored** column). It works offline, and nothing is stored on a server.

**Live: https://schoology-board.vercel.app** · [Try the sample board](https://schoology-board.vercel.app) (no sign-in, made-up data)

![Demo: first run, sample board, drag, mark done, Course Assignment Sheet preview](docs/demo.gif)

## What it does

- **Setup in under a minute.** Paste your calendar link, or drop files. Not ready yet? Use **Try the sample board** (made-up classes).
- **Three columns, four if you need them.** Turn on *Needs to be proctored* in **Filter**. Boards that already use it keep it. Turning it off moves those cards back to *Need to be done* without losing anything; turn it on again and they return. Drag cards with a mouse, or long-press and drag on a phone. Double-click a card to mark it done. Every card's **⋯** menu has **Move to…**, Mark done, Edit, Open in Schoology and Delete. On a phone it opens as a bottom sheet.
- **Opens on this week.** Views: **Due today** (only things due on today's date), **Week** (Monday to Sunday, use ‹ › to step) and **All**. From **Friday 6 PM through Sunday**, Week opens on the coming week, labelled *Next week · Oct 26–Nov 1*. **Filter** holds *Hide past* and the column settings. Search with `/`.
- **Always fresh.** If you saved your calendar link, the board re-fetches it every time you open it and merges the changes like a re-import (your progress stays). The header says *Updated 3m ago*. If Schoology doesn't answer you get a quiet *Couldn't refresh · Retry* and your saved board stays put.
- **Grouped the way you think.** To-do columns are grouped by class, then by day. Completed is one flat list. Every card links to its Schoology page. Anything due within 36 hours, or overdue, gets a red edge.
- **Classes, even though Schoology doesn't send them.** The feed has no course field, so the board works it out:
  1. your own choices;
  2. your Course Assignment Sheets (the class name on the sheet wins);
  3. the title's prefix ("ALG2 Homework 10", "Apologia Chem - Module 03 Quiz", "Spanish I Quiz 2" / "Spanish 1 Activities…" are the same class);
  4. words it learned from your sheets.

  After an import, a quick **Name your classes** step lists each detected prefix group ("ALG2 · 12 items") with an editable name, plus anything still Unsorted. Your names are remembered and used on every refresh, re-import and backup. Reopen it any time from **⋯ → Name your classes**.

  School-event audience tags like "(Grades 7-12)" or "FT Students Only" are never treated as classes.
- **A clean start.** Imported work due **before the day you created the board** counts as already handled. It's hidden, not shown as overdue, and re-imports never bring it back. Work due later on the creation day still shows. A quiet note under the class chips says how many are hidden (*12 earlier items hidden · Show*); **Show** (or **Filter → Show items from before this board was created**) brings them back.
- **Course Assignment Sheets (CAS).** Drop CAS PDFs. They're read **in your browser** with pdf.js and become dated cards under that class: readings, homework and submissions. Learning objectives are skipped. A preview lets you check, edit or untick items first. Items already on your Schoology calendar are flagged *Already on calendar* and skipped.
- **Your own stuff.** Add tasks (title, category, due date/time, link, note) and your own categories. You can rename, reorder or delete them; everything survives re-imports.
- **Save a backup** (in the **⋯** menu). You get one self-contained `.html` file with your board baked in, including your class names and column settings. It runs the exact same code as the website: it works with no internet, saves progress in that browser, and can re-import an `.ics` or CAS PDFs. It says *Offline copy* and never refreshes on its own, because it doesn't contain your calendar link.
- **Move to phone** (in the **⋯** menu). Shows a QR code and a link that carry your board to another device: progress, your own tasks and categories, class names, column settings, the creation date and your calendar link. There's no server in between: everything is compressed into the part of the link after `#`, which browsers never send to a server. With a calendar link it sends only short fingerprints of the assignments, and the phone fetches the assignments itself. Without one it sends the minimum event data. If the link gets too long for a QR code that phones read reliably, you get the link only, with Copy and Share buttons. The phone asks first (*Replace this board?*, or *Merge*), then removes the fragment from its address bar. **The link contains your calendar link, so treat it like a password.**
- **Import a backup** (in the **⋯** menu, on the website and inside a backup file). Pick a *Save a backup* `.html` file or a `.json` export, check what's in it, then **Replace** or **Merge**.
- **Keyboard-friendly.** `N` add · `I` import · `/` search · `T`/`W`/`A` views · `[` `]` weeks · `H` hide past · arrows move focus · `1`–`4` move a card to a column · `M` card menu · `X` done · `E` edit · `?` all shortcuts.

| Board | First run |
|---|---|
| ![Board with the sample data](docs/board.png) | ![First-run screen](docs/first-run.png) |
| **Course Assignment Sheet preview** | **A full (made-up) school year, mid-February** |
| ![CAS import preview](docs/cas-preview.png) | ![This week from a 517-item feed](docs/year-this-week.png) |
| **Name your classes (after an import)** | **Friday evening: Week shows next week** |
| ![Name your classes step](docs/class-naming.png) | ![Next week view on a Friday evening](docs/weekend-week.png) |
| **Move to phone** | **The phone after scanning** |
| ![Move to phone dialog with QR code](docs/move-to-phone.png) | <img src="docs/phone-after-move.png" width="300" alt="Phone after the move"> |

| Phone | Card menu on a phone |
|---|---|
| <img src="docs/mobile.png" width="300" alt="Phone layout"> | <img src="docs/mobile-menu.png" width="300" alt="Move to… bottom sheet"> |

## Get your Schoology calendar link

Verified on a real student account:

1. In Schoology, open **Calendar**.
2. At the bottom of the month grid, click **Export**.
3. Choose **Share Calendar**.
4. Copy the **iCal link** and paste it into Schoology Board. A `webcal://` link works too.

Some schools turn calendar sharing off; if you don't see **Export** or **Share Calendar**, that's probably why. Treat the link like a password: anyone who has it can read your calendar.

**No link?** Drop an `.ics` file instead. Any calendar app that subscribed to your Schoology calendar can usually export one.

## Privacy

- **Nothing is stored on a server.** Your board, progress, custom tasks and categories live in your browser's `localStorage` (or inside your backup file). The saved calendar link stays in this browser's `localStorage` and is only ever sent, in a POST body, to the relay.
- **The calendar proxy only relays.** Browsers can't read Schoology's feed directly (it has no CORS headers), so a tiny serverless route ([`app/api/feed/route.js`](app/api/feed/route.js)) fetches it and streams the bytes back. The link is sent in a POST body, so it never appears in a URL or request log. The route doesn't log, cache or store the link or the calendar. It refuses private network addresses and anything that isn't a calendar.
- **CAS PDFs never leave your device.** They're parsed in the browser.
- The calendar link is kept only if you tick *Remember the link on this device*. It is **never** put into a backup file.
- **Move to phone links never touch a server.** The board rides in the URL fragment (`#move=…`), which browsers don't include in requests. The receiving page strips it from the address bar straight away. The QR code is drawn in your browser ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), MIT); no QR service is called.
- No analytics, no accounts, no cookies.

## What's in a Schoology calendar feed (and how it's parsed)

Schoology's feed is a standard iCalendar file. As far as we could verify:

- **`SUMMARY`** is the assignment or event title, by itself. Schoology doesn't put the course name in it.
- **`DTSTART`** is the due time, usually in UTC (`DTSTART;VALUE=DATE-TIME:20261020T035900Z` means 11:59 PM Eastern on Oct 19). All-day events use `VALUE=DATE`.
- **`URL;VALUE=URI:`** is the item's Schoology page (`…/assignment/<id>/…`, `…/event/<id>/…` and so on). `DESCRIPTION` ends with `" - Link: <same url>"`, which is used when `URL` is missing.
- **`UID`** is stable for each item, so progress is keyed on it.
- **There is no course field.** Classes are worked out as described above. Your edits always win and survive re-imports.

Real feeds also contain school events. Some carry audience tags in `CATEGORIES` or as a `(…)` title suffix ("Grades 7-12", "FT Students Only", "this week only"). Some are recurring (`RRULE`), and some span several days. Recurring events are expanded once each (with `EXDATE` and moved occurrences honoured). Multi-day events show once, on their start date. All-day dates never shift a day.

How we checked: Schoology's REST API docs (events vs. assignment due events, title/description fields), PowerSchool's calendar-sharing docs (the `/calendar/feed/ical/…` link), and open-source Schoology feed parsers on GitHub whose test fixtures and notes describe the same shape. The parser also copes with folded lines (including folds inside multi-byte characters), escaped `\,` `\;` `\n`, `TZID` and Windows zone names, floating times, `VALUE=DATE`, `DUE`, missing `UID`/`URL`, `STATUS:CANCELLED` and nested `VALARM`s.

## Run it yourself

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests: iCal, CAS, and a 517-item synthetic school year
npm run build && npm start
BASE_URL=http://localhost:3000 npm run test:e2e   # headless Chromium end-to-end (frozen clock)
BASE_URL=http://localhost:3000 node scripts/record-demo.mjs   # re-record docs/demo.gif (needs ffmpeg)
```

Deploy to Vercel as a standard Next.js project; no environment variables are needed.

### How it's built

- `public/board/theme/default.css`: every color, font, radius, shadow, texture and motion value as CSS variables. `board.css` only references them. See [THEMING.md](THEMING.md) for adding a theme.
- `public/board/board.js`, `board.css`: the whole board UI, framework-free. The website (`public/index.html`) and the backup file run **the same files**. The backup inlines them along with pdf.js.
- `public/board/ics.js`: the iCal parser (no dependencies; runs in the browser and Node).
- `public/board/cas.js`: the CAS parser. It works on pdf.js text positions: it finds the *Class Dates* and *Assignments* columns, assigns each task to its class day (including rows that run onto the next page), and pulls out explicit due dates like "Due Saturday 09/12/26 at 12:00 pm ET" or "by midnight the evening prior to class".
- `app/api/feed/route.js`: the calendar relay (Next.js route handler).
- Tests: `test/ics.test.mjs`, `test/cas.test.mjs`, `test/year.test.mjs` and `test/e2e.mjs`. Fixtures are all made up: `public/sample/schoology-sample.ics`, `test/fixtures/messy.ics`, `test/fixtures/sample-cas.pdf`, and `test/fixtures/year.ics` (Aug–Jun, generated by `make-year-feed.mjs` together with an independently computed `year-expected.json`). The end-to-end run checks the exact Due today / This week / per-column / per-class counts for that year. To check the CAS parser against your own sheets without committing them: `CAS_SAMPLES_DIR=~/Downloads npm test`.

## License

MIT. Not affiliated with Schoology or PowerSchool.
