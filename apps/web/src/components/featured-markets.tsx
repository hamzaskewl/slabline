"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import {
  buyPercent,
  eventVolume,
  marketOutcomes,
  marketTeams,
  featuredMarkets,
  isCurrentMarket,
  isLiveGame,
  type Listing,
  type ChartRange,
  type Contract,
  type Market,
} from "@collectible/domain";
import { CardAvailability } from "./card-availability";
import { hasListedCards } from "@/lib/card-availability";
import { api } from "@/lib/trpc";
import { MarketArt } from "./market-art";
import { LiveBadge } from "./live-badge";
import { useMarketClock } from "@/lib/use-market-clock";
const PriceChart = dynamic(() => import("./price-chart"), {
  ssr: false,
  loading: () => <div className="chart-loading">Loading price history…</div>,
});
function buttonTextColor(color: string) {
  const rgb = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (!rgb) return "#fff";
  const channels = rgb.slice(1).map((c) => {
    const n = parseInt(c, 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722 >
    0.179
    ? "#101418"
    : "#fff";
}

export function FeaturedMarkets({
  markets,
  cards = [],
}: {
  markets: Market[];
  cards?: Listing[];
}) {
  const now = useMarketClock();
  const [ended, setEnded] = useState<string[]>([]);
  const hideEnded = useCallback((id: string) => {
    setEnded((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }, []);
  const featured = useMemo(
    () =>
      featuredMarkets(
        markets.filter((m) => !ended.includes(m.id)),
        now,
      ),
    [markets, ended, now],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const index = Math.max(
    0,
    featured.findIndex((m) => m.id === selected),
  );
  const ids = featured.map((m) => m.id).join("|");
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (paused || interacting || reducedMotion || featured.length < 2) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        setSelected(featured[(index + 1) % featured.length]!.id);
    }, 8000);
    return () => clearInterval(timer);
  }, [ids, index, paused, interacting, reducedMotion]);
  if (!featured.length) return null;
  const move = (next: number) => {
    setSelected(featured[(next + featured.length) % featured.length]!.id);
    setPaused(true);
  };
  return (
    <section
      className="featured-markets"
      aria-label="Featured prediction markets"
      aria-roledescription="carousel"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocusCapture={() => setPaused(true)}
    >
      <div
        className="featured-window"
        onTouchStart={(e) => {
          const p = e.touches[0];
          touch.current = p ? { x: p.clientX, y: p.clientY } : null;
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          const end = e.changedTouches[0];
          touch.current = null;
          if (!start || !end) return;
          const dx = end.clientX - start.x;
          if (
            Math.abs(dx) > 60 &&
            Math.abs(dx) > Math.abs(end.clientY - start.y)
          )
            move(index + (dx < 0 ? 1 : -1));
        }}
      >
        <div
          className="featured-track"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {featured.map((market, i) => (
            <div
              key={market.id}
              className="featured-slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${featured.length}: ${market.title}`}
              aria-hidden={i !== index}
              inert={i !== index}
            >
              {i === index ? (
                <FeaturedEvent
                  key={market.id}
                  market={market}
                  cards={cards}
                  now={now}
                  hideEnded={hideEnded}
                />
              ) : (
                <div className="featured-placeholder">
                  <h2>{market.title}</h2>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="featured-controls">
        <button
          className="icon-button"
          aria-label="Previous featured market"
          disabled={featured.length < 2}
          onClick={() => move(index - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="featured-dots">
          {featured.map((m, i) => (
            <button
              key={m.id}
              aria-label={`Show featured market ${i + 1}: ${m.title}`}
              aria-pressed={i === index}
              onClick={() => move(i)}
            >
              <span />
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          aria-label={
            paused || reducedMotion
              ? "Play featured markets"
              : "Pause featured markets"
          }
          onClick={() => {
            setPaused(!(paused || reducedMotion));
            setReducedMotion(false);
          }}
        >
          {paused || reducedMotion ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button
          className="icon-button"
          aria-label="Next featured market"
          disabled={featured.length < 2}
          onClick={() => move(index + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}
function FeaturedEvent({
  market,
  cards,
  now,
  hideEnded,
}: {
  market: Market;
  cards: Listing[];
  now: number;
  hideEnded: (id: string) => void;
}) {
  const detail = api.market.useQuery(
    { id: market.ticker ?? market.id },
    { staleTime: 30000, refetchInterval: 30000 },
  );
  const full = detail.data?.data ?? market;
  const outcomes = useMemo(
    () => marketOutcomes({ ...full, children: [] }).slice(0, 2),
    [full],
  );
  const teams = marketTeams(full);
  const [range, setRange] = useState<ChartRange>("ALL");
  const current = isCurrentMarket(full, now);
  useEffect(() => {
    if (!current) hideEnded(market.id);
  }, [current, market.id, hideEnded]);
  const href = `/markets/${market.ticker ?? market.id}`;
  const related = ["spread", "total"]
    .map((type) =>
      full.children.find(
        (m) =>
          m.sportsMarket?.type === type ||
          (type === "spread"
            ? /point spread/i
            : /total (points|goals|runs)/i
          ).test(m.title),
      ),
    )
    .filter((m): m is Market => !!m);
  if (!current) return null;
  return (
    <div className="featured-event">
      <div className="featured-trading">
        <Link href={href} className="featured-title">
          <MarketArt market={full} />
          <div>
            <h2>
              {full.title}{" "}
              <CardAvailability available={hasListedCards(full, cards)} />
            </h2>
            <p>
              {isLiveGame(full, now) ? (
                <LiveBadge />
              ) : full.startsAt ? (
                new Date(full.startsAt).toLocaleString("en-US", {
                  weekday: "short",
                  hour: "numeric",
                  minute: "2-digit",
                  month: "short",
                  day: "numeric",
                })
              ) : (
                (full.subcategory ?? full.category)
              )}
            </p>
          </div>
        </Link>
        <div className="featured-winners">
          {outcomes.map((c) => (
            <Link
              key={c.symbol}
              href={`${href}?contract=${encodeURIComponent(c.symbol)}&side=yes`}
              style={{
                background: c.color,
                color: buttonTextColor(c.color),
                textShadow: "none",
              }}
            >
              <span>
                {c.label}{" "}
                <CardAvailability available={hasListedCards(full, cards, c)} />
              </span>
              <strong>{buyPercent(c.buyYes)}</strong>
            </Link>
          ))}
        </div>
        <div className="featured-lines">
          {related.map((m) => (
            <FeaturedLine key={m.id} market={m} parent={full} />
          ))}
          {!related.length && (
            <Link className="featured-open" href={href}>
              View all outcomes <ChevronRight size={16} />
            </Link>
          )}
        </div>
        <p className="featured-volume">{eventVolume(full.volume)}</p>
      </div>
      <div className="featured-chart">
        <div className="featured-matchup">
          {teams[0] && (
            <span>
              <MarketArt market={full} outcome={teams[0]} />
              {teams[0].label}{" "}
              <CardAvailability
                available={hasListedCards(full, cards, teams[0])}
              />
            </span>
          )}
          <div>
            {isLiveGame(full, now) ? (
              <LiveBadge />
            ) : full.startsAt ? (
              <time dateTime={full.startsAt}>
                {new Date(full.startsAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            ) : (
              <strong>Matchup</strong>
            )}
            <small>{full.subcategory ?? full.category}</small>
          </div>
          {teams[1] && (
            <span>
              <MarketArt market={full} outcome={teams[1]} />
              {teams[1].label}{" "}
              <CardAvailability
                available={hasListedCards(full, cards, teams[1])}
              />
            </span>
          )}
        </div>
        <PriceChart
          outcomes={outcomes}
          eventTime={null}
          range={range}
          onRangeChange={setRange}
          latestTrade={null}
          compact
          background="#151719"
        />
      </div>
    </div>
  );
}
function FeaturedLine({ market, parent }: { market: Market; parent: Market }) {
  const contracts = market.contracts;
  const nearest = contracts.reduce(
    (best, c, i) =>
      c.buyYes != null &&
      Math.abs(Number(c.buyYes) - 0.5) <
        Math.abs(Number(contracts[best]?.buyYes ?? 2) - 0.5)
        ? i
        : best,
    0,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const index = Math.max(
    0,
    selected ? contracts.findIndex((c) => c.symbol === selected) : nearest,
  );
  const contract = contracts[index];
  if (!contract) return null;
  const href = `/markets/${parent.ticker ?? parent.id}?contract=${encodeURIComponent(contract.symbol)}`;
  const strike = (c: Contract) =>
    c.label.match(/\d+(?:\.\d+)?/)?.[0] ?? c.label;
  return (
    <div className="featured-line">
      <p>{contract.label}</p>
      <div className="featured-line-controls">
        <div className="strike-selector" aria-label={`${market.title} line`}>
          <button
            className="icon-button"
            aria-label={`Previous ${market.title} line`}
            disabled={index === 0}
            onClick={() => setSelected(contracts[index - 1]!.symbol)}
          >
            <ChevronLeft size={15} />
          </button>
          {contracts
            .slice(
              Math.max(0, Math.min(index - 1, contracts.length - 3)),
              Math.max(0, Math.min(index - 1, contracts.length - 3)) + 3,
            )
            .map((c) => (
              <button
                key={c.symbol}
                aria-label={c.label}
                aria-pressed={c.symbol === contract.symbol}
                onClick={() => setSelected(c.symbol)}
              >
                {strike(c)}
              </button>
            ))}
          <button
            className="icon-button"
            aria-label={`Next ${market.title} line`}
            disabled={index === contracts.length - 1}
            onClick={() => setSelected(contracts[index + 1]!.symbol)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
        <Link className="outcome-yes" href={`${href}&side=yes`}>
          Yes {buyPercent(contract.buyYes)}
        </Link>
        <Link className="outcome-no" href={`${href}&side=no`}>
          No {buyPercent(contract.buyNo)}
        </Link>
      </div>
    </div>
  );
}
