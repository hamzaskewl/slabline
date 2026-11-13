# QuickNode Solana Stream setup and recovery

Status: webhook verification and durable reconciliation code implemented; **real Stream creation/delivery is permission blocked** because no QuickNode account/API credential/RPC/Stream signing secret was provided. No completed bounty evidence is claimed.

1. Create a Solana Stream for the chosen network and block/transaction dataset in the QuickNode dashboard. Choose real mint addresses from verified app listings/orders. Configure the filter below with those mints; the placeholder is deliberately not a real asset/program.
2. Set destination to `https://<web-domain>/api/webhooks/quicknode`, compression `none` or `gzip`, and a generated Stream `security_token`. Store it as server-only `QUICKNODE_WEBHOOK_SECRET` on web. Set `QUICKNODE_RPC_URL` and (for compressed/Core assets) `QUICKNODE_DAS_RPC_URL` on worker. Networks must match the tracked order.
3. Test the filter against a real block in QuickNode before activating. Confirm actual delivery envelope matches `{transactions:[{signature,mint}]}` or QuickNode's `data` array of such results. Do not assume a documented filter is evidence of a configured Stream.
4. The endpoint verifies HMAC-SHA256 over `nonce + timestamp + decoded JSON payload`, checks a five-minute timestamp window, bounds compressed/decoded bodies, persists a unique nonce, then returns accepted. Receipt is not ownership confirmation.
5. Worker verifies the signature independently through Solana RPC, matches expected app order/mint/user destination, and queries asset ownership independently. Only a matching verified wallet can yield `owner_verified`. Missing RPC/DAS support, failed signatures, parser failures and owner mismatches yield `reconciliation_required`.

Example filter template (adapt the input envelope to the selected QuickNode dataset and test it):

```js
function main(stream) {
  const watched = new Set(["REPLACE_WITH_A_VERIFIED_APP_ORDER_MINT"]);
  const transactions = [];
  for (const block of stream.data ?? []) {
    for (const tx of block.transactions ?? []) {
      if (tx.meta?.err) continue;
      const signature = tx.transaction?.signatures?.[0];
      if (!signature) continue;
      const mints = new Set(
        (tx.meta?.postTokenBalances ?? []).map((b) => b.mint),
      );
      for (const mint of mints)
        if (watched.has(mint)) transactions.push({ signature, mint });
    }
  }
  return transactions.length ? { transactions } : null;
}
```

This token-balance filter covers standard token transfers; it does **not** claim to cover compressed/Core marketplace transfers. Those require confirmed marketplace program IDs, DAS-aware events and tested dataset-specific filters. Configure a real filtered standard-token Stream for the initial bounty proof, then extend with verified program events.

Recovery: worker does not rebroadcast transactions. Inspect `webhook_deliveries`, `onchain_events` and audit records. For a `reconciliation_required` or interrupted `working` delivery, fix the exact provider/owner/parser issue first, then requeue that single delivery to `pending` in Postgres and reconcile again. Duplicate nonce deliveries do not enqueue a second job. A manual requeue never initiates purchases or funding.

Official signature reference: https://www.quicknode.com/sample-app-library/streams-webhook-validate-signature

Create Stream reference: https://www.quicknode.com/docs/streams/rest-api/create-stream
