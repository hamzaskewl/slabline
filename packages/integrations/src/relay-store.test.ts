import { expect, test } from "bun:test";
import {
  getDb,
  users,
  walletLinks,
  relayRequests,
  auditEvents,
  eq,
} from "@collectible/db";
import { type RelayQuoteInput } from "@collectible/domain";
import {
  saveRelayQuote,
  ownedRelayRecord,
  refreshRelayStatus,
} from "./relay-store";
import { quoteRelay } from "./relay";
import {
  simulatedRelayResponse,
  SIMULATED_RELAY_INPUT,
} from "./relay-fixtures";

test.skipIf(!process.env.DATABASE_URL)(
  "Postgres isolates Relay quotes, deduplicates concurrent requests and preserves unconfirmed provider status",
  async () => {
    const db = getDb(),
      marker = `SIMULATED-RELAY-${crypto.randomUUID()}`;
    const rows = await db
      .insert(users)
      .values([{ privyId: `${marker}-a` }, { privyId: `${marker}-b` }])
      .returning();
    const [a, b] = rows;
    if (!a || !b) throw new Error("Fixture setup failed");
    try {
      const wallet =
        `0x${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}` as `0x${string}`;
      await db.insert(walletLinks).values({
        userId: a.id,
        address: wallet,
        network: "eip155",
        verifiedAt: new Date(),
      });
      const input: RelayQuoteInput = {
        ...SIMULATED_RELAY_INPUT,
        wallet,
        recipient: wallet,
      };
      const base = await quoteRelay(SIMULATED_RELAY_INPUT, (async () =>
        Response.json(simulatedRelayResponse())) as unknown as typeof fetch);
      let calls = 0;
      const provider = async (next: RelayQuoteInput) => {
        calls++;
        await new Promise((r) => setTimeout(r, 30));
        return {
          ...base,
          input: next,
          requestId: `0x${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`,
        };
      };
      const key = crypto.randomUUID();
      const results = await Promise.allSettled([
        saveRelayQuote(a.id, input, key, provider),
        saveRelayQuote(a.id, input, key, provider),
      ]);
      expect(calls).toBe(1);
      expect(results.some((r) => r.status === "fulfilled")).toBe(true);
      const saved = await saveRelayQuote(a.id, input, key, provider);
      expect(calls).toBe(1);
      expect(saved.canExecute).toBe(false);
      await expect(
        saveRelayQuote(a.id, { ...input, amount: "0.02" }, key, provider),
      ).rejects.toThrow("another route or amount");
      await expect(ownedRelayRecord(b.id, saved.id)).rejects.toThrow(
        "not found",
      );
      await expect(
        saveRelayQuote(b.id, input, crypto.randomUUID(), provider),
      ).rejects.toThrow("Verify your EVM wallet");
      await expect(
        saveRelayQuote(
          a.id,
          {
            ...input,
            routeId: "base-solana",
            amount: "100",
            recipient: "DJGsYNJWSM1PVo6EsiAv4989KdcVQABjuQ3iuFAAmjd",
          },
          crypto.randomUUID(),
          provider,
        ),
      ).rejects.toThrow("Verify your Solana wallet");
      const status = await refreshRelayStatus(a.id, saved.id, async () => ({
        providerState: "success",
        originHashes: [],
        destinationHashes: [],
        checkedAt: new Date().toISOString(),
        independentlyConfirmed: false,
      }));
      expect(status.state).toBe("quoted");
      expect(status.status?.independentlyConfirmed).toBe(false);
      expect(status.moneyMovedByApp).toBe(false);
      for (let i = 0; i < 4; i++)
        await saveRelayQuote(a.id, input, crypto.randomUUID(), provider);
      await expect(
        saveRelayQuote(a.id, input, crypto.randomUUID(), provider),
      ).rejects.toThrow("Wait a minute");
      expect(calls).toBe(5);
    } finally {
      for (const row of rows) {
        await db.delete(relayRequests).where(eq(relayRequests.userId, row.id));
        await db.delete(auditEvents).where(eq(auditEvents.userId, row.id));
        await db.delete(walletLinks).where(eq(walletLinks.userId, row.id));
        await db.delete(users).where(eq(users.id, row.id));
      }
    }
  },
);
