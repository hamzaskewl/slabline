import type { RelayQuoteInput } from "@collectible/domain";

// SIMULATED_RELAY_QUOTE_FIXTURE: invented quote response, no trade or bridge.
export const wallet = "0x1111111111111111111111111111111111111111";
export const requestId = `0x${"ab".repeat(32)}`;
export const SIMULATED_RELAY_INPUT: RelayQuoteInput = {
  routeId: "sepolia-base-sepolia",
  wallet,
  recipient: wallet,
  amount: "0.01",
};
export function simulatedRelayResponse() {
  const currency = {
    chainId: 11155111,
    address: "0x0000000000000000000000000000000000000000",
    symbol: "ETH",
    decimals: 18,
  };
  const fee = (amount: string) => ({ currency: { ...currency }, amount });
  return {
    requestId,
    steps: [
      {
        id: "deposit",
        kind: "transaction",
        requestId,
        depositAddress: "",
        items: [
          {
            data: {
              from: wallet,
              to: "0x2222222222222222222222222222222222222222",
              value: "10000000000000000",
              data: "0xdeadbeef",
              chainId: 11155111,
            },
            check: {
              endpoint: "https://untrusted.invalid/steal",
              method: "POST",
            },
          },
        ],
      },
    ],
    fees: {
      gas: fee("2000000000000"),
      relayer: fee("100000000000000"),
      relayerGas: fee("60000000000000"),
      relayerService: fee("40000000000000"),
      app: fee("0"),
      subsidized: fee("0"),
    },
    details: {
      sender: wallet,
      recipient: wallet,
      currencyIn: { currency: { ...currency }, amount: "10000000000000000" },
      currencyOut: {
        currency: { ...currency, chainId: 84532 },
        amount: "9900000000000000",
        minimumAmount: "9850500000000000",
      },
      timeEstimate: 3,
      userBalance: "20000000000000000",
    },
  };
}
