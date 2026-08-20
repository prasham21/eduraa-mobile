/**
 * Shared normalization of axios failures into states the UI can speak about
 * honestly: offline, expired session, not authorized, conflict, and so on.
 */

export type ApiFailureKind =
  | 'offline'
  | 'session_expired'
  | 'not_authorized'
  | 'not_found'
  | 'invalid'
  | 'conflict'
  | 'server'
  | 'unknown'

export interface ApiFailure {
  kind: ApiFailureKind
  status?: number
  /** Server-provided detail when present. Never invented. */
  detail?: string
  message: string
}

const FAILURE_COPY: Record<ApiFailureKind, string> = {
  offline: 'You appear to be offline. Reconnect and try again — nothing was sent.',
  session_expired: 'Your session expired. Sign in again to continue.',
  not_authorized: 'Your account is not authorized for this.',
  not_found: 'This no longer exists.',
  invalid: 'The server rejected this change.',
  conflict: 'Someone else changed this data. Reload before saving again.',
  server: 'The server could not complete this request. Try again shortly.',
  unknown: 'Something went wrong. Try again.',
}

export function toApiFailure(error: unknown): ApiFailure {
  const axiosError = error as {
    response?: { status?: number; data?: { detail?: unknown } }
    request?: unknown
    code?: string
    message?: string
  }

  const status = axiosError?.response?.status
  const rawDetail = axiosError?.response?.data?.detail
  const detail = typeof rawDetail === 'string' && rawDetail.trim() ? rawDetail.trim() : undefined

  if (!axiosError?.response) {
    const isNetwork = Boolean(axiosError?.request) || axiosError?.code === 'ERR_NETWORK' || axiosError?.code === 'ECONNABORTED'
    const kind: ApiFailureKind = isNetwork ? 'offline' : 'unknown'
    return { kind, detail, message: detail ?? FAILURE_COPY[kind] }
  }

  let kind: ApiFailureKind = 'unknown'
  if (status === 401) kind = 'session_expired'
  else if (status === 403) kind = 'not_authorized'
  else if (status === 404) kind = 'not_found'
  else if (status === 409) kind = 'conflict'
  else if (status === 400 || status === 422) kind = 'invalid'
  else if (status && status >= 500) kind = 'server'

  // A server explanation is more useful than our generic copy, except for
  // auth failures where the backend detail is terse and unhelpful.
  const preferDetail = kind === 'invalid' || kind === 'not_found' || kind === 'conflict'
  return { kind, status, detail, message: (preferDetail && detail) || FAILURE_COPY[kind] }
}
