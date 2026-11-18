"use client";

import {
  ArrowDownUp,
  Check,
  ChevronDown,
  RefreshCw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Popover, Select, Switch } from "radix-ui";
import { useEffect, useId, useState } from "react";
import type { MarketSort } from "@collectible/domain";

function MarketSelect({
  label,
  value,
  options,
  onChange,
  sort = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  sort?: boolean;
}) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger
        className={`market-select-trigger ${sort ? "sort-trigger" : ""}`}
        aria-label={label}
      >
        {sort && <ArrowDownUp size={14} aria-hidden="true" />}
        <Select.Value />
        {!sort && (
          <Select.Icon>
            <ChevronDown size={14} />
          </Select.Icon>
        )}
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="market-select-menu"
          position="popper"
          sideOffset={8}
          align={sort ? "end" : "start"}
          collisionPadding={16}
        >
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item
                className="market-select-option"
                value={option.value}
                key={option.value}
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check size={16} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function FilterSwitch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="market-filter-switch" htmlFor={id}>
      <span>{label}</span>
      <Switch.Root
        id={id}
        className="market-switch"
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      >
        <Switch.Thumb className="market-switch-thumb" />
      </Switch.Root>
    </label>
  );
}

export function DiscoveryControls({
  sort,
  setSort,
  category,
  setCategory,
  categories,
  league,
  setLeague,
  leagues,
  includeProps,
  setIncludeProps,
  favoritesOnly,
  setFavoritesOnly,
  searching,
  search,
  retry,
  reset,
}: {
  sort: MarketSort;
  setSort: (sort: MarketSort) => void;
  category: string;
  setCategory: (category: string) => void;
  categories: string[];
  league: string;
  setLeague: (league: string) => void;
  leagues: string[];
  includeProps: boolean;
  setIncludeProps: (value: boolean) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (value: boolean) => void;
  searching: boolean;
  search: string;
  retry: () => void;
  reset: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [category]);
  const count = Number(!!league) + Number(includeProps) + Number(favoritesOnly);
  return (
    <div className="discovery-actions">
      <MarketSelect
        label="Sort markets"
        value={sort}
        onChange={(value) => setSort(value as MarketSort)}
        sort
        options={[
          { value: "volume", label: "Volume" },
          { value: "closing", label: "Expiry date" },
          { value: "name", label: "Alphabetical" },
        ]}
      />
      {category !== "All markets" && (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              className="filter-toggle"
              aria-label={count ? `Filters, ${count} active` : "Filters"}
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              Filters
              {count > 0 && <span className="filter-count">{count}</span>}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="market-filter-panel"
              aria-label="Market filters"
              sideOffset={10}
              align="end"
              collisionPadding={16}
            >
              <div className="market-filter-header">
                <h2>Filters</h2>
                <Popover.Close
                  className="market-filter-close"
                  aria-label="Close filters"
                >
                  <X size={16} />
                </Popover.Close>
              </div>
              <div className="market-filter-fields">
                <div className="market-filter-field">
                  <span>Category</span>
                  <MarketSelect
                    label="Category"
                    value={category}
                    onChange={setCategory}
                    options={categories.map((c) => ({ value: c, label: c }))}
                  />
                </div>
                <div className="market-filter-field">
                  <span>League or topic</span>
                  <MarketSelect
                    label="League or topic"
                    value={league || "all"}
                    onChange={(value) =>
                      setLeague(value === "all" ? "" : value)
                    }
                    options={[
                      { value: "all", label: "All leagues and topics" },
                      ...leagues.map((l) => ({ value: l, label: l })),
                    ]}
                  />
                </div>
              </div>
              <div className="market-filter-toggles">
                <FilterSwitch
                  label="Player props"
                  checked={includeProps || !!search.trim()}
                  onChange={setIncludeProps}
                  disabled={!!search.trim()}
                />
                <FilterSwitch
                  label="Favorites only"
                  checked={favoritesOnly}
                  onChange={setFavoritesOnly}
                />
              </div>
              {!!search.trim() && (
                <p className="market-filter-hint">
                  Search includes player props.
                </p>
              )}
              <div className="market-filter-footer">
                <button onClick={reset}>Reset filters</button>
                <Popover.Close className="market-filter-done">
                  Done
                </Popover.Close>
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
      <button
        className="icon-button discovery-refresh"
        aria-label="Refresh markets"
        disabled={searching}
        onClick={retry}
      >
        <RefreshCw size={16} />
      </button>
    </div>
  );
}
