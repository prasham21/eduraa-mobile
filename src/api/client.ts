/**
 * Eduraa Mobile - Axios API Client
 * Mirrors frontend auth behavior with bearer tokens and refresh retry.
 */

import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

type ApiTarget = 'local' | 'prod'

const PROD_API_BASE_URL =
  'https://eduraa-ai-dev-cin-api.gentleforest-0ad6efdc.centralindia.azurecontainerapps.io'
const LOCAL_API_PORT = '8000'

const normalizeApiTarget = (value?: string): ApiTarget => {
  return value?.trim().toLowerCase() === 'prod' ? 'prod' : 'local'
}

const getWebLocalApiUrl = () => {
  if (typeof window === 'undefined' || !window.location?.hostname) {
    return `http://localhost:${LOCAL_API_PORT}`
  }

  return `${window.location.protocol}//${window.location.hostname}:${LOCAL_API_PORT}`
}

const resolveApiBaseUrl = () => {
  const explicitUrl = process.env.EXPO_PUBLIC_API_URL?.trim()
  if (explicitUrl) return explicitUrl.replace(/\/$/, '')

  const target = normalizeApiTarget(process.env.EXPO_PUBLIC_API_TARGET)
  if (target === 'prod') return PROD_API_BASE_URL

  if (Platform.OS === 'web') return getWebLocalApiUrl()

  // Android emulators expose the host machine through 10.0.2.2. Using
  // localhost here points back to the emulator and makes every local API
  // request fail even when the backend is healthy on Windows.
  if (Platform.OS === 'android') return `http://10.0.2.2:${LOCAL_API_PORT}`

  return `http://localhost:${LOCAL_API_PORT}`
}

/**
 * Resolve an asset path returned by the API. Mirrors the web client's
 * buildApiUrl: already-absolute URLs (blob storage, CDN) pass through
 * untouched, relative paths get the API origin prefixed.
 */
export function buildAssetUrl(path?: string | null): string | undefined {
  const value = path?.trim()
  if (!value) return undefined
  if (/^https?:\/\//i.test(value)) return value
  return `${API_BASE_URL}${value.startsWith('/') ? '' : '/'}${value}`
}

export const API_TARGET = normalizeApiTarget(process.env.EXPO_PUBLIC_API_TARGET)
export const API_BASE_URL = resolveApiBaseUrl()
export const TOKEN_KEY = 'eduraa_access_token'

var inMemoryAccessToken: string | null = null

export function setAccessToken(token: string | null) {
  inMemoryAccessToken = token
}

/**
 * The bearer token, using the same precedence as the axios interceptor.
 *
 * SecureStore is unavailable on web, where the token lives only in memory, so
 * anything issuing requests outside axios (the SSE stream) must consult both.
 */
export async function getAccessToken(): Promise<string | null> {
  if (inMemoryAccessToken) return inMemoryAccessToken
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY)
  } catch {
    return null
  }
}

const sharedClientConfig = {
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 60000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
}

const apiClient = axios.create(sharedClientConfig)
const refreshClient = axios.create(sharedClientConfig)

if (__DEV__) {
  console.info(`[Eduraa API] target=${API_TARGET} base=${API_BASE_URL}`)
}

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = inMemoryAccessToken ?? (await SecureStore.getItemAsync(TOKEN_KEY))
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch {
      if (inMemoryAccessToken && config.headers) {
        config.headers.Authorization = `Bearer ${inMemoryAccessToken}`
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

type AuthRefreshPayload = {
  access_token: string
}

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
}

let logoutCallback: (() => void) | null = null
let refreshTokenCallback: ((token: string) => Promise<void> | void) | null = null
let refreshPromise: Promise<string> | null = null

export function registerLogoutCallback(cb: () => void) {
  logoutCallback = cb
}

export function registerRefreshTokenCallback(cb: (token: string) => Promise<void> | void) {
  refreshTokenCallback = cb
}

async function persistAccessToken(token: string) {
  inMemoryAccessToken = token
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token)
  } catch {
    // SecureStore may be unavailable on web; the in-memory token still covers this session.
  }
  await refreshTokenCallback?.(token)
}

async function clearAccessToken() {
  inMemoryAccessToken = null
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY)
  } catch {
    // Ignore storage cleanup failures on unsupported platforms.
  }
}

function isAuthEndpoint(url?: string) {
  return Boolean(url?.includes('/auth/login') || url?.includes('/auth/refresh') || url?.includes('/auth/logout'))
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post<AuthRefreshPayload>('/auth/refresh')
      .then(async (response) => {
        const token = response.data.access_token
        if (!token) {
          throw new Error('Refresh response did not include an access token.')
        }
        await persistAccessToken(token)
        return token
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint(originalRequest.url)) {
      originalRequest._retry = true
      try {
        const token = await refreshAccessToken()
        originalRequest.headers.Authorization = `Bearer ${token}`
        return apiClient.request(originalRequest as AxiosRequestConfig)
      } catch {
        await clearAccessToken()
        logoutCallback?.()
      }
    } else if (error.response?.status === 401 && !isAuthEndpoint(originalRequest?.url)) {
      await clearAccessToken()
      logoutCallback?.()
    }

    return Promise.reject(error)
  }
)

export default apiClient
