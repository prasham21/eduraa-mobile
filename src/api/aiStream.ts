import { fetch as expoFetch } from 'expo/fetch'
import { API_BASE_URL, getAccessToken } from './client'
import { ApiFailure, toApiFailure } from './errors'

/**
 * Streaming client for POST /ai/chat/stream.
 *
 * React Native's built-in fetch buffers the whole response, so incremental
 * reads need expo/fetch, whose Response exposes a real ReadableStream.
 *
 * Wire format (backend/app/api/v1/ai/stream.py) is SSE with one JSON object
 * per `data:` frame:
 *   {type:'meta',     conversation_id}
 *   {type:'thinking'}
 *   {type:'token',    content}
 *   {type:'error',    content}
 *   {type:'done',     message_id, conversation_id, token_usage, source}
 * terminated by the literal frame `data: [DONE]`.
 */

export interface AiStreamRequest {
  message: string
  conversation_id?: string
  question_id?: string
  paper_id?: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

/** Whether the answer drew on the learner's Eduraa data or general knowledge. */
export type AiAnswerSource = 'inside' | 'outside'

export interface AiStreamDone {
  message_id?: string
  conversation_id?: string
  source?: AiAnswerSource | null
  token_usage?: Record<string, unknown> | null
}

export interface AiStreamHandlers {
  /** Conversation id, available before any token arrives. */
  onMeta?: (conversationId: string) => void
  /** Model is working but has not emitted text yet. */
  onThinking?: () => void
  /** An incremental chunk of answer text. */
  onToken: (chunk: string) => void
  /** Server-reported mid-stream failure; the stream ends after this. */
  onStreamError?: (message: string) => void
  /** Normal completion. */
  onDone?: (done: AiStreamDone) => void
}

export type AiStreamOutcome =
  | { status: 'completed'; done: AiStreamDone }
  | { status: 'cancelled' }
  | { status: 'stream_error'; message: string }
  | { status: 'failed'; failure: ApiFailure }

function isAbort(error: unknown) {
  const name = (error as { name?: string } | null)?.name
  return name === 'AbortError'
}

/**
 * Streams one assistant reply.
 *
 * Resolves rather than throws so the caller can distinguish a user
 * cancellation from a transport failure and keep partial text either way.
 * Pass `signal` from an AbortController to cancel.
 */
export async function streamAiChat(
  payload: AiStreamRequest,
  handlers: AiStreamHandlers,
  signal?: AbortSignal,
): Promise<AiStreamOutcome> {
  const token = await getAccessToken()

  let response: Awaited<ReturnType<typeof expoFetch>>
  try {
    response = await expoFetch(`${API_BASE_URL}/api/v1/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      credentials: 'include',
      signal,
    })
  } catch (error) {
    if (isAbort(error)) return { status: 'cancelled' }
    return { status: 'failed', failure: toApiFailure(error) }
  }

  if (!response.ok) {
    // Shape a synthetic axios-like error so failures read the same everywhere.
    let detail: string | undefined
    try {
      const body = await response.text()
      detail = JSON.parse(body)?.detail
    } catch {
      // A non-JSON error body carries nothing useful.
    }
    return {
      status: 'failed',
      failure: toApiFailure({ response: { status: response.status, data: { detail } } }),
    }
  }

  const body = response.body
  if (!body) {
    return {
      status: 'failed',
      failure: {
        kind: 'unknown',
        message: 'This device could not read a streaming response.',
      },
    }
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let done: AiStreamDone = {}
  let streamError: string | null = null
  let sawTerminator = false

  try {
    for (;;) {
      const { value, done: finished } = await reader.read()
      if (finished) break
      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line.
      let split: number
      while ((split = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, split)
        buffer = buffer.slice(split + 2)

        for (const rawLine of frame.split('\n')) {
          const line = rawLine.trim()
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data) continue
          if (data === '[DONE]') {
            sawTerminator = true
            continue
          }

          let event: Record<string, unknown>
          try {
            event = JSON.parse(data)
          } catch {
            // Skip a malformed frame rather than abandoning the whole reply.
            continue
          }

          switch (event.type) {
            case 'meta':
              if (typeof event.conversation_id === 'string') handlers.onMeta?.(event.conversation_id)
              break
            case 'thinking':
              handlers.onThinking?.()
              break
            case 'token':
              if (typeof event.content === 'string' && event.content) handlers.onToken(event.content)
              break
            case 'error':
              streamError = typeof event.content === 'string' ? event.content : 'The response was interrupted.'
              break
            case 'done':
              done = {
                message_id: typeof event.message_id === 'string' ? event.message_id : undefined,
                conversation_id: typeof event.conversation_id === 'string' ? event.conversation_id : undefined,
                source: event.source === 'inside' || event.source === 'outside' ? event.source : null,
                token_usage: (event.token_usage as Record<string, unknown> | null) ?? null,
              }
              break
            default:
              break
          }
        }
      }
    }
  } catch (error) {
    if (isAbort(error)) return { status: 'cancelled' }
    return { status: 'failed', failure: toApiFailure(error) }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // Already released when the stream ended on its own.
    }
  }

  if (streamError) {
    handlers.onStreamError?.(streamError)
    return { status: 'stream_error', message: streamError }
  }

  // A stream that stops without `done` or `[DONE]` was truncated in transit.
  if (!sawTerminator && !done.message_id) {
    const message = 'The response ended early. Send again to retry.'
    handlers.onStreamError?.(message)
    return { status: 'stream_error', message }
  }

  handlers.onDone?.(done)
  return { status: 'completed', done }
}
