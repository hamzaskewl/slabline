"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
const DemoReplayControls = dynamic(
  () => import("./demo-controls").then((m) => m.DemoReplayControls),
  { ssr: false },
);
const WalletInventorySettings = dynamic(
  () => import("./wallet-collection").then((m) => m.WalletInventorySettings),
  { ssr: false },
);
import { Dialog } from "radix-ui";
import { Settings2, X } from "lucide-react";
const NetworkContext = createContext<{
  network: "mainnet" | "devnet";
  setNetwork: (network: "mainnet" | "devnet") => void;
}>({ network: "devnet", setNetwork: () => {} });
export const useNetwork = () => useContext(NetworkContext);
export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, update] = useState<"mainnet" | "devnet">("devnet");
  useEffect(() => {
    try {
      if (localStorage.getItem("cm-network-v1") === "mainnet")
        update("mainnet");
    } catch {}
  }, []);
  function setNetwork(value: "mainnet" | "devnet") {
    update(value);
    try {
      localStorage.setItem("cm-network-v1", value);
    } catch {}
  }
  return (
    <NetworkContext.Provider value={{ network, setNetwork }}>
      {children}
    </NetworkContext.Provider>
  );
}
export function NetworkSettings() {
  const { network, setNetwork } = useNetwork();
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className="network-trigger"
        aria-label={`Settings, ${network}`}
      >
        <Settings2 size={16} />
        <span>{network === "devnet" ? "Devnet" : "Mainnet"}</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="reward-browser-overlay" />
        <Dialog.Content className="network-settings">
          <header>
            <Dialog.Title>Settings</Dialog.Title>
            <Dialog.Close
              className="reward-browser-close"
              aria-label="Close settings"
            >
              <X size={20} />
            </Dialog.Close>
          </header>
          <Dialog.Description>Choose your network.</Dialog.Description>
          <div className="network-options" role="group" aria-label="Network">
            {(["mainnet", "devnet"] as const).map((n) => (
              <button
                key={n}
                aria-pressed={network === n}
                onClick={() => setNetwork(n)}
              >
                {n === "devnet" ? "Devnet" : "Mainnet"}
              </button>
            ))}
          </div>
          <div className="settings-replay">
            <h3>Replay a market</h3>
            <p>
              Use a recorded book and choose its result when you’re ready to
              finish.
            </p>
            <Link
              className="button button-outline"
              href="/demo"
              onClick={() => {
                setNetwork("devnet");
                setOpen(false);
              }}
            >
              Open replay
            </Link>
            {open && process.env.NEXT_PUBLIC_PRIVY_APP_ID && (
              <DemoReplayControls />
            )}
          </div>
          {open && process.env.NEXT_PUBLIC_PRIVY_APP_ID && (
            <WalletInventorySettings />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
