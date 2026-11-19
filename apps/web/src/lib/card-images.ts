// Shared by the image component and Next's optimizer allowlist. Only public
// provider artwork goes through this cache; API/account URLs stay untouched.
export const cardImagePatterns = [
  ...[
    "assets.gemini.com",
    "nft.collectorcrypt.com",
    "nft-dev.collectorcrypt.com",
    "arweave.net",
    "d1xpxki1g4htqu.cloudfront.net",
    "ipfs.io",
    "gateway.pinata.cloud",
    "images.phygitals.com",
    "cdn.phygitals.com",
    "api.phygitals.com",
    "grailxyz-public.s3.us-east-2.amazonaws.com",
    "wildcard-public.s3.us-east-2.amazonaws.com",
  ].map((hostname) => ({
    protocol: "https" as const,
    hostname,
    port: "",
    pathname: "/**",
    search: "",
  })),
];

export function canOptimizeCardImage(src: string) {
  try {
    if (src.startsWith("/demo/")) {
      const local = new URL(src, "https://slabline.xyz");
      return (
        local.pathname.startsWith("/demo/") && !local.search && !local.hash
      );
    }
    const url = new URL(src);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      cardImagePatterns.some((p) => p.hostname === url.hostname)
    );
  } catch {
    return false;
  }
}
