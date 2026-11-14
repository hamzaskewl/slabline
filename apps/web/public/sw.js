// Only full page navigations receive the offline message. API calls, account
// callbacks, streams and mutations always use their normal network path.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  event.respondWith(
    fetch(request).catch(
      () =>
        new Response(
          '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Collectible Markets · Offline</title><style>html{color-scheme:dark;background:#010304;color:#fff;font:16px system-ui}main{max-width:28rem;margin:22vh auto;padding:1rem}p{color:#b4bec7}a{color:#68caff}</style><main><p>Collectible Markets</p><h1>You’re offline</h1><p>Reconnect to load markets and your account.</p><a href="">Try again</a></main></html>',
          {
            status: 503,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            },
          },
        ),
    ),
  );
});
