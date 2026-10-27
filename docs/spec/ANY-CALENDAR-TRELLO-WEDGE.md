# Spec: Any-calendar + Trello board moves (smallest E2E wedge)

**Repo:** nyfeblade/schoology-board  
**Live:** https://schoology-board.vercel.app  
**Date:** 2026-10-26  
**Status:** Decided for eng (Luke: Spec both, then build smallest E2E wedge)

## Customer win

Drop **any** calendar (`.ics` or a supported live calendar URL) or a plain **todo list**, and get the same Tonight plan + Board that already works for Schoology — then organize with a few Trello-grade board moves (custom columns, labels, card notes + checklist). Still local-first: nothing about the user stored on a server beyond the existing calendar relay.

## Wedge (smallest E2E)

One vertical slice that a stranger can complete without Schoology:

1. **Import any calendar file** — drop/open any valid `.ics` (Google, Apple, Outlook export, Schoology export). Parse with existing `ics.js`. No proxy needed for files.
2. **Import a live calendar URL (allowlisted hosts)** — paste a private/public HTTPS or webcal calendar URL from an allowlist that includes Schoology **and** common calendar hosts (Google Calendar, Outlook/Office 365, iCloud). Reuse `app/api/feed/guard.js` SSRF model (HTTPS-only after upgrade, no userinfo, port 443, connection-time private-IP block, redirect hop re-check, size cap, `BEGIN:VCALENDAR` check). Update user-facing copy so non-Schoology links are not rejected with “isn't from Schoology.”
3. **Import a todo list** — paste or drop a plain text / markdown checklist (one task per line; `- [ ]` / `- [x]` / `* ` / numbered lines stripped). Each line becomes a custom task (no due date unless a trailing date is parseable). Merge into Board under Need to be done; Tonight includes undated customs per existing custom-task rules.
4. **Trello board moves (Board only)**  
   - Add / rename / delete / reorder **columns** (lists). Keep defaults: Need to be done → Started → Completed; optional Proctored column remains creatable. Deleting a column moves its cards to Need to be done (or a single confirm target). Persist column defs in `localStorage` + backups + Move-to-phone payload.  
   - **Labels** on cards (small set of named color chips per theme palette; create/rename; filter by label).  
   - **Card detail**: notes (plain text) + checklist (add/toggle/delete items). Open from card `⋯` or click. Persist on the card record.

## Cut from v1 (explicit)

- Multi-board / workspaces  
- Members, assignees, comments, due-date picker redesign beyond what exists  
- Power-Ups, attachments, cover images, voting  
- Cloud sync / accounts  
- Arbitrary URL proxy (open relay) — only allowlisted calendar hosts  
- Google Tasks / Todoist / Notion OAuth importers (paste/file only)  
- Renaming the product away from “Schoology Board” (copy can say “any calendar” in import UI; product rename is a later decision)  
- Notifications (still blocked by no-server-storage rule)

## Success metric

A user with **no Schoology account** can: drop a Google Calendar `.ics` **or** paste an allowlisted Google/Outlook/iCloud calendar URL **or** paste a 5-line todo list → see cards on the Board → drag into a **custom** column → open a card, add a note + checklist item → mark done → Tonight updates. Freshness pill still honest. `npm test` green; e2e covers new import paths with fixtures (no real school data).

## Kill line

If allowlisting calendar hosts needs more than one focused PR of guard + copy + tests, or if custom columns break Tonight planning, ship **file `.ics` + paste todos + labels + notes/checklist** first and hold live non-Schoology URLs behind a follow-up PR.

## Technical notes (for implementer)

- Today `hostAllowed` is Schoology-only (`ALLOWED_HOST = 'schoology.com'`). Replace with an allowlist of host suffixes / exact hosts; keep SSRF invariants. Suggested starters (exact list may be refined with tests):  
  - `schoology.com` (+ subdomains)  
  - `calendar.google.com`, `www.google.com` (only paths that are calendar feeds — if path gating is hard, prefer documented Google private ICS host patterns you verify)  
  - `outlook.live.com`, `outlook.office365.com`, `outlook.office.com`  
  - `calendar.icloud.com`  
  Document rejected hosts in tests (evil.test, localhost, metadata IP).  
- File `.ics` import already exists for Schoology exports — ensure first-run / Import UI presents **Any calendar file**, **Calendar link**, **Todo list**, and existing CAS PDF without implying Schoology-only.  
- Column model today is fixed keys (`todo` / `started` / `done` / `proctor`). Move to ordered column records `{ id, name, kind?: 'done'|'active' }` so Completed still drives strike-through / Tonight hide rules. Migration: map old keys → new ids on load.  
- Labels + notes + checklist ride on existing card/task objects; survive refresh, backup HTML/JSON, Move-to-phone `#move=` payload. Never put calendar URL into backup files (existing rule).  
- Themes: no cyan; Signal-like red already in themes — don't invent Markit palette. Reuse theme swatches for labels.  
- Privacy README: update “only Schoology links” to “allowlisted calendar hosts”; still no logging/storage of links.  
- Tests: unit for host allowlist + todo parse + column migration; e2e or unit for import → column → card detail persistence.

## Out of scope decisions (do not invent)

- Product rename / domain  
- Paid features  
- Push notifications  

## Acceptance checklist

- [ ] Spec file landed in repo under `docs/spec/ANY-CALENDAR-TRELLO-WEDGE.md`  
- [ ] Generic `.ics` file import works without Schoology branding errors  
- [ ] Allowlisted live calendar URL works; non-allowlisted rejected with clear copy  
- [ ] Todo paste → cards  
- [ ] Custom columns add/rename/delete/reorder; delete migrates cards safely  
- [ ] Labels + card notes + checklist persist  
- [ ] Tonight still plans; freshness pill honest  
- [ ] `npm test` (and e2e if present) green  
- [ ] README privacy + import docs updated  

