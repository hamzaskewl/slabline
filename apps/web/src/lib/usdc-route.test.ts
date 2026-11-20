import { expect, test } from "bun:test";
import { GET, POST } from "../app/api/demo/usdc/route";

test("USDC routes reject mainnet and unspecified networks with an actionable status", async () => {
  for (const network of ["mainnet", ""]) {
    for (const handler of [GET, POST]) {
      const response = await handler(
        new Request("http://localhost:3000/api/demo/usdc", {
          headers: { "X-Market-Network": network },
        }),
      );
      expect(response.status).toBe(409);
      expect((await response.json()).error).toContain("Devnet");
    }
  }
});

test("USDC account reads require authentication even on devnet", async () => {
  const before = {
    id: process.env.PRIVY_APP_ID,
    secret: process.env.PRIVY_APP_SECRET,
  };
  process.env.PRIVY_APP_ID = "TEST_ONLY";
  process.env.PRIVY_APP_SECRET = "TEST_ONLY";
  try {
    const response = await GET(
      new Request("http://localhost:3000/api/demo/usdc", {
        headers: { "X-Market-Network": "devnet" },
      }),
    );
    expect(response.status).toBe(401);
  } finally {
    if (before.id === undefined) delete process.env.PRIVY_APP_ID;
    else process.env.PRIVY_APP_ID = before.id;
    if (before.secret === undefined) delete process.env.PRIVY_APP_SECRET;
    else process.env.PRIVY_APP_SECRET = before.secret;
  }
});
