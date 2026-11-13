import { gunzipSync } from "node:zlib";
import { verifyQuickNode } from "@collectible/integrations";
import { getDb, webhookDeliveries } from "@collectible/db";
export async function POST(request: Request) {
  const secret = process.env.QUICKNODE_WEBHOOK_SECRET;
  if (!secret)
    return Response.json(
      { error: "QuickNode Stream signing secret not configured" },
      { status: 503 },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 1048576)
    return new Response("Payload too large", { status: 413 });
  try {
    const wire = new Uint8Array(await request.arrayBuffer());
    if (wire.byteLength > 1048576)
      return new Response("Payload too large", { status: 413 });
    const decoded =
      request.headers.get("content-encoding") === "gzip"
        ? gunzipSync(wire, { maxOutputLength: 1048576 })
        : wire;
    const payload = new TextDecoder().decode(decoded),
      nonce = request.headers.get("x-qn-nonce") ?? "";
    if (
      !verifyQuickNode({
        payload,
        nonce,
        timestamp: request.headers.get("x-qn-timestamp") ?? "",
        signature: request.headers.get("x-qn-signature") ?? "",
        secret,
      })
    )
      return Response.json(
        { error: "Invalid or expired webhook signature" },
        { status: 401 },
      );
    const data = JSON.parse(payload) as unknown;
    const saved = await getDb()
      .insert(webhookDeliveries)
      .values({ nonce, data, state: "pending" })
      .onConflictDoNothing()
      .returning({ nonce: webhookDeliveries.nonce });
    return Response.json(
      { accepted: true, duplicate: saved.length === 0, reconciled: false },
      { status: 202 },
    );
  } catch {
    return Response.json(
      {
        error:
          "Webhook payload invalid or persistence unavailable; retry delivery",
      },
      { status: 503 },
    );
  }
}
