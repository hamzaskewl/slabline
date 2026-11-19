import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { readPublicShare } from "@/server/position-share";
import {
  identityLabel,
  shareAmount,
  shareNumber,
  shareStateCopy,
} from "@collectible/domain";

type Props = { params: Promise<{ token: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params,
    share = await readPublicShare(token);
  if (!share) return { title: "Share not found · Slabline" };
  const s = share.snapshot,
    title = `${s.market.title} · Slabline`;
  const description = `${identityLabel(s)} · ${shareStateCopy[s.state].headline}: $${shareNumber(shareAmount(s), 2)}`;
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: `${base}/share/${token}`,
      images: [
        {
          url: `${base}/share/${token}/image`,
          width: 1200,
          height: 630,
          alt: description,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${base}/share/${token}/image`],
    },
  };
}
export default async function PublicPositionShare({ params }: Props) {
  const { token } = await params,
    share = await readPublicShare(token);
  if (!share) notFound();
  return (
    <main className="public-position-share">
      <Link href="/" className="exchange-brand">
        <img
          src="/brand/slabline-mark-blue.svg"
          width="20"
          height="28"
          alt=""
        />
        Slabline
      </Link>
      <h1>{share.snapshot.market.title}</h1>
      <img
        className="share-preview"
        src={`/share/${token}/image`}
        width="1200"
        height="630"
        alt={`${identityLabel(share.snapshot)} · ${shareStateCopy[share.snapshot.state].headline} · $${shareNumber(shareAmount(share.snapshot), 2)}${share.snapshot.slab ? ` · ${share.snapshot.slab.role === "collected" ? "Collected" : "Slab"}: ${share.snapshot.slab.name}` : ""}`}
      />
      <Link className="button button-outline" href="/">
        Explore markets
      </Link>
    </main>
  );
}
