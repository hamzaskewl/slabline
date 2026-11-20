"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import { useDemoAction } from "./demo-controls";
import { UsdcAmount, UsdcIcon } from "./usdc-amount";
import { UsdcTransfers } from "./usdc-transfers";

export function BalanceActions({
  balance,
  suggestedAmount,
}: {
  balance?: string;
  suggestedAmount?: string;
}) {
  const a = useDemoAction();
  const amountId = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"topup" | "deposit" | "withdraw">("topup");
  const [amount, setAmount] = useState(
    suggestedAmount
      ? String(Math.ceil(Number(suggestedAmount) * 100) / 100)
      : "100",
  );
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    setOpen(false);
  }, [a.user?.id, a.network]);
  return (
    <div className="balance-actions">
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (next && suggestedAmount) {
            const suggested = String(
              Math.ceil(Number(suggestedAmount) * 100) / 100,
            );
            if (suggested !== amount) {
              setAmount(suggested);
              key.current = crypto.randomUUID();
            }
          }
          setOpen(next);
        }}
      >
        <Dialog.Trigger
          className="button button-primary button-pill"
          onClick={() => setMode("topup")}
        >
          Top up
        </Dialog.Trigger>
        <Button
          variant="outline"
          onClick={() => {
            setMode("deposit");
            setOpen(true);
          }}
        >
          Deposit USDC
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setMode("withdraw");
            setOpen(true);
          }}
        >
          Withdraw USDC
        </Button>
        <Dialog.Portal>
          <Dialog.Overlay className="reward-browser-overlay" />
          <Dialog.Content className="balance-dialog">
            <header>
              <Dialog.Title>
                {mode === "topup"
                  ? "Top up balance"
                  : mode === "deposit"
                    ? "Deposit USDC"
                    : "Withdraw USDC"}
              </Dialog.Title>
              <Dialog.Close
                className="icon-button"
                aria-label="Close balance dialog"
              >
                <X size={20} />
              </Dialog.Close>
            </header>
            <Dialog.Description>
              {mode === "topup"
                ? "Add any amount to your Devnet practice balance."
                : mode === "deposit"
                  ? "Move USDC from your Devnet wallet to your available balance."
                  : "Move your available balance to your Devnet wallet."}
            </Dialog.Description>
            {mode !== "topup" ? (
              <UsdcTransfers key={mode} direction={mode} balance={balance} />
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void a.run(async () => {
                    await a.request({
                      action: "topup",
                      key: key.current,
                      amount,
                    });
                    key.current = crypto.randomUUID();
                    setOpen(false);
                  });
                }}
              >
                <label htmlFor={amountId}>
                  Amount <UsdcIcon />
                </label>
                <input
                  id={amountId}
                  autoFocus
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    key.current = crypto.randomUUID();
                  }}
                />
                {balance !== undefined && (
                  <p>
                    Available <UsdcAmount value={balance} />
                  </p>
                )}
                <Button type="submit" disabled={a.busy}>
                  {a.busy ? "Adding…" : "Add to balance"}
                </Button>
                {a.error && <p role="alert">{a.error}</p>}
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
