"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function HoldingSection({
  title,
  count,
  storageKey,
  actions,
  children,
}: {
  title: string;
  count?: number;
  storageKey: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [preference, setPreference] = useState<{
    key: string;
    expanded: boolean;
  }>();
  const expanded = preference?.key === storageKey ? preference.expanded : true;
  const id = useId();
  useEffect(() => {
    try {
      setPreference({
        key: storageKey,
        expanded: localStorage.getItem(storageKey) !== "closed",
      });
    } catch {
      setPreference({ key: storageKey, expanded: true });
    }
  }, [storageKey]);
  return (
    <section className="portfolio-section holding-section">
      <div className="portfolio-section-heading">
        <h2>
          <button
            className="holding-toggle"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => {
              const next = !expanded;
              setPreference({ key: storageKey, expanded: next });
              try {
                localStorage.setItem(storageKey, next ? "open" : "closed");
              } catch {}
            }}
          >
            <ChevronDown size={17} aria-hidden="true" />
            {title}
            {count !== undefined && <span>{count}</span>}
          </button>
        </h2>
        {actions}
      </div>
      <div id={id} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
