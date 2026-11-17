import { getWalletCollection } from "@collectible/integrations";
import { apiRoute, authenticate, ApiError } from "@/server/auth";
import { address } from "@solana/kit";
export async function GET(request: Request) {
  return apiRoute(async () => {
    const user = await authenticate(request),
      params = new URL(request.url).searchParams;
    const wallet = params.get("address") ?? "",
      page = Number(params.get("page") ?? 1);
    try {
      address(wallet);
    } catch {
      throw new ApiError(400, "Invalid Solana address");
    }
    if (!Number.isInteger(page) || page < 1 || page > 100)
      throw new ApiError(400, "Invalid collection page");
    try {
      return Response.json(await getWalletCollection(user.id, wallet, page), {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch {
      throw new ApiError(
        503,
        "Collection unavailable. Verify this wallet in Wallet, then retry. Indexer or credit limits may also prevent this read.",
      );
    }
  });
}
