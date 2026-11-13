import { getSolanaBalances } from "@collectible/integrations";
import { getDb, walletLinks, eq, and } from "@collectible/db";
import { apiRoute, authenticate, ApiError } from "@/server/auth";
export async function GET(request: Request) {
  return apiRoute(async () => {
    const user = await authenticate(request);
    const wallet = new URL(request.url).searchParams.get("address") ?? "";
    const [link] = await getDb()
      .select()
      .from(walletLinks)
      .where(
        and(eq(walletLinks.address, wallet), eq(walletLinks.userId, user.id)),
      )
      .limit(1);
    if (!link)
      throw new ApiError(
        403,
        "Verify this wallet before reading account balances",
      );
    return Response.json(await getSolanaBalances(wallet), {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
