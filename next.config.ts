import type { NextConfig } from 'next';
import path from 'path';

// The Content-Security-Policy is set per-request in src/proxy.ts (it carries a fresh nonce).
// These static headers apply to every response and don't vary per request.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: path.join(__dirname, '../..'),
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  images: {
    // Menu photos live in a public Supabase Storage bucket. Scoped to the public object path
    // so next/image can optimise them (AVIF/WebP + responsive srcset) without becoming an
    // open image proxy for arbitrary hosts.
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
      { protocol: 'https', hostname: '*.supabase.in', pathname: '/storage/v1/object/public/**' }
    ],
    formats: ['image/avif', 'image/webp'],
    // Guest menu tiles are small; these are the widths actually requested by the grid.
    imageSizes: [96, 128, 160, 200, 256, 320, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30
  },
  experimental: {
    optimizePackageImports: ['lucide-react']
  }
};

export default nextConfig;
