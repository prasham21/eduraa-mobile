import { QueryClient } from '@tanstack/react-query'

/**
 * Single shared cache for the app.
 *
 * Exported from its own module so the auth store can purge it on sign-in and
 * sign-out. Cached entries are keyed by endpoint, not by account, so leaving
 * them in place across an account switch would show one user another user's
 * data — and with a five-minute staleTime the new session would not even
 * refetch to correct it.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
})

/** Drops every cached response. Call whenever the signed-in identity changes. */
export function resetQueryCache() {
  queryClient.clear()
}

export default queryClient
