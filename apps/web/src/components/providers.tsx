'use client';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { api } from '@/lib/trpc';
export function Providers({children}:{children:ReactNode}) {
  const [queryClient]=useState(()=>new QueryClient({defaultOptions:{queries:{staleTime:30000,retry:1,refetchOnWindowFocus:false}}}));
  const [client]=useState(()=>api.createClient({links:[httpBatchLink({url:'/api/trpc'})]}));
  return <api.Provider client={client} queryClient={queryClient}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></api.Provider>;
}
