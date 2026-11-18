import { expect, test } from "bun:test";
import { ApiError, SdkError } from "@gemini-markets/sdk/server";
import { publicProviderError } from "./provider-error";

test("public provider logs identify SDK failures without response bodies or credentials", () => {
  const error = ApiError.fromResponse({
    status: 503,
    body: {
      reason: "ServiceUnavailable",
      message: "secret response text",
      token: "secret-token",
    },
    metadata: {
      endpoint: "/events?key=secret-key",
      method: "GET",
      correlationId: "test",
      retryCount: 2,
    },
    operationContext: { operation: "predictionMarkets.listEvents" },
  });
  const summary = publicProviderError(error);
  expect(summary).toMatchObject({
    status: 503,
    reason: "ServiceUnavailable",
    operation: "predictionMarkets.listEvents",
  });
  expect(JSON.stringify(summary)).not.toContain("secret");
  expect(
    publicProviderError(
      new SdkError("HTTP response exceeded the configured 16777216-byte limit"),
    ),
  ).toMatchObject({ responseTooLarge: true });
  expect(
    JSON.stringify(publicProviderError(new Error("secret message"))),
  ).not.toContain("secret");
});
