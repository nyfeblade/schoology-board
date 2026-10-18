/** @type {import('next').NextConfig} */
// The UI is a static page (public/index.html + public/board/*), so the exact same
// board code can be baked into the offline download. Next.js serves it and runs
// the one serverless route, /api/feed.
const nextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return { beforeFiles: [{ source: '/', destination: '/index.html' }] };
  },
  async headers() {
    return [{
      // The service worker must be re-checked on every visit so updates arrive.
      source: '/sw.js',
      headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
    }, {
      source: '/manifest.webmanifest',
      headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
    }, {
      source: '/(.*)',
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};
export default nextConfig;
