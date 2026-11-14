import Link from "next/link";
import { notFound } from "next/navigation";
import { evmChainId, evmAddress } from "@collectible/domain";
import { findGrailToken, grailReleaseBlocker } from "@collectible/integrations";
import { GrailTrading } from "@/components/grail-trading";

export default async function TokenPage({
  params,
}: {
  params: Promise<{ chain: string; address: string }>;
}) {
  const values = await params,
    chain = evmChainId.safeParse(Number(values.chain)),
    address = evmAddress.safeParse(values.address);
  if (!chain.success || !address.success) notFound();
  let token;
  try {
    token = await findGrailToken(chain.data, address.data);
  } catch {
    return (
      <main className="about-page">
        <Link href="/rewards">‹ Rewards</Link>
        <h1>Token unavailable</h1>
        <p>Grail’s catalog could not be loaded. Return to Rewards and retry.</p>
      </main>
    );
  }
  return (
    <main className="token-page">
      <nav>
        <Link href="/rewards">‹ Rewards</Link>
        <Link href="/wallet">Wallet</Link>
      </nav>
      <GrailTrading
        token={token}
        configured={!!process.env.NEXT_PUBLIC_PRIVY_APP_ID}
        quoteConfigured={!!process.env.ZEROX_API_KEY}
        blocker={grailReleaseBlocker()}
      />
      <footer>
        <Link href="/about">About &amp; credits</Link>
      </footer>
    </main>
  );
}
