"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnectWallet } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { units, type PullOpening, type PullTheme } from "@collectible/domain";
import { usePrivateRead } from "@/lib/use-private-read";
import { usdc } from "@/lib/utils";
import { Button } from "./ui/button";
import { useDemoAction } from "./demo-controls";
import { useNetwork } from "./network-settings";
import { PullBoard, PullRetry } from "./pull-board";
import { PullOpeningPanel } from "./pull-opening";
import { PullCinematic, type PackPresentation } from "./pull-cinematic";
import { PackageOpen } from "lucide-react";

const path = "/api/pull";
type PullAccountView = {
  balance: string;
  openings: PullOpening[];
  randomnessMode: PullOpening["randomnessSource"];
};

export type PullActions = Pick<
  ReturnType<typeof useDemoAction>,
  "busy" | "error" | "run"
> & {
  request: <T>(input: object) => Promise<T>;
  save: (opening: PullOpening, balance?: string) => void;
};

function openingState(opening: PullOpening) {
  switch (opening.state) {
    case "ready":
      return "Budget ready";
    case "pending":
      return "Draw pending";
    case "redeemed":
      return "Position opened";
  }
}

export function PullAccount() {
  const auth = useDemoAction();
  const { setNetwork } = useNetwork();

  if (!auth.ready)
    return (
      <PullBoard
        action={() => (
          <p className="pull-muted" role="status">
            Checking sign-in…
          </p>
        )}
      />
    );
  if (!auth.authenticated || !auth.user?.id) {
    return (
      <PullBoard
        action={() => (
          <Button className="pull-action" onClick={auth.login}>
            Sign in to open a pack
          </Button>
        )}
      />
    );
  }
  if (auth.network !== "devnet") {
    return (
      <PullBoard
        action={() => (
          <Button className="pull-action" onClick={() => setNetwork("devnet")}>
            Switch to Devnet
          </Button>
        )}
      />
    );
  }
  return (
    <SignedInPull key={auth.user.id} owner={auth.user.id} actions={auth} />
  );
}

