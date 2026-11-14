import { ChainInspector } from "@/components/chain-inspector";
import Link from "next/link";

export default function About() {
  return (
    <main className="about-page">
      <Link href="/">‹ Markets</Link>
      <h1>About Collectible Markets</h1>
      <section>
        <h2>Data sources</h2>
        <p>
          Public prediction markets from Gemini. Exact-card listings and slab
          images from Collector Crypt. Token metadata and images from Grail.
        </p>
        <p>
          Markets appear when a listed collectible or Grail token relates to
          their subject or sport. Non-sports rewards appear only when a related
          active market exists.
        </p>
      </section>
      <section>
        <h2>Availability</h2>
        <p>
          Trading, transfers and card checkout are currently unavailable.
          Practice orders are simulated and saved on this device.
        </p>
        <p>
          Grail purchases use the connected EVM wallet and require a live 0x
          quote. Purchases remain disabled pending setup and a verified test.
          Gas sponsorship is off; physical redemption remains on Grail. Owning a
          fraction of a token does not by itself qualify for a physical card.
        </p>
      </section>
      <section>
        <h2>Credits</h2>
        <p>
          Charts use{" "}
          <a
            href="https://www.tradingview.com/"
            target="_blank"
            rel="noreferrer"
          >
            TradingView Lightweight Charts™
          </a>
          . Copyright © 2025 TradingView, Inc.
        </p>
        <p>
          Provider images belong to their respective owners. Collectible Markets
          is an independent UBC 2026 prototype and is not endorsed by these
          providers.
        </p>
      </section>
      <details>
        <summary>Transaction tools</summary>
        <ChainInspector network={process.env.SOLANA_NETWORK ?? "devnet"} />
      </details>
      <nav>
        <Link href="/rewards">Rewards</Link> ·{" "}
        <Link href="/wallet">Wallet</Link>
      </nav>
    </main>
  );
}
