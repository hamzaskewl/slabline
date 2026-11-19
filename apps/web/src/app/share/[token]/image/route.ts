import { readPublicShare } from "@/server/position-share";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const share = await readPublicShare((await params).token);
  if (!share) return new Response("Share not found", { status: 404 });
  return new Response(Buffer.from(share.png, "base64"), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
