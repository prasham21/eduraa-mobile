import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Tracks the OS "reduce motion" setting.
 *
 * Extracted from the pattern already used in AuthIntelligenceHero so every
 * animated surface honours the same signal instead of each re-implementing it.
 */
export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion)
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion)
    return () => subscription.remove()
  }, [])

  return reducedMotion
}

export default useReducedMotion
