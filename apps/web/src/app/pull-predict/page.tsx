import type { Metadata } from "next";
import { MarketApp } from "@/components/market-app";
import "./pull-predict.css";

export const metadata: Metadata = { title: "Pull & Predict | Slabline" };

export default function Page() {
  return <MarketApp section="pull-predict" />;
}
