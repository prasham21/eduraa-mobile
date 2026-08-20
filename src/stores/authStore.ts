/**
 * Eduraa Mobile - Auth Store (Zustand)
 * Mirrors frontend auth behavior using SecureStore for native persistence.
 */

import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { TOKEN_KEY, registerLogoutCallback, registerRefreshTokenCallback, setAccessToken } from '../api/client'
import { resetQueryCache } from '../api/queryClient'
import type { AccountMinimal, AuthToken } from '../types'

interface AuthState {
  user: AccountMinimal | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  setAuth: (authToken: AuthToken) => Promise<void>
  logout: () => Promise<void>
  loadFromStorage: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => {
  registerLogoutCallback(() => {
    void get().logout()
  })
  registerRefreshTokenCallback((token) => {
    set((state) => ({
      token,
      isAuthenticated: state.isAuthenticated || Boolean(state.user),
      isLoading: false,
    }))
  })

  return {
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,

    setAuth: async (authToken: AuthToken) => {
      try {
        await SecureStore.setItemAsync(TOKEN_KEY, authToken.access_token)
      } catch {
        // SecureStore is not always available in the web preview.
      }

      setAccessToken(authToken.access_token)
      resetQueryCache()
      set({
        user: authToken.user,
        token: authToken.access_token,
        isAuthenticated: true,
        isLoading: false,
      })
    },

    logout: async () => {
      try {
        await SecureStore.deleteItemAsync(TOKEN_KEY)
      } catch {
        // Ignore storage cleanup failures on unsupported platforms.
      }

      setAccessToken(null)
      resetQueryCache()
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      })
    },

    loadFromStorage: async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY)
        if (token) {
          setAccessToken(token)
          set({ token, isLoading: false })
          return
        }
      } catch {
        // Fall through to the unauthenticated state.
      }

      setAccessToken(null)
      set({ isLoading: false })
    },
  }
})
