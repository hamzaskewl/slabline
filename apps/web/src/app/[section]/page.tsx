import { notFound, redirect } from "next/navigation";
import { MarketApp } from "@/components/market-app";
import { getPublicProfile } from "@/server/profiles";
import Link from "next/link";
import { SlablineMark } from "@/components/slabline-mark";
import { ArrowRight } from "lucide-react";
const sections = [
  "rewards",
  "cart",
  "wallet",
  "profile",
  "portfolio",
  "collection",
  "redeem",
  "demo",
];
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{
    scenario?: string;
    stake?: string;
    trade?: string;
    side?: string;
  }>;
}) {
  const { section } = await params;
  if (section === "wallet") redirect("/profile");
  if (section === "cart" || section === "collection") redirect("/portfolio");
  if (!sections.includes(section)) {
    const profile = await getPublicProfile(section);
    if (!profile) notFound();
    if (section !== profile.username) redirect(`/${profile.username}`);
    return (
      <main className="public-profile">
        <Link className="exchange-brand" href="/">
          <SlablineMark />
          <span>Slabline</span>
        </Link>
        <section>
          <span className="profile-avatar">
            {profile.displayName.slice(0, 1)}
          </span>
          <h1>{profile.displayName}</h1>
          <p className="profile-handle">@{profile.username}</p>
          {profile.bio && <p className="profile-description">{profile.bio}</p>}
        </section>
        <Link className="button button-outline button-pill" href="/">
          Explore markets <ArrowRight size={16} />
        </Link>
      </main>
    );
  }
  const query = await searchParams;
  return (
    <MarketApp
      section={section}
      initialTrade={query.trade === "sell" ? "sell" : "buy"}
      initialSide={query.side === "no" ? "no" : "yes"}
      rehearsal={
        section === "demo" && query.scenario === "grail" ? "grail" : undefined
      }
      initialStake={
        section === "demo" &&
        query.stake &&
        /^\d+(\.\d{1,2})?$/.test(query.stake) &&
        Number(query.stake) <= 1000000
          ? query.stake
          : "25"
      }
    />
  );
}
