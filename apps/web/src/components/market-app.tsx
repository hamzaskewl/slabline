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
  ShieldCheck,
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
const ConnectedWalletPanel = dynamic(
  () => import("./auth-controls").then((m) => m.ConnectedWalletPanel),
  { ssr: false },
);
const RelayFunding = dynamic(() => import("./relay-funding"), { ssr: false });
const navigation = [
  { label: "Markets", href: "/", icon: Compass },
  { label: "Rewards", href: "/rewards", icon: Gift },
  { label: "Portfolio", href: "/portfolio", icon: BarChart3 },
  { label: "Wallet", href: "/wallet", icon: Wallet },
  { label: "Collection", href: "/collection", icon: Layers3 },
];
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
}: {
  section?: string;
  selectedId?: string;
  initialSide?: "yes" | "no";
  initialOutcome?: number;
  initialSymbol?: string;
  initialStake?: string;
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
    [practice, setPractice] = useState(false),
    [menuOpen, setMenuOpen] = useState(false);
  const [orders, setOrders] = useState<PracticeOrder[]>([]),
    [notice, setNotice] = useState("");
  const marketQuery = api.markets.useQuery(
    { search: "" },
    {
      refetchInterval: (q) => (q.state.data?.refreshing ? 2000 : 15000),
      structuralSharing: (previous, incoming) =>
        retainMarketSnapshot(
          previous as ProviderResult<Market[]> | undefined,
          incoming as ProviderResult<Market[]>,
        ),
      enabled: section === "markets" && !selectedId && !practice,
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
      localStorage.removeItem("cm-practice-v1");
    }
  }, []);
  const detailView = section === "markets" && (!!selectedId || practice);
  const markets = practice ? [PRACTICE_MARKET] : (marketQuery.data?.data ?? []);
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
  const cards = rewardQuery.data?.data.cards ?? [];
  const tokens = rewardQuery.data?.data.tokens ?? [];
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
    localStorage.setItem("cm-practice-v1", JSON.stringify(updated));
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
              <label className="global-search">
                <Search size={18} />
                <input
                  aria-label="Search markets"
                  placeholder="Search markets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            )}
            <div className="topbar-actions">
              <span className="mode-badge">SIMULATED</span>
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
              className={
                section === "markets" && category === "All markets"
                  ? "active"
                  : ""
              }
            >
              <Zap size={14} /> Trending
            </Link>
            {[...new Set(markets.map((m) => m.category))]
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
            <button
              className="practice-link"
              onClick={() => {
                setPractice(!practice);
                setCategory("All markets");
                setSearch("");
              }}
            >
              {practice ? "Live catalog" : "Practice"} <ChevronDown size={12} />
            </button>
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
          {practice ? (
            <div className="mode-strip">
              <ShieldCheck size={16} />
              <span>
                {practice
                  ? "SIMULATED fixture. No real event, order, settlement or funds."
                  : "Public provider data. Live financial actions are disabled."}
              </span>
              <Link href="/wallet">
                Connection status <ArrowRight size={14} />
              </Link>
            </div>
          ) : null}
          {section === "markets" ? (
            <>
              {!selectedId && !practice ? (
                <Discovery
                  onPractice={() => setPractice(true)}
                  search={search}
                  setSearch={setSearch}
                  markets={markets}
                  category={category}
                  setCategory={setCategory}
                  loading={
                    marketQuery.isLoading ||
                    (!!marketQuery.data?.refreshing && !markets.length)
                  }
                  snapshot={practice ? undefined : marketQuery.data}
                  error={marketQuery.data?.error}
                  retry={() => void marketQuery.refetch()}
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
                        onClick={() => setPractice(false)}
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
                        cards={cards}
                        tokens={tokens}
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
                          onClick={() => setPractice(true)}
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
                loading={rewardQuery.isLoading}
                error={rewardQuery.data?.error}
                retry={() => void rewardQuery.refetch()}
              />
            </>
          ) : section === "portfolio" ? (
            <>
              {status.data?.privyConfigured ? <PrivateAccount /> : null}
              <div className="account-empty panel">
                <BarChart3 size={35} />
                <h2>Connect Gemini</h2>
                <p>Gemini account connection is awaiting approval.</p>
                <Button disabled>Gemini OAuth approval required</Button>
              </div>
              <div className="section-heading">
                <div>
                  <h2>Practice positions</h2>
                  <p>
                    SIMULATED · Stored on this device · No provider orders or
                    settlement
                  </p>
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
                <Empty
                  title="No practice positions yet"
                  detail="Choose the practice market to try a simulated fill."
                />
              )}
            </>
          ) : section === "wallet" ? (
            <>
              <div className="mobile-wallet-actions">
                {status.data?.privyConfigured && <AuthButton />}
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
              <WalletView network={status.data?.solanaNetwork ?? "devnet"} />
              {status.data?.privyConfigured ? <ConnectedWalletPanel /> : null}
              {status.data?.privyConfigured ? <RelayFunding /> : null}
            </>
          ) : section === "collection" ? (
            <div className="account-empty panel">
              <Layers3 size={36} />
              <h2>No collectibles yet</h2>

              <Link href="/rewards" className="text-link">
                Browse the catalog <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <div className="redeem-flow panel">
              <h2>Physical redemption</h2>
              <p>
                Physical redemption is separate from owning a Solana asset.
                Collector Crypt manages its vault, shipping eligibility and
                delivery.
              </p>
              <ol>
                <li>Verify the collectible is in your wallet.</li>
                <li>
                  Open the provider and review redemption fees and delivery
                  options.
                </li>
                <li>
                  Authorize redemption with the provider. Track shipping there.
                </li>
              </ol>
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
            <span>Collectible Markets</span>
            <Link href="/about">About &amp; credits</Link>
          </footer>
        </main>
        <nav
          className="phone-tabs"
          aria-label="App navigation"
          onContextMenu={(e) => e.preventDefault()}
        >
          {navigation.map(({ label, href, icon: Icon }) => (
            <button
              key={href}
              type="button"
              aria-current={
                section === label.toLowerCase() ? "page" : undefined
              }
              onClick={() => {
                if (href === "/" && !selectedId && section === "markets") {
                  setPractice(false);
                  setSearch("");
                  setCategory("All markets");
                  window.scrollTo({ top: 0 });
                } else router.push(href);
              }}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
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
      <span className="subtle">Fetching public provider data…</span>
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
      <section className="market-detail panel">
        <div className="event-identity">
          {market.imageUrl ? (
            <img src={market.imageUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            <div className="event-fallback">
              <Layers3 size={28} />
            </div>
          )}
          <div>
            <h1>{market.title}</h1>
          </div>
        </div>
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
                  <i style={{ background: c.color }} />
                  {c.imageUrl && (
                    <img
                      src={c.imageUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  )}
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
          <p className="subtle break-all">{symbol}</p>
          <a
            href="https://exchange.gemini.com/predictions"
            target="_blank"
            rel="noreferrer"
          >
            Review on Gemini <ExternalLink size={12} />
          </a>
        </details>
      </section>
      <div className="prediction-panels">
        <aside className="order-ticket panel" id="prediction-ticket">
          <h2 className="prediction-title">
            The prediction{" "}
            <span title="Live trading is disabled">Estimate</span>
          </h2>
          <p className="ticket-event">{market.title}</p>
          <label className="ticket-outcome">
            <i style={{ background: contract?.color }} />
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
          <p id="quote-note" className="sr-only">
            Estimates use available depth before fees. A losing prediction pays
            zero. Live trading is disabled.
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
          cards={possibleMatches}
          tokens={possibleTokens}
          market={rewardMarket}
          book={book}
          side={side}
          stale={stale}
          payout={quote?.totalPayout ?? null}
          onStake={(value) => {
            setStake(value.replace(/0+$/, "").replace(/\.$/, ""));
            setReview(false);
          }}
        />
      </div>
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
        <div className="card-price">
          <div>
            <small>Listing ask · USDC</small>
            <strong>{usd(card.ask)}</strong>
          </div>
        </div>
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
}: {
  cards: Listing[];
  tokens: GrailToken[];
  loading: boolean;
  error?: string | null;
  retry: () => void;
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
  };
  const [filters, setFilters] = useState<RewardFilters>(defaults);
  const [source, setSource] = useState<"cards" | "tokens">("cards");
  const [limit, setLimit] = useState(24);
  const update = (key: keyof RewardFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setLimit(24);
  };
  const visible = filterCards(cards, filters);
  const visibleTokens = tokens.filter((t) =>
    `${t.name} ${t.symbol} ${t.tags.join(" ")}`
      .toLowerCase()
      .includes(filters.search.toLowerCase()),
  );
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
      <div className="reward-toolbar">
        <div className="category-tabs" aria-label="Reward type">
          <button
            className={source === "cards" ? "selected" : ""}
            onClick={() => {
              setSource("cards");
              setLimit(24);
            }}
          >
            Cards <span>{cards.length}</span>
          </button>
          <button
            className={source === "tokens" ? "selected" : ""}
            onClick={() => {
              setSource("tokens");
              setLimit(24);
            }}
          >
            Grail tokens <span>{tokens.length}</span>
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
              [...new Set(cards.map((c) => c.category))].sort(),
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
          : `${source === "cards" ? visible.length : visibleTokens.length} ${source === "cards" ? "cards" : "tokens"}`}
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
          <p className="token-catalog-note">
            Fractional collectible tokens. View prices and redemption options on
            Grail.
          </p>
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
function WalletView({ network }: { network: string }) {
  return (
    <>
      <div className="balance-grid">
        <section className="panel balance-panel">
          <span>Gemini account</span>
          <h2>USD</h2>
          <strong>Not connected</strong>

          <Button disabled variant="outline">
            OAuth app approval required
          </Button>
        </section>
        <section className="panel balance-panel">
          <span>Solana wallet · {network.toUpperCase()}</span>
          <h2>SOL / USDC</h2>
          <p>Balances appear with your connected wallet below.</p>
        </section>
      </div>
    </>
  );
}
