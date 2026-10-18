# Theming Schoology Board

Six themes ship today: **Sticker Book** (the default), **Arcade Night**, **Highlighter Notebook** (light and
dark), **Varsity**, **Riso Zine** and **Lo-fi Café**. Each one is a single CSS file of custom properties plus
a few visual-only flourishes. Layout and structure never change between themes.

```
public/board/theme/default.css   shared tokens: layer 1 defaults (Sticker Book values) + layer 2 mapping
public/board/theme/<name>.css    one theme: @font-face + layer-1 tokens on :root[data-theme="<name>"] + flourishes
public/board/theme/fonts/        the themes' fonts (woff2, SIL Open Font License, see OFL.txt)
public/board/board.css           Board, dialogs, menus: var(--…) only
public/board/tonight.css         Tonight, Sunday plan, Calendar: var(--…) only
```

## Two layers of variables

1. **Theme tokens** (short names): `--bgc` page background, `--bgi`/`--bgs` its texture, `--ink`/`--ink2`/`--mut`
   text, `--card`, `--soft`, `--well`, `--bc`/`--bw` borders, `--r`/`--rs`/`--rb` radii, `--sh`/`--shs`/`--lift`/`--pop`
   shadows, `--fh`/`--fb` fonts with `--fwh`/`--lsh`/`--tth` heading weight, spacing and case, `--acc`/`--accInk`/`--acc2`
   accents, `--late*` overdue, `--warn*` stale, `--flag*` "Double-check this", `--nav*`, `--ch*` (chips), `--ck*` (check boxes),
   `--swatch-0..8` with `--swatch-N-ink` (class colors; 0 is Unsorted, 8 is optional), `--art-*` and `--confetti-*`
   (finish moments), `--focus`, `--meta-theme-color`.
2. **Component tokens** (`--surface-1`, `--text-2`, `--radius-card`, `--shadow-menu`, `--card-edge`, …) used by `board.css`.
   `default.css` derives them from layer 1, so a new theme normally sets layer 1 only.

The root selector is `:root[data-theme="<name>"],.thp[data-theme="<name>"]`. The second half lets the theme
picker draw live previews of every theme inside one page. A dark variant uses `[data-mode="dark"]` on `<html>`
(Highlighter Notebook does).

## Rules the tests enforce

- `test/theme-lint.test.mjs`: no hex, `rgb()`, `hsl()` or named color outside `public/board/theme/`; every variable
  the layout uses is defined; no hardcoded fonts, durations or shadows in `board.css` / `tonight.css`.
- `test/colors.test.mjs`: no orange (hue 15–45°) and no cyan, teal or blue-green (160–200°) anywhere a color has real
  chroma; pink only as the optional `--swatch-8`. Default class colors use swatches 1–7 (pink is never a default).
- `test/motion.test.mjs`: UI motion ≤ 0.4 s, celebrations ≤ 1.2 s, and everything off under `prefers-reduced-motion`.
- No hearts or sparkles in any theme's art.

## Add a theme

1. Copy `theme/sticker.css` to `theme/<name>.css`, rename the selector, change tokens and fonts (put woff2 files in
   `theme/fonts/`, OFL or similar).
2. Add `['<name>', 'Display name', 'One-line description']` to `THEMES` in `board.js`, link the file in
   `public/index.html`, and add it to `THEMES` in `scripts/build-pwa.mjs` so it works offline.
3. Add a finish moment for it in `ART` / `CEL` in `board.js` (optional; Sticker Book's is the fallback).
4. Run `npm test` and `node scripts/visual-snap.mjs`.

## Where the theme goes

- The choice is saved in `localStorage` (`sb-theme`), applied by a tiny script in `<head>` before first paint, and
  stored in the board state so **Move to phone** carries it.
- **Save a backup file** inlines `default.css`, `tonight.css` and only the active theme, with its fonts turned into
  `data:` URIs, so the file looks the same offline.
- Class colors are saved per theme (`colors[theme][class]`), so a pick in one theme doesn't clash in another.
- The install manifest and icons use Sticker Book's colors (`scripts/build-pwa.mjs`, `scripts/make-icons.mjs`).
