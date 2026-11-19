"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  marketMatches,
  sortMarkets,
  eventVolume,
  type Market,
} from "@collectible/domain";
import { MarketArt } from "./market-art";
import type { PublicProfile } from "@collectible/domain";

export function MarketSearch({
  value,
  onChange,
  markets,
  loading,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  markets: Market[];
  loading: boolean;
  onSubmit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("markets");
  const [query, setQuery] = useState("");
  const root = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    const timer = setTimeout(() => setQuery(value.trim()), 250);
    return () => clearTimeout(timer);
  }, [value]);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const profiles = useQuery<PublicProfile[]>({
    queryKey: ["public-profiles", query],
    enabled: open && tab === "profiles",
    staleTime: 30000,
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/profiles?q=${encodeURIComponent(query)}`, {
        signal,
      });
      if (!r.ok) throw new Error("Profile search unavailable. Please retry.");
      return r.json();
    },
  });
  const results = sortMarkets(
    markets.filter((m) => marketMatches(m, value)),
    value.trim() ? "relevance" : "volume",
    value,
  ).slice(0, 6);
  return (
    <form
      className="global-search search-container"
      role="search"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          root.current?.querySelector("input")?.focus();
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setOpen(true);
          const links = [
            ...(root.current?.querySelectorAll<HTMLAnchorElement>(
              ".search-result",
            ) ?? []),
          ];
          const current = links.indexOf(
            document.activeElement as HTMLAnchorElement,
          );
          links[
            current < 0
              ? e.key === "ArrowDown"
                ? 0
                : links.length - 1
              : (current + (e.key === "ArrowDown" ? 1 : -1) + links.length) %
                links.length
          ]?.focus();
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        onSubmit();
      }}
    >
      <Search size={18} aria-hidden="true" />
      <input
        aria-label="Search markets and profiles"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        placeholder="Search markets and profiles"
        value={value}
        maxLength={100}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
      />
      {value && (
        <button
          type="button"
          className="icon-button search-clear"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <X size={16} />
        </button>
      )}
      {open && (
        <div className="search-dropdown" id={id}>
          <div className="search-tabs" role="tablist" aria-label="Search type">
            {["markets", "profiles"].map((t) => (
              <button
                type="button"
                role="tab"
                id={`${id}-${t}`}
                aria-selected={tab === t}
                aria-controls={`${id}-results`}
                tabIndex={tab === t ? 0 : -1}
                key={t}
                onClick={() => setTab(t)}
                onKeyDown={(e) => {
                  if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                    e.preventDefault();
                    const next = t === "markets" ? "profiles" : "markets";
                    setTab(next);
                    document.getElementById(`${id}-${next}`)?.focus();
                  }
                }}
              >
                {t === "markets" ? "Markets" : "Profiles"}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`${id}-results`}
            aria-labelledby={`${id}-${tab}`}
          >
            {tab === "markets" ? (
              <>
                {results.map((m) => (
                  <Link
                    className="search-result"
                    key={m.id}
                    href={`/markets/${encodeURIComponent(m.ticker ?? m.id)}`}
                    onClick={() => setOpen(false)}
                  >
                    <span className="search-art">
                      <MarketArt market={m} />
                    </span>
                    <span className="search-result-copy">
                      <strong>{m.title}</strong>
                      <span>{m.subcategory ?? m.category}</span>
                    </span>
                    <span className="search-volume">
                      {m.volume == null ? "—" : eventVolume(m.volume)}
                    </span>
                  </Link>
                ))}
                {loading ? (
                  <p role="status" className="search-message">
                    Searching…
                  </p>
                ) : (
                  !results.length && (
                    <p className="search-message">No matching markets.</p>
                  )
                )}
                <button
                  className="button button-outline button-pill search-all"
                  type="submit"
                >
                  See all results <ArrowRight size={16} />
                </button>
              </>
            ) : (
              <>
                {profiles.data?.map((p) => (
                  <Link
                    className="search-result"
                    key={p.username}
                    href={`/${p.username}`}
                    onClick={() => setOpen(false)}
                  >
                    <span className="profile-avatar">
                      {p.displayName.slice(0, 1)}
                    </span>
                    <span className="search-result-copy">
                      <strong>{p.displayName}</strong>
                      <span>@{p.username}</span>
                    </span>
                    <ArrowRight size={16} />
                  </Link>
                ))}
                {profiles.isPending || query !== value.trim() ? (
                  <p role="status" className="search-message">
                    Searching profiles…
                  </p>
                ) : profiles.isError ? (
                  <p role="alert" className="search-message">
                    {profiles.error.message}{" "}
                    <button
                      type="button"
                      onClick={() => void profiles.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                ) : (
                  !profiles.data?.length && (
                    <p className="search-message">No matching profiles.</p>
                  )
                )}
              </>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
