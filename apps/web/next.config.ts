import type { NextConfig } from "next";
import { cardImagePatterns } from "./src/lib/card-images";
const config: NextConfig = {
  transpilePackages: [
    "@collectible/domain",
    "@collectible/integrations",
    "@collectible/db",
  ],
  poweredByHeader: false,
  images: {
    remotePatterns: cardImagePatterns,
    localPatterns: [{ pathname: "/demo/**", search: "" }],
    formats: ["image/webp"],
    qualities: [75],
    minimumCacheTTL: 86400,
    maximumDiskCacheSize: 500_000_000,
    // Arweave and Collector Crypt redirect to their image delivery URLs.
    maximumRedirects: 3,
  },
  async redirects() {
    return ["web-production-ae51051f.up.railway.app", "www.slabline.xyz"].map(
      (host) => ({
        source: "/:path*",
        has: [{ type: "host" as const, value: host.replaceAll(".", "\\.") }],
        destination: "https://slabline.xyz/:path*",
        permanent: true,
      }),
    );
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
