"use client";
import { ProfileEditor } from "./profile-editor";
import { AuthButton, ConnectedWalletPanel } from "./auth-controls";
import { useNetwork } from "./network-settings";
import { WalletInventorySettings } from "./wallet-collection";
import RelayFunding from "./relay-funding";

export function ProfileSettings() {
  const { network, setNetwork } = useNetwork();
  return (
    <div className="profile-settings-page">
      <ProfileEditor />
      <section className="panel funding-panel">
        <h2>Preferences</h2>
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
      <ConnectedWalletPanel />
      {network === "mainnet" && <RelayFunding />}
      <div>
        <AuthButton />
      </div>
    </div>
  );
}
