"use client";
import { useSlablineAuth } from "./sign-in-dialog";
import { useEffect, useRef, useState } from "react";

import type { GeminiConnection, GeminiSnapshot } from "@collectible/domain";
import { Button } from "./ui/button";
import { usd } from "@/lib/utils";
import { usePrivateRead } from "@/lib/use-private-read";
import { PositionShare } from "./position-share";
export function PrivateAccount({ compact = false }: { compact?: boolean }) {
  const { ready, authenticated, login, getAccessToken, user } =
    useSlablineAuth();
  const connection = usePrivateRead<GeminiConnection>("/api/gemini/connection");
  const snapshot = usePrivateRead<GeminiSnapshot>(
    "/api/gemini/account",
    connection.data?.canRead === true,
  );
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
  }, [user?.id, authenticated]);
  const [connecting, setConnecting] = useState(false),
    [problem, setProblem] = useState<{ owner: string; text: string } | null>(
      null,
    );
  async function connect() {
    const owner = user?.id;
    if (!owner || connecting) return;
    setConnecting(true);
    setProblem(null);
    const current = generation.current;
    try {
      const token = await getAccessToken();
      if (current !== generation.current) return;
      if (!token) throw new Error("Sign in to continue.");
      const response = await fetch("/api/gemini/connect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (current !== generation.current) return;
      if (!response.ok)
        throw new Error(result.error ?? "Gemini connection unavailable.");
      window.location.assign(result.url);
    } catch (e) {
      setProblem({
        owner,
        text: e instanceof Error ? e.message : "Gemini connection unavailable.",
      });
    } finally {
      setConnecting(false);
    }
  }
  const data =
    authenticated && connection.data?.canRead ? snapshot.data : undefined;
  const dollars = data?.balances.find(
    (b) => b.currency.toUpperCase() === "USD",
  );
  return (
    <section className="panel funding-panel account-panel">
      <div className="section-heading">
        <h2>Gemini account</h2>
        {connection.data?.environment === "sandbox" ? (
          <span className="mode-badge">SANDBOX</span>
        ) : null}
      </div>
      {!ready ? (
        <p role="status">Loading account…</p>
      ) : !authenticated ? (
        <Button onClick={login}>Log in to connect Gemini</Button>
      ) : (
        <>
          {connection.isPending ? (
            <p role="status">Checking connection…</p>
          ) : null}
          {connection.data?.blocker ? <p>{connection.data.blocker}</p> : null}
          {connection.error ? (
            <p role="alert">{connection.error.message}</p>
          ) : null}
          {connection.data?.canConnect && !connection.data.canRead ? (
            <Button disabled={connecting} onClick={() => void connect()}>
              {connecting
                ? "Connecting…"
                : connection.data.linked
                  ? "Reconnect Gemini"
                  : "Connect Gemini"}
            </Button>
          ) : null}
          <div className="wallet-actions">
            <Button
              variant="outline"
              disabled={connection.isFetching || snapshot.isFetching}
              onClick={() => {
                void connection.refetch();
                if (connection.data?.canRead) void snapshot.refetch();
              }}
            >
              {connection.isFetching || snapshot.isFetching
                ? "Refreshing…"
                : "Refresh account"}
            </Button>
          </div>
          {problem?.owner === user?.id ? (
            <p role="alert">{problem?.text}</p>
          ) : null}
          {snapshot.error ? (
            <p role="alert">
              {snapshot.error.message}
              {data ? " Displayed balances may be outdated." : ""}
            </p>
          ) : null}
          {data ? (
            <>
              <div className="quote-lines">
                <div>
                  <span>Available USD</span>
                  <strong>
                    {dollars?.available != null
                      ? usd(dollars.available)
                      : "Not provided"}
                  </strong>
                </div>
                <div>
                  <span>Available for withdrawal</span>
                  <strong>
                    {dollars?.availableForWithdrawal != null
                      ? usd(dollars.availableForWithdrawal)
                      : "Not provided"}
                  </strong>
                </div>
              </div>
              {!compact ? (
                <>
                  <h3>Positions</h3>
                  {data.positions.length ? (
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
                          {data.positions.map((p, i) => (
                            <tr key={`${p.symbol}-${i}`}>
                              <td>{p.symbol}</td>
                              <td>{p.outcome ?? "Unknown"}</td>
                              <td>{p.quantity ?? "Not supplied"}</td>
                              <td>
                                <div className="position-value-share">
                                  {p.marketValue != null
                                    ? usd(p.marketValue)
                                    : "Not supplied"}
                                  <PositionShare
                                    reference={{
                                      source: "gemini",
                                      kind: "position",
                                      symbol: p.symbol,
                                      outcome: p.outcome,
                                      settledAt: null,
                                    }}
                                    revision={JSON.stringify(p)}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>No open positions.</p>
                  )}
                  <h3>Open orders</h3>
                  {data.activeOrders.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Contract</th>
                            <th>Side / outcome</th>
                            <th>Limit price</th>
                            <th>Remaining shares</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.activeOrders.map((o, i) => (
                            <tr key={o.id ?? i}>
                              <td>{o.symbol}</td>
                              <td>
                                {o.side ?? "Unknown"} / {o.outcome ?? "Unknown"}
                              </td>
                              <td>
                                {o.price != null
                                  ? usd(o.price)
                                  : "Not supplied"}
                              </td>
                              <td>{o.remainingQuantity ?? "Not supplied"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>No open orders.</p>
                  )}
                  <h3>Settlements</h3>
                  {data.settlements.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Contract</th>
                            <th>Payout</th>
                            <th>Settled</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.settlements.map((s, i) => (
                            <tr key={`${s.symbol}-${i}`}>
                              <td>{s.symbol}</td>
                              <td>
                                <div className="position-value-share">
                                  {s.payout != null
                                    ? usd(s.payout)
                                    : "Not supplied"}
                                  <PositionShare
                                    reference={{
                                      source: "gemini",
                                      kind: "settlement",
                                      symbol: s.symbol,
                                      outcome: s.outcome ?? null,
                                      settledAt: s.settledAt,
                                    }}
                                    revision={JSON.stringify(s)}
                                  />
                                </div>
                              </td>
                              <td>{s.settledAt ?? "Not supplied"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>No settlements yet.</p>
                  )}
                </>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
