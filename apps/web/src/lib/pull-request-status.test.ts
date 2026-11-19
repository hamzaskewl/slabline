import { expect, test } from "bun:test";
import { pullRequestStatus } from "./pull-request-status";

test("a submitted draw remains bound to its prior signature until finality or expiry", () => {
  expect(pullRequestStatus(null, 101n, "100")).toBe("replace");
  expect(pullRequestStatus(null, 100n, "100")).toBe("unseen");
  expect(pullRequestStatus(null, 101n)).toBe("unseen");
  expect(pullRequestStatus(null, 101n, "corrupt")).toBe("unseen");
  expect(
    pullRequestStatus(
      { confirmationStatus: "confirmed", err: "failed" },
      101n,
      "100",
    ),
  ).toBe("waiting");
  expect(
    pullRequestStatus({ confirmationStatus: "finalized", err: "failed" }),
  ).toBe("replace");
  expect(
    pullRequestStatus({ confirmationStatus: "finalized", err: null }),
  ).toBe("finalized");
});
