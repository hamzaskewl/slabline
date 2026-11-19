"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
const NetworkContext = createContext<{
  network: "mainnet" | "devnet";
  setNetwork: (network: "mainnet" | "devnet") => void;
}>({ network: "devnet", setNetwork: () => {} });
export const useNetwork = () => useContext(NetworkContext);
export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, update] = useState<"mainnet" | "devnet">("devnet");
  useEffect(() => {
    try {
      if (localStorage.getItem("cm-network-v1") === "mainnet")
        update("mainnet");
    } catch {}
  }, []);
  function setNetwork(value: "mainnet" | "devnet") {
    update(value);
    try {
      localStorage.setItem("cm-network-v1", value);
    } catch {}
  }
  return (
    <NetworkContext.Provider value={{ network, setNetwork }}>
      {children}
    </NetworkContext.Provider>
  );
}