function SignedInPull({
  owner,
  actions,
}: {
  owner: string;
  actions: ReturnType<typeof useDemoAction>;
}) {
  const account = usePrivateRead<PullAccountView>(path);
  const links = usePrivateRead<{ wallets: { address: string }[] }>(
    "/api/wallet/links",
    account.data?.randomnessMode === "magicblock-devnet",
  );
  const query = useQueryClient();
  const { wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const [activeId, setActiveId] = useState<string>();
  const [presentation, setPresentation] = useState<PackPresentation>();
  const [focusOpening, setFocusOpening] = useState(0);
  const [selectedWallet, setSelectedWallet] = useState("");
  const [actionArea, setActionArea] = useState<"pack" | "opening">("pack");
  const attempts = useRef(new Map<string, string>());
  const wallet =
    wallets.find((entry) => entry.address === selectedWallet) ?? wallets[0];
  const verifiedWallet = links.data?.wallets.some(
    (entry) => entry.address === wallet?.address,
  );
  const data = account.data;
  const openings = data?.openings ?? [];
  const active =
    openings.find((opening) => opening.id === activeId) ??
    openings.find((opening) => opening.state !== "redeemed") ??
    openings[0];

  useEffect(() => {
    if (focusOpening && !presentation)
      document.getElementById("opening-title")?.focus();
  }, [focusOpening, presentation]);

  function selectOpening(id: string) {
    setActiveId(id);
    setFocusOpening((count) => count + 1);
  }

  async function request<T>(input: object) {
    try {
      return await actions.request<T>(input, path);
    } catch (error) {
      void account.refetch();
      throw error;
    }
  }

  function update(opening: PullOpening, balance?: string) {
    query.setQueryData<PullAccountView>(
      ["private-read", owner, path, "devnet"],
      (previous) =>
        previous && {
          ...previous,
          balance: balance ?? previous.balance,
          openings: [
            opening,
            ...previous.openings.filter(({ id }) => id !== opening.id),
          ],
        },
    );
  }

  function save(opening: PullOpening, balance?: string) {
    update(opening, balance);
    selectOpening(opening.id);
    void account.refetch({ cancelRefetch: true });
  }

  function open(pack: PackPresentation) {
    const { tier, theme } = pack;
    return actions.run(async () => {
      setActionArea("pack");
      setPresentation(pack);
      const payer =
        data?.randomnessMode === "magicblock-devnet"
          ? wallet?.address
          : undefined;
      const storageKey = `slabline-pull-attempt:${owner}:${tier}:${JSON.stringify(theme)}:${payer ?? ""}`;
      let key = attempts.current.get(storageKey);
      try {
        key ??= localStorage.getItem(storageKey) ?? undefined;
      } catch {}
      key ??= crypto.randomUUID();
      attempts.current.set(storageKey, key);
      try {
        localStorage.setItem(storageKey, key);
      } catch {}
      const response = await request<{
        opening: PullOpening;
        balance?: string;
        recoveredSignature?: string;
      }>({ action: "open", key, tier, theme, payer });
      if (response.recoveredSignature) {
        try {
          localStorage.setItem(
            `slabline-pull-signature:${response.opening.id}`,
            response.recoveredSignature,
          );
        } catch {}
      }
      setPresentation((current) =>
        current ? { ...current, id: response.opening.id } : current,
      );
      save(response.opening, response.balance);
      attempts.current.delete(storageKey);
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    });
  }

  const displayedOpening = openings.find(
    (opening) => opening.id === presentation?.id,
  );
  const openingActions: PullActions = {
    busy: actions.busy,
    error: actionArea === "opening" ? actions.error : "",
    run: (operation) =>
      actions.run(async () => {
        setActionArea("opening");
        await operation();
      }),
    request,
    save,
  };

  return (
    <>
      <PullBoard
        balance={data?.balance}
        busy={actions.busy}
        mode={data?.randomnessMode}
        opening={
          active && (
            <PullOpeningPanel
              key={active.id}
              opening={active}
              inPresentation={!!presentation}
              onResume={() =>
                setPresentation({
                  tier: active.tier,
                  theme: active.theme,
                  id: active.id,
                })
              }
              actions={openingActions}
            />
          )
        }
        history={
          openings.length > 0 && (
            <section
              className="pull-panel pull-history"
              aria-labelledby="pull-history-title"
            >
              <h2 id="pull-history-title">Opening history</h2>
              <ul>
                {openings.map((opening) => (
                  <li key={opening.id}>
                    <button
                      type="button"
                      disabled={actions.busy}
                      aria-pressed={opening.id === active?.id}
                      onClick={() => selectOpening(opening.id)}
                    >
                      <strong>${opening.tier} pack</strong>
                      <span>{openingState(opening)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        }
        action={(pack, eligible) => {
          const { tier, theme } = pack;
          if (account.error)
            return (
              <div>
                <p className="pull-error" role="alert">
                  {account.error.message}
                </p>
                <PullRetry onClick={() => void account.refetch()}>
                  Refresh account
                </PullRetry>
              </div>
            );
          if (!data)
            return (
              <p className="pull-muted" role="status">
                Loading demo balance…
              </p>
            );
          const insufficient = units(data.balance) < units(String(tier));
          const walletPaid = data.randomnessMode === "magicblock-devnet";
          return (
            <div className="pull-stack">
              {walletPaid && wallets.length > 1 && (
                <label className="pull-field">
                  <span>Solana Devnet wallet</span>
                  <select
                    value={wallet?.address}
                    onChange={(event) => setSelectedWallet(event.target.value)}
                  >
                    {wallets.map((entry) => (
                      <option key={entry.address}>{entry.address}</option>
                    ))}
                  </select>
                </label>
              )}
              {walletPaid && !wallet ? (
                <PullRetry
                  onClick={() =>
                    void connectWallet({ walletChainType: "solana-only" })
                  }
                >
                  Connect Solana wallet
                </PullRetry>
              ) : walletPaid && !verifiedWallet ? (
                <div className="pull-stack">
                  <p className="pull-muted">
                    {links.isPending
                      ? "Checking verified Devnet wallets…"
                      : "Verify your connected wallet before opening an onchain pack."}
                  </p>
                  <Button variant="outline" asChild className="pull-action">
                    <Link href="/wallet">Manage wallet verification</Link>
                  </Button>
                </div>
              ) : (
                <Button
                  className="pull-action"
                  disabled={!eligible || insufficient || actions.busy}
                  onClick={() =>
                    void open({
                      ...pack,
                      theme:
                        theme.kind === "all"
                          ? theme
                          : { ...theme, label: theme.label.trim() },
                    })
                  }
                >
                  <PackageOpen size={17} aria-hidden="true" /> Open ${tier} pack
                </Button>
              )}
              {insufficient && (
                <p className="pull-muted">
                  Your {usdc(data.balance)} demo balance is below this pack
                  price.
                </p>
              )}
              {actions.busy && (
                <p className="pull-muted" role="status">
                  Processing request…
                </p>
              )}
              {actionArea === "pack" && actions.error && (
                <p className="pull-error" role="alert">
                  {actions.error}
                </p>
              )}
            </div>
          );
        }}
      />
      {presentation && (
        <PullCinematic
          pack={presentation}
          opening={displayedOpening}
          waiting={actions.busy}
          error={actionArea === "pack" ? actions.error : undefined}
          actions={openingActions}
          onClose={(choose) => {
            setPresentation(undefined);
            if (choose && displayedOpening) selectOpening(displayedOpening.id);
          }}
        />
      )}
    </>
  );
}
