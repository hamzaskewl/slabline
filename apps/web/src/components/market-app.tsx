"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  ExternalLink,
  Gift,
  Layers3,
  Menu,
  RefreshCw,
  Search,
  Trophy,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import {
  asksForSide,
  cents,
  quoteDepth,
  units,
  money,
  matchingCards,
  outcomeRewardMarket,
  cardTeam,
  sportCategories,
  tokenSport,
  matchingTokens,
  filterCards,
  type GrailToken,
  type RewardFilters,
  marketOutcomes,
  buyPercent,
  type ChartRange,
  type Listing,
  type Market,
  type ProviderResult,
} from "@collectible/domain";
import { PRACTICE_MARKET } from "@collectible/integrations/fixtures";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { usd } from "@/lib/utils";
import { GrailCatalog } from "./grail-catalog";
import { Discovery } from "./discovery";
import { OutcomeDetail } from "./outcome-detail";
import { RewardTarget } from "./reward-target";
import { useLiveBook } from "@/lib/use-live-book";
import { retainMarketSnapshot } from "@/lib/market-snapshot";
import { SnapshotStatus } from "./snapshot-status";
import { MarketArt } from "./market-art";
import { CardDetails } from "./card-details";
import { navigation, PhoneNavigation } from "./site-navigation";
import { useEligibleRewards } from "@/lib/use-eligible-rewards";
const PriceChart = dynamic(() => import("./price-chart"), {
  ssr: false,
  loading: () => <div className="chart-loading">Loading chart…</div>,
});
const AuthButton = dynamic(
  () => import("./auth-controls").then((m) => m.AuthButton),
  { ssr: false },
);
const PrivateAccount = dynamic(
  () => import("./private-account").then((m) => m.PrivateAccount),
  { ssr: false },
);
const WalletCollection = dynamic(
  () => import("./wallet-collection").then((m) => m.WalletCollection),
  { ssr: false },
);
const WalletOverview = dynamic(() => import("./wallet-overview"), {
  ssr: false,
});
type PracticeOrder = {
  id: string;
  symbol: string;
  side: string;
  stake: string;
  contracts: string;
  createdAt: string;
};
const flatten = (items: Market[]): Market[] =>
  items.flatMap((m) => [m, ...flatten(m.children)]);

