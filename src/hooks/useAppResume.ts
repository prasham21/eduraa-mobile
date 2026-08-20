import { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'

/**
 * Runs `onResume` when the app comes back to the foreground.
 * Class rosters and enrollments change while the app is backgrounded, so every
 * class-teacher surface reconciles with the server on resume.
 */
export function useAppResume(onResume: () => void, enabled = true) {
  const handler = useRef(onResume)
  handler.current = onResume

  useEffect(() => {
    if (!enabled) return
    let previous: AppStateStatus = AppState.currentState

    const subscription = AppState.addEventListener('change', (next) => {
      const wasBackground = previous === 'background' || previous === 'inactive'
      previous = next
      if (wasBackground && next === 'active') handler.current()
    })

    return () => subscription.remove()
  }, [enabled])
}

export default useAppResume
