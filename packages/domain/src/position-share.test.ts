import { expect, test } from "bun:test";
import {
  DEMO_REPLAY,
  DEMO_REPLAY_CARD,
  demoShareSnapshot,
  geminiShareFinancials,
  shareFeeQualifier,
  shareIdentity,
  identityLabel,
  shareNumber,
  shareProfit,
  shareIntent,
  slabFromListing,
  type DemoPosition,
  type DemoCollectible,
} from "./index";
const position: DemoPosition = {
  ...DEMO_REPLAY,
  id: "private-position",
  symbol: DEMO_REPLAY.book.symbol,
  state: "open",
  side: "yes",
  quantity: "1000",
  cost: "350",
  replay: true,
  createdAt: "2026-11-18T12:00:00Z",
  shareTarget: slabFromListing(DEMO_REPLAY_CARD),
};
const snapshot = (
  p: Partial<DemoPosition> = {},
  cards: DemoCollectible[] = [],
) =>
  demoShareSnapshot(
    { ...position, ...p },
    cards,
    shareIdentity(false),
    "2026-11-18T12:00:00Z",
  );
test("open payout uses eligible one-dollar demo shares, never odds or cost", () => {
  const s = snapshot();
  expect(s.trade.grossPayoutIfCorrect).toBe("1000");
  expect(s.trade.averageEntryPrice).toBe("0.350000");
  expect(s.trade.profit).toBe("650.000000");
  expect(s.trade.roiPercent).toBe("185.714285");
  expect(s.trade.fees).toBeNull();
  expect(s.trade.profitBasis).toBe("before-fees");
  expect(s.environment).toBe("replay");
});
test("won-unclaimed and won-claimed are wins without implying collectible receipt", () => {
  for (const state of ["available", "allocated", "claimed"] as const) {
    const s = snapshot({
      state: "won",
      payout: "1000",
      reward: { state, budget: "1000", cardSpend: "900", remainder: "100" },
    });
    expect(s.state).toBe("won");
    expect(s.slab?.role).toBe("target");
    expect(s.trade.payoutReceipt).not.toBe("received");
  }
});
test("only a confirmed related collectible overrides the saved target", () => {
  const c: DemoCollectible = {
    id: "receipt",
    state: "confirmed",
    confirmedAt: "2026-11-18T13:00:00Z",
    rewardPositionId: position.id,
    name: "Actual received slab",
    image: "/actual.png",
    source: "collectorcrypt",
    sourceId: "received-mint",
    sourceUrl: "",
    cost: "900",
    wallet: "private-wallet",
  };
  expect(snapshot({ state: "won", payout: "1000" }, [c]).slab).toMatchObject({
    role: "collected",
    name: "Actual received slab",
    sourceId: "received-mint",
  });
  expect(snapshot({}, [{ ...c, state: "submitted" }]).slab?.role).toBe(
    "target",
  );
  expect(
    snapshot({}, [{ ...c, rewardPositionId: "someone-else" }]).slab?.role,
  ).toBe("target");
});
test("sold, lost, refund and pending use explicit state and applicable proceeds", () => {
  expect(snapshot({ state: "sold", saleProceeds: "400" })).toMatchObject({
    state: "sold",
    trade: { profit: "50.000000" },
  });
  expect(snapshot({ state: "lost", payout: "0" })).toMatchObject({
    state: "lost",
    trade: { profit: "-350.000000" },
  });
  expect(snapshot({ state: "refunded", payout: "350" })).toMatchObject({
    state: "void",
    trade: { profit: "0.000000" },
  });
  expect(snapshot({ state: "awaiting-settlement" }).trade.profit).toBeNull();
});
test("unknown cost/fees and zero basis never become invented net returns", () => {
  expect(shareProfit("100", null, null, null)).toEqual({
    profit: null,
    roiPercent: null,
    profitBasis: "unavailable",
  });
  expect(shareProfit("100", "0", null, false).roiPercent).toBeNull();
  expect(shareProfit("100", "70", "3", false).profit).toBe("27.000000");
  expect(shareProfit("100", "73", "3", true).profit).toBe("27.000000");
  expect(shareProfit("0.000003", "0.000002", "0.000001", false).profit).toBe(
    "0.000000",
  );
});
test("Anonymous public shaping contains no identity, private IDs, wallets or balance", () => {
  const hidden = shareIdentity(false, "Courtside", "0x2699SECRET8265");
  expect(hidden).toEqual({
    visible: false,
    displayName: null,
    addressLabel: null,
    avatarUrl: null,
  });
  const s = snapshot();
  expect(identityLabel(s)).toBe("Anonymous");
  expect(JSON.stringify(s)).not.toContain("private-position");
  expect(JSON.stringify(s)).not.toContain("wallet");
  expect(
    identityLabel({ ...s, identity: shareIdentity(true, "Courtside") }),
  ).toBe("Courtside");
  expect(
    identityLabel({
      ...s,
      identity: shareIdentity(true, null, "0x2699SECRET8265"),
    }),
  ).toBe("0x2699...8265");
  expect(identityLabel({ ...s, identity: shareIdentity(true) })).toBe("Trader");
});
test("exact huge and fractional money, absent targets, and encoded platform intents", () => {
  expect(shareNumber("99999999999999999.123456", 2)).toBe(
    "99,999,999,999,999,999.123456",
  );
  expect(shareNumber(null)).toBe("—");
  expect(snapshot({ shareTarget: undefined }).slab).toBeNull();
  const url = "https://example.com/share/abc",
    text = "A & B? #win";
  for (const p of ["X", "Telegram", "WhatsApp"] as const) {
    const intent = new URL(shareIntent(p, url, text));
    expect(intent.searchParams.get("text")).toBe(
      p === "WhatsApp" ? `${text} ${url}` : text,
    );
    if (p !== "WhatsApp") expect(intent.searchParams.get("url")).toBe(url);
  }
});
test("Gemini uses verified entry history and payout multiplier, leaving sparse figures unavailable", () => {
  const p = {
    symbol: "GEMI-TEST",
    quantity: "12.5",
    outcome: "yes",
    marketValue: "9999",
    averageEntryPrice: "0.24",
    payoutPerShare: "1",
  };
  expect(geminiShareFinancials(p, null)).toMatchObject({
    state: "open",
    trade: {
      cost: "3.000000",
      averageEntryPrice: "0.24",
      grossPayoutIfCorrect: "12.500000",
      profit: "9.500000",
      fees: null,
      profitBasis: "before-fees",
    },
  });
  expect(
    geminiShareFinancials(
      { ...p, averageEntryPrice: null, payoutPerShare: null },
      null,
    ).trade,
  ).toMatchObject({ cost: null, grossPayoutIfCorrect: null, profit: null });
  expect(
    geminiShareFinancials({ ...p, resolutionSide: "yes" }, null).state,
  ).toBe("pending");
  const settled = {
    symbol: p.symbol,
    outcome: "yes",
    resolutionSide: "yes",
    payout: "12.5",
    quantity: "12.5",
    settledAt: "2026-11-18T12:00:00Z",
    costBasis: "3",
    realizedPnl: "0",
  };
  expect(geminiShareFinancials(null, settled)).toMatchObject({
    state: "won",
    trade: {
      payoutReceipt: "received",
      profit: "9.500000",
      averageEntryPrice: null,
    },
  });
  expect(
    geminiShareFinancials(null, { ...settled, realizedPnl: "2" }).trade.cost,
  ).toBeNull();
  expect(
    geminiShareFinancials(null, { ...settled, outcome: "no", payout: "0" })
      .state,
  ).toBe("lost");
  expect(
    geminiShareFinancials(null, {
      symbol: "GEMI-TEST",
      payout: null,
      settledAt: null,
    }).trade.cost,
  ).toBeNull();
});
test("fee qualifiers distinguish known net figures, included costs and unknown fees", () => {
  const t = snapshot().trade;
  expect(shareFeeQualifier(t)).toBe("Fees excluded");
  expect(shareFeeQualifier({ ...t, profitBasis: "net", fees: "3" })).toBe(
    "Profit includes fees",
  );
  expect(
    shareFeeQualifier({
      ...t,
      profitBasis: "unavailable",
      costIncludesFees: true,
    }),
  ).toBe("Cost includes fees");
});
