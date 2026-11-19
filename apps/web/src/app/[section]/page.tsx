import { notFound, redirect } from "next/navigation";
import { MarketApp } from "@/components/market-app";
const sections = [
  "rewards",
  "cart",
  "wallet",
  "portfolio",
  "collection",
  "redeem",
  "demo",
];
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === "cart") redirect("/portfolio");
  if (!sections.includes(section)) notFound();
  return <MarketApp section={section} />;
}
