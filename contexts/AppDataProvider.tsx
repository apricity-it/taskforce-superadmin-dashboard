import { ReactNode, useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

const CACHE_KEY = 'TASKFORCE_QUERY_CACHE_V2'
const CACHE_BUSTER = 'taskforce-cache-v2'

function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 60 * 24,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: false,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}

const queryClient = createAppQueryClient()

export default function AppDataProvider({ children }: { children: ReactNode }) {
  const [persister, setPersister] = useState<ReturnType<typeof createSyncStoragePersister> | null>(null)

  useEffect(() => {
    setPersister(
      createSyncStoragePersister({
        storage: window.localStorage,
        key: CACHE_KEY,
        throttleTime: 1000,
      })
    )
  }, [])

  useEffect(() => {
    focusManager.setFocused(document.visibilityState === 'visible')
    const onVisibility = () => focusManager.setFocused(document.visibilityState === 'visible')
    const onOnline = () => onlineManager.setOnline(true)
    const onOffline = () => onlineManager.setOnline(false)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (!persister) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 12,
        buster: CACHE_BUSTER,
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}