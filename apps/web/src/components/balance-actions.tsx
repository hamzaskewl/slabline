"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import { useDemoAction } from "./demo-controls";
import { UsdcAmount, UsdcIcon } from "./usdc-amount";

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
        <Dialog.Trigger className="button button-primary button-pill">
          Top up
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="reward-browser-overlay balance-overlay" />
          <Dialog.Content className="balance-dialog">
            <header>
              <Dialog.Title>Top up balance</Dialog.Title>
              <Dialog.Close className="icon-button" aria-label="Close top up">
                <X size={20} />
              </Dialog.Close>
            </header>
            <Dialog.Description>
              Add any amount to your balance.
            </Dialog.Description>
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
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
