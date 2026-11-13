"use client";
import Link from "next/link";
import {
  Bookmark,
  ChevronDown,
  Clock3,
  Compass,
  Gift,
  Layers3,
  Radio,
  Search,
  SlidersHorizontal,
  Trophy,
  Zap,
} from "lucide-react";
import { useState } from "react";
import type { Market } from "@collectible/domain";

export function Discovery({
  markets,
  category,
  setCategory,
  loading,
  error,
  retry,
  search,
  setSearch,
}: {
  markets: Market[];
  category: string;
  setCategory: (c: string) => void;
  loading: boolean;
  error?: string | null;
  retry: () => void;
  search: string;
  setSearch: (value: string) => void;
}) {
  const [limit, setLimit] = useState(24);
  const categories = [
    "All markets",
    "Sports",
    "Crypto",
    "Economics",
    "Politics",
    "Tech",
    "Culture",
    "Business",
  ];
  const visible = markets.filter(
    (m) =>
      (category === "All markets" || m.category === category) &&
      m.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="discovery-layout">
      <aside className="discovery-rail" aria-label="Market filters">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => {
              setCategory(c);
              setLimit(24);
            }}
            className={category === c ? "active" : ""}
          >
            {c === "All markets" ? (
              <Compass size={17} />
            ) : c === "Sports" ? (
              <Trophy size={17} />
            ) : c === "Crypto" ? (
              <Zap size={17} />
            ) : (
              <Layers3 size={17} />
            )}
            <span>{c === "All markets" ? "All" : c}</span>
            {c === "All markets" ? <small>{markets.length}</small> : null}
          </button>
        ))}
        <div className="rail-rule" />
        <Link href="/rewards">
          <Gift size={17} /> Collectible rewards
        </Link>
        <Link href="/portfolio">
          <Layers3 size={17} /> My positions
        </Link>
        <div className="rail-note">
          <span className="live-dot" /> Gemini public data
          <p>Trading is simulated.</p>
        </div>
      </aside>
      <section className="discovery-content">
        <div className="discovery-heading">
          <h1>{category === "All markets" ? "Markets" : category}</h1>
          <div className="discovery-filters">
            <button className="active" onClick={() => setLimit(24)}>
              All
            </button>
            <span className="public-label">Active events</span>
          </div>
          <label className="discovery-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search markets"
              aria-label="Filter market cards"
            />
          </label>
          <button
            className="icon-button"
            aria-label="Refresh active market catalog"
            onClick={retry}
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
        {loading ? (
          <div className="prediction-grid">
            {Array.from({ length: 9 }, (_, i) => (
              <div className="market-skeleton" key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="empty-state">
            <Radio size={28} />
            <h2>Market feed unavailable</h2>
            <p>{error}</p>
            <button className="button button-outline" onClick={retry}>
              Retry connection
            </button>
          </div>
        ) : !visible.length ? (
          <div className="empty-state">
            <Search size={28} />
            <h2>No markets found</h2>
            <p>Try another category or search.</p>
          </div>
        ) : (
          <>
            <div className="prediction-grid">
              {visible.slice(0, limit).map((m) => (
                <PredictionCard market={m} key={m.id} />
              ))}
            </div>
            {visible.length > limit ? (
              <div className="show-more">
                <button onClick={() => setLimit((l) => l + 24)}>
                  Show more markets <ChevronDown size={15} />
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
function PredictionCard({ market }: { market: Market }) {
  const [saved, setSaved] = useState(false);
  const outcomes = market.contracts.length
    ? market.contracts.slice(0, 2)
    : market.children.flatMap((c) => c.contracts).slice(0, 2);
  return (
    <article className="prediction-card">
      <div className="prediction-card-heading">
        <Link
          href={`/markets/${market.ticker ?? market.id}`}
          className="prediction-card-image"
        >
          {market.imageUrl ? (
            <img
              src={market.imageUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <Layers3 size={23} />
          )}
        </Link>
        <Link
          href={`/markets/${market.ticker ?? market.id}`}
          className="prediction-card-title"
        >
          {market.title}
        </Link>
      </div>
      <div className="prediction-outcomes">
        {outcomes.map((c, i) => (
          <div className="prediction-outcome" key={c.symbol}>
            <Link
              href={`/markets/${market.ticker ?? market.id}?outcome=${i}`}
              className="outcome-label"
            >
              {c.label}
            </Link>
            <strong title="Public catalog price snapshot; executable depth is available on the market page">
              {c.lastPrice ? `${Math.round(Number(c.lastPrice) * 100)}%` : "—"}
            </strong>
            <Link
              href={`/markets/${market.ticker ?? market.id}?outcome=${i}&side=yes`}
              className="outcome-yes"
            >
              Yes
            </Link>
            <Link
              href={`/markets/${market.ticker ?? market.id}?outcome=${i}&side=no`}
              className="outcome-no"
            >
              No
            </Link>
          </div>
        ))}
      </div>
      <div className="prediction-card-footer">
        <Link href={`/markets/${market.ticker ?? market.id}`}>
          <span className="live-dot" /> Active{" "}
          <span className="footer-divider">·</span> {market.category}
        </Link>
        {market.children.length ? (
          <span>{market.children.length} related</span>
        ) : null}
        <button
          onClick={() => setSaved(!saved)}
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
