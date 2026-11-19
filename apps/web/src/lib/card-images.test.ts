import { expect, test } from "bun:test";
import { canOptimizeCardImage } from "./card-images";

test("only public provider artwork is eligible for server image caching", () => {
  expect(canOptimizeCardImage("https://arweave.net/image-hash")).toBe(true);
  expect(
    canOptimizeCardImage("https://nft.collectorcrypt.com/front/card-id"),
  ).toBe(true);
  expect(canOptimizeCardImage("/demo/wembanyama-hoops.jpg")).toBe(true);
  for (const src of [
    "http://nft.collectorcrypt.com/front/card-id",
    "https://nft.collectorcrypt.com.attacker.test/image",
    "https://user:secret@nft.collectorcrypt.com/front/card-id",
    "https://nft.collectorcrypt.com:8443/front/card-id",
    "https://nft.collectorcrypt.com/front/card-id?token=private",
    "/api/wallet/collection",
    "/demo/../api/wallet/collection",
    "http://127.0.0.1:4001/markets",
    "//arweave.net/image-hash",
  ])
    expect(canOptimizeCardImage(src)).toBe(false);
});
