import { MarketApp } from "@/components/market-app";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ side?: string; outcome?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const outcome = Number(query.outcome ?? 0);
  return (
    <MarketApp
      selectedId={id}
      initialSide={query.side === "no" ? "no" : "yes"}
      initialOutcome={
        Number.isInteger(outcome) && outcome >= 0 && outcome < 100 ? outcome : 0
      }
    />
  );
}
