import { MarketApp } from "@/components/market-app";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    side?: string;
    trade?: string;
    outcome?: string;
    contract?: string;
    stake?: string;
  }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const outcome = Number(query.outcome ?? 0);
  return (
    <MarketApp
      selectedId={id}
      initialSymbol={query.contract}
      initialStake={
        query.stake &&
        /^\d+(\.\d{1,2})?$/.test(query.stake) &&
        Number(query.stake) > 0 &&
        Number(query.stake) <= 1000000
          ? query.stake
          : "25"
      }
      initialTrade={query.trade === "sell" ? "sell" : "buy"}
      initialSide={query.side === "no" ? "no" : "yes"}
      initialOutcome={Number.isInteger(outcome) && outcome >= 0 ? outcome : 0}
    />
  );
}
