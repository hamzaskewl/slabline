import type { Metadata } from "next";

import { MarketApp } from "@/components/market-app";

import "../pull-predict.css";

export const metadata: Metadata = { title: "Your packs | Slabline" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ opening?: string }>;
}) {
  const { opening } = await searchParams;

  return <MarketApp section="pull-packs" pullOpeningId={opening} />;
}
