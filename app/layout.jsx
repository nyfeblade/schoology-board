// Only used by Next's built-in pages (e.g. 404). The board itself is public/index.html.
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ background: '#000', color: '#eee', fontFamily: 'system-ui, sans-serif' }}>{children}</body>
    </html>
  );
}
