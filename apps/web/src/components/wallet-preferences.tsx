"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
const Context = createContext<{
  selected: Record<string, string>;
  choose: (key: string, address: string) => void;
}>({ selected: {}, choose: () => {} });
export function WalletPreferencesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  return (
    <Context.Provider
      value={{
        selected,
        choose: (key, address) =>
          setSelected((s) => ({ ...s, [key]: address })),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWalletPreference(
  owner: string | undefined,
  network: string,
) {
  const context = useContext(Context),
    key = `${owner ?? ""}:${network}`;
  return [
    context.selected[key] ?? "",
    (address: string) => context.choose(key, address),
  ] as const;
}
