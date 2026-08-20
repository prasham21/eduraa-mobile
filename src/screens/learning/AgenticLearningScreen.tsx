import React, { useCallback, useMemo } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, ProgressRing, SkeletonCard } from '../../components/ui'
import { agenticLearningApi, AgenticLearningSubjectBucket } from '../../api/agenticLearning'
import { toApiFailure } from '../../api/errors'
import { useAppResume } from '../../hooks/useAppResume'
import { useLearnerTrack } from '../../hooks/useLearnerTrack'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import {
  deriveStatus,
  formatLastActivity,
  masteryTone,
  signalLabel,
  signalTone,
  subjectSignal,
} from './agenticStatus'

/** Screen 1 of the learner flow, mirroring the web hub: subjects only. */
function SubjectCard({
  subject,
  showExamMetrics,
  onOpen,
}: {
  subject: AgenticLearningSubjectBucket
  showExamMetrics: boolean
  onOpen: () => void
}) {
  const signal = subjectSignal(subject)
  const status = deriveStatus(subject.average_mastery, subject.mastery_trend)
  const label = signalLabel(signal, status, showExamMetrics, subject.unresolved_count)
  const tone = signalTone(signal, status)
  const hasSignal = signal === 'tracked'
  const weightage = showExamMetrics ? subject.paper_weightage_pct : null

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={
        hasSignal
          ? `${subject.subject_name}, ${Math.round(subject.average_mastery)} percent, ${label}, ${subject.unresolved_count} to review`
          : `${subject.subject_name}, ${label}`
      }
      style={({ pressed }) => [styles.subjectCard, pressed && styles.pressed]}
    >
      <View style={styles.subjectHeader}>
        <View style={styles.subjectHeaderCopy}>
          <Text style={styles.subjectEyebrow}>{weightage != null ? `${weightage}% weightage` : 'Subject'}</Text>
          <Text style={styles.subjectName} numberOfLines={2}>
            {subject.subject_name}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: tone }]} />
            <Text style={styles.statusLabel}>{label}</Text>
          </View>
        </View>

        <View style={styles.ringWrap}>
          {hasSignal ? (
            <ProgressRing
              value={subject.average_mastery}
              size={58}
              strokeWidth={6}
              color={masteryTone(subject.average_mastery)}
            />
          ) : (
            <View style={styles.ringPlaceholder}>
              <Text style={styles.ringPlaceholderText}>—</Text>
            </View>
          )}
          <Text style={styles.ringCaption}>progress</Text>
        </View>
      </View>

      {hasSignal && subject.top_weak_topic && status !== 'strong' && status !== 'resolved' ? (
        <View style={styles.startWith}>
          <Text style={styles.startWithText} numberOfLines={2}>
            Start with: {subject.top_weak_topic}
          </Text>
        </View>
      ) : null}

      <View style={styles.subjectFooter}>
        <View style={styles.chipRow}>
          {subject.unresolved_count > 0 ? (
            <View style={styles.reviewChip}>
              <Text style={styles.reviewChipText}>{subject.unresolved_count} to review</Text>
            </View>
          ) : null}
          <View style={styles.countChip}>
            <Text style={styles.countChipText}>
              {subject.total_subtopics} topic{subject.total_subtopics === 1 ? '' : 's'}
            </Text>
          </View>
        </View>
        <Text style={styles.activityText}>{formatLastActivity(subject.last_activity_at)}</Text>
      </View>
    </Pressable>
  )
}

