import { z } from "zod";
import { apiRoute, authenticate, ApiError } from "@/server/auth";
import {
  demoAccount,
  listRewardCards,
  providerRead,
  listGrailTokens,
  attachCachedValuations,
  withSolanaNetwork,
} from "@collectible/integrations";
import {
  positionRewardMarket,
  matchingTokens,
  selectedRewardTeam,
  DEMO_REPLAY_CARD,
} from "@collectible/domain";

export async function GET(request: Request) {
  return apiRoute(() =>
    withSolanaNetwork("devnet", async () => {
      const user = await authenticate(request);
      const id = z
        .string()
        .uuid()
        .safeParse(new URL(request.url).searchParams.get("id"));
      if (!id.success) throw new ApiError(400, "Choose a prediction position.");
      const position = (await demoAccount(user.id)).positions.find(
        (p) => p.id === id.data,
      );
      if (!position) throw new ApiError(404, "Position not found.");
      const subject = positionRewardMarket(position);
      const [cards, tokens] = await Promise.all([
        providerRead(() => listRewardCards(subject), []),
        listGrailTokens().catch(() => []),
      ]);
      if (cards.error && !position.replay)
        throw new ApiError(
          503,
          "Card listings are temporarily unavailable. Try again shortly.",
        );
      return Response.json(
        {
          cards: await attachCachedValuations(
            position.replay && !position.rehearsal
              ? [
                  DEMO_REPLAY_CARD,
                  ...cards.data.filter((c) => c.mint !== DEMO_REPLAY_CARD.mint),
                ]
              : position.rehearsal === "grail"
                ? []
                : cards.data,
          ),
          tokens: matchingTokens(subject, tokens),
          subject: selectedRewardTeam(subject)?.name ?? position.label,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }),
  );
}
