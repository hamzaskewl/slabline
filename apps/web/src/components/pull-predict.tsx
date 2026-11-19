"use client";

import dynamic from "next/dynamic";
import { PullBoard } from "./pull-board";

const PullAccount = dynamic(
  () => import("./pull-account").then((module) => module.PullAccount),
  {
    ssr: false,
    loading: () => <p role="status">Loading your pack account…</p>,
  },
);
export function PullPredict({
  configured,
  view = "shop",
  openingId,
}: {
  configured?: boolean;
  view?: "shop" | "packs";
  openingId?: string;
}) {
  if (configured) return <PullAccount view={view} openingId={openingId} />;
  return (
    <PullBoard
      action={() => (
        <p className="pull-muted" role="status">
          {configured === undefined
            ? "Checking account availability…"
            : "Account sign-in is unavailable in this deployment."}
        </p>
      )}
    />
  );
}
