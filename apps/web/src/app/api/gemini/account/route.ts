import { apiRoute, authenticate } from "@/server/auth";
import { getGeminiAccountSnapshot } from "@collectible/integrations";
export async function GET(request: Request) {
  return apiRoute(async () => {
    const user = await authenticate(request);
    return Response.json(await getGeminiAccountSnapshot(user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
