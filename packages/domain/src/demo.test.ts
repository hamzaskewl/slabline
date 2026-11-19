import { expect, test } from "bun:test";
import { rewardAllocation, demoSaleQuote, DEMO_REPLAY } from "./demo";
test("reward selections enforce 80–100% including sub-cent rounding", () => {
  expect(rewardAllocation("100", ["50", "30"]).valid).toBe(true);
  expect(rewardAllocation("100", ["79.999999"]).valid).toBe(false);
  expect(rewardAllocation("100", ["100"]).remainder).toBe("0.000000");
  expect(rewardAllocation("100", ["100.000001"]).overBudget).toBe(true);
  expect(rewardAllocation("0.000001", ["0.000001"]).valid).toBe(true);
  expect(rewardAllocation("0.000001", []).valid).toBe(false);
  expect(rewardAllocation("0", []).valid).toBe(false);
});
test("sales use bids for the selected side and reject unavailable depth", () => {
  expect(demoSaleQuote({ side: "yes", quantity: "10" }, DEMO_REPLAY.book)).toBe(
    "1.900000",
  );
  expect(demoSaleQuote({ side: "no", quantity: "3" }, DEMO_REPLAY.book)).toBe(
    "2.280000",
  );
  expect(() =>
    demoSaleQuote({ side: "yes", quantity: "100000" }, DEMO_REPLAY.book),
  ).toThrow("Not enough buyers");
});
