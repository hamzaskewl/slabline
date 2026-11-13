import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "./globals.css";
import "./prediction-theme.css";
import { Providers } from "@/components/providers";
export const metadata: Metadata = {
  title: "Collectible Markets — Make your call",
  description:
    "Explore Gemini prediction markets and discover real collectible rewards. Hackathon prototype; simulated trading.",
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
