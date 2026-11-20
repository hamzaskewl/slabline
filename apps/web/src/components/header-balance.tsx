"use client";
import Link from "next/link";
import type {
  DemoAccountView,
  GeminiConnection,
  GeminiSnapshot,
} from "@collectible/domain";
import { usePrivateRead } from "@/lib/use-private-read";
import { usd } from "@/lib/utils";
import { useNetwork } from "./network-settings";

/** Spendable cash only: never position cost, card value, or unclaimed winnings. */
export function HeaderBalance() {
  const { network } = useNetwork();
  const demo = usePrivateRead<DemoAccountView>(
    "/api/demo",
    network === "devnet",
  );
  const connection = usePrivateRead<GeminiConnection>(
    "/api/gemini/connection",
    network === "mainnet",
  );
  const gemini = usePrivateRead<GeminiSnapshot>(
    "/api/gemini/account",
    network === "mainnet" && connection.data?.canRead === true,
  );
  const value =
    network === "devnet"
      ? demo.data?.balance
      : gemini.data?.balances.find((b) => b.currency.toUpperCase() === "USD")
          ?.available;
  const error =
    network === "devnet" ? demo.error : connection.error || gemini.error;
  const text = value == null || error ? "—" : usd(value);
  return (
    <Link
      className="header-balance"
      href="/portfolio"
      title={
        error
          ? "Balance unavailable. Open Portfolio to retry."
          : "Available balance"
      }
      aria-label={`Available balance ${text}. Open Portfolio.`}
    >
      <span>Balance</span>
      <strong>{text}</strong>
    </Link>
  );
}
