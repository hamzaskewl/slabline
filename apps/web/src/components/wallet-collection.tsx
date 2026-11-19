"use client";
import { Select } from "./ui/select";
import { CardImage } from "./card-image";
import { CardValue } from "./card-value";
import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { WalletCollection as Collection } from "@collectible/domain";
import { privateRead, usePrivateRead } from "@/lib/use-private-read";
import { Button } from "./ui/button";
import { useNetwork } from "./network-settings";
type Links = {
  network: "devnet" | "mainnet";
  wallets: { address: string; network: string }[];
};
export function WalletCollection({
  embedded = false,
  excludeMints = [],
}: {
  embedded?: boolean;
  excludeMints?: string[];
}) {
  const { network } = useNetwork();
  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
  const links = usePrivateRead<Links>("/api/wallet/links");
  const [selected, setSelected] = useState("");
  const wallet =
    links.data?.wallets.find((w) => w.address === selected)?.address ??
    links.data?.wallets[0]?.address ??
    "";
  const collection = useInfiniteQuery({
    queryKey: ["wallet-collection", user?.id, links.data?.network, wallet],
    enabled: authenticated && !!user?.id && !!wallet,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) =>
      privateRead<Collection>(
        `/api/wallet/collection?address=${encodeURIComponent(wallet)}&page=${pageParam}`,
        await getAccessToken(),
        signal,
        network,
      ),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 60000,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const pages = authenticated && wallet ? collection.data?.pages : undefined;
  const assets = [
    ...new Map(
      pages?.flatMap((p) => p.assets).map((a) => [a.mint, a]),
    ).values(),
  ].filter((a) => !excludeMints.includes(a.mint));
  if (embedded && (!authenticated || !wallet)) return null;
  return (
    <section
      className={
        embedded
          ? "portfolio-section wallet-holdings"
          : "panel funding-panel account-panel"
      }
    >
      <div className="section-heading">
        <h2>{embedded ? "Wallet collectibles" : "Your collectibles"}</h2>
        {links.data?.network === "devnet" ? (
          <span className="mode-badge">DEVNET</span>
        ) : null}
      </div>
      {!ready ? (
        <p role="status">Loading account…</p>
      ) : !authenticated ? (
        <Button onClick={login}>Log in to view your collection</Button>
      ) : (
        <>
          {links.isPending ? (
            <p role="status">Loading linked wallets…</p>
          ) : null}
          {links.error ? (
            <>
              <p role="alert">{links.error.message}</p>
              <Button onClick={() => void links.refetch()}>
                Retry wallets
              </Button>
            </>
          ) : null}
          {links.data && !wallet ? (
            <>
              <p>Verify your Solana wallet to view its collectibles.</p>
              <Link className="text-link" href="/wallet">
                Open Wallet
              </Link>
            </>
          ) : null}
          {wallet ? (
            <>
              <label
                className="account-wallet-label"
                htmlFor="collection-wallet"
              >
                Solana wallet
              </label>
              <Select
                id="collection-wallet"
                className="account-wallet-select"
                value={wallet}
                onChange={(e) => setSelected(e.target.value)}
              >
                {links.data?.wallets.map((w) => (
                  <option key={w.address} value={w.address}>
                    {w.address.slice(0, 8)}…{w.address.slice(-6)}
                  </option>
                ))}
              </Select>
              <div className="wallet-actions">
                <Button
                  variant="outline"
                  disabled={collection.isFetching}
                  onClick={() => void collection.refetch()}
                >
                  {collection.isFetching ? "Refreshing…" : "Refresh collection"}
                </Button>
              </div>
              {collection.error ? (
                <p role="alert">{collection.error.message}</p>
              ) : null}
              {collection.isPending ? (
                <p role="status">Reading wallet collectibles…</p>
              ) : null}
              {pages && !assets.length ? (
                <p>
                  {collection.hasNextPage
                    ? "No collectibles on this page."
                    : embedded
                      ? "No additional collectibles in this wallet."
                      : "No collectibles in this wallet."}
                </p>
              ) : null}
              <div className="wallet-collection-grid">
                {assets.map((a) => (
                  <article className="wallet-collectible" key={a.mint}>
                    <CardImage src={a.imageUrl} alt={a.name} />
                    <h3>{a.name}</h3>
                    <CardValue valuation={a.valuation} />
                    <a
                      className="text-link"
                      target="_blank"
                      rel="noreferrer"
                      href={`https://explorer.solana.com/address/${a.mint}${links.data?.network === "devnet" ? "?cluster=devnet" : ""}`}
                    >
                      View on Solana
                    </a>
                  </article>
                ))}
              </div>
              {collection.hasNextPage ? (
                <Button
                  variant="outline"
                  disabled={collection.isFetching}
                  onClick={() => void collection.fetchNextPage()}
                >
                  {collection.isFetchingNextPage ? "Loading…" : "Show more"}
                </Button>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
