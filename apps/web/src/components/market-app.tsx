"use client";
import { GrailRehearsal } from "./grail-rehearsal";
import { Select } from "./ui/select";
import { CardImage } from "./card-image";
import { CardValue } from "./card-value";
import { AddReward } from "./reward-checkout";
import { RewardClaimEntry } from "./position-rewards";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  ExternalLink,
  Gift,
  Layers3,
  Menu,
  PackageOpen,
  RefreshCw,
  Search,
  Trophy,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import {
  asksForSide,
  bookForSide,
  DEMO_REPLAY,
  DEMO_GRAIL_REPLAY,
  DEMO_REPLAY_CARD,
  cents,
  quoteDepth,
  units,
  money,
  matchingCards,
  outcomeRewardMarket,
  cardTeam,
  sportCategories,
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
import { CardAvailability } from "./card-availability";
import { hasListedCards } from "@/lib/card-availability";
import { UsdcAmount, UsdcIcon } from "./usdc-amount";
import { GrailCatalog } from "./grail-catalog";
import { Discovery } from "./discovery";
import { MarketSearch } from "./market-search";
import { LiveBadge } from "./live-badge";
import type { MarketStatusFilter } from "@collectible/domain";
import { PredictNavigation } from "./predict-navigation";
import { SlablineMark } from "./slabline-mark";
import { OutcomeDetail } from "./outcome-detail";
import { RewardTarget } from "./reward-target";
import { useMobileNavigation } from "@/lib/use-mobile-navigation";
import { useLiveBook } from "@/lib/use-live-book";
import { retainMarketSnapshot } from "@/lib/market-snapshot";
import { SnapshotStatus } from "./snapshot-status";
import { MarketArt } from "./market-art";
import { useNetwork } from "./network-settings";
import { MobileBackButton } from "./mobile-back-button";
import { LocalLimitOrder } from "./local-limit-order";
const DemoOrder = dynamic(
  () => import("./demo-controls").then((m) => m.DemoOrder),
  { ssr: false },
);
const DemoSellOrder = dynamic(
  () => import("./demo-sell-order").then((m) => m.DemoSellOrder),
  { ssr: false },
);
const PositionHoldings = dynamic(
  () => import("./demo-controls").then((m) => m.PositionHoldings),
  { ssr: false },
);
const MarketPositionStatus = dynamic(
  () => import("./demo-controls").then((m) => m.MarketPositionStatus),
  { ssr: false },
);
const DemoPortfolio = dynamic(
  () => import("./demo-controls").then((m) => m.DemoPortfolio),
  { ssr: false },
);
const PriceChart = dynamic(() => import("./price-chart"), {
  ssr: false,
  loading: () => <div className="chart-loading">Loading chart…</div>,
});
const AuthButton = dynamic(
  () => import("./auth-controls").then((m) => m.AuthButton),
  { ssr: false },
);
const AccountGate = dynamic(
  () => import("./account-gate").then((m) => m.AccountGate),
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
const ProfileSettings = dynamic(
  () => import("./profile-settings").then((m) => m.ProfileSettings),
  { ssr: false },
);
const PullPredict = dynamic(
  () => import("./pull-predict").then((m) => m.PullPredict),
  {
    loading: () => <p role="status">Loading Pull &amp; Predict…</p>,
  },
);
const navigation = [
  { label: "Markets", href: "/", icon: Compass },
  { label: "Rewards", href: "/rewards", icon: Gift },
  { label: "Portfolio", href: "/portfolio", icon: BarChart3 },
  { label: "Profile", href: "/profile", icon: UserRound },
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
  pullOpeningId,
  initialSide = "yes",
  initialTrade = "buy",
  initialOutcome = 0,
  initialSymbol,
  initialStake = "25",
  rehearsal,
}: {
  section?: string;
  selectedId?: string;
  pullOpeningId?: string;
  initialSide?: "yes" | "no";
  initialTrade?: "buy" | "sell";
  initialOutcome?: number;
  initialSymbol?: string;
  initialStake?: string;
  rehearsal?: "grail";
}) {
  const router = useRouter();
  const { network } = useNetwork();
  const replay = section === "demo";
  const pull = section === "pull-predict" || section === "pull-packs";
  const scenario = rehearsal === "grail" ? DEMO_GRAIL_REPLAY : DEMO_REPLAY;
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
  const navigationRef = useMobileNavigation(
    `${section}:${selectedId ?? ""}:${practice}`,
  );
  const [orders, setOrders] = useState<PracticeOrder[]>([]),
    [notice, setNotice] = useState("");
  const [marketStatus, setMarketStatus] =
    useState<MarketStatusFilter>("active");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const syncLocation = () => {
      const params = new URLSearchParams(window.location.search);
      setSearch(params.get("q") ?? "");
      setCategory(params.get("category") === "live" ? "Live" : "All markets");
      setMarketStatus("active");
    };
    syncLocation();
    window.addEventListener("popstate", syncLocation);
    return () => window.removeEventListener("popstate", syncLocation);
  }, []);
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(search.trim()),
      search.trim() ? 500 : 0,
    );
    return () => clearTimeout(timer);
  }, [search]);
  const marketQuery = api.markets.useQuery(
    { search: "", status: marketStatus },
    {
      refetchInterval: (q) => (q.state.data?.refreshing ? 2000 : 15000),
      structuralSharing: (previous, incoming) =>
        retainMarketSnapshot(
          previous as ProviderResult<Market[]> | undefined,
          incoming as ProviderResult<Market[]>,
        ),
      enabled: section === "markets" && !selectedId && !replay && !practice,
    },
  );
  const searchQuery = api.markets.useQuery(
    { search: debouncedSearch, status: marketStatus },
    {
      enabled:
        section === "markets" &&
        !selectedId &&
        !replay &&
        !practice &&
        !!debouncedSearch,
      staleTime: 30000,
    },
  );
  const rewardQuery = api.rewards.useQuery(undefined, {
    staleTime: 60000,
    enabled: replay || section === "rewards" || section === "markets",
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
  const detailView =
    replay || (section === "markets" && (!!selectedId || practice));
  const markets = practice ? [PRACTICE_MARKET] : (marketQuery.data?.data ?? []);
  const visible = markets.filter(
    (m) =>
      (category === "All markets" || m.category === category || practice) &&
      `${m.title} ${m.category}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = replay
    ? ({
        id: scenario.eventTicker,
        ticker: scenario.eventTicker,
        title: scenario.eventTitle,
        category: rehearsal ? "Business" : "Sports",
        subcategory: rehearsal ? "NVIDIA" : "Pro Basketball",
        status: "active",
        imageUrl: rehearsal ? (scenario.artwork[0]?.src ?? null) : null,
        description: rehearsal
          ? "NVIDIA prediction market"
          : "Recorded Gemini market replay",
        closesAt: null,
        children: [],
        contracts: [
          {
            symbol: scenario.book.symbol,
            label: scenario.label,
            status: "active",
            lastPrice: null,
            quantityIncrement: "1",
            priceIncrement: "0.01",
          },
        ],
      } satisfies Market)
    : practice
      ? PRACTICE_MARKET
      : selectedId
        ? (selectedQuery.data?.data ??
          flatten(markets).find(
            (m) => m.id === selectedId || m.ticker === selectedId,
          ))
        : visible[0];
  const cards = rewardQuery.data?.data.cards ?? [];
  const replayCard = rewardQuery.data?.data.replayCard ?? DEMO_REPLAY_CARD;
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
      className={`app-shell prediction-surface ${pull ? "pull-app" : ""}`}
      ref={navigationRef}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-main">
        <header className="exchange-header">
          <div className="exchange-header-main">
            <MobileBackButton />
            <Link href="/" className="exchange-brand">
              <SlablineMark />
              <span>Slabline</span>
            </Link>
            <span className="brand-divider" />
            <PredictNavigation pull={pull} />
            {detailView || section !== "markets" ? (
              <nav className="board-navigation" aria-label="Market navigation">
                <Link
                  href="/"
                  aria-current={section === "markets" ? "page" : undefined}
                >
                  Predictions
                </Link>
                {navigation
                  .slice(1)
                  .filter((item) => item.href !== "/profile")
                  .map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      aria-current={
                        section === label.toLowerCase() ? "page" : undefined
                      }
                    >
                      <Icon size={15} aria-hidden="true" />{" "}
                      {label === "Profile" ? (
                        <span className="sr-only">Profile</span>
                      ) : (
                        label
                      )}
                    </Link>
                  ))}
              </nav>
            ) : (
              <MarketSearch
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setCategory("All markets");
                }}
                markets={
                  debouncedSearch && searchQuery.data
                    ? searchQuery.data.data
                    : markets
                }
                loading={
                  !!search.trim() &&
                  (search.trim() !== debouncedSearch || searchQuery.isFetching)
                }
                onSubmit={() => {
                  if (section !== "markets")
                    router.push(`/?q=${encodeURIComponent(search.trim())}`);
                  else {
                    setCategory("All markets");
                    setDebouncedSearch(search.trim());
                  }
                }}
              />
            )}
            <div className="topbar-actions">
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
          {!pull && (
            <nav
              className={`exchange-navigation ${detailView || section !== "markets" ? "board-secondary" : ""} ${menuOpen ? "menu-expanded" : ""}`}
              aria-label="Main navigation"
            >
              <Link
                href="/"
                onClick={() => {
                  setCategory("All markets");
                  setMarketStatus("active");
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
              <Link href="/pull-predict" className="pull-nav-entry">
                <PackageOpen size={16} aria-hidden="true" /> Pull &amp; Predict
              </Link>
              <Link
                href="/?category=live"
                className={
                  section === "markets" && category === "Live" ? "active" : ""
                }
                onClick={() => {
                  setCategory("Live");
                  setMarketStatus("active");
                  setSearch("");
                  setPractice(false);
                }}
              >
                <LiveBadge />
              </Link>
              {[...new Set(markets.map((m) => m.category))]
                .filter((c) => c !== "Live")
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
              <div className="account-navigation">
                {navigation
                  .slice(1)
                  .filter((item) => item.href !== "/profile")
                  .map((n) => (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={
                        section === n.label.toLowerCase() ? "active" : ""
                      }
                    >
                      <n.icon size={15} aria-hidden="true" />{" "}
                      {n.label === "Profile" ? (
                        <span className="sr-only">Profile</span>
                      ) : (
                        n.label
                      )}
                    </Link>
                  ))}
              </div>
            </nav>
          )}
        </header>
        <main
          id="main"
          className={section === "portfolio" ? "portfolio-page" : undefined}
        >
          {section !== "markets" && !replay && !pull ? (
            <div
              className={`page-heading${section === "profile" ? " profile-page-heading" : ""}`}
            >
              <div>
                <h1>
                  {section === "rewards"
                    ? "Collectible rewards"
                    : section === "cart"
                      ? "Your cart"
                      : section === "profile"
                        ? "Profile"
                        : section === "portfolio"
                          ? "Portfolio"
                          : "Physical redemption"}
                </h1>
              </div>
              {section === "profile" && status.data?.privyConfigured && (
                <AuthButton />
              )}
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
          {pull ? (
            <PullPredict
              configured={status.data?.privyConfigured}
              view={section === "pull-packs" ? "packs" : "shop"}
              openingId={pullOpeningId}
            />
          ) : section === "markets" || replay ? (
            <>
              {!selectedId && !practice && !replay ? (
                <Discovery
                  status={marketStatus}
                  setStatus={setMarketStatus}
                  onPractice={() => setPractice(true)}
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
                  cards={
                    rewardQuery.data?.stale ||
                    rewardQuery.data?.source === "fixture"
                      ? []
                      : cards
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
                      : marketQuery.data?.error
                  }
                  retry={() => {
                    void marketQuery.refetch();
                    if (debouncedSearch) void searchQuery.refetch();
                  }}
                />
              ) : (
                <>
                  {practice && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPractice(false)}
                    >
                      Exit practice
                    </Button>
                  )}
                  {!practice && <SnapshotStatus result={selectedQuery.data} />}
                  <div className="exchange-grid">
                    {selected ? (
                      <MarketDetail
                        key={[
                          selected.id,
                          initialSymbol,
                          initialOutcome,
                          initialSide,
                          initialTrade,
                        ].join(":")}
                        market={selected}
                        practice={practice}
                        replay={replay}
                        rehearsal={rehearsal}
                        cards={
                          replay
                            ? [
                                replayCard,
                                ...cards.filter(
                                  (c) => c.mint !== DEMO_REPLAY_CARD.mint,
                                ),
                              ]
                            : cards
                        }
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
                        initialTrade={initialTrade}
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
              {status.data?.privyConfigured && <RewardClaimEntry />}
              <RewardCatalog
                cards={cards}
                tokens={tokens}
                loading={rewardQuery.isLoading}
                error={rewardQuery.data?.error}
                retry={() => void rewardQuery.refetch()}
              />
            </>
          ) : section === "portfolio" || section === "profile" ? (
            status.data?.privyConfigured ? (
              <AccountGate>
                {section === "portfolio" ? (
                  <>
                    {network === "devnet" ? (
                      <DemoPortfolio />
                    ) : (
                      <>
                        <PrivateAccount />
                        <WalletCollection embedded />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <ProfileSettings />
                  </>
                )}
              </AccountGate>
            ) : (
              <div className="account-login" role="status">
                {status.isPending
                  ? "Loading…"
                  : "Login is temporarily unavailable."}
              </div>
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
            <span className="footer-brand">
              <SlablineMark height={20} />
              Slabline
            </span>
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
    <AuthButton header />
  ) : (
    <Button size="sm" variant="outline" asChild>
      <Link href="/profile">
        <UserRound size={15} />
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
  replay = false,
  rehearsal,
  cards,
  tokens,
  onSimulate,
  initialSide,
  initialTrade,
  initialOutcome,
  initialSymbol,
  initialStake,
  rewardsLoading,
  rewardsError,
}: {
  market: Market;
  practice: boolean;
  replay?: boolean;
  rehearsal?: "grail";
  cards: Listing[];
  tokens: GrailToken[];
  onSimulate: (o: Omit<PracticeOrder, "id" | "createdAt">) => void;
  initialSide: "yes" | "no";
  initialTrade: "buy" | "sell";
  initialOutcome: number;
  initialSymbol?: string;
  initialStake: string;
  rewardsLoading: boolean;
  rewardsError: string | null;
}) {
  const { network } = useNetwork();
  const contracts = useMemo(() => marketOutcomes(market), [market]);
  const [selectedSymbol, setSelectedSymbol] = useState(
      initialSymbol ?? contracts[initialOutcome]?.symbol,
    ),
    [expanded, setExpanded] = useState(false),
    [expandedSymbol, setExpandedSymbol] = useState<string | null>(null),
    [side, setSide] = useState<"yes" | "no">(initialSide),
    [tradeMode, setTradeMode] = useState<"buy" | "sell">(initialTrade),
    [orderType, setOrderType] = useState<"market" | "limit">("market"),
    [stake, setStake] = useState(initialStake),
    [stakeRevision, setStakeRevision] = useState(0),
    [range, setRange] = useState<ChartRange>("ALL"),
    [review, setReview] = useState(false);
  const contract = contracts.find((c) => c.symbol === selectedSymbol);
  const symbol = contract?.symbol;
  const [explicitTarget, setExplicitTarget] = useState<{
    symbol: string;
    side: string;
    mint: string;
  } | null>(null);
  const live = useLiveBook(replay ? undefined : symbol, practice);
  const { book, latestTrade, stale } = replay
    ? {
        book: rehearsal === "grail" ? DEMO_GRAIL_REPLAY.book : DEMO_REPLAY.book,
        latestTrade: null,
        stale: false,
      }
    : live;
  const livePrice = (s: "yes" | "no") =>
    !book || stale ? null : (asksForSide(book, s)[0]?.price ?? null);
  const ticketPrice = (s: "yes" | "no") =>
    tradeMode === "buy"
      ? livePrice(s)
      : !book || stale
        ? null
        : (bookForSide(book, s).bids[0]?.price ?? null);
  const charted = contracts.slice(0, 3);
  if (contract && !charted.some((c) => c.symbol === symbol))
    charted.splice(2, 1, contract);
  function selectOutcome(id: string, nextSide: "yes" | "no") {
    setSelectedSymbol(id);
    setSide(nextSide);
    setReview(false);
    if (!practice && !replay) {
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

  const renderRewards = (heldShares = "0") =>
    rehearsal === "grail" ? (
      <GrailRehearsal
        payout={
          quote && tradeMode === "buy" && orderType === "market"
            ? money(units(heldShares) + units(quote.totalPayout))
            : units(heldShares) > 0n
              ? heldShares
              : null
        }
        side={side}
      />
    ) : (
      <RewardTarget
        heldShares={heldShares}
        onTargetSelect={(mint) =>
          symbol && setExplicitTarget({ symbol, side, mint })
        }
        key={`${symbol}:${side}`}
        stake={stake}
        stakeRevision={stakeRevision}
        replay={replay}
        loading={rewardsLoading}
        error={rewardsError}
        cards={possibleMatches}
        tokens={possibleTokens}
        market={rewardMarket}
        book={book}
        side={side}
        stale={stale}
        payout={
          quote && tradeMode === "buy" && orderType === "market"
            ? money(units(heldShares) + units(quote.totalPayout))
            : units(heldShares) > 0n
              ? heldShares
              : null
        }
        onStake={(value) => {
          setTradeMode("buy");
          setOrderType("market");
          setStake(String(Number(value)));
          setReview(false);
        }}
      />
    );

  return (
    <>
      <section className="market-detail panel">
        <div className="event-identity">
          <MarketArt market={market} />
          <div>
            <h1>{market.title}</h1>
          </div>
        </div>
        {rehearsal === "grail" ? (
          <div className="practice-chart">
            <h2>NVIDIA prediction. Jensen reward.</h2>
            <p>
              No Jensen Huang slab was listed in the catalog check. A winning
              prediction goes to JENSEN on Grail.
            </p>
          </div>
        ) : practice ? (
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
            availability={
              <CardAvailability
                available={
                  !rewardsLoading &&
                  !rewardsError &&
                  hasListedCards(market, cards)
                }
              />
            }
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
                  <strong>
                    {c.label}{" "}
                    <CardAvailability
                      available={
                        !rewardsLoading &&
                        !rewardsError &&
                        hasListedCards(market, cards, c)
                      }
                    />
                  </strong>
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
      <div className="prediction-panels">
        <aside className="order-ticket panel" id="prediction-ticket">
          <h2 className="prediction-title">
            The prediction{" "}
            {replay ? (
              <span>
                {rehearsal ? "Illustrative depth" : "Replay · recorded book"}
              </span>
            ) : network === "mainnet" ? (
              <span>Estimate</span>
            ) : null}
          </h2>
          <p className="ticket-event">{market.title}</p>
          <label className="ticket-outcome">
            {contract && <MarketArt market={market} outcome={contract} />}
            <Select
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
            </Select>
          </label>
          <div className="trade-controls">
            <div
              className="trade-mode-tabs"
              role="group"
              aria-label="Trade direction"
            >
              {(["buy", "sell"] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  aria-pressed={tradeMode === mode}
                  onClick={() => {
                    setTradeMode(mode);
                    setReview(false);
                  }}
                >
                  {mode === "buy" ? "Buy" : "Sell"}
                </button>
              ))}
            </div>
            <Select
              aria-label="Order type"
              value={orderType}
              onChange={(event) => {
                setOrderType(event.target.value as "market" | "limit");
                setReview(false);
              }}
            >
              <option value="market">Market</option>
              <option value="limit">Limit</option>
            </Select>
          </div>
          <div className="side-toggle">
            {(["yes", "no"] as const).map((s) => (
              <button
                key={s}
                aria-pressed={s === side}
                className={s + (s === side ? " selected" : "")}
                disabled={!contract}
                onClick={() => contract && selectOutcome(contract.symbol, s)}
              >
                {s === "yes" ? "Yes" : "No"} <b>{buyPercent(ticketPrice(s))}</b>
              </button>
            ))}
          </div>
          <p id="quote-note" className="sr-only">
            Estimates use available depth before fees. A losing prediction pays
            zero.
          </p>
          {orderType === "market" && !practice && (!book || stale) && (
            <p className="snapshot-status" role="status">
              {stale
                ? "Reconnecting to live odds…"
                : "Connecting to live odds…"}
            </p>
          )}
          {orderType === "limit" ? (
            symbol && contract ? (
              <LocalLimitOrder
                key={`${symbol}:${side}:${tradeMode}:${network}:${practice}`}
                symbol={symbol}
                label={contract.label}
                direction={tradeMode}
                side={side}
                practice={practice}
              />
            ) : (
              <p className="snapshot-status">
                Choose an outcome to place a local limit order.
              </p>
            )
          ) : tradeMode === "buy" ? (
            <>
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
              {!practice && process.env.NEXT_PUBLIC_PRIVY_APP_ID && symbol && (
                <DemoOrder
                  onFilled={() => {
                    setTradeMode("sell");
                    setStake("0");
                    setReview(false);
                  }}
                  targetMint={
                    explicitTarget?.symbol === symbol &&
                    explicitTarget.side === side
                      ? explicitTarget.mint
                      : undefined
                  }
                  eventTicker={market.ticker ?? market.id}
                  symbol={symbol}
                  side={side}
                  stake={String(Number(stake))}
                  shares={quote?.contracts ?? null}
                  replay={replay}
                  rehearsal={rehearsal}
                />
              )}
              {network === "mainnet" && (
                <p className="snapshot-status">
                  Gemini trading connection pending.
                </p>
              )}
              {practice && (
                <Button
                  className={`ticket-action trade-submit ${side}`}
                  disabled={!quote || units(quote.contracts) === 0n}
                  onClick={() => {
                    if (!review) {
                      setReview(true);
                      return;
                    }
                    if (quote) {
                      onSimulate({
                        symbol: symbol ?? "SIMULATED",
                        side,
                        stake,
                        contracts: quote.contracts,
                      });
                      setReview(false);
                    }
                  }}
                >
                  {review
                    ? "Confirm trade"
                    : `Buy ${side === "yes" ? "Yes" : "No"}`}
                </Button>
              )}
              {quote && (
                <div
                  className="execution-estimate"
                  aria-label="New order estimate"
                >
                  <div>
                    <span title="Weighted average across available orders, before fees">
                      Order average
                    </span>
                    <strong>
                      {cents(
                        quote?.averagePrice ?? null,
                        book?.priceIncrement,
                        true,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>
                      New shares
                      {quote?.exhausted && (
                        <small className="shares-limit">max available</small>
                      )}
                    </span>
                    <strong>
                      {quote
                        ? Number(quote.contracts).toLocaleString("en-US", {
                            maximumFractionDigits: 2,
                          })
                        : "—"}
                    </strong>
                  </div>
                </div>
              )}
            </>
          ) : !practice && process.env.NEXT_PUBLIC_PRIVY_APP_ID && symbol ? (
            <DemoSellOrder
              key={`${symbol}:${side}:${replay}:${rehearsal}:${network}`}
              symbol={symbol}
              side={side}
              replay={replay}
              rehearsal={rehearsal}
              book={book}
              stale={stale}
            />
          ) : (
            <div className="sell-order">
              <div className="sell-amount">
                <span>Shares</span>
                <strong>0</strong>
              </div>
              <Button className="ticket-action trade-sell-submit" disabled>
                No shares to sell
              </Button>
            </div>
          )}
          {!practice && process.env.NEXT_PUBLIC_PRIVY_APP_ID && symbol && (
            <MarketPositionStatus
              symbol={symbol}
              side={side}
              replay={replay}
              rehearsal={rehearsal}
            />
          )}
        </aside>
        {process.env.NEXT_PUBLIC_PRIVY_APP_ID && !practice ? (
          <PositionHoldings
            symbol={symbol}
            side={side}
            replay={replay}
            rehearsal={rehearsal}
          >
            {renderRewards}
          </PositionHoldings>
        ) : (
          renderRewards()
        )}
      </div>
    </>
  );
}

function CardTile({ card, eager = false }: { card: Listing; eager?: boolean }) {
  const { network } = useNetwork();
  const [back, setBack] = useState(false);
  const image = back ? card.backImage : card.frontImage;
  return (
    <article className="collectible-tile">
      <div className="card-image-well">
        <span className="grade-badge">
          {card.grader} {card.grade}
        </span>
        <CardImage
          src={image}
          eager={eager}
          alt={`${card.name}, ${back ? "back" : "front"}`}
        />
        {card.backImage ? (
          <button
            className="flip-card"
            onClick={() => {
              setBack(!back);
            }}
            aria-label={`Show ${back ? "front" : "back"} of ${card.name}`}
          >
            <RefreshCw size={14} />
          </button>
        ) : null}
      </div>
      <div className="card-information">
        <span className="card-category">
          {card.year} {card.category}
        </span>
        <h3>{card.name}</h3>
        {card.set ? <p>{card.set}</p> : null}
        {sportCategories.includes(card.category) && cardTeam(card) && (
          <p>Team on card: {cardTeam(card)}</p>
        )}
        <div className="card-price card-price-row">
          <div>
            <small className="listing-ask-label">Listing ask</small>
            <strong>{usd(card.ask)}</strong>
          </div>
          <CardValue valuation={card.valuation} ask={card.ask} />
        </div>
        {network === "devnet" && process.env.NEXT_PUBLIC_PRIVY_APP_ID && (
          <AddReward
            item={{
              source: "collectorcrypt",
              sourceId: card.mint,
              name: card.name,
              image: card.frontImage,
              cost: card.ask,
              valuation: card.valuation,
            }}
          />
        )}
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
      {cards.map((c, index) => (
        <CardTile card={c} eager={index < 2} key={c.mint} />
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
    sort: "fmv",
    team: "",
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
      <Select
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
      </Select>
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
              <Select
                value={filters.feature}
                onChange={(e) => update("feature", e.target.value)}
              >
                <option value="">All cards</option>
                <option value="autograph">Autographed</option>
                <option value="rookie">Rookie</option>
              </Select>
            </label>
            <label>
              <span>
                Min price <UsdcIcon />
              </span>
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
              <span>
                Max price <UsdcIcon />
              </span>
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
              <Select
                value={filters.sort}
                onChange={(e) => update("sort", e.target.value)}
              >
                <option value="fmv">Highest FMV</option>
                <option value="high">Highest listing price</option>
                <option value="low">Lowest listing price</option>
                <option value="name">Name A–Z</option>
              </Select>
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
          : `${source === "cards" ? visible.length : visibleTokens.length} ${source === "cards" ? "cards" : "tokens"}${source === "cards" && filters.sort === "fmv" ? " · Highest FMV first" : ""}`}
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
