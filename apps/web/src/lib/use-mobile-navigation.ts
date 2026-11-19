"use client";

import { useEffect, useRef } from "react";
import { advanceNavigation, type NavigationScroll } from "./mobile-navigation";

export function useMobileNavigation(routeKey: string) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const shell = ref.current;
    if (!shell) return;
    const mobile = window.matchMedia(
      "(max-width: 760px), (pointer: coarse) and (max-height: 540px) and (max-width: 1000px)",
    );
    let state: NavigationScroll = {
      y: window.scrollY,
      travel: 0,
      hidden: false,
    };
    let frame = 0;
    let width = window.innerWidth;
    const reveal = () => {
      state = { y: Math.max(0, window.scrollY), travel: 0, hidden: false };
      shell.dataset.navigationHidden = "false";
    };
    const update = () => {
      frame = 0;
      // Keep search and keyboard navigation in view while the user interacts.
      const active = document.activeElement;
      const editing = active?.matches(
        'input, textarea, select, [contenteditable="true"]',
      );
      const navigationFocus =
        active?.matches(":focus-visible") &&
        active.closest(".exchange-header, .phone-tabs");
      if (!mobile.matches || editing || navigationFocus) {
        reveal();
        return;
      }
      state = advanceNavigation(
        state,
        window.scrollY,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      shell.dataset.navigationHidden = String(state.hidden);
    };
    // Safari's browser bars resize the viewport while scrolling. Only reset
    // for a width change (rotation/window resize), not browser chrome movement.
    const onResize = () => {
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        reveal();
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const onFocus = (event: FocusEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".exchange-header, .phone-tabs")
      )
        reveal();
    };
    reveal();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    shell.addEventListener("focusin", onFocus);
    mobile.addEventListener("change", reveal);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      shell.removeEventListener("focusin", onFocus);
      mobile.removeEventListener("change", reveal);
      delete shell.dataset.navigationHidden;
    };
  }, [routeKey]);

  return ref;
}
