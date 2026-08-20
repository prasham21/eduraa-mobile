/**
 * Status, tone, and formatting helpers for Agentic Learning.
 *
 * Ported from the web's features/agentic-learning-v3/theme-v3.ts so the mobile
 * hub, concept buckets, and lesson describe a learner's state with exactly the
 * same rules and wording the web uses.
 */

import { colors } from '../../theme'

export type TopicStatus = 'needs_work' | 'improving' | 'strong' | 'resolved'

/** Ordering used when listing a subject's concepts: worst first. */
export const STATUS_ORDER: Record<string, number> = {
  needs_work: 0,
  improving: 1,
  strong: 2,
  resolved: 3,
}

export function deriveStatus(mastery: number, trend?: number[]): TopicStatus {
  if (mastery >= 80) return 'strong'
  if (mastery < 55) return 'needs_work'
  if (trend && trend.length >= 2 && trend[trend.length - 1] > trend[0]) return 'improving'
  return 'needs_work'
}

export function masteryTone(pct: number) {
  if (pct >= 80) return colors.success
  if (pct >= 60) return colors.warning
  return colors.danger
}

const STUDENT_LABEL: Record<TopicStatus, string> = {
  needs_work: 'Needs attention',
  improving: 'Getting better',
  strong: 'Looking good',
  resolved: 'All caught up',
}

const EXAM_LABEL: Record<TopicStatus, string> = {
  needs_work: 'Mark-leak',
  improving: 'Trending up',
  strong: 'Mock-ready',
  resolved: 'Cleared',
}

export function statusLabel(status: TopicStatus, isJee: boolean) {
  return isJee ? EXAM_LABEL[status] : STUDENT_LABEL[status]
}

export function statusTone(status: TopicStatus) {
  if (status === 'needs_work') return colors.danger
  if (status === 'improving') return colors.warning
  if (status === 'strong') return colors.success
  return colors.textMuted
}

/**
 * Two kinds of "nothing to show" that must not be reported as weakness:
 * a subject with no concepts extracted yet, and one with concepts but no
 * recorded activity.
 */
export type SubjectSignal = 'no_topics' | 'not_started' | 'tracked'

export function subjectSignal(input: {
  total_subtopics: number
  average_mastery: number
  last_activity_at?: string | null
}): SubjectSignal {
  if (input.total_subtopics === 0) return 'no_topics'
  if (input.average_mastery === 0 && !input.last_activity_at) return 'not_started'
  return 'tracked'
}

export function signalLabel(signal: SubjectSignal, status: TopicStatus, isJee: boolean, unresolved: number) {
  if (signal === 'no_topics') return 'No topics yet'
  if (signal === 'not_started') return 'Not started'
  if (!isJee) return statusLabel(status, false)
  if (status === 'needs_work') return `${unresolved} priority topic${unresolved === 1 ? '' : 's'}`
  return statusLabel(status, true)
}

export function signalTone(signal: SubjectSignal, status: TopicStatus) {
  if (signal !== 'tracked') return colors.textSoft
  return statusTone(status)
}

/** "Today" / "Yesterday" / "4 days ago" / "Mar 5", matching web. */
export function formatLastActivity(value?: string | null) {
  if (!value) return 'No activity'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No activity'
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * `confidence`, `evidence_strength`, and `repeated_mistake_index` come back as
 * 0.0-1.0 floats from the backend, while mastery is already 0-100. Rendering a
 * ratio directly showed 0.75 confidence as "1%".
 */
export function ratioToPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value * 100)))
}

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}