export default function AgenticLearningScreen() {
  const navigation = useNavigation<any>()
  const { isJee, isSchoolAccount, curriculum, isCurriculumUnavailable } = useLearnerTrack()

  const subjectsQuery = useQuery({
    queryKey: ['agentic-subjects'],
    queryFn: agenticLearningApi.getSubjects,
    retry: false,
  })

  const quickActionsQuery = useQuery({
    queryKey: ['agentic-quick-actions'],
    queryFn: agenticLearningApi.getQuickActions,
    retry: false,
  })

  const subjects = subjectsQuery.data ?? []

  const refreshAll = useCallback(() => {
    void subjectsQuery.refetch()
    void quickActionsQuery.refetch()
  }, [quickActionsQuery, subjectsQuery])

  useAppResume(refreshAll)

  const openSubject = (subject: AgenticLearningSubjectBucket) => {
    navigation.navigate('AgenticSubject', { subjectId: subject.subject_id, subjectName: subject.subject_name })
  }

  // Web picks the first subject needing work as the day's focus, else the first.
  const heroSubject = useMemo(() => {
    const needsWork = subjects.find(
      (subject) => subjectSignal(subject) === 'tracked' && deriveStatus(subject.average_mastery, subject.mastery_trend) === 'needs_work',
    )
    return needsWork ?? subjects.find((subject) => subjectSignal(subject) === 'tracked') ?? null
  }, [subjects])

  const curriculumLine = curriculum.schoolName
    ? [curriculum.schoolName, curriculum.label].filter(Boolean).join(' · ')
    : curriculum.label

  if (subjectsQuery.isError) {
    const failure = toApiFailure(subjectsQuery.error)
    return (
      <AppScreen
        contentStyle={styles.screen}
        refreshControl={<RefreshControl refreshing={subjectsQuery.isFetching} onRefresh={refreshAll} tintColor={colors.accent} />}
      >
        <Text style={styles.brief}>{isJee ? "Today's brief" : "Today's brief"}</Text>
        <AnimatedCard style={styles.stateCard}>
          <View style={styles.stateIcon}>
            <Ionicons
              name={failure.kind === 'offline' ? 'cloud-offline' : failure.kind === 'not_authorized' ? 'lock-closed' : 'alert-circle'}
              size={20}
              color={colors.danger}
            />
          </View>
          <Text style={styles.stateTitle}>
            {failure.kind === 'offline'
              ? 'You are offline'
              : failure.kind === 'session_expired'
                ? 'Session expired'
                : failure.kind === 'not_authorized'
                  ? 'Not available for this account'
                  : 'Learning map unavailable'}
          </Text>
          <Text style={styles.stateBody}>
            {failure.kind === 'offline'
              ? 'Your learning map needs a connection. Reconnect and pull to refresh — nothing has been lost.'
              : failure.kind === 'session_expired'
                ? 'Sign in again to see your learning map.'
                : failure.kind === 'not_authorized'
                  ? 'Agentic Learning is available to student accounts.'
                  : (failure.detail ?? 'Once the session is valid, this space will show the next weak concept to work on.')}
          </Text>
          {failure.kind !== 'session_expired' && failure.kind !== 'not_authorized' ? (
            <AnimatedButton label="Retry" variant="secondary" onPress={refreshAll} />
          ) : null}
        </AnimatedCard>
      </AppScreen>
    )
  }

  const quickActions = quickActionsQuery.data ?? []

  return (
    <AppScreen
      contentStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={subjectsQuery.isFetching} onRefresh={refreshAll} tintColor={colors.accent} />}
    >
      <Text style={styles.brief}>Today's brief</Text>

      {subjectsQuery.isLoading ? (
        <SkeletonCard lines={3} />
      ) : !heroSubject ? (
        <AnimatedCard style={styles.stateCard}>
          <View style={styles.stateIconSoft}>
            <Ionicons name="sparkles-outline" size={20} color={colors.accentStrong} />
          </View>
          <Text style={styles.stateTitle}>
            {subjects.length === 0 ? 'No subjects ready yet' : 'No learning signals yet'}
          </Text>
          <Text style={styles.stateBody}>
            {subjects.length === 0
              ? isSchoolAccount
                ? 'Your school has not enrolled this account in any subjects for the current semester. They appear here automatically once enrollment is complete.'
                : 'Add the subjects you are studying to your profile and this map will start tracking them.'
              : 'Complete a practice paper or submit work for checking to build your first learning brief.'}
          </Text>
        </AnimatedCard>
      ) : (
        <AnimatedCard style={styles.heroCard}>
          <View style={styles.heroRail} />
          <View style={styles.heroBody}>
            <Text style={styles.heroKicker}>{isJee ? 'AI strategy · high-yield priority' : 'AI recommends · today'}</Text>
            <Text style={styles.heroTitle}>
              {heroSubject.top_weak_topic ? (
                <>
                  <Text style={styles.heroAccent}>{heroSubject.top_weak_topic}</Text> keeps showing up in your mistakes.
                </>
              ) : (
                <>
                  You have <Text style={styles.heroAccent}>{heroSubject.unresolved_count} open concepts</Text> that keep showing up.
                </>
              )}
            </Text>
            <Text style={styles.heroSupport}>{heroSubject.subject_name} · based on your recent attempts</Text>

            <AnimatedButton label="Start here" onPress={() => openSubject(heroSubject)} style={styles.heroCta} />

            <View style={styles.heroPills}>
              <View style={styles.heroPill}>
                <Text style={styles.heroPillText}>15 min</Text>
              </View>
              <View style={styles.heroPill}>
                <Text style={styles.heroPillText}>
                  {heroSubject.unresolved_count} open concept{heroSubject.unresolved_count === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
          </View>
        </AnimatedCard>
      )}

      {curriculumLine ? (
        <View style={styles.curriculumRow}>
          <Ionicons name="school-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.curriculumText} numberOfLines={2}>
            {curriculumLine}
          </Text>
        </View>
      ) : isSchoolAccount && isCurriculumUnavailable ? (
        <Text style={styles.curriculumMissing}>Your school details could not load, so only your subjects are shown below.</Text>
      ) : null}

      {quickActions.length > 0 ? (
        <AnimatedCard style={styles.actionCard}>
          <Text style={styles.sectionKicker}>Quick actions</Text>
          {quickActions.slice(0, 3).map((action) => (
            <Pressable
              key={action.id}
              onPress={() => {
                if (action.target_topic_id) {
                  navigation.navigate('AgenticTopic', { topicId: action.target_topic_id })
                  return
                }
                const target = subjects.find((subject) => subject.subject_id === action.target_subject_id)
                if (target) openSubject(target)
              }}
              accessibilityRole="button"
              accessibilityLabel={action.description ? `${action.label}. ${action.description}` : action.label}
              style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="flash" size={15} color={colors.accent} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={styles.actionTitle}>{action.label}</Text>
                {action.description ? <Text style={styles.actionBody}>{action.description}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.textSoft} />
            </Pressable>
          ))}
        </AnimatedCard>
      ) : null}

      {/* No dangling section header when the account has no subjects at all. */}
      {subjectsQuery.isLoading || subjects.length > 0 ? <Text style={styles.sectionKicker}>Your subjects</Text> : null}

      {subjectsQuery.isLoading ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </>
      ) : subjects.length === 0 ? null : (
        <View style={styles.subjectList}>
          {subjects.map((subject) => (
            <SubjectCard key={subject.subject_id} subject={subject} showExamMetrics={isJee} onOpen={() => openSubject(subject)} />
          ))}
        </View>
      )}

      {subjectsQuery.isFetching && !subjectsQuery.isLoading ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.inlineLoadingText}>Refreshing</Text>
        </View>
      ) : null}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
  },
  brief: {
    ...typography.roles.eyebrow,
    color: colors.textMuted,
  },
  heroCard: {
    padding: 0,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  heroRail: {
    width: 5,
    backgroundColor: colors.accent,
  },
  heroBody: {
    flex: 1,
    padding: spacing[5],
    gap: spacing[2],
  },
  heroKicker: {
    ...typography.roles.eyebrow,
    color: colors.accent,
  },
  heroTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 22,
    lineHeight: 29,
  },
  heroAccent: {
    color: colors.accentStrong,
  },
  heroSupport: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  heroCta: {
    marginTop: spacing[3],
  },
  heroPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  heroPill: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  heroPillText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  curriculumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.full,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  curriculumText: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  curriculumMissing: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  actionCard: {
    gap: spacing[3],
  },
  sectionKicker: {
    ...typography.roles.eyebrow,
    color: colors.accent,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  actionCopy: {
    flex: 1,
  },
  actionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  actionBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  subjectList: {
    gap: spacing[3],
  },
  subjectCard: {
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    gap: spacing[3],
    ...shadows.xs,
  },
  subjectHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  subjectHeaderCopy: {
    flex: 1,
    gap: spacing[1],
  },
  subjectEyebrow: {
    ...typography.roles.eyebrow,
    color: colors.textSoft,
  },
  subjectName: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 20,
    lineHeight: 25,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
  },
  statusLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
  },
  ringWrap: {
    alignItems: 'center',
    gap: spacing[1],
  },
  ringPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: radius.full,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPlaceholderText: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 15,
  },
  ringCaption: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  startWith: {
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  startWithText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  subjectFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing[3],
  },
  chipRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  reviewChip: {
    borderRadius: radius.full,
    backgroundColor: colors.dangerSurface,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  reviewChipText: {
    color: colors.dangerText,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
  },
  countChip: {
    borderRadius: radius.full,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  countChipText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
  },
  activityText: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
  },
  stateCard: {
    gap: spacing[2],
    alignItems: 'flex-start',
  },
  stateIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSurface,
  },
  stateIconSoft: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  stateTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
    lineHeight: 22,
  },
  stateBody: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  inlineLoadingText: {
    ...typography.roles.label,
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.78,
  },
})
