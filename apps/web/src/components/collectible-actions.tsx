import { ArrowUpRight, Tag, Truck } from "lucide-react";

export function CollectibleActions({ href }: { href?: string }) {
  return (
    <div className="collectible-asset-actions" aria-label="Asset actions">
      {href ? (
        <a
          className="button button-outline button-sm"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          <ArrowUpRight size={14} aria-hidden="true" /> View asset
        </a>
      ) : (
        <button
          className="button button-outline button-sm"
          disabled
          title="Available after the asset transfer completes"
        >
          <ArrowUpRight size={14} aria-hidden="true" /> View asset
        </button>
      )}
      <button
        className="button button-outline button-sm"
        disabled
        title="Shipping is coming soon"
        aria-label="Ship asset (coming soon)"
      >
        <Truck size={14} aria-hidden="true" /> Ship asset
      </button>
      <button
        className="button button-outline button-sm"
        disabled
        title="Listing is coming soon"
        aria-label="List asset (coming soon)"
      >
        <Tag size={14} aria-hidden="true" /> List asset
      </button>
    </div>
  );
}
