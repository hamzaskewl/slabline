import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "./globals.css";
import "./prediction-theme.css";
import "./mobile.css";
import "./order-book.css";
import "./reward-target.css";
import "./market-artwork.css";
import { Providers } from "@/components/providers";
export const metadata: Metadata = {
  applicationName: "Collectible Markets",
  appleWebApp: {
    capable: true,
    title: "Collectible Markets",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
    icon: "/icons/markets-192.png",
  },
  title: "Collectible Markets",
  description: "Prediction markets, sports cards and collectible tokens.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#010304",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
