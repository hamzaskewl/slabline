import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Collectible Markets",
    short_name: "Markets",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#010304",
    theme_color: "#010304",
    icons: [
      {
        src: "/icons/markets-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/markets-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/markets-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
