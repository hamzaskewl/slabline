"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Compass, Gift, UserRound } from "lucide-react";
import { MobileBackButton } from "./mobile-back-button";
import { SlablineMark } from "./slabline-mark";
import { AuthButton } from "./auth-controls";

const appSections = new Set([
  "",
  "rewards",
  "cart",
  "wallet",
  "profile",
  "portfolio",
  "collection",
  "redeem",
  "demo",
  "markets",
  "pull-predict",
]);
const destinations = [
  { label: "Markets", href: "/", icon: Compass },
  { label: "Rewards", href: "/rewards", icon: Gift },
  { label: "Portfolio", href: "/portfolio", icon: BarChart3 },
  { label: "Profile", href: "/profile", icon: UserRound },
];

/** Pages outside MarketApp still need a way around an installed phone app. */
export function StandalonePageNavigation({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  if (appSections.has(pathname.split("/")[1] ?? "")) return children;
  return (
    <div className="standalone-page-shell">
      <header className="standalone-phone-header">
        <MobileBackButton />
        <Link href="/" className="exchange-brand" aria-label="Slabline">
          <SlablineMark />
          <span>Slabline</span>
        </Link>
        <div className="standalone-phone-account">
          {process.env.NEXT_PUBLIC_PRIVY_APP_ID && <AuthButton header />}
        </div>
      </header>
      {children}
      <nav className="phone-tabs" aria-label="App navigation">
        {destinations.map(({ label, href, icon: Icon }) => (
          <button key={href} type="button" onClick={() => router.push(href)}>
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
