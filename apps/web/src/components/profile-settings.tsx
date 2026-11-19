"use client";
import { ProfileEditor } from "./profile-editor";
import { AuthButton, ConnectedWalletPanel } from "./auth-controls";
import { useNetwork } from "./network-settings";
import { WalletInventorySettings } from "./wallet-collection";
import Link from "next/link";
import dynamic from "next/dynamic";
const DemoReplayControls = dynamic(
  () => import("./demo-controls").then((m) => m.DemoReplayControls),
  { ssr: false },
);
import RelayFunding from "./relay-funding";

export function ProfileSettings() {
  const { network, setNetwork } = useNetwork();
  return (
    <div className="profile-settings-page">
      <ProfileEditor />
      <section className="panel funding-panel">
        <h2>Settings</h2>
        <div className="network-options" role="group" aria-label="Network">
          {(["mainnet", "devnet"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={network === value}
              onClick={() => setNetwork(value)}
            >
              {value === "devnet" ? "Devnet" : "Mainnet"}
            </button>
          ))}
        </div>
        <WalletInventorySettings embedded />
        <details className="install-help">
          <summary>Add to Home Screen</summary>
          <p>
            On iPhone, open Safari’s Share menu and choose Add to Home Screen.
            On Android, choose Install app in your browser menu.
          </p>
        </details>
      </section>
      <section className="panel funding-panel settings-replay">
        <h2>Replay a market</h2>
        <Link
          className="button button-outline"
          href="/demo"
          onClick={() => setNetwork("devnet")}
        >
          Open replay
        </Link>
        <DemoReplayControls />
      </section>
      <ConnectedWalletPanel />
      {network === "mainnet" && <RelayFunding />}
      <div>
        <AuthButton />
      </div>
    </div>
  );
}
