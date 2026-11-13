"use client";
import { useState } from "react";
import { Button } from "./ui/button";
export function ChainInspector({ network }: { network: string }) {
  const [sig, setSig] = useState(""),
    [result, setResult] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel funding-panel">
      <h2>Verify a Solana transaction</h2>
      <p>
        {network.toUpperCase()} RPC · Read-only confirmation. A confirmed
        signature alone does not prove card ownership.
      </p>
      <form
        className="chain-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const response = await fetch(
              `/api/solana/confirm?signature=${encodeURIComponent(sig)}`,
            );
            const data = await response.json();
            setResult(
              response.ok
                ? `${data.state.toUpperCase()} on ${data.network} · slot ${data.slot ?? "unknown"}`
                : data.error,
            );
          } catch {
            setResult("RPC unavailable; confirmation unknown.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="Solana transaction signature"
          placeholder="Paste a transaction signature"
          value={sig}
          onChange={(e) => setSig(e.target.value)}
          required
          minLength={64}
          maxLength={88}
        />
        <Button disabled={busy}>
          {busy ? "Checking…" : "Check onchain status"}
        </Button>
      </form>
      {result ? <p role="status">{result}</p> : null}
    </section>
  );
}
