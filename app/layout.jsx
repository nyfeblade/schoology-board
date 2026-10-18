// Only used by Next's built-in pages (e.g. 404). The board itself is public/index.html.
// Colors and fonts come from the theme file, like everywhere else.
export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="sticker">
      <head><link rel="stylesheet" href="/board/theme/default.css" /><link rel="stylesheet" href="/board/theme/sticker.css" /></head>
      <body style={{ margin: 0, background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'var(--font-body)' }}>{children}</body>
    </html>
  );
}
