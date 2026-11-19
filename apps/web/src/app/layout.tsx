import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "./globals.css";
import "./prediction-theme.css";
import "./mobile.css";
import "./order-book.css";
import "./reward-target.css";
import "./market-artwork.css";
import "./discovery.css";
import "./demo.css";
import "./account.css";
import "./sign-in.css";
import "./slabline.css";
import "./fmv.css";
import "./responsive-panels.css";
import "./portfolio-refinements.css";
import { Providers } from "@/components/providers";
export const metadata: Metadata = {
  applicationName: "Slabline",
  appleWebApp: {
    capable: true,
    title: "Slabline",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
    icon: "/brand/slabline-favicon.svg",
  },
  title: "Slabline",
  description: "Prediction markets, sports cards and collectible tokens.",
  openGraph: {
    title: "Slabline",
    images: [
      {
        url: "/brand/slabline-square-background.png",
        width: 1254,
        height: 1254,
      },
    ],
  },
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B1118",
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
