import { confirmSolanaTransaction } from "@collectible/integrations";
export async function GET(request: Request) {
  const sig = new URL(request.url).searchParams.get("signature") ?? "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(sig))
    return Response.json(
      { error: "Invalid Solana signature" },
      { status: 400 },
    );
  try {
    return Response.json(await confirmSolanaTransaction(sig), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Solana RPC is unavailable. Confirmation is unknown." },
      { status: 503 },
    );
  }
}
