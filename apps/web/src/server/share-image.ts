import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { safeImage } from "@collectible/integrations";

export function publicAssetPath(file: string) {
  // Next runs with apps/web as cwd in both the repo scripts and Railway.
  const root = existsSync(path.join(process.cwd(), "public"))
    ? process.cwd()
    : path.join(process.cwd(), "apps/web");
  return path.join(root, "public", file);
}
export function safeShareImage(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  // These are produced only by shareImage and read from authenticated persisted targets.
  if (
    value.length < 3_000_000 &&
    /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value)
  )
    return value;
  if (value === "/demo/wembanyama-hoops.jpg") return value;
  const allowed = safeImage(value);
  if (!allowed) return null;
  const url = new URL(allowed);
  if (url.username || url.password || url.search || url.hash || url.port)
    return null;
  return url.href;
}
/** Fixed provider allowlist, no redirects/credentials, bounded download and decode. */
export async function shareImage(value: string | null): Promise<string | null> {
  const src = safeShareImage(value);
  if (!src) return null;
  try {
    let bytes: Buffer;
    if (src.startsWith("data:image/png;base64,"))
      bytes = Buffer.from(src.slice(22), "base64");
    else if (src.startsWith("/demo/"))
      bytes = await readFile(publicAssetPath(src.slice(1)));
    else {
      const response = await fetch(src, {
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "image/png,image/jpeg,image/webp" },
      });
      if (
        !response.ok ||
        !/^image\/(png|jpeg|webp|avif)/.test(
          response.headers.get("content-type") ?? "",
        ) ||
        !response.body
      )
        return null;
      const chunks: Uint8Array[] = [];
      let length = 0;
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        length += chunk.length;
        if (length > 8 * 1024 * 1024) {
          await response.body.cancel().catch(() => {});
          return null;
        }
        chunks.push(chunk);
      }
      bytes = Buffer.concat(chunks);
    }
    const png = await sharp(bytes, { limitInputPixels: 20_000_000 })
      .rotate()
      .resize({
        width: 600,
        height: 700,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}
