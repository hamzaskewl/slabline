import { describe, expect, test } from "bun:test";
import { advanceNavigation, type NavigationScroll } from "./mobile-navigation";

const visible: NavigationScroll = { y: 200, travel: 0, hidden: false };
describe("mobile navigation scroll intent", () => {
  test("accumulates deliberate movement and ignores small reversals", () => {
    let state = advanceNavigation(visible, 210, 2000);
    expect(state.hidden).toBe(false);
    state = advanceNavigation(state, 225, 2000);
    expect(state.hidden).toBe(true);
    state = advanceNavigation(state, 221, 2000);
    expect(state.hidden).toBe(true);
    state = advanceNavigation(state, 225, 2000);
    expect(state.hidden).toBe(true);
    state = advanceNavigation(state, 212, 2000);
    expect(state.hidden).toBe(false);
  });
  test("always reveals near the top and on short pages", () => {
    const hidden = { y: 200, travel: 0, hidden: true };
    expect(advanceNavigation(hidden, 80, 2000).hidden).toBe(false);
    expect(advanceNavigation(hidden, 100, 0).hidden).toBe(false);
  });
  test("Safari bottom bounce does not falsely reveal the bars", () => {
    let state = { y: 1000, travel: 0, hidden: true };
    state = advanceNavigation(state, 1080, 1000);
    state = advanceNavigation(state, 1010, 1000);
    state = advanceNavigation(state, 1000, 1000);
    expect(state.hidden).toBe(true);
    expect(advanceNavigation(state, 985, 1000).hidden).toBe(false);
  });
  test("Safari top bounce stays visible", () => {
    let state = advanceNavigation(visible, -80, 2000);
    state = advanceNavigation(state, 0, 2000);
    expect(state.hidden).toBe(false);
    expect(state.y).toBe(0);
  });
});
