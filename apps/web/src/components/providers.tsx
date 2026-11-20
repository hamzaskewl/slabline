"use client";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpLink } from "@trpc/client";
import { api } from "@/lib/trpc";
import { NetworkProvider } from "./network-settings";
import { WalletPreferencesProvider } from "./wallet-preferences";
import { BackNavigationProvider } from "./mobile-back-button";
import dynamic from "next/dynamic";
const AuthProvider = dynamic(() => import("./auth-provider"), { ssr: false });
const RewardSelectionProvider = dynamic(
  () => import("./reward-checkout").then((m) => m.RewardSelectionProvider),
  { ssr: false },
);
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  const [client] = useState(() =>
    api.createClient({ links: [httpLink({ url: "/api/trpc" })] }),
  );
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const content = (
    <api.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {appId ? (
          <RewardSelectionProvider>{children}</RewardSelectionProvider>
        ) : (
          children
        )}
      </QueryClientProvider>
    </api.Provider>
  );
  return (
    <BackNavigationProvider>
      <NetworkProvider>
        <WalletPreferencesProvider>
          {appId ? (
            <AuthProvider appId={appId}>{content}</AuthProvider>
          ) : (
            content
          )}
        </WalletPreferencesProvider>
      </NetworkProvider>
    </BackNavigationProvider>
  );
}
