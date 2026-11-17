import {
  getSolanaBalances,
  requireSolanaWallet,
} from "@collectible/integrations";
import { apiRoute, authenticate, ApiError } from "@/server/auth";
export async function GET(request: Request) {
  return apiRoute(async () => {
    const user = await authenticate(request);
    const wallet = new URL(request.url).searchParams.get("address") ?? "";
    try {
      await requireSolanaWallet(user.id, wallet);
    } catch {
      throw new ApiError(
        403,
        "Verify this Solana wallet for the active network before reading balances",
      );
    }
    return Response.json(await getSolanaBalances(wallet), {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
