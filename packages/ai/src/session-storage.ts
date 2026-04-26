import type { SessionMessage } from './types'

/**
 * localStorage-backed conversation persistence.
 *
 * Stores the latest N messages keyed by storage key. Includes
 * `schemaSnapshot` so that "回到此版本" can restore the canvas after a
 * page reload. When a write would exceed the configured byte budget the
 * oldest messages are dropped first (FIFO ring).
 */

const DEFAULT_MAX_BYTES = 2_000_000 // ~2MB - well under the 5MB browser cap
const DEFAULT_MAX_MESSAGES = 80

export interface SessionStorageOptions {
  key: string
  maxBytes?: number
  maxMessages?: number
}

export function loadSession(options: SessionStorageOptions): SessionMessage[] {
  if (typeof localStorage === 'undefined')
    return []
  try {
    const raw = localStorage.getItem(options.key)
    if (!raw)
      return []
    const parsed = JSON.parse(raw) as { messages?: SessionMessage[] }
    return Array.isArray(parsed?.messages) ? parsed.messages : []
  }
  catch {
    return []
  }
}

export function saveSession(
  messages: SessionMessage[],
  options: SessionStorageOptions,
): void {
  if (typeof localStorage === 'undefined')
    return

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES

  // Trim by message count first.
  let working = messages.length > maxMessages
    ? messages.slice(messages.length - maxMessages)
    : messages.slice()

  // Then iteratively drop oldest until JSON fits the byte budget.
  let payload = JSON.stringify({ messages: working })
  while (payload.length > maxBytes && working.length > 1) {
    working = working.slice(1)
    payload = JSON.stringify({ messages: working })
  }

  // Last resort: drop schemaSnapshot of all but the newest message.
  if (payload.length > maxBytes && working.length > 0) {
    const newest = working[working.length - 1]!
    const stripped = working.slice(0, -1).map(m => ({
      ...m,
      schemaSnapshot: undefined,
    }))
    working = [...stripped, newest]
    payload = JSON.stringify({ messages: working })
  }

  try {
    localStorage.setItem(options.key, payload)
  }
  catch {
    // Quota exceeded or storage disabled — silently drop.
  }
}

export function clearSession(options: SessionStorageOptions): void {
  if (typeof localStorage === 'undefined')
    return
  try {
    localStorage.removeItem(options.key)
  }
  catch {}
}
