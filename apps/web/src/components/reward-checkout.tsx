"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConnectWallet } from "@privy-io/react-auth";
import { useWallets, useSignMessage } from "@privy-io/react-auth/solana";
import { X } from "lucide-react";
import {
  rewardAllocation,
  units,
  money,
  type DemoAccountView,
  type DemoPosition,
  type Valuation,
} from "@collectible/domain";
import { usePrivateRead } from "@/lib/use-private-read";
import { usd, usdc } from "@/lib/utils";
import { useDemoAction } from "./demo-controls";
import { Select } from "./ui/select";
import { Button } from "./ui/button";
import { CardImage } from "./card-image";
import { CardValue } from "./card-value";
import { RewardWalletFunding } from "./reward-wallet-funding";
export type RewardPick = {
  source: "collectorcrypt" | "grail";
  sourceId: string;
  reserveId?: string;
  name: string;
  image: string | null;
  cost: string;
  valuation?: Valuation | null;
};
const pickId = (item: RewardPick) =>
  `${item.source}:${item.sourceId}:${item.reserveId ?? ""}`;
const Context = createContext<{
  claiming: boolean;
  data?: DemoAccountView;
  position?: DemoPosition;
  picks: RewardPick[];
  toggle: (item: RewardPick) => void;
  clear: () => void;
} | null>(null);
export const useRewardSelection = () => useContext(Context);
export function RewardSelectionProvider({
  children,
  positionId,
  initialPosition,
}: {
  children: ReactNode;
  positionId?: string;
  initialPosition?: DemoPosition;
}) {
  const a = useDemoAction();
  const account = usePrivateRead<DemoAccountView>(
    "/api/demo",
    a.network === "devnet",
  );
  const [selection, setSelection] = useState<{
    owner?: string;
    positionId: string;
    picks: RewardPick[];
  }>({ positionId: "", picks: [] });
  const active = a.network === "devnet" && selection.owner === a.user?.id;
  const data = a.network === "devnet" ? account.data : undefined;
  const position = positionId
    ? (data?.positions.find((p) => p.id === positionId) ?? initialPosition)
    : (data?.positions.find(
        (p) => p.id === selection.positionId && p.reward?.state === "available",
      ) ?? data?.positions.find((p) => p.reward?.state === "available"));
  const picks =
    active && position?.id === selection.positionId ? selection.picks : [];
  return (
    <Context.Provider
      value={{
        claiming: !!positionId,
        data,
        position,
        picks,
        clear: () =>
          setSelection({
            owner: a.user?.id,
            positionId: position?.id ?? "",
            picks: [],
          }),
        toggle: (item) => {
          if (!position) return;
          const next = picks.some((p) => pickId(p) === pickId(item))
            ? picks.filter((p) => pickId(p) !== pickId(item))
            : [...picks, item];
          setSelection({
            owner: a.user?.id,
            positionId: position.id,
            picks: next,
          });
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function AddReward({ item }: { item: RewardPick }) {
  const c = useContext(Context);
  if (!c?.claiming || !c.position?.reward) return null;
  const selected = c.picks.some((p) => pickId(p) === pickId(item));
  const committed =
    c.data?.collectibles.filter(
      (card) =>
        card.rewardPositionId === c.position!.id && card.state !== "cancelled",
    ) ?? [];
  const total = [
    ...committed.map((p) => p.cost),
    ...c.picks.map((p) => p.cost),
  ].reduce((sum, cost) => sum + units(cost), 0n);
  const allocation = rewardAllocation(
    c.position.reward.budget,
    [money(total + units(item.cost))],
    money(committed.reduce((sum, card) => sum + units(card.topUp ?? "0"), 0n)),
  );
  const tooMuch = !selected && allocation.overBudget;
  const already = committed.some(
    (p) =>
      p.sourceId ===
      item.sourceId + (item.reserveId ? `:${item.reserveId}` : ""),
  );
  return (
    <button
      className="reward-browse-button"
      aria-pressed={selected}
      disabled={
        c.position.reward.state !== "available" ||
        tooMuch ||
        already ||
        (!selected && c.picks.length >= 20)
      }
      onClick={() => c.toggle(item)}
    >
      {already
        ? "Selected for this win"
        : selected
          ? "Remove from rewards"
          : tooMuch
            ? "Above 5% limit"
            : units(allocation.additionalTopUp) > 0n
              ? `Add · ${usdc(allocation.additionalTopUp)} from wallet`
              : "Add to rewards"}
    </button>
  );
}
export function RewardCheckout() {
  const c = useContext(Context),
    a = useDemoAction(),
    { connectWallet } = useConnectWallet(),
    { wallets } = useWallets(),
    { signMessage } = useSignMessage();
  const links = usePrivateRead<{ wallets: { address: string }[] }>(
    "/api/wallet/links",
    a.network === "devnet",
  );
  const [walletAddress, setWallet] = useState(""),
    [verified, setVerified] = useState(""),
    [complete, setComplete] = useState(false);
  const key = useRef(crypto.randomUUID());
  const wallet = wallets.find((w) => w.address === walletAddress) ?? wallets[0];
  const positionId = c?.position?.id;
  useEffect(() => {
    key.current = crypto.randomUUID();
    setVerified("");
  }, [positionId, a.user?.id, a.network]);
  useEffect(() => {
    setComplete(false);
  }, [a.user?.id, a.network]);
  if (
    a.network !== "devnet" ||
    !a.authenticated ||
    complete ||
    c?.position?.reward?.state !== "available"
  )
    return null;
  const { position, picks, data } = c,
    reward = position.reward!;
  const committed =
    data?.collectibles.filter(
      (card) =>
        card.rewardPositionId === position.id && card.state !== "cancelled",
    ) ?? [];
  const allocation = rewardAllocation(
    reward.budget,
    [...committed.map((p) => p.cost), ...picks.map((p) => p.cost)],
    money(committed.reduce((sum, card) => sum + units(card.topUp ?? "0"), 0n)),
  );
  const needsTopUp = units(allocation.additionalTopUp) > 0n;
  const approved =
    wallet &&
    (verified === `${a.user?.id}:${wallet.address}` ||
      links.data?.wallets.some((w) => w.address === wallet.address));
  return (
    <section
      className="reward-checkout embedded-checkout"
      aria-label="Select winning rewards"
    >
      <dl className="reward-budget-totals">
        <div>
          <dt>Cards selected</dt>
          <dd>{usd(allocation.total)}</dd>
        </div>
        <div>
          <dt>From your wallet</dt>
          <dd>
            {usdc(allocation.additionalTopUp)}
            <small>Up to {usdc(allocation.maxTopUp)} · 5%</small>
          </dd>
        </div>
        <div>
          <dt>Cash remainder</dt>
          <dd>
            {allocation.valid ? usd(allocation.remainder) : "—"}{" "}
            <small>
              {allocation.valid
                ? "demo credit"
                : "Select at least 80% in cards"}
            </small>
          </dd>
        </div>
      </dl>
      <p className="reward-range">
        Choose {usd(allocation.minimum)}–{usd(allocation.maximum)} in cards. Any
        amount above your reward comes from your wallet.
      </p>
      {picks.length > 0 && (
        <details className="reward-basket">
          <summary>
            {picks.length} {picks.length === 1 ? "card" : "cards"} selected ·
            Review
          </summary>
          <div className="reward-basket-items">
            {picks.map((p) => (
              <div className="reward-basket-row" key={pickId(p)}>
                <CardImage src={p.image} alt={p.name} />
                <div>
                  <strong>{p.name}</strong>
                  <CardValue valuation={p.valuation} />
                </div>
                <b>{usd(p.cost)}</b>
                <button
                  className="icon-button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => c.toggle(p)}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
      {needsTopUp && !data?.rewardTopUpEnabled && (
        <p role="status">
          Wallet top-ups are not available yet. You can still claim cards within
          your reward budget.
        </p>
      )}
      {needsTopUp && wallet && data?.rewardTopUpEnabled && (
        <RewardWalletFunding
          wallet={wallet.address}
          verified={!!approved}
          amount={allocation.additionalTopUp}
        />
      )}
      <div className="reward-checkout-actions">
        {wallet ? (
          <Select
            aria-label="Reward destination wallet"
            value={wallet.address}
            onChange={(e) => setWallet(e.target.value)}
          >
            {wallets.map((w) => (
              <option key={w.address} value={w.address}>
                {w.address.slice(0, 6)}…{w.address.slice(-4)}
              </option>
            ))}
          </Select>
        ) : (
          <Button
            variant="outline"
            onClick={() => connectWallet({ walletChainType: "solana-only" })}
          >
            Connect a wallet
          </Button>
        )}
        <Button
          disabled={
            a.busy ||
            !wallet ||
            !allocation.valid ||
            !picks.length ||
            (needsTopUp && !data?.rewardTopUpEnabled)
          }
          onClick={() =>
            void a.run(async () => {
              if (!wallet) return;
              if (!approved) {
                const proof = await a.request<{
                  nonce: string;
                  message: string;
                }>({ address: wallet.address }, "/api/wallet/challenge");
                const signed = await signMessage({
                  message: new TextEncoder().encode(proof.message),
                  wallet,
                });
                await a.request(
                  {
                    nonce: proof.nonce,
                    signature: btoa(String.fromCharCode(...signed.signature)),
                  },
                  "/api/wallet/verify",
                );
                setVerified(`${a.user?.id}:${wallet.address}`);
              }
              await a.request({
                action: "claim-reward",
                id: position.id,
                key: key.current,
                wallet: wallet.address,
                expectedTopUp: allocation.additionalTopUp,
                items: picks.map((p) => ({
                  source: p.source,
                  sourceId: p.sourceId,
                  reserveId: p.reserveId,
                  expectedCost: p.cost,
                })),
              });
              c.clear();
              setComplete(true);
            })
          }
        >
          {a.busy
            ? "Saving rewards…"
            : needsTopUp
              ? `Confirm · ${usdc(allocation.additionalTopUp)} extra`
              : "Confirm rewards"}
        </Button>
      </div>
      {a.error && <p role="alert">{a.error}</p>}
    </section>
  );
}
