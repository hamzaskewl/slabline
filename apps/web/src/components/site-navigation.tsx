"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Compass, Gift, Layers3, Wallet } from "lucide-react";

export const navigation = [
  { label: "Markets", href: "/", icon: Compass },
  { label: "Rewards", href: "/rewards", icon: Gift },
  { label: "Portfolio", href: "/portfolio", icon: BarChart3 },
  { label: "Wallet", href: "/wallet", icon: Wallet },
  { label: "Collection", href: "/collection", icon: Layers3 },
];

export function PhoneNavigation({ onMarkets }: { onMarkets?: () => void }) {
  const router = useRouter(),
    pathname = usePathname();
  const active = pathname.startsWith("/tokens/")
    ? "/rewards"
    : pathname.startsWith("/markets/") || pathname === "/practice"
      ? "/"
      : pathname;
  return (
    <nav
      className="phone-tabs"
      aria-label="App navigation"
      onContextMenu={(event) => event.preventDefault()}
    >
      {navigation.map(({ label, href, icon: Icon }) => (
        <button
          key={href}
          type="button"
          aria-current={active === href ? "page" : undefined}
          onClick={() =>
            href === "/" && onMarkets ? onMarkets() : router.push(href)
          }
        >
          <Icon size={20} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Shared navigation for informational and token-detail routes. */
export function SiteFrame({
  children,
  contentClass,
}: {
  children: ReactNode;
  contentClass: string;
}) {
  return (
    <div className="app-shell supporting-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="exchange-header">
        <div className="exchange-header-main">
          <Link href="/" className="exchange-brand">
            <Layers3 size={27} />
            <span>Collectible Markets</span>
          </Link>
          <nav className="supporting-navigation" aria-label="Main navigation">
            {navigation.map(({ label, href }) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
          <Link className="text-link supporting-practice" href="/practice">
            Practice
          </Link>
        </div>
      </header>
      <main id="main" className={contentClass}>
        {children}
      </main>
      <PhoneNavigation />
    </div>
  );
}