export function MarketApp({
  section = "markets",
  selectedId,
  initialSide = "yes",
  initialOutcome = 0,
  initialSymbol,
  initialStake = "25",
  initialPractice = false,
}: {
  section?: string;
  selectedId?: string;
  initialSide?: "yes" | "no";
  initialOutcome?: number;
  initialSymbol?: string;
  initialStake?: string;
  initialPractice?: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch(() => {});
    }
  }, []);
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("All markets"),
    [practice, setPractice] = useState(initialPractice),
    [menuOpen, setMenuOpen] = useState(false);
  const [orders, setOrders] = useState<PracticeOrder[]>([]),
    [notice, setNotice] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    setSearch(new URLSearchParams(window.location.search).get("q") ?? "");
  }, []);
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(search.trim()),
      search.trim() ? 500 : 0,
    );
    return () => clearTimeout(timer);
  }, [search]);
  const marketQuery = api.markets.useQuery(
    { search: "" },
    {
      refetchInterval: (q) => (q.state.data?.refreshing ? 2000 : 15000),
      structuralSharing: (previous, incoming) =>
        retainMarketSnapshot(
          previous as ProviderResult<Market[]> | undefined,
          incoming as ProviderResult<Market[]>,
        ),
      enabled:
        (section === "markets" || section === "rewards") &&
        !selectedId &&
        !practice,
    },
  );
  const searchQuery = api.markets.useQuery(
    { search: debouncedSearch },
    {
      enabled:
        section === "markets" && !selectedId && !practice && !!debouncedSearch,
      staleTime: 30000,
    },
  );
  const rewardQuery = api.rewards.useQuery(undefined, {
    staleTime: 60000,
    enabled: section === "rewards" || (section === "markets" && !!selectedId),
    refetchInterval: 60000,
  });
  const status = api.status.useQuery();
  const selectedQuery = api.market.useQuery(
    { id: selectedId ?? "" },
    {
      enabled: !!selectedId && !practice,
      refetchInterval: (q) => (q.state.data?.refreshing ? 2000 : 15000),
      structuralSharing: (previous, incoming) =>
        retainMarketSnapshot(
          previous as ProviderResult<Market | null> | undefined,
          incoming as ProviderResult<Market | null>,
        ),
    },
  );
  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem("cm-practice-v1") ?? "[]");
      if (Array.isArray(o)) setOrders(o.slice(0, 50));
    } catch {
      // Browsers may deny storage entirely. Practice can still run in memory.
    }
  }, []);
  const detailView = section === "markets" && (!!selectedId || practice);
  const catalog = marketQuery.data?.data ?? [];
  const inventory = rewardQuery.data?.data;
  const markets = practice ? [PRACTICE_MARKET] : catalog;
  const visible = markets.filter(
    (m) =>
      (category === "All markets" || m.category === category || practice) &&
      `${m.title} ${m.category}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = practice
    ? PRACTICE_MARKET
    : selectedId
      ? (selectedQuery.data?.data ??
        flatten(markets).find(
          (m) => m.id === selectedId || m.ticker === selectedId,
        ))
      : visible[0];
  const eligibleRewards = useEligibleRewards(
    inventory,
    marketQuery.data?.data,
    section === "rewards",
  );
  const { cards, tokens } = eligibleRewards;
  const simulate = (order: Omit<PracticeOrder, "id" | "createdAt">) => {
    const updated = [
      {
        ...order,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      },
      ...orders,
    ].slice(0, 50);
    setOrders(updated);
    try {
      localStorage.setItem("cm-practice-v1", JSON.stringify(updated));
    } catch {
      setNotice(
        "Simulation complete. Browser storage is unavailable, so this position lasts for this visit only. No funds moved.",
      );
      return;
    }
    setNotice(
      "SIMULATED position saved on this device. No order was sent to Gemini.",
    );
  };
  return (
    <div
      className={
        section === "markets" ? "app-shell prediction-surface" : "app-shell"
      }
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-main">
        <header className="exchange-header">
          <div className="exchange-header-main">
            <Link href="/" className="exchange-brand">
              <Layers3 size={27} />
              <span>Collectible Markets</span>
            </Link>
            <span className="brand-divider" />
            <Link href="/" className="predict-link">
              Predict <ChevronDown size={13} />
            </Link>
            {detailView ? (
              <nav className="board-navigation" aria-label="Market navigation">
                <Link href="/" aria-current="page">
                  Predictions
                </Link>
                <Link href="/rewards">Rewards</Link>
                <Link href="/portfolio">Portfolio</Link>
                <Link href="/wallet">Wallet</Link>
              </nav>
            ) : (
              <form
                className="global-search"
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (section !== "markets")
                    router.push(`/?q=${encodeURIComponent(search.trim())}`);
                  else {
                    setCategory("All markets");
                    setDebouncedSearch(search.trim());
                  }
                }}
              >
                <Search size={18} />
                <input
                  aria-label="Search markets"
                  placeholder="Search markets..."
                  value={search}
                  maxLength={100}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCategory("All markets");
                  }}
                />
              </form>
            )}
            <div className="topbar-actions">
              <span className="mode-badge">
                {practice ? "PRACTICE" : "PREVIEW"}
              </span>
              <div className="header-account">
                <WalletEntry configured={!!status.data?.privyConfigured} />
              </div>
              <button
                className="icon-button mobile-menu"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="Toggle navigation"
              >
                <Menu size={21} />
              </button>
            </div>
          </div>
          <nav
            className={`exchange-navigation ${detailView ? "board-secondary" : ""} ${menuOpen ? "menu-expanded" : ""}`}
            aria-label="Main navigation"
          >
            <Link
              href="/"
              onClick={() => {
                setCategory("All markets");
                setSearch("");
                setPractice(false);
              }}
              className={
                section === "markets" && category === "All markets"
                  ? "active"
                  : ""
              }
            >
              <Zap size={14} /> All markets
            </Link>
            {[
              ...new Set(
                (section === "markets" ? markets : []).map((m) => m.category),
              ),
            ]
              .sort((a, b) =>
                a === "Sports" ? -1 : b === "Sports" ? 1 : a.localeCompare(b),
              )
              .map((c) => (
                <button
                  key={c}
                  className={
                    section === "markets" && category === c ? "active" : ""
                  }
                  onClick={() => {
                    setCategory(c);
                    if (section !== "markets") window.location.href = "/";
                  }}
                >
                  {c}
                </button>
              ))}
            <span className="navigation-divider" />
            {navigation.slice(1).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={section === n.label.toLowerCase() ? "active" : ""}
              >
                {n.label}
              </Link>
            ))}
            <Link className="practice-link" href={practice ? "/" : "/practice"}>
              {practice ? "Live catalog" : "Practice"} <ChevronDown size={12} />
            </Link>
          </nav>
        </header>
        <main id="main">
          {section !== "markets" ? (
            <div className="page-heading">
              <div>
                <h1>
                  {section === "rewards"
                    ? "Collectible rewards"
                    : section === "cart"
                      ? "Your cart"
                      : section === "wallet"
                        ? "Wallet"
                        : section === "portfolio"
                          ? "Portfolio"
                          : section === "collection"
                            ? "Collection"
                            : "Physical redemption"}
                </h1>
              </div>
              <Link href="/" className="text-link">
                Markets <ArrowUpRight size={16} />
              </Link>
            </div>
          ) : null}
          {notice ? (
            <div className="toast" role="status">
              <Check size={17} />
              {notice}
              <button
                className="icon-button"
                onClick={() => setNotice("")}
                aria-label="Dismiss notification"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          {section === "markets" ? (
            <>
              {!selectedId && !practice ? (
                <Discovery
                  onPractice={() => router.push("/practice")}
                  search={search}
                  query={debouncedSearch}
                  setSearch={(value) => {
                    setSearch(value);
                    setCategory("All markets");
                  }}
                  markets={
                    debouncedSearch
                      ? (searchQuery.data?.data ?? markets)
                      : markets
                  }
                  catalog={markets}
                  searching={
                    !!search.trim() &&
                    (search.trim() !== debouncedSearch ||
                      searchQuery.isFetching)
                  }
                  category={category}
                  setCategory={setCategory}
                  loading={
                    marketQuery.isLoading ||
                    (!!marketQuery.data?.refreshing && !markets.length)
                  }
                  snapshot={
                    debouncedSearch ? searchQuery.data : marketQuery.data
                  }
                  error={
                    search.trim()
                      ? (searchQuery.data?.error ??
                        (searchQuery.isError
                          ? "Search is unavailable. Please retry."
                          : null))
                      : (marketQuery.data?.error ??
                        (marketQuery.isError
                          ? "Catalog is unavailable. Please retry."
                          : null))
                  }
                  retry={() => {
                    void marketQuery.refetch();
                    if (debouncedSearch) void searchQuery.refetch();
                  }}
                />
              ) : (
                <>
                  <nav
                    className="detail-breadcrumb"
                    aria-label="Back to markets"
                  >
                    <Link href="/">
                      <ArrowLeft size={16} aria-hidden="true" />
                      All markets
                    </Link>
                    {practice ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push("/")}
                      >
                        Exit practice
                      </Button>
                    ) : null}
                  </nav>
                  {!practice && <SnapshotStatus result={selectedQuery.data} />}
                  <div className="exchange-grid">
                    {selected ? (
                      <MarketDetail
                        key={[
                          selected.id,
                          initialSymbol,
                          initialOutcome,
                          initialSide,
                        ].join(":")}
                        market={selected}
                        practice={practice}
                        cards={inventory?.cards ?? []}
                        tokens={inventory?.tokens ?? []}
                        rewardsLoading={rewardQuery.isLoading}
                        rewardsError={
                          rewardQuery.data?.error ??
                          (rewardQuery.isError
                            ? "Rewards are unavailable. Retrying shortly."
                            : null)
                        }
                        onSimulate={simulate}
                        initialStake={initialStake}
                        initialSide={initialSide}
                        initialOutcome={initialOutcome}
                        initialSymbol={practice ? undefined : initialSymbol}
                      />
                    ) : selectedId &&
                      (selectedQuery.isLoading ||
                        selectedQuery.data?.refreshing) &&
                      !practice ? (
                      <section className="panel no-market" role="status">
                        <RefreshCw className="spin" size={24} />
                        <h2>Loading market…</h2>
                        <p>Fetching Gemini’s public event and outcomes.</p>
                      </section>
                    ) : (
                      <section className="panel no-market">
                        <Compass size={30} />
                        <h2>Find your next market</h2>
                        <p>
                          Select a live event or open the clearly labeled
                          practice market.
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => router.push("/practice")}
                        >
                          Open practice market
                        </Button>
                      </section>
                    )}
                  </div>
                </>
              )}
            </>
          ) : section === "rewards" ? (
            <>
              <RewardCatalog
                cards={cards}
                tokens={tokens}
                matching={eligibleRewards.pending}
                loading={rewardQuery.isLoading || marketQuery.isLoading}
                error={
                  eligibleRewards.error ??
                  rewardQuery.data?.error ??
                  marketQuery.data?.error ??
                  (rewardQuery.isError || marketQuery.isError
                    ? "Catalog is unavailable. Please retry."
                    : null)
                }
                retry={() => {
                  void rewardQuery.refetch();
                  void marketQuery.refetch();
                }}
              />
            </>
          ) : section === "portfolio" ? (
            <>
              {status.data?.privyConfigured ? <PrivateAccount /> : null}
              <div className="section-heading">
                <div>
                  <h2>Practice positions</h2>
                </div>
              </div>
              {orders.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Contract</th>
                        <th>Side</th>
                        <th>Practice stake</th>
                        <th>Simulated quantity</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id}>
                          <td>{o.symbol}</td>
                          <td>{o.side.toUpperCase()}</td>
                          <td>{usd(o.stake)}</td>
                          <td>{o.contracts}</td>
                          <td>
                            <span className="mode-badge">SIMULATED</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="practice-empty">
                  <Empty
                    title="No practice positions yet"
                    detail="Choose the practice market to try a simulated fill."
                  />
                  <Button asChild>
                    <Link href="/practice">
                      Try a practice prediction <ArrowRight size={16} />
                    </Link>
                  </Button>
                </div>
              )}
            </>
          ) : section === "wallet" ? (
            <>
              {status.isPending ? (
                <p role="status">Loading account options…</p>
              ) : status.data?.privyConfigured ? (
                <WalletOverview />
              ) : (
                <Empty
                  title="Account connection unavailable"
                  detail="Account sign-in is not configured on this environment. You can still explore live markets and practice predictions."
                />
              )}
              <div className="wallet-install">
                <details className="install-help">
                  <summary>Add to Home Screen</summary>
                  <p>
                    On iPhone, open this site in Safari, tap Share, then Add to
                    Home Screen. Turn on Open as Web App if shown and tap Add.
                    In Chrome on Android, open the browser menu and select
                    Install app or Add to Home screen.
                  </p>
                </details>
              </div>
            </>
          ) : section === "collection" ? (
            status.isPending ? (
              <p role="status">Loading wallet connection…</p>
            ) : status.data?.privyConfigured ? (
              <WalletCollection />
            ) : (
              <Empty
                title="Wallet connection unavailable"
                detail="Please try again shortly."
              />
            )
          ) : (
            <div className="redeem-flow panel">
              <h2>Physical redemption</h2>
              <p>Choose shipping and delivery options on Collector Crypt.</p>
              <Button asChild>
                <a
                  href="https://collectorcrypt.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Collector Crypt <ExternalLink size={16} />
                </a>
              </Button>
            </div>
          )}
          <footer className="page-footer">
            <Link href="/about">About &amp; credits</Link>
          </footer>
        </main>
        <PhoneNavigation
          onMarkets={() => {
            if (!selectedId && section === "markets" && !initialPractice) {
              setSearch("");
              setCategory("All markets");
              window.scrollTo({ top: 0 });
            } else router.push("/");
          }}
        />
      </div>
    </div>
  );
}

function WalletEntry({ configured }: { configured: boolean }) {
  return configured ? (
    <AuthButton />
  ) : (
    <Button size="sm" variant="outline" asChild>
      <Link href="/wallet">
        <Wallet size={15} />
        Connect account
      </Link>
    </Button>
  );
}
function LoadingRows() {
  return (
    <div className="loading-rows" aria-busy="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <div className="skeleton" key={i} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
function Empty({
  title,
  detail,
  retry,
}: {
  title: string;
  detail: string;
  retry?: () => void;
}) {
  return (
    <div className="empty-state">
      <Layers3 size={25} />
      <h3>{title}</h3>
      <p>{detail}</p>
      {retry ? (
        <Button variant="outline" size="sm" onClick={retry}>
          <RefreshCw size={14} /> Retry
        </Button>
      ) : null}
    </div>
  );
}

function MarketDetail({
  market,
  practice,
  cards,
  tokens,
  onSimulate,
  initialSide,
  initialOutcome,
  initialSymbol,
  initialStake,
  rewardsLoading,
  rewardsError,
}: {
  market: Market;
  practice: boolean;
  cards: Listing[];
  tokens: GrailToken[];
  onSimulate: (o: Omit<PracticeOrder, "id" | "createdAt">) => void;
  initialSide: "yes" | "no";
  initialOutcome: number;
  initialSymbol?: string;
  initialStake: string;
  rewardsLoading: boolean;
  rewardsError: string | null;
}) {
  const contracts = useMemo(() => marketOutcomes(market), [market]);
  const [selectedSymbol, setSelectedSymbol] = useState(
      initialSymbol ?? contracts[initialOutcome]?.symbol,
    ),
    [expanded, setExpanded] = useState(false),
    [expandedSymbol, setExpandedSymbol] = useState<string | null>(null),
    [side, setSide] = useState<"yes" | "no">(initialSide),
    [stake, setStake] = useState(initialStake),
    [stakeRevision, setStakeRevision] = useState(0),
    [range, setRange] = useState<ChartRange>("ALL"),
    [review, setReview] = useState(false);
  const contract = contracts.find((c) => c.symbol === selectedSymbol);
  const symbol = contract?.symbol;
  const live = useLiveBook(symbol, practice);
  const { book, latestTrade, stale } = live;
  const livePrice = (s: "yes" | "no") =>
    !book || stale ? null : (asksForSide(book, s)[0]?.price ?? null);
  const charted = contracts.slice(0, 3);
  if (contract && !charted.some((c) => c.symbol === symbol))
    charted.splice(2, 1, contract);
  function selectOutcome(id: string, nextSide: "yes" | "no") {
    setSelectedSymbol(id);
    setSide(nextSide);
    setReview(false);
    if (!practice) {
      const url = new URL(window.location.href);
      url.searchParams.delete("outcome");
      url.searchParams.set("contract", id);
      url.searchParams.set("side", nextSide);
      window.history.replaceState(window.history.state, "", url);
    }
  }
  const quote = useMemo(() => {
    if (
      !book ||
      stale ||
      !/^\d+(\.\d{0,6})?$/.test(stake) ||
      Number(stake) <= 0 ||
      Number(stake) > 1000000
    )
      return null;
    try {
      return quoteDepth({
        stake,
        asks: asksForSide(book, side),
        quantityIncrement: book.quantityIncrement,
        priceIncrement: book.priceIncrement,
        quantityMinimum: book.quantityMinimum,
        priceMinimum: book.priceMinimum,
        quoteAssetPrecision: book.quoteAssetPrecision,
        feeBps: practice ? 100 : null,
      });
    } catch {
      return null;
    }
  }, [stake, book, side, stale, practice]);
  const rewardMarket = contract ? outcomeRewardMarket(market, contract) : null;
  const possibleMatches = rewardMarket
    ? matchingCards(rewardMarket, cards)
    : [];
  const possibleTokens = rewardMarket
    ? matchingTokens(rewardMarket, tokens)
    : [];

  return (
    <>
      <div className="detail-title">
        <div className="event-identity">
          <MarketArt market={market} />
          <div>
            <h1>{market.title}</h1>
          </div>
        </div>
        <nav className="detail-jumps" aria-label="Market sections">
          <a href="#prediction-ticket">Prediction &amp; reward</a>
          <a href="#market-activity">Chart &amp; outcomes</a>
        </nav>
      </div>
      <div className="prediction-panels">
        <aside className="order-ticket panel" id="prediction-ticket">
          <h2 className="prediction-title">
            The prediction{" "}
            <span title="Live trading is disabled">Estimate</span>
          </h2>
          <p className="ticket-event">{market.title}</p>
          <label className="ticket-outcome">
            {contract && <MarketArt market={market} outcome={contract} />}
            <select
              aria-label="Prediction outcome"
              value={symbol ?? ""}
              onChange={(e) => selectOutcome(e.target.value, side)}
            >
              {!contract && <option value="">Choose an outcome</option>}
              {contracts.map((c) => (
                <option key={c.symbol} value={c.symbol}>
                  {c.label}
                </option>
              ))}
            </select>
            <ChevronDown size={18} />
          </label>
          <div className="side-toggle">
            {(["yes", "no"] as const).map((s) => (
              <button
                key={s}
                aria-pressed={s === side}
                className={s + (s === side ? " selected" : "")}
                disabled={!contract}
                onClick={() => contract && selectOutcome(contract.symbol, s)}
              >
                {s === "yes" ? "Yes" : "No"} <b>{buyPercent(livePrice(s))}</b>
              </button>
            ))}
          </div>
          <p id="quote-note" className="ticket-explanation">
            {practice
              ? "Practice only. No funds move."
              : "Live prices. Estimates only; no order is placed."}{" "}
            Estimates are before fees. A losing prediction pays zero.
          </p>
          {!practice && (!book || stale) && (
            <p className="snapshot-status" role="status">
              {stale
                ? "Reconnecting to live odds…"
                : "Connecting to live odds…"}
            </p>
          )}
          <label className="stake-label" htmlFor="stake">
            Your stake <span>USD</span>
          </label>
          <div className="stake-input">
            <span>$</span>
            <input
              id="stake"
              inputMode="decimal"
              value={stake}
              onChange={(e) => {
                setStake(e.target.value);
                setStakeRevision((revision) => revision + 1);
                setReview(false);
              }}
              aria-describedby="quote-note"
            />
          </div>
          <div className="stake-presets">
            {[50, 100, 500].map((v) => (
              <button
                key={v}
                onClick={() => {
                  setStakeRevision((revision) => revision + 1);
                  setStake(
                    String(
                      Math.min(
                        1000000,
                        Math.round(((Number(stake) || 0) + v) * 100) / 100,
                      ),
                    ),
                  );
                  setReview(false);
                }}
              >
                +${v}
              </button>
            ))}
            <button
              disabled
              title="A verified spendable USD balance is required"
            >
              Max
            </button>
          </div>
          {practice ? (
            <>
              <Button
                className="ticket-action"
                disabled={!quote || units(quote.contracts) === 0n}
                onClick={() => setReview(true)}
              >
                Review simulated order <ArrowRight size={16} />
              </Button>
              {review && quote ? (
                <div className="review-box">
                  <strong>SIMULATED order review</strong>
                  <p>
                    {side.toUpperCase()} on {contract?.label} ·{" "}
                    {quote.contracts} contracts · {usd(quote.cost)} +{" "}
                    {usd(quote.fees ?? "0")} fixture fee. No funds move.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      onSimulate({
                        symbol: symbol ?? "SIMULATED",
                        side,
                        stake,
                        cost: quote.cost,
                        contracts: quote.contracts,
                      } as Omit<PracticeOrder, "id" | "createdAt">);
                      setReview(false);
                    }}
                  >
                    Confirm simulation
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
          <div className="execution-estimate" aria-label="Execution estimate">
            <div>
              <span title="Weighted average across available orders, before fees">
                Average price
              </span>
              <strong>
                {cents(quote?.averagePrice ?? null, book?.priceIncrement, true)}
              </strong>
            </div>
            <div>
              <span>
                Shares
                {quote?.exhausted && (
                  <small className="shares-limit">max available</small>
                )}
              </span>
              <strong>
                {quote
                  ? Number(quote.contracts).toLocaleString("en-US", {
                      maximumFractionDigits: 6,
                    })
                  : "—"}
              </strong>
            </div>
          </div>
        </aside>
        <RewardTarget
          key={`${symbol}:${side}`}
          stake={stake}
          stakeRevision={stakeRevision}
          loading={rewardsLoading}
          error={rewardsError}
          cards={possibleMatches}
          tokens={possibleTokens}
          market={rewardMarket}
          book={book}
          side={side}
          stale={stale}
          payout={quote?.totalPayout ?? null}
          onStake={(value) => {
            setStake(String(Number(value)));
            setReview(false);
          }}
        />
      </div>
      <section
        className="market-detail panel"
        id="market-activity"
        aria-label="Chart and market outcomes"
      >
        {practice ? (
          <div className="practice-chart">
            <BarChart3 size={35} />
            <strong>Simulated depth, real math.</strong>
            <span>
              Try a larger stake to see the estimate walk the order book.
            </span>
          </div>
        ) : (
          <PriceChart
            outcomes={charted}
            volume={market.volume}
            eventTime={market.startsAt ?? market.closesAt}
            latestTrade={latestTrade}
            range={range}
            onRangeChange={setRange}
          />
        )}
        <section className="outcomes-section" aria-label="Market outcomes">
          <h2>
            <span>Markets</span>
            <small>{contracts.length}</small>
          </h2>
          {(expanded ? contracts : contracts.slice(0, 10)).map((c) => (
            <div className="outcome-item" key={c.symbol}>
              <div className="outcome-row">
                <button
                  className="outcome-name outcome-expand"
                  aria-label={`${c.label} details`}
                  aria-expanded={expandedSymbol === c.symbol}
                  aria-controls={`outcome-${c.symbol}`}
                  onClick={() =>
                    setExpandedSymbol((current) =>
                      current === c.symbol ? null : c.symbol,
                    )
                  }
                >
                  <MarketArt market={market} outcome={c} />
                  <strong>{c.label}</strong>
                  <ChevronDown size={16} />
                </button>
                {(["yes", "no"] as const).map((s) => (
                  <button
                    key={s}
                    className={"board-side " + s}
                    aria-label={
                      s.toUpperCase() +
                      " " +
                      c.label +
                      " " +
                      buyPercent(
                        c.symbol === symbol
                          ? livePrice(s)
                          : s === "yes"
                            ? c.buyYes
                            : c.buyNo,
                      )
                    }
                    aria-pressed={c.symbol === symbol && side === s}
                    onClick={() => {
                      selectOutcome(c.symbol, s);
                      if (window.matchMedia("(max-width: 840px)").matches)
                        document
                          .getElementById("prediction-ticket")
                          ?.scrollIntoView({ block: "start" });
                    }}
                  >
                    {s === "yes" ? "Yes" : "No"}{" "}
                    <b>
                      {buyPercent(
                        c.symbol === symbol
                          ? livePrice(s)
                          : s === "yes"
                            ? c.buyYes
                            : c.buyNo,
                      )}
                    </b>
                  </button>
                ))}
              </div>
              {expandedSymbol === c.symbol && (
                <OutcomeDetail
                  id={`outcome-${c.symbol}`}
                  outcome={c}
                  practice={practice}
                  shared={live}
                />
              )}
            </div>
          ))}
          {contracts.length > 10 && (
            <button
              className="more-outcomes"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? "Show less"
                : "Show all " + contracts.length + " markets"}{" "}
              <ChevronDown size={15} />
            </button>
          )}
        </section>
        <details className="market-rules">
          <summary>Market details &amp; resolution</summary>
          <p>
            {market.description ||
              "See Gemini for full resolution terms and eligibility."}
          </p>
          {market.closesAt && (
            <p>Closes {new Date(market.closesAt).toLocaleString("en-US")}</p>
          )}
          <a
            href="https://exchange.gemini.com/predictions"
            target="_blank"
            rel="noreferrer"
          >
            Review on Gemini <ExternalLink size={12} />
          </a>
        </details>
      </section>
    </>
  );
}

function CardTile({ card }: { card: Listing }) {
  const [back, setBack] = useState(false),
    [failed, setFailed] = useState(false);
  const image = back ? card.backImage : card.frontImage;
  return (
    <article className="collectible-tile">
      <div className="card-image-well">
        <span className="grade-badge">
          {card.grader} {card.grade}
        </span>
        {image && !failed ? (
          <img
            src={image}
            alt={`${card.name}, ${back ? "back" : "front"} of actual slab`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="missing-image">
            <Layers3 size={29} />
            <span>Provider image unavailable</span>
          </div>
        )}
        {card.backImage ? (
          <button
            className="flip-card"
            onClick={() => {
              setBack(!back);
              setFailed(false);
            }}
            aria-label={`Show ${back ? "front" : "back"} of ${card.name}`}
          >
            <RefreshCw size={14} />
          </button>
        ) : null}
      </div>
      <div className="card-information">
        <span className="card-category">
          {card.year} {card.category} · {card.network}
        </span>
        <h3>{card.name}</h3>
        {card.set ? <p>{card.set}</p> : null}
        {sportCategories.includes(card.category) && (
          <p>Team on card: {cardTeam(card) ?? "Not verified"}</p>
        )}
        <div className="card-price">
          <div>
            <small>Listing ask · USDC</small>
            <strong>{usd(card.ask)}</strong>
          </div>
        </div>
        <CardDetails card={card} />
      </div>
    </article>
  );
}
function CatalogGrid({
  cards,
  loading,
  error,
  retry,
}: {
  cards: Listing[];
  loading: boolean;
  error?: string | null;
  retry?: () => void;
}) {
  return loading ? (
    <LoadingRows />
  ) : cards.length ? (
    <div className="collectible-grid">
      {cards.map((c) => (
        <CardTile card={c} key={c.mint} />
      ))}
    </div>
  ) : (
    <Empty
      title={error ? "Collector Crypt is unavailable" : "No matching cards"}
      detail={error ?? "Try a different search or reset your filters."}
      retry={retry}
    />
  );
}
function RewardCatalog({
  cards,
  tokens,
  loading,
  error,
  retry,
  matching,
}: {
  cards: Listing[];
  tokens: GrailToken[];
  loading: boolean;
  error?: string | null;
  retry: () => void;
  matching: boolean;
}) {
  const defaults: RewardFilters = {
    search: "",
    category: "",
    grader: "",
    grade: "",
    min: "",
    max: "",
    feature: "",
    sort: "high",
    team: "",
  };
  const [filters, setFilters] = useState<RewardFilters>(defaults);
  const [source, setSource] = useState<"cards" | "tokens">("cards");
  const [scope, setScope] = useState<"sports" | "all">("sports");
  const [limit, setLimit] = useState(24);
  const update = (key: keyof RewardFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setLimit(24);
  };
  const scopedCards =
    scope === "sports"
      ? cards.filter((card) => sportCategories.includes(card.category))
      : cards;
  const scopedTokens =
    scope === "sports" ? tokens.filter((token) => tokenSport(token)) : tokens;
  const visible = filterCards(scopedCards, filters);
  const visibleTokens = scopedTokens.filter((t) =>
    `${t.name} ${t.symbol} ${t.tags.join(" ")}`
      .toLowerCase()
      .includes(filters.search.toLowerCase()),
  );
  const resultCount =
    source === "cards" ? visible.length : visibleTokens.length;
  const select = (
    key: keyof RewardFilters,
    label: string,
    values: string[],
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={filters[key]}
        onChange={(e) => update(key, e.target.value)}
      >
        <option value="">All</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <div className="reward-scope" aria-label="Reward scope">
        {(["sports", "all"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={scope === value}
            disabled={value === "all" && matching}
            onClick={() => {
              setScope(value);
              setFilters(defaults);
              setLimit(24);
            }}
          >
            {value === "sports" ? "Sports" : "All eligible rewards"}
          </button>
        ))}
        <p>
          {matching
            ? "Matching other collectibles to active markets…"
            : "Other collectibles appear when they relate to an active market."}
        </p>
      </div>
      {error && (cards.length > 0 || tokens.length > 0) && (
        <p className="snapshot-status" role="status">
          Some rewards may be unavailable. {error}
        </p>
      )}
      <div className="reward-toolbar">
        <div className="category-tabs" aria-label="Reward type">
          <button
            className={source === "cards" ? "selected" : ""}
            aria-pressed={source === "cards"}
            onClick={() => {
              setSource("cards");
              setLimit(24);
            }}
          >
            Cards <span>{scopedCards.length}</span>
          </button>
          <button
            className={source === "tokens" ? "selected" : ""}
            aria-pressed={source === "tokens"}
            onClick={() => {
              setSource("tokens");
              setLimit(24);
            }}
          >
            Grail tokens <span>{scopedTokens.length}</span>
          </button>
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Search rewards"
            placeholder={
              source === "cards"
                ? "Search cards, players, sets"
                : "Search Grail tokens"
            }
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
          />
        </label>
      </div>
      {source === "cards" && (
        <details className="reward-filter-panel">
          <summary>Filters</summary>
          <div className="reward-filters">
            {select(
              "category",
              "Sport / category",
              [...new Set(scopedCards.map((c) => c.category))].sort(),
            )}
            {select(
              "team",
              "Team on card",
              [
                ...new Set(cards.map(cardTeam).filter((t): t is string => !!t)),
              ].sort(),
            )}
            {select(
              "grader",
              "Grader",
              [
                ...new Set(
                  cards.map((c) => c.grader).filter((g): g is string => !!g),
                ),
              ].sort(),
            )}
            {select(
              "grade",
              "Grade",
              [
                ...new Set(
                  cards.flatMap(
                    (c) => c.grade?.match(/\d+(?:\.\d+)?/)?.[0] ?? [],
                  ),
                ),
              ].sort((a, b) => Number(b) - Number(a)),
            )}
            <label>
              Card type
              <select
                value={filters.feature}
                onChange={(e) => update("feature", e.target.value)}
              >
                <option value="">All cards</option>
                <option value="autograph">Autographed</option>
                <option value="rookie">Rookie</option>
              </select>
            </label>
            <label>
              Min price · USDC
              <input
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="Any"
                value={filters.min}
                onChange={(e) => update("min", e.target.value)}
              />
            </label>
            <label>
              Max price · USDC
              <input
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="Any"
                value={filters.max}
                onChange={(e) => update("max", e.target.value)}
              />
            </label>
            <label>
              Sort by
              <select
                value={filters.sort}
                onChange={(e) => update("sort", e.target.value)}
              >
                <option value="high">Highest price</option>
                <option value="low">Lowest price</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
            <button
              className="filter-reset"
              onClick={() => {
                setFilters(defaults);
                setLimit(24);
              }}
            >
              Reset filters
            </button>
          </div>
        </details>
      )}
      <div className="reward-result-count" role="status">
        {loading
          ? "Loading rewards…"
          : `${resultCount} ${source === "cards" ? "card" : "token"}${resultCount === 1 ? "" : "s"}`}
      </div>
      {source === "cards" ? (
        <CatalogGrid
          cards={visible.slice(0, limit)}
          loading={loading}
          error={error}

          retry={retry}
        />
      ) : loading ? (
        <LoadingRows />
      ) : visibleTokens.length ? (
        <>
          <GrailCatalog tokens={visibleTokens.slice(0, limit)} />
        </>
      ) : (
        <Empty
          title="No matching tokens"
          detail={error ?? "Try a different search."}
          retry={retry}
        />
      )}
      {(source === "cards" ? visible.length : visibleTokens.length) > limit && (
        <Button
          className="reward-load-more"
          variant="outline"
          onClick={() => setLimit((l) => l + 24)}
        >
          Show more
        </Button>
      )}
    </>
  );
}
