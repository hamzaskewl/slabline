import { ChainInspector } from "@/components/chain-inspector";
import { SiteFrame } from "@/components/site-navigation";
import Link from "next/link";
import { CollectorCryptTest } from "@/components/collector-crypt-test";

export default function About() {
  return (
    <SiteFrame contentClass="about-page">
      <Link href="/">‹ Markets</Link>
      <h1>About Collectible Markets</h1>
      <section>
        <h2>Data sources</h2>
        <p>
          Public prediction markets from Gemini. Exact-card listings and slab
          images from Collector Crypt. Token metadata and images from Grail.
        </p>
        <p>
          Reward previews match listed collectibles and Grail tokens to a
          prediction's subject. Non-sports rewards in the catalog appear only
          when a related active market exists.
        </p>
      </section>
      <section>
        <h2>Availability</h2>
        <p>
          Trading, transfers and card checkout are currently unavailable.
          Practice orders are simulated and saved on this device.
        </p>
        <p>
          Grail pages show token prices and vault information. In-app token
          purchases are unavailable; physical redemption remains on Grail.
          Owning a fraction of a token does not by itself qualify for a physical
          card.
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
        {process.env.NEXT_PUBLIC_PRIVY_APP_ID &&
        process.env.SOLANA_NETWORK !== "mainnet" ? (
          <CollectorCryptTest />
        ) : null}
      </details>
      <nav>
        <Link href="/rewards">Rewards</Link> ·{" "}
        <Link href="/wallet">Wallet</Link>
      </nav>
    </SiteFrame>
  );
}
