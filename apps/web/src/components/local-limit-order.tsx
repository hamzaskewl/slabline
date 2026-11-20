"use client";
import { useState, useSyncExternalStore } from "react";
import {
  createLocalLimitOrder,
  localLimitOrderKey,
  localLimitOrderTotal,
  readLocalLimitOrders,
} from "@/lib/local-limit-orders";
import { usd } from "@/lib/utils";
import { useSlablineAuth } from "./sign-in-dialog";
import { useNetwork } from "./network-settings";
import { Button } from "./ui/button";

const changedEvent = "slabline-local-limit-orders";
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(changedEvent, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(changedEvent, notify);
  };
}
const serverSnapshot = () => null;

type Props = {
  symbol: string;
  label: string;
  direction: "buy" | "sell";
  side: "yes" | "no";
  practice: boolean;
};

export function LocalLimitOrder(props: Props) {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID ? (
    <AccountLocalLimitOrder {...props} />
  ) : (
    <LocalLimitOrderForm {...props} owner="guest" />
  );
}

function AccountLocalLimitOrder(props: Props) {
  const { user } = useSlablineAuth();
  return (
    <LocalLimitOrderForm
      {...props}
      owner={user?.id ?? "guest"}
      key={user?.id ?? "guest"}
    />
  );
}

function LocalLimitOrderForm({
  symbol,
  label,
  direction,
  side,
  practice,
  owner,
}: Props & { owner: string }) {
  const { network } = useNetwork();
  const storageKey = localLimitOrderKey(owner, practice ? "practice" : network);
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    },
    serverSnapshot,
  );
  const orders = readLocalLimitOrders(raw);
  const visible = orders.filter((order) => order.symbol === symbol);
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function save(next: typeof orders) {
    localStorage.setItem(storageKey, JSON.stringify(next));
    window.dispatchEvent(new Event(changedEvent));
  }

  return (
    <section className="local-limit-order" aria-label="Local limit order">
      <p className="local-order-note" id="local-limit-note">
        Saved on this device only. No trade is submitted or balance reserved.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          setMessage("");
          try {
            const order = createLocalLimitOrder({
              symbol,
              label,
              direction,
              side,
              priceCents: price,
              quantity,
            });
            const current = readLocalLimitOrders(
              localStorage.getItem(storageKey),
            );
            if (current.length >= 100)
              throw new Error("Cancel a local order before adding another.");
            save([order, ...current]);
            setMessage("Limit order saved on this device.");
          } catch (err) {
            setError(
              err instanceof Error &&
                err.name !== "QuotaExceededError" &&
                err.name !== "SecurityError"
                ? err.message
                : "Could not save on this device. Check browser storage and retry.",
            );
          }
        }}
      >
        <label htmlFor="limit-price">
          Limit price <span>cents per share</span>
        </label>
        <input
          id="limit-price"
          inputMode="decimal"
          autoComplete="off"
          placeholder="50"
          maxLength={8}
          value={price}
          onChange={(event) => {
            setPrice(event.target.value);
            setMessage("");
            setError("");
          }}
          aria-describedby="local-limit-note"
          required
        />
        <label htmlFor="limit-quantity">Shares</label>
        <input
          id="limit-quantity"
          inputMode="decimal"
          autoComplete="off"
          placeholder="10"
          maxLength={14}
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value);
            setMessage("");
            setError("");
          }}
          required
        />
        <Button className="ticket-action">
          Place limit {direction} · {side === "yes" ? "Yes" : "No"}
        </Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {visible.length > 0 && (
        <div className="local-limit-orders">
          <h3>Local orders ({visible.length})</h3>
          {visible.map((order) => (
            <div className="local-limit-order-row" key={order.id}>
              <div>
                <strong>
                  {order.direction === "buy" ? "Buy" : "Sell"}{" "}
                  {order.side === "yes" ? "Yes" : "No"} ·{" "}
                  {Number(order.quantity).toLocaleString("en-US", {
                    maximumFractionDigits: 6,
                  })}{" "}
                  shares
                </strong>
                <p>
                  {(Number(order.price) * 100).toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}
                  ¢ · {usd(localLimitOrderTotal(order))} · Pending locally
                </p>
              </div>
              <Button
                variant="ghost"
                aria-label={`Cancel local ${order.direction} ${order.side} order for ${Number(order.quantity)} shares`}
                onClick={() => {
                  setError("");
                  setMessage("");
                  try {
                    const current = readLocalLimitOrders(
                      localStorage.getItem(storageKey),
                    );
                    save(current.filter((item) => item.id !== order.id));
                    setMessage("Local limit order cancelled.");
                  } catch {
                    setError("Could not cancel on this device. Please retry.");
                  }
                }}
              >
                Cancel
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
