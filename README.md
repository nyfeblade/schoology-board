# Schoology Board

**Your Schoology assignments on one drag-and-drop board.** Paste your Schoology calendar link (or drop an `.ics` file and your Course Assignment Sheet PDFs) and get a kanban board: **Need to be done → Started → Needs to be proctored → Completed**. It works offline, and nothing is stored on a server.

**Live: https://schoology-board.vercel.app** · [Try the sample board](https://schoology-board.vercel.app) (no sign-in, made-up data)

![Demo: first run, sample board, drag, mark done, Course Assignment Sheet preview](docs/demo.gif)

## What it does

- **Setup in under a minute.** Paste your calendar link, or drop files. Not ready yet? Use **Try the sample board** (made-up classes).
- **Four columns.** Drag cards with a mouse, or long-press and drag on a phone. Double-click a card to mark it done. Every card's **⋯** menu has **Move to…**, Mark done, Edit, Open in Schoology and Delete. On a phone it opens as a bottom sheet.
- **Opens on this week.** Views: **Due today** (only things due on today's date), **Week** (Monday to Sunday, use ‹ › to step), **All**, or a date **Range**. **Filter** holds *Hide past*. Search with `/`.
- **Grouped the way you think.** To-do columns are grouped by class, then by day. Completed is one flat list. Every card links to its Schoology page. Anything due within 36 hours, or overdue, gets a red edge.
- **Classes, even though Schoology doesn't send them.** The feed has no course field, so the board works it out:
  1. your own choices;
  2. your Course Assignment Sheets (the class name on the sheet wins);
  3. the title's prefix ("ALG2 Homework 10", "Apologia Chem - Module 03 Quiz", "Spanish I Quiz 2" / "Spanish 1 Activities…" are the same class);
  4. words it learned from your sheets.

  School-event audience tags like "(Grades 7-12)" or "FT Students Only" are never treated as classes.
- **A clean start.** Imported work due **before you created the board** counts as already handled. It's hidden, not shown as overdue, and re-imports never bring it back. You can bring it back with **Filter → Show items from before this board was created**.
- **Course Assignment Sheets (CAS).** Drop CAS PDFs. They're read **in your browser** with pdf.js and become dated cards under that class: readings, homework and submissions. Learning objectives are skipped. A preview lets you check, edit or untick items first. Items already on your Schoology calendar are flagged *Already on calendar* and skipped.
- **Your own stuff.** Add tasks (title, category, due date/time, link, note) and your own categories. You can rename, reorder or delete them; everything survives re-imports.
- **Download for offline** (in the **⋯** menu). You get one self-contained `.html` file with your board baked in. It runs the exact same code as the website: it works with no internet, saves progress in that browser, and can re-import an `.ics` or CAS PDFs.
- **Keyboard-friendly.** `N` add · `I` import · `/` search · `T`/`W`/`A` views · `[` `]` weeks · `H` hide past · arrows move focus · `1`–`4` move a card · `M` card menu · `X` done · `E` edit · `?` all shortcuts.

| Board | First run |
|---|---|
| ![Board with the sample data](docs/board.png) | ![First-run screen](docs/first-run.png) |
| **Course Assignment Sheet preview** | **A full (made-up) school year, mid-February** |
| ![CAS import preview](docs/cas-preview.png) | ![This week from a 517-item feed](docs/year-this-week.png) |

| Phone | Card menu on a phone |
|---|---|
| <img src="docs/mobile.png" width="300" alt="Phone layout"> | <img src="docs/mobile-menu.png" width="300" alt="Move to… bottom sheet"> |

## Get your Schoology calendar link

These steps come from PowerSchool's Schoology help article ["Link Schoology Calendar to a Different Calendar"](https://customercentral.powerschool.com/s/article/q-a-link-schoology-calendar-to-different-calendar-274611?language=en_US) and the [student calendar-sharing guide](https://uc.powerschool-docs.com/en/schoology/latest/personal-account-students-share-your-calendar):

1. In Schoology, open the account menu in the upper-right corner and choose **Settings** (older layouts call it **Account Settings**).
2. In the **Share Your Schoology Calendar** area, click **Enable**.
3. Copy the URL in the **Use this iCal link** pane and paste it into Schoology Board. A `webcal://` link works too.

Notes from the same docs: the setting only works if your personal calendar has at least one entry. Some schools turn it off. Treat the link like a password: anyone who has it can read your calendar.

**No link?** Drop an `.ics` file instead. Any calendar app that subscribed to your Schoology calendar can usually export one.

## Privacy

- **Nothing is stored on a server.** Your board, progress, custom tasks and categories live in your browser's `localStorage` (or inside your offline file).
- **The calendar proxy only relays.** Browsers can't read Schoology's feed directly (it has no CORS headers), so a tiny serverless route ([`app/api/feed/route.js`](app/api/feed/route.js)) fetches it and streams the bytes back. The link is sent in a POST body, so it never appears in a URL or request log. The route doesn't log, cache or store the link or the calendar. It refuses private network addresses and anything that isn't a calendar.
- **CAS PDFs never leave your device.** They're parsed in the browser.
- The calendar link is kept only if you tick *Remember the link on this device*. It is **never** put into the offline file.
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

- `public/board/board.js`, `board.css`: the whole board UI, framework-free. The website (`public/index.html`) and the offline download run **the same files**. The offline file inlines them along with pdf.js.
- `public/board/ics.js`: the iCal parser (no dependencies; runs in the browser and Node).
- `public/board/cas.js`: the CAS parser. It works on pdf.js text positions: it finds the *Class Dates* and *Assignments* columns, assigns each task to its class day (including rows that run onto the next page), and pulls out explicit due dates like "Due Saturday 09/12/26 at 12:00 pm ET" or "by midnight the evening prior to class".
- `app/api/feed/route.js`: the calendar relay (Next.js route handler).
- Tests: `test/ics.test.mjs`, `test/cas.test.mjs`, `test/year.test.mjs` and `test/e2e.mjs`. Fixtures are all made up: `public/sample/schoology-sample.ics`, `test/fixtures/messy.ics`, `test/fixtures/sample-cas.pdf`, and `test/fixtures/year.ics` (Aug–Jun, generated by `make-year-feed.mjs` together with an independently computed `year-expected.json`). The end-to-end run checks the exact Due today / This week / per-column / per-class counts for that year. To check the CAS parser against your own sheets without committing them: `CAS_SAMPLES_DIR=~/Downloads npm test`.

## License

MIT. Not affiliated with Schoology or PowerSchool.
