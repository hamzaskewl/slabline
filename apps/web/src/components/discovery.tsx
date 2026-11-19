"use client";
import Link from "next/link";
import { Bookmark, ChevronDown, Radio, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buyPercent,
  eventVolume,
  isPlayerProp,
  marketMatches,
  marketStatusMatches,
  type MarketStatusFilter,
  sortMarkets,
  type Market,
  type MarketSort,
  type ProviderResult,
} from "@collectible/domain";
import { SnapshotStatus } from "./snapshot-status";
import { MarketArt } from "./market-art";
import { FeaturedMarkets } from "./featured-markets";
import { DiscoveryControls } from "./discovery-controls";

export function Discovery({
  markets,
  catalog,
  category,
  setCategory,
  loading,
  searching,
  error,
  retry,
  search,
  query,
  setSearch,
  onPractice,
  snapshot,
  status,
  setStatus,
}: {
  status: MarketStatusFilter;
  setStatus: (status: MarketStatusFilter) => void;
  markets: Market[];
  catalog: Market[];
  category: string;
  setCategory: (c: string) => void;
  loading: boolean;
  searching: boolean;
  error?: string | null;
  retry: () => void;
  search: string;
  query: string;
  setSearch: (value: string) => void;
  onPractice: () => void;
  snapshot?: ProviderResult<Market[]>;
}) {
  const [limit, setLimit] = useState(24);
  const [sort, setSort] = useState<MarketSort>("relevance");
  const [league, setLeague] = useState("");
  const [includeProps, setIncludeProps] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem("cm-favorites-v1") ?? "[]",
      );
      if (Array.isArray(saved))
        setFavorites(
          saved.filter((id): id is string => typeof id === "string"),
        );
    } catch {
      /* Browsing still works when local storage is unavailable. */
    }
  }, []);
  useEffect(
    () => setLimit(24),
    [search, category, league, sort, status, includeProps, favoritesOnly],
  );
  useEffect(() => {
    setLeague("");
    if (category === "All markets") {
      setFavoritesOnly(false);
      setIncludeProps(false);
    }
  }, [category]);
  useEffect(() => {
    setLeague("");
    setFavoritesOnly(false);
  }, [search]);
  const categories = [
    "All markets",
    ...new Set([...catalog, ...markets].map((m) => m.category).sort()),
  ];
  const leagues = [
    ...new Set(
      [...catalog, ...markets]
        .filter((m) => category === "All markets" || m.category === category)
        .flatMap((m) => (m.subcategory ? [m.subcategory] : [])),
    ),
  ].sort();
  const visible = useMemo(
    () =>
      sortMarkets(
        markets.filter(
          (m) =>
            (category === "All markets" || m.category === category) &&
            (!league || m.subcategory === league) &&
            marketMatches(m, query) &&
            marketStatusMatches(m, status) &&
            (includeProps || !!query || !isPlayerProp(m)) &&
            (!favoritesOnly || favorites.includes(m.id)),
        ),
        sort,
        query,
      ),
    [
      markets,
      status,
      category,
      league,
      query,
      includeProps,
      favoritesOnly,
      favorites,
      sort,
    ],
  );
  const changeCategory = (value: string) => {
    setCategory(value);
    setLeague("");
  };
  const clear = () => {
    setSearch("");
    setCategory("All markets");
    setLeague("");
    setFavoritesOnly(false);
    setIncludeProps(false);
    setSort("relevance");
    setStatus("active");
  };
  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id)
      ? favorites.filter((f) => f !== id)
      : [...favorites, id];
    setFavorites(next);
    try {
      localStorage.setItem("cm-favorites-v1", JSON.stringify(next));
      setSaveError("");
    } catch {
      setSaveError(
        "Favorites are saved for this visit only. Browser storage is unavailable.",
      );
    }
  };
  return (
    <div className="discovery-layout">
      <section className="discovery-content" aria-label="Browse markets">
        <nav className="phone-categories" aria-label="Market categories">
          {categories.map((c) => (
            <button
              key={c}
              aria-pressed={category === c}
              onClick={() => changeCategory(c)}
            >
              {c === "All markets" ? "All" : c}
            </button>
          ))}
          <button onClick={onPractice}>Practice</button>
        </nav>
        {!search.trim() &&
          category === "All markets" &&
          !league &&
          !favoritesOnly &&
          status === "active" && <FeaturedMarkets markets={catalog} />}
        <div className="discovery-heading">
          <h1>{search.trim() ? "Search results" : category}</h1>
          <label className="discovery-search">
            <Search size={17} />
            <input
              value={search}
              maxLength={100}
              onChange={(e) => {
                setSearch(e.target.value);
                setLeague("");
              }}
              placeholder="Search markets"
              aria-label="Search market catalog"
            />
            {search && (
              <button
                className="icon-button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <X size={16} />
              </button>
            )}
          </label>
          <DiscoveryControls
            hasLiquidity={markets.some(
              (m) => m.liquidity != null && /^\d+(?:\.\d+)?$/.test(m.liquidity),
            )}
            status={status}
            setStatus={setStatus}
            sort={sort}
            setSort={setSort}
            category={category}
            setCategory={changeCategory}
            categories={categories}
            league={league}
            setLeague={setLeague}
            leagues={leagues}
            includeProps={includeProps}
            setIncludeProps={setIncludeProps}
            favoritesOnly={favoritesOnly}
            setFavoritesOnly={setFavoritesOnly}
            searching={searching}
            search={search}
            retry={retry}
            reset={() => {
              setLeague("");
              setIncludeProps(false);
              setFavoritesOnly(false);
            }}
          />
        </div>
        <div className="discovery-summary" role="status" aria-live="polite">
          {searching ? (
            <span>Searching Gemini…</span>
          ) : loading && !markets.length ? (
            <span>Loading markets…</span>
          ) : (
            <strong>
              {visible.length.toLocaleString()}{" "}
              {visible.length === 1 ? "market" : "markets"}
              {query ? ` for “${query}”` : ""}
            </strong>
          )}
          {(search.trim() ||
            category !== "All markets" ||
            league ||
            favoritesOnly ||
            status !== "active" ||
            includeProps ||
            sort !== "relevance") && (
            <button onClick={clear}>
              Clear filters <X size={15} />
            </button>
          )}
        </div>
        <SnapshotStatus result={snapshot} />
        {saveError && (
          <p role="status" className="discovery-message">
            {saveError}
          </p>
        )}
        {error && markets.length > 0 && (
          <p role="alert" className="discovery-message">
            {error} <button onClick={retry}>Retry</button>
          </p>
        )}
        {loading && !markets.length ? (
          <div className="prediction-grid" aria-busy="true">
            {Array.from({ length: 9 }, (_, i) => (
              <div className="market-skeleton" key={i} />
            ))}
          </div>
        ) : error && !markets.length ? (
          <div className="empty-state">
            <Radio size={28} />
            <h2>{search ? "Search unavailable" : "Market feed unavailable"}</h2>
            <p>{error}</p>
            <button className="button button-outline" onClick={retry}>
              Retry connection
            </button>
          </div>
        ) : !visible.length ? (
          <div className="empty-state">
            <Search size={28} />
            <h2>{searching ? "Searching markets…" : "No matching markets"}</h2>
            <p>
              {searching
                ? "Checking Gemini for events beyond the saved catalog."
                : "Try another search or clear your filters."}
            </p>
            {!searching && (
              <button className="button button-outline" onClick={clear}>
                Show all markets
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="prediction-grid" aria-busy={searching}>
              {visible.slice(0, limit).map((m) => (
                <PredictionCard
                  market={m}
                  key={m.id}
                  saved={favorites.includes(m.id)}
                  onSave={() => toggleFavorite(m.id)}
                />
              ))}
            </div>
            {visible.length > limit && (
              <div className="show-more">
                <button onClick={() => setLimit((l) => l + 24)}>
                  Show more markets <ChevronDown size={15} />
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
function PredictionCard({
  market,
  saved,
  onSave,
}: {
  market: Market;
  saved: boolean;
  onSave: () => void;
}) {
  const outcomes = market.contracts.slice(0, 2);
  const href = `/markets/${market.ticker ?? market.id}`;
  return (
    <article className="prediction-card">
      <div className="prediction-card-heading">
        <Link
          href={href}
          className="prediction-card-image"
          tabIndex={-1}
          aria-hidden="true"
        >
          <MarketArt market={market} />
        </Link>
        <Link href={href} className="prediction-card-title">
          {market.title}
        </Link>
      </div>
      <div className="prediction-outcomes">
        {outcomes.map((c) => (
          <div className="prediction-outcome" key={c.symbol}>
            <Link
              href={`${href}?contract=${encodeURIComponent(c.symbol)}`}
              className="outcome-label"
            >
              <MarketArt market={market} outcome={c} />
              <span>{c.label}</span>
            </Link>
            <Link
              href={`${href}?contract=${encodeURIComponent(c.symbol)}&side=yes`}
              className="outcome-yes"
              aria-label={`Yes ${c.label}, ${buyPercent(c.buyYes)}`}
            >
              Yes {buyPercent(c.buyYes)}
            </Link>
            <Link
              href={`${href}?contract=${encodeURIComponent(c.symbol)}&side=no`}
              className="outcome-no"
              aria-label={`No ${c.label}, ${buyPercent(c.buyNo)}`}
            >
              No {buyPercent(c.buyNo)}
            </Link>
          </div>
        ))}
      </div>
      <div className="prediction-card-footer">
        <span className="card-volume">{eventVolume(market.volume)}</span>
        <span className="card-category">
          {market.subcategory ?? market.category}
        </span>
        {(market.outcomeCount ?? outcomes.length) > 2 && (
          <Link href={href}>
            +{(market.outcomeCount ?? outcomes.length) - 2} more
          </Link>
        )}
        <button
          onClick={onSave}
          className={`icon-button ${saved ? "saved" : ""}`}
          aria-label={`${saved ? "Remove" : "Add"} ${market.title} ${saved ? "from" : "to"} favorites`}
          aria-pressed={saved}
        >
          <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
    </article>
  );
}
