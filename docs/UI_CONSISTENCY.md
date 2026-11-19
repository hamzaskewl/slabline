# Shared interface rules

These rules apply across Slabline, including Pull & Predict. Follow them when adding or changing an interface.

- Use `apps/web/src/components/ui/select.tsx` for value dropdowns, with visible labels and the shared menu, keyboard navigation, focus, disabled, and selected states. Discovery's `MarketSelect` uses the same Radix primitives and CSS. Do not introduce native `<select>` controls or a separate dropdown style. Navigation menus remain navigation menus.
- Use the shared `Button`, `MarketArt`, `CardImage`, and `UsdcAmount` components. Display amounts to two decimals and preserve exact values in calculations and requests.
- Use 8px between a label and its control or within a compact option group, 12px between separate related controls, 16px between a result summary and its cards, and 20–24px between sections. Give repeated siblings equal padding and gaps. Do not add margins to every descendant button or rely on browser paragraph margins for layout.
- Keep the single large profile entry at the far right of the desktop header. The phone layout uses its Profile tab. Do not add a second small profile icon to desktop navigation. Settings, wallet preferences, and replay controls belong inside Profile; do not add a header settings button.
- Highlight Pull & Predict navigation with the ice-blue text/icon color. Its default background is transparent; hover and focus can use the shared subtle surface.
- Team and Player pack themes search sports only. All markets may search every category. Do not show all team suggestions before typing, carry a team name into Player mode, or infer player/team relationships from unrelated words or historical card associations. Preserve the sport context when naming teams: a football market’s Miami label must not become Miami Heat.
- A themed pack shows only matching predictions. Once an outcome is chosen, keep it fixed through confirmation; allow Yes/No without a second contract dropdown. Revalidate the subject on the server.
- Show confirmation figures automatically when an outcome or side is selected. Use the heading **Confirm prediction**, the facts **Shares**, **Cost**, and **If correct**, and **Confirm Yes** / **Confirm No** as the final action. Do not add a Review depth quote step, a Quote review heading, or extra fee/average-price rows to this flow.
- Loading, error, and retry states must preserve the saved pack. Wait for initial price data instead of presenting a cold subscription as a closed market. Never invent liquidity or submit a different prediction to hide a data failure.

Verify the changed flow at desktop and phone widths, with long names, empty results, loading, errors, and keyboard focus. Check existing components before creating a new control or spacing convention.
