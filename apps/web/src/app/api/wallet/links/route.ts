import { getDb, walletLinks, eq, and } from "@collectible/db";
import { solanaNetwork } from "@collectible/integrations";
import { apiRoute, authenticate } from "@/server/auth";
export async function GET(request: Request) {
  return apiRoute(async () => {
    const user = await authenticate(request);
    const wallets = await getDb()
      .select({ address: walletLinks.address, network: walletLinks.network })
      .from(walletLinks)
      .where(
        and(
          eq(walletLinks.userId, user.id),
          eq(walletLinks.network, solanaNetwork()),
        ),
      );
    return Response.json(
      { wallets, network: solanaNetwork() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }, request);
}
