export type NavigationScroll = {
  y: number;
  travel: number;
  hidden: boolean;
};

/** Clamp Safari rubber-banding and require deliberate travel before toggling. */
export function advanceNavigation(
  previous: NavigationScroll,
  scrollY: number,
  maxScroll: number,
): NavigationScroll {
  const y = Math.max(0, Math.min(scrollY, Math.max(0, maxScroll)));
  const delta = y - previous.y;
  if (y <= 80) return { y, travel: 0, hidden: false };
  if (!delta) return { ...previous, y };
  const travel =
    Math.sign(delta) === Math.sign(previous.travel)
      ? previous.travel + delta
      : delta;
  const hidden = travel >= 24 ? true : travel <= -12 ? false : previous.hidden;
  return { y, travel: hidden !== previous.hidden ? 0 : travel, hidden };
}
