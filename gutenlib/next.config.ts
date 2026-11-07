import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/lexicon/chunks/**/*"],
    "/ar/lexicon": ["./data/lexicon/chunks/**/*"],
    "/lexicon": ["./data/lexicon/chunks/**/*"],
    "/voice": ["./data/lexicon/chunks/**/*"],
    "/room/**/*": ["./data/lexicon/chunks/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
