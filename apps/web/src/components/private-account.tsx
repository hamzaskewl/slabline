"use client";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "./ui/button";
import { usd } from "@/lib/utils";
type Snapshot = {
  balances: {
    currency: string;
    available: string | null;
    availableForWithdrawal: string | null;
  }[];
  positions: {
    symbol: string;
    quantity: string | null;
    outcome: string | null;
    marketValue: string | null;
  }[];
  settlements: {
    symbol: string;
    payout: string | null;
    settledAt: string | null;
  }[];
  observedAt: string;
};
export function PrivateAccount() {
  const { authenticated, getAccessToken } = usePrivy();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/gemini/account", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Account unavailable");
      setSnapshot(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Account unavailable");
    } finally {
      setBusy(false);
    }
  }
  const dollars = snapshot?.balances.find((b) => b.currency === "USD");
  return (
    <section className="panel funding-panel">
      <h2>Your linked Gemini account</h2>
      <p>
        Gemini USD is separate from Solana assets. Read-only account access
        never grants a trade or withdrawal.
      </p>
      <div className="wallet-actions">
        <Button disabled={!authenticated || busy} onClick={() => void load()}>
          {busy ? "Refreshing…" : "Load Gemini balances & positions"}
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {snapshot ? (
        <>
          <div className="quote-lines">
            <div>
              <span>Available Gemini USD</span>
              <strong>
                {dollars?.available ? usd(dollars.available) : "Not provided"}
              </strong>
            </div>
            <div>
              <span>Available for withdrawal</span>
              <strong>
                {dollars?.availableForWithdrawal
                  ? usd(dollars.availableForWithdrawal)
                  : "Not provided"}
              </strong>
            </div>
          </div>
          <h3>Positions</h3>
          {snapshot.positions.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Outcome</th>
                    <th>Quantity</th>
                    <th>Market value</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.positions.map((p, i) => (
                    <tr key={i}>
                      <td>{p.symbol}</td>
                      <td>{p.outcome ?? "Unknown"}</td>
                      <td>{p.quantity ?? "Unknown"}</td>
                      <td>
                        {p.marketValue
                          ? usd(p.marketValue)
                          : "No executable liquidity"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No open positions returned.</p>
          )}
          <h3>Settlements</h3>
          {snapshot.settlements.length ? (
            <ul>
              {snapshot.settlements.map((s, i) => (
                <li key={i}>
                  {s.symbol} · {s.payout ? usd(s.payout) : "Payout unknown"} ·{" "}
                  {s.settledAt ?? "Date not supplied"}
                </li>
              ))}
            </ul>
          ) : (
            <p>No settlements returned.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
