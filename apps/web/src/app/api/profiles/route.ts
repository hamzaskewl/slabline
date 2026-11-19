import { apiRoute } from "@/server/auth";
import { searchPublicProfiles } from "@/server/profiles";
export async function GET(request: Request) {
  return apiRoute(async () =>
    Response.json(
      await searchPublicProfiles(
        new URL(request.url).searchParams.get("q") ?? "",
      ),
      { headers: { "Cache-Control": "no-store" } },
    ),
  );
}
