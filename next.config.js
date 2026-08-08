/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Security headers applied at the app layer as a baseline.
  // Cloudflare/edge-level headers (Product B) layer on top of these, not instead of.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev; connect-src 'self' https://*.clerk.accounts.dev; img-src 'self' data: https:; style-src 'self' 'unsafe-inline';",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
