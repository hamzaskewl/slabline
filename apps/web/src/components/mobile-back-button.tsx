"use client";

import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const BackContext = createContext(false);
const entryKey = "slablineCanGoBack";

function HistoryTracker({ onChange }: { onChange: (value: boolean) => void }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const visited = useRef(false);

  useEffect(() => {
    const saved = window.history.state?.[entryKey];
    let internalReferrer = false;
    try {
      internalReferrer = new URL(document.referrer).origin === location.origin;
    } catch {}
    const canGoBack =
      typeof saved === "boolean"
        ? saved
        : visited.current || (internalReferrer && history.length > 1);
    // Preserve Next's state. The marker travels with this entry on Back,
    // Forward and reload, so a direct launch never backs out of the app.
    window.history.replaceState(
      { ...window.history.state, [entryKey]: canGoBack },
      "",
    );
    visited.current = true;
    onChange(canGoBack);
  }, [pathname, search, onChange]);
  return null;
}

export function BackNavigationProvider({ children }: { children: ReactNode }) {
  const [canGoBack, setCanGoBack] = useState(false);
  return (
    <BackContext.Provider value={canGoBack}>
      <Suspense fallback={null}>
        <HistoryTracker onChange={setCanGoBack} />
      </Suspense>
      {children}
    </BackContext.Provider>
  );
}

export function MobileBackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const canGoBack = useContext(BackContext);
  if (pathname === "/") return null;
  return (
    <button
      type="button"
      className="mobile-back-button"
      aria-label={canGoBack ? "Go back" : "Back to markets"}
      onClick={() => (canGoBack ? router.back() : router.replace("/"))}
    >
      <ArrowLeft size={21} aria-hidden="true" />
    </button>
  );
}
