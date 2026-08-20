/**
 * Eduraa Mobile — Root App
 */

import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { QueryClientProvider } from '@tanstack/react-query'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StyleSheet, View, ActivityIndicator, Platform } from 'react-native'
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope'
import { SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk'
import RootNavigator from './src/navigation'
import { useAuthStore } from './src/stores/authStore'
import { authApi } from './src/api/auth'
import { queryClient } from './src/api/queryClient'

function AppContent() {
  const { setAuth, logout } = useAuthStore()

  // On mount: load token from SecureStore, then validate with /auth/me
  useEffect(() => {
    const init = async () => {
      // loadFromStorage returns the token it found
      const store = useAuthStore.getState()
      await store.loadFromStorage()
      // Read token directly from store after loading
      const { token } = useAuthStore.getState()
      if (token) {
        try {
          const user = await authApi.me()
          const latestToken = useAuthStore.getState().token || token
          // Reconstruct minimal auth state with the validated user
          await setAuth({ access_token: latestToken, token_type: 'bearer', user })
        } catch {
          // Token is invalid or expired
          await logout()
        }
      }
    }
    void init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <StatusBar style="auto" />
      <WebPreviewShell>
        <RootNavigator />
      </WebPreviewShell>
    </>
  )
}

function WebPreviewShell({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') {
    return <>{children}</>
  }

  return (
    <View style={styles.webStage}>
      <View style={styles.webPhone}>{children}</View>
    </View>
  )
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  })

  if (!fontsLoaded) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' }]}>
        <ActivityIndicator color="#0f766e" />
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppContent />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  webStage: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#e9eef2',
  },
  webPhone: {
    width: '100%',
    maxWidth: 430,
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#fffaf2',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.18,
    shadowRadius: 50,
  },
})
