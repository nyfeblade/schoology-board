# Theming Schoology Board

The look lives in one file of CSS custom properties. Layout and structure (`public/board/board.css`)
only reference variables, so a reskin is a file swap, not a rewrite.

```
public/board/theme/default.css   every color, font, radius, shadow, border width, texture, motion value and slot
public/board/board.css           layout only: var(--…) everywhere, no literal colors, fonts, durations or shadows
public/index.html                <html data-theme="default"> + <link> to the theme, then board.css
```

`npm run lint:theme` (also part of `npm test`) fails if a hex, `rgb()`, `hsl()` or named color shows up
outside `public/board/theme/`, if a variable used by the layout isn't defined in `default.css`, or if
board.css hardcodes a font, a duration or a shadow.

## Add a theme

1. Create `public/board/theme/<name>.css`. Only override what changes, scoped to your theme name:

   ```css
   :root[data-theme="notebook"]{
     color-scheme:light;
     --bg:#FBFAF6; --surface-1:#FFFFFF; --surface-2:#FFFFFF; --text-1:#22232A; --accent:#D6455D;
     --font-display:Caveat,cursive;
     --bg-image:linear-gradient(rgba(70,80,120,.075) 1px,transparent 1px);
     --bg-image-size:100% 28px;
     --radius-card:4px; --card-shadow:0 1px 0 rgba(30,30,40,.08);
     --slot-done:" ✓";
     --anim-card-done:ink .4s ease-out;
   }
   @keyframes ink{from{transform:scale(.98)}}            /* keyframes and extra flourishes go here too */
   @font-face{font-family:Caveat;src:url(notebook/Caveat.woff2) format("woff2")}
   ```

   `:root[data-theme=…]` is more specific than the default `:root`, so load order doesn't matter.
2. Load it after `default.css` in `public/index.html` and set `<html data-theme="<name>">`.
3. Run `npm test` (lint) and `node scripts/visual-snap.mjs` to look at every screen.

The **backup file** inlines `default.css` plus the active theme (`data-theme` on `<html>`), and turns
`url(…)` assets such as fonts and textures into `data:` URIs so they work offline. Keep theme assets
small.

## What a theme controls

| Group | Variables |
|---|---|
| Palette | `--bg`, `--surface-1..3`, `--border-1..3`, `--text-1..3`, `--accent`, `--accent-hover`, `--accent-pressed`, `--accent-soft(er)`, `--on-accent`, `--note-color`, `--meta-theme-color` |
| Components | `--header-bg`, `--colnav-bg`, `--btn-active-bg`, `--seg-active-bg`, `--col-bg`, `--col-border`, `--col-over-bg`, `--card-bg`, `--card-hover-bg`, `--card-border`, `--card-edge` (due-soon edge uses `--accent`), `--tag-bg`, `--tag-color`, `--scrim`, `--backdrop`, `--qr-dark`/`--qr-light` (keep them high-contrast) |
| Class colors | `--class-0` (Unsorted) … `--class-8`. Each class pill gets `--ci` = its stable class color; set `--tag-bg:var(--ci)` to color pills by class |
| Type | `--font-body`, `--font-display` (title, hero, column and dialog headings), `--font-card-title`, `--font-hand`, `--font-mono`, `--font-size`, `--line-height` |
| Shape | `--bw`, `--bw-drop`, `--card-edge-w`, radius scale `--r-2xs … --r-2xl`, `--r-pill`, and per component `--radius-btn/-input/-card/-col/-chip/-tag/-menu/-dialog/-toast`, `--h` (control height) |
| Depth | `--ring`, `--ring-inset`, `--card-shadow`, `--col-shadow`, `--shadow-drag/-menu/-toast/-dialog/-hero`, `--hero-tilt` |
| Texture | `--bg-image`, `--bg-image-size`, `--bg-image-attachment`, `--col-bg-image` (gradients or `url()`) |
| Motion | `--dur-fast`, `--dur-slow`, `--anim-menu/-sheet/-scrim/-toast/-spin`, `--anim-card-landed` (a card just moved), `--anim-card-done` (a card just marked done). `prefers-reduced-motion` still switches all of it off |
| Now / Week ahead | `--tabbar-bg`, `--tab-active`, `--tab-idle`, `--tab-indicator`, `--hero-card-bg/-border/-shadow`, `--radius-hero`, `--block-bg/-border/-running-border/-break-color/-rail`, `--flag-test-bg/-color`, `--flag-early-bg/-color`, `--flag-late-color`, `--flag-run-color`, `--bar-track/-fill/-heavy`, `--spill-border/-bg` |
| Slots | `content` values (`none`, `"🎉"`, `url(…)`): `--slot-logo` (before the title), `--slot-empty` (empty states), `--slot-col-empty` (empty column), `--slot-done` (after "Completed"), `--slot-now` (before "Do this now"), `--slot-all-set` (before "You're all set") |

For anything the variables can't express (a sticker tilt on cards, a margin line), add rules to the
theme file under `:root[data-theme="<name>"] …`; keep them visual-only so layout stays shared.

The app icons and the install manifest take their colors from the theme too: `node scripts/make-icons.mjs` re-renders the icons, and `scripts/build-pwa.mjs` (run by `npm run build`) writes the manifest.
