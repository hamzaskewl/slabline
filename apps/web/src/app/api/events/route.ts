export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "";
  if (!/^[A-Z0-9-]{1,120}$/.test(symbol))
    return new Response("Invalid symbol", { status: 400 });
  try {
    const response = await fetch(
      `${process.env.WORKER_URL ?? "http://localhost:4001"}/events?symbol=${encodeURIComponent(symbol)}`,
      { signal: request.signal, cache: "no-store" },
    );
    if (!response.ok)
      return new Response("Gemini book unavailable", { status: 503 });
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return new Response("Data worker unavailable", { status: 503 });
  }
}
