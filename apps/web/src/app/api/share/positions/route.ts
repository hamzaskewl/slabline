import { z } from "zod";
import {
  apiRoute,
  authenticate,
  boundedJson,
  requireOrigin,
  ApiError,
} from "@/server/auth";
import {
  prepareShare,
  publishShare,
  validateShare,
  saveShareTarget,
  shareCatalog,
  shareReferenceSchema,
  targetChoiceSchema,
} from "@/server/position-share";

const bodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("prepare"),
      reference: shareReferenceSchema,
      showProfile: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("publish"),
      draft: z.string().regex(/^[a-f0-9]{48}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("validate"),
      draft: z.string().regex(/^[a-f0-9]{48}$/),
    })
    .strict(),
  z
    .object({ action: z.literal("catalog"), reference: shareReferenceSchema })
    .strict(),
  z
    .object({
      action: z.literal("target"),
      reference: shareReferenceSchema,
      choice: targetChoiceSchema,
    })
    .strict(),
]);
export async function POST(request: Request) {
  return apiRoute(async () => {
    requireOrigin(request);
    const owner = await authenticate(request);
    const parsed = bodySchema.safeParse(await boundedJson(request));
    if (!parsed.success) throw new ApiError(400, "Invalid share request.");
    const b = parsed.data;
    const result =
      b.action === "prepare"
        ? await prepareShare(owner, b.reference, b.showProfile)
        : b.action === "publish"
          ? await publishShare(owner, b.draft)
          : b.action === "validate"
            ? await validateShare(owner, b.draft)
            : b.action === "catalog"
              ? await shareCatalog(owner, b.reference)
              : await saveShareTarget(owner, b.reference, b.choice);
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
