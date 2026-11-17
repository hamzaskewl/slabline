"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
export async function privateRead<T>(
  url: string,
  token: string | null,
  signal?: AbortSignal,
): Promise<T> {
  if (!token) throw new Error("Sign in to continue.");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
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
  return useQuery({
    queryKey: ["private-read", user?.id, url],
    enabled: ready && authenticated && !!user?.id && enabled,
    queryFn: async ({ signal }) =>
      privateRead<T>(url, await getAccessToken(), signal),
    staleTime: 30000,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
