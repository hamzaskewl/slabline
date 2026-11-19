"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
export function PullAccount({
  view = "shop",
  openingId,
}: {
  view?: "shop" | "packs";
  openingId?: string;
}) {
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
    <SignedInPull
      key={auth.user.id}
      owner={auth.user.id}
      actions={auth}
      view={view}
      openingId={openingId}
    />
  );
}

function SignedInPull({
  owner,
  actions,
  view,
  openingId,
}: {
  owner: string;
  view: "shop" | "packs";
  openingId?: string;
  actions: ReturnType<typeof useDemoAction>;
}) {
  const router = useRouter();
  const account = usePrivateRead<PullAccountView>(path);
  const links = usePrivateRead<{ wallets: { address: string }[] }>(
    "/api/wallet/links",
    account.data?.randomnessMode === "magicblock-devnet",
  );
  const query = useQueryClient();
  const { wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const [activeId, setActiveId] = useState<string | undefined>(openingId);
  const [presentation, setPresentation] = useState<PackPresentation>();
  const [focusOpening, setFocusOpening] = useState(0);
  const [selectedWallet, setSelectedWallet] = useState("");
  const [actionArea, setActionArea] = useState<"pack" | "opening">("pack");
  const draftClosed = useRef(false);
  const attempts = useRef(new Map<string, string>());
  const wallet =
    wallets.find((entry) => entry.address === selectedWallet) ?? wallets[0];
  const verifiedWallet = links.data?.wallets.some(
    (entry) => entry.address === wallet?.address,
  );
  const data = account.data;
  const openings = (data?.openings ?? []).filter(
    (opening) => opening.state !== "cancelled",
  );
  const active = activeId
    ? openings.find((opening) => opening.id === activeId)
    : (openings.find((opening) => opening.state === "ready") ?? openings[0]);
  useEffect(() => {
    setActiveId(openingId);
  }, [openingId]);

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
            ...(opening.state === "cancelled" ? [] : [opening]),
            ...previous.openings.filter(({ id }) => id !== opening.id),
          ],
        },
    );
  }

  function save(opening: PullOpening, balance?: string) {
    if (opening.state === "cancelled") setPresentation(undefined);
    update(opening, balance);
    if (opening.state !== "cancelled") selectOpening(opening.id);
    void account.refetch({ cancelRefetch: true });
  }

  useEffect(() => {
    if (
      view !== "packs" ||
      active?.state !== "pending" ||
      !active.requestSignature ||
      presentation
    )
      return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const result = await request<{
          opening: PullOpening;
          balance?: string;
        }>({
          action: "verify",
          id: active!.id,
          requestSignature: active!.requestSignature,
        });
        if (!disposed && result.opening.state !== "pending")
          update(result.opening, result.balance);
      } catch {
        /* Keep the saved pack available for a manual check. */
      }
      if (!disposed) timer = setTimeout(check, 5000);
    }
    void check();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [view, active?.id, active?.state, active?.requestSignature, presentation]);

  function open(pack: PackPresentation) {
    const { tier, theme } = pack;
    return actions.run(async () => {
      setActionArea("pack");
      draftClosed.current = false;
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
      }>({ action: "open", key, tier, theme, payer }).catch((error) => {
        // A lost response may already have reserved cash. Retain its purchase
        // key until the server definitively reports cancellation.
        if (error instanceof Error && /cancelled/i.test(error.message)) {
          attempts.current.delete(storageKey);
          try {
            localStorage.removeItem(storageKey);
          } catch {}
        }
        throw error;
      });
      if (response.recoveredSignature) {
        try {
          localStorage.setItem(
            `slabline-pull-signature:${response.opening.id}`,
            response.recoveredSignature,
          );
        } catch {}
      }
      if (draftClosed.current) {
        const cancelled = await request<{
          opening: PullOpening;
          balance?: string;
        }>({ action: "cancel", id: response.opening.id });
        update(cancelled.opening, cancelled.balance);
      }
      setPresentation((current) =>
        current ? { ...current, id: response.opening.id } : current,
      );
      if (!draftClosed.current) save(response.opening, response.balance);
      attempts.current.delete(storageKey);
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    });
  }
  const cleaned = useRef(false);
  const [cleanupError, setCleanupError] = useState("");
  useEffect(() => {
    if (!data || cleaned.current) return;
    cleaned.current = true;
    const abandoned = data.openings.filter(
      (opening) => opening.state === "pending" && !opening.requestSignature,
    );
    void (async () => {
      for (const opening of abandoned) {
        try {
          // Do not cancel an older client's signed request while it is in flight.
          if (
            localStorage.getItem(`slabline-pull-request:${opening.id}`) ||
            localStorage.getItem(`slabline-pull-signature:${opening.id}`)
          )
            continue;
          const result = await request<{
            opening: PullOpening;
            balance?: string;
          }>({ action: "cancel", id: opening.id });
          update(result.opening, result.balance);
        } catch {
          setCleanupError(
            "Could not check an unfinished opening. Refresh Your packs to try again.",
          );
        }
      }
    })();
  }, [data]);
  async function closePresentation(choose?: boolean) {
    draftClosed.current = true;
    const closing = presentation;
    setPresentation(undefined);
    if (choose && closing?.id) {
      router.push(`/pull-predict/packs?opening=${closing.id}`);
    } else if (closing?.id) {
      try {
        const result = await request<{
          opening: PullOpening;
          balance?: string;
        }>({ action: "cancel", id: closing.id });
        update(result.opening, result.balance);
      } catch {
        setCleanupError(
          "Your opening is saved while we check its transaction. View it in Your packs.",
        );
      }
    }
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
      {cleanupError && (
        <p className="pull-error" role="alert">
          {cleanupError}
        </p>
      )}
      {view === "shop" &&
        !presentation &&
        actionArea === "opening" &&
        actions.error && (
          <p className="pull-error" role="alert">
            {actions.error}
          </p>
        )}
      {view === "packs" ? (
        <section className="pull-workspace pull-stack">
          <header className="pull-heading">
            <div>
              <h1>Your packs</h1>
              <p>Use your unlocked budget on a prediction.</p>
            </div>
            <div className="pull-page-links">
              <Link href="/pull-predict">Choose a pack</Link>
            </div>
          </header>
          {account.isPending ? (
            <p role="status">Loading your packs…</p>
          ) : account.error ? (
            <div role="alert">
              {account.error.message}
              <PullRetry onClick={() => void account.refetch()}>
                Refresh packs
              </PullRetry>
            </div>
          ) : !openings.length ? (
            <p>
              No packs yet.{" "}
              <Link href="/pull-predict">Choose your first pack</Link>.
            </p>
          ) : (
            <>
              <nav className="pull-pack-tabs" aria-label="Your packs">
                {openings.map((opening) => (
                  <Link
                    key={opening.id}
                    aria-current={
                      opening.id === active?.id ? "page" : undefined
                    }
                    href={`/pull-predict/packs?opening=${opening.id}`}
                    onClick={() => selectOpening(opening.id)}
                  >
                    ${opening.tier} · {openingState(opening)}
                  </Link>
                ))}
              </nav>
              {!active && (
                <p className="pull-muted">
                  This opening is no longer available. Choose one of your saved
                  packs above.
                </p>
              )}
              {active && (
                <PullOpeningPanel
                  key={active.id}
                  opening={active}
                  actions={openingActions}
                  inPresentation={!!presentation}
                  onResume={() =>
                    setPresentation({
                      tier: active.tier,
                      theme: active.theme,
                      id: active.id,
                    })
                  }
                />
              )}
            </>
          )}
        </section>
      ) : (
        <PullBoard
          balance={data?.balance}
          busy={actions.busy}
          mode={data?.randomnessMode}
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
                      <Link href={`/pull-predict/packs?opening=${opening.id}`}>
                        <strong>${opening.tier} pack</strong>
                        <span>{openingState(opening)}</span>
                      </Link>
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
                  Loading balance…
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
                      onChange={(event) =>
                        setSelectedWallet(event.target.value)
                      }
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
                    style={{ width: "100%", justifySelf: "stretch" }}
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
                    <PackageOpen size={17} aria-hidden="true" /> Open ${tier}
                  </Button>
                )}
                {insufficient && (
                  <p className="pull-muted">
                    Your {usdc(data.balance)} balance is below this pack price.
                  </p>
                )}
                {actions.busy && (
                  <p className="pull-muted" role="status">
                    Opening pack…
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
      )}
      {presentation && (
        <PullCinematic
          pack={presentation}
          opening={displayedOpening}
          waiting={actions.busy}
          error={actionArea === "pack" ? actions.error : undefined}
          actions={openingActions}
          onClose={(choose) => void closePresentation(choose)}
        />
      )}
    </>
  );
}
