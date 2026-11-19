import { demoMetadata, DemoError } from "@collectible/integrations";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id))
    return new Response("Not found", { status: 404 });
  try {
    return Response.json(await demoMetadata(id), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response("Metadata unavailable", {
      status: e instanceof DemoError ? e.status : 503,
    });
  }
}
