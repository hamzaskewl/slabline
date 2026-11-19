"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useNetwork } from "@/components/network-settings";
export async function privateRead<T>(
  url: string,
  token: string | null,
  signal?: AbortSignal,
  network?: "mainnet" | "devnet",
): Promise<T> {
  if (!token) throw new Error("Sign in to continue.");
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(network ? { "X-Market-Network": network } : {}),
    },
    cache: "no-store",
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Account data is unavailable.");
  return data as T;
}
export function usePrivateRead<T>(url: string, enabled = true) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { network } = useNetwork();
  return useQuery({
    queryKey: ["private-read", user?.id, url, network],
    enabled: ready && authenticated && !!user?.id && enabled,
    queryFn: async ({ signal }) =>
      privateRead<T>(url, await getAccessToken(), signal, network),
    staleTime: 30000,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
