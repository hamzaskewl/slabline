import {
  apiRoute,
  authenticate,
  boundedJson,
  requireOrigin,
} from "@/server/auth";
import { ownProfile, savePublicProfile } from "@/server/profiles";
export async function GET(request: Request) {
  return apiRoute(async () =>
    Response.json(await ownProfile((await authenticate(request)).id), {
      headers: { "Cache-Control": "private, no-store" },
    }),
  );
}
export async function PUT(request: Request) {
  return apiRoute(async () => {
    requireOrigin(request);
    const owner = await authenticate(request);
    return Response.json(
      await savePublicProfile(owner.id, await boundedJson(request)),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
