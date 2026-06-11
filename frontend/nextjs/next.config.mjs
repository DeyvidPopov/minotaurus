/** @type {import('next').NextConfig} */

// Baseline HTTP security headers applied to every route.
//
// The non-CSP headers are safe in every environment. The Content-Security-Policy
// is emitted in PRODUCTION ONLY: in `next dev` the frontend (:3000) calls the
// backend (:4000) cross-origin and an `upgrade-insecure-requests`/`connect-src`
// policy would break those calls and HMR. Production is same-origin (the API is
// reverse-proxied under /api), so the CSP locks things down without that risk.
const isProd = process.env.NODE_ENV === "production";

// Allow XHR/fetch to the configured API origin (same-origin in prod; this just
// future-proofs an api.* subdomain topology). 'self' is always included.
let apiOrigin = "";
try {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (base) apiOrigin = new URL(base).origin;
} catch {
  apiOrigin = "";
}

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
];

const nextConfig = {
  reactStrictMode: true,
  // Self-contained runtime bundle in `.next/standalone` (server.js + only the
  // node_modules actually traced as needed). We build locally and ship just the
  // compiled output to a small (1 GB) box, so the server runs the standalone
  // server instead of a full `next start` over the whole repo. NOTE: the static
  // assets are NOT copied into standalone automatically — after `next build`,
  // copy `.next/static` → `.next/standalone/.next/static` and `public` →
  // `.next/standalone/public` before deploying (see README → Production build).
  output: "standalone",
  experimental: {
    typedRoutes: false,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
