import React, { useCallback, useMemo, useState } from 'react'
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, ProgressRing, SkeletonCard } from '../../components/ui'
import { agenticLearningApi, AgenticLearningSubtopicCard } from '../../api/agenticLearning'
import { toApiFailure } from '../../api/errors'
import { useAppResume } from '../../hooks/useAppResume'
import { useLearnerTrack } from '../../hooks/useLearnerTrack'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import { STATUS_ORDER, TopicStatus, deriveStatus, masteryTone, ratioToPercent, statusLabel, statusTone } from './agenticStatus'

type RouteParams = {
  subjectId: string
  subjectName: string
}

function resolvedStatus(topic: AgenticLearningSubtopicCard): TopicStatus {
  const known = topic.status as TopicStatus
  if (known === 'needs_work' || known === 'improving' || known === 'strong' || known === 'resolved') return known
  return deriveStatus(topic.mastery_score)
}

function TopicRow({
  topic,
  showExamMetrics,
  onOpen,
}: {
  topic: AgenticLearningSubtopicCard
  showExamMetrics: boolean
  onOpen: () => void
}) {
  const status = resolvedStatus(topic)
  const tone = masteryTone(topic.mastery_score)
  const urgent = status === 'needs_work' && topic.mastery_score < 55
  const isResolved = status === 'resolved'

  const supportLine =
    showExamMetrics && topic.pyq_frequency != null
      ? `PYQ ${topic.pyq_frequency}/10 · Seen ${topic.attempt_count} time${topic.attempt_count === 1 ? '' : 's'}`
      : `Confidence ${ratioToPercent(topic.confidence)}% · Seen ${topic.attempt_count} time${topic.attempt_count === 1 ? '' : 's'}`

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${topic.topic_name}, ${statusLabel(status, showExamMetrics)}, ${Math.round(topic.mastery_score)} percent. ${supportLine}`}
      style={({ pressed }) => [styles.topicRow, urgent && styles.topicRowUrgent, pressed && styles.pressed]}
    >
      <ProgressRing value={topic.mastery_score} size={50} strokeWidth={5} color={tone} />

      <View style={styles.topicBody}>
        <View style={styles.tagRow}>
          <View style={[styles.statusChip, { backgroundColor: `${statusTone(status)}18` }]}>
            <Text style={[styles.statusChipText, { color: statusTone(status) }]}>{statusLabel(status, showExamMetrics)}</Text>
          </View>
          {topic.has_diagram ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>diagram</Text>
            </View>
          ) : null}
          {showExamMetrics && topic.branch ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{topic.branch}</Text>
            </View>
          ) : null}
          {showExamMetrics && topic.pyq_frequency != null && topic.pyq_frequency >= 8 ? (
            <View style={styles.tagAccent}>
              <Text style={styles.tagAccentText}>PYQ {topic.pyq_frequency}/10</Text>
            </View>
          ) : showExamMetrics && topic.pyq_frequency != null && topic.pyq_frequency >= 5 ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>PYQ {topic.pyq_frequency}/10</Text>
            </View>
          ) : null}
          {showExamMetrics
            ? (topic.paper_types ?? []).map((paper) => (
                <View key={paper} style={styles.tag}>
                  <Text style={styles.tagText}>JEE {paper}</Text>
                </View>
              ))
            : null}
        </View>

        <Text style={styles.topicName}>{topic.topic_name}</Text>
        <Text style={styles.topicChapter}>{topic.chapter_title ?? 'General concept'}</Text>
        <Text style={styles.topicSummary}>{topic.summary}</Text>

        <View style={styles.topicFooter}>
          <Text style={styles.supportText}>{supportLine}</Text>
          <View style={[styles.studyPill, isResolved && styles.studyPillMuted]}>
            <Text style={styles.studyPillText}>{isResolved ? 'Review' : 'Study now'}</Text>
            <Ionicons name="arrow-forward" size={12} color={colors.white} />
          </View>
        </View>
      </View>
    </Pressable>
  )
}

export default function AgenticSubjectScreen() {
  const route = useRoute()
  const navigation = useNavigation<any>()
  const { subjectId, subjectName } = route.params as RouteParams
  const { isJee } = useLearnerTrack()
  const [showResolved, setShowResolved] = useState(false)

  const subtopicsQuery = useQuery({
    queryKey: ['agentic-subtopics', subjectId],
    queryFn: () => agenticLearningApi.getSubtopics(subjectId),
    retry: false,
  })

  const topics = subtopicsQuery.data?.items ?? []

  const counts = useMemo(
    () => ({
      open: topics.filter((topic) => resolvedStatus(topic) === 'needs_work').length,
      improving: topics.filter((topic) => resolvedStatus(topic) === 'improving').length,
      strong: topics.filter((topic) => resolvedStatus(topic) === 'strong').length,
      resolved: topics.filter((topic) => resolvedStatus(topic) === 'resolved').length,
    }),
    [topics],
  )

  // Resolved concepts stay out of the way until asked for, worst first otherwise.
  const visible = useMemo(() => {
    const filtered = showResolved ? topics : topics.filter((topic) => resolvedStatus(topic) !== 'resolved')
    return [...filtered].sort((a, b) => (STATUS_ORDER[resolvedStatus(a)] ?? 99) - (STATUS_ORDER[resolvedStatus(b)] ?? 99))
  }, [showResolved, topics])

  const refresh = useCallback(() => {
    void subtopicsQuery.refetch()
  }, [subtopicsQuery])

  useAppResume(refresh)

  const heading = subtopicsQuery.data?.subject_name || subjectName
  const failure = subtopicsQuery.error ? toApiFailure(subtopicsQuery.error) : null

  return (
    <AppScreen
      contentStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={subtopicsQuery.isFetching} onRefresh={refresh} tintColor={colors.accent} />}
    >
      <View style={styles.crumbRow}>
        <Text style={styles.crumb}>{isJee ? 'JEE Agentic Learning' : 'Agentic Learning'}</Text>
        <Ionicons name="chevron-forward" size={12} color={colors.textSoft} />
        <View style={styles.subjectPill}>
          <Text style={styles.subjectPillText} numberOfLines={1}>
            {heading}
          </Text>
        </View>
      </View>

      <Text style={styles.title}>
        {isJee ? (
          <>
            Patch your <Text style={styles.titleAccent}>highest-risk</Text> topics.
          </>
        ) : (
          <>
            Open a <Text style={styles.titleAccent}>weak concept</Text> and start the lesson.
          </>
        )}
      </Text>
      <Text style={styles.subtitle}>
        {isJee
          ? 'Ranked by weakness and recent mistake patterns.'
          : 'Topics ranked by urgency — the ones you keep getting wrong are at the top.'}
      </Text>

      {topics.length > 0 ? (
        <Text style={styles.countsLine}>
          {counts.open} to fix · {counts.improving} improving · {counts.resolved} done
        </Text>
      ) : null}

      {failure ? (
        <AnimatedCard style={styles.stateCard}>
          <View style={styles.stateIcon}>
            <Ionicons name={failure.kind === 'offline' ? 'cloud-offline' : 'alert-circle'} size={20} color={colors.danger} />
          </View>
          <Text style={styles.stateTitle}>
            {failure.kind === 'offline' ? 'You are offline' : failure.kind === 'not_authorized' ? 'Not your subject' : 'Concepts did not load'}
          </Text>
          <Text style={styles.stateBody}>{failure.message}</Text>
          {failure.kind !== 'session_expired' && failure.kind !== 'not_authorized' ? (
            <AnimatedButton label="Retry" variant="secondary" onPress={refresh} />
          ) : null}
        </AnimatedCard>
      ) : subtopicsQuery.isLoading ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </>
      ) : topics.length === 0 ? (
        <AnimatedCard style={styles.stateCard}>
          <View style={styles.stateIconSoft}>
            <Ionicons name="sparkles-outline" size={20} color={colors.accentStrong} />
          </View>
          <Text style={styles.stateTitle}>Nothing flagged in {heading}</Text>
          <Text style={styles.stateBody}>
            Concept cards are built from your own attempts and checked papers. As soon as a repeated mistake shows up in this subject, the
            exact topic to study appears here.
          </Text>
        </AnimatedCard>
      ) : visible.length === 0 ? (
        <AnimatedCard style={styles.stateCard}>
          <View style={styles.stateIconSoft}>
            <Ionicons name="checkmark-done-circle-outline" size={20} color={colors.success} />
          </View>
          <Text style={styles.stateTitle}>Every concept here is resolved</Text>
          <Text style={styles.stateBody}>
            You have closed all {counts.resolved} tracked concept{counts.resolved === 1 ? '' : 's'} in {heading}. Show them below if you
            want another pass.
          </Text>
        </AnimatedCard>
      ) : (
        <View style={styles.topicList}>
          {visible.map((topic) => (
            <TopicRow
              key={topic.topic_id}
              topic={topic}
              showExamMetrics={isJee}
              onOpen={() => navigation.navigate('AgenticTopic', { topicId: topic.topic_id })}
            />
          ))}
        </View>
      )}

      {counts.resolved > 0 ? (
        <Pressable
          onPress={() => setShowResolved((current) => !current)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showResolved }}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        >
          <Ionicons name={showResolved ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accentStrong} />
          <Text style={styles.toggleText}>{showResolved ? 'Hide resolved' : `Show resolved (${counts.resolved})`}</Text>
        </Pressable>
      ) : null}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
  },
  crumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  crumb: {
    ...typography.roles.eyebrow,
    color: colors.textMuted,
  },
  subjectPill: {
    flexShrink: 1,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  subjectPillText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  title: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 22,
    lineHeight: 29,
  },
  titleAccent: {
    color: colors.accentStrong,
  },
  subtitle: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  countsLine: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  topicList: {
    gap: spacing[3],
  },
  topicRow: {
    flexDirection: 'row',
    gap: spacing[3],
    alignItems: 'flex-start',
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    ...shadows.xs,
  },
  topicRowUrgent: {
    borderColor: colors.dangerBorder,
  },
  topicBody: {
    flex: 1,
    gap: spacing[1],
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  statusChip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  statusChipText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
  },
  tag: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  tagText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
  },
  tagAccent: {
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  tagAccentText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
  },
  topicName: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
    lineHeight: 22,
    marginTop: 2,
  },
  topicChapter: {
    ...typography.roles.eyebrow,
    color: colors.textSoft,
    letterSpacing: 0.6,
  },
  topicSummary: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  topicFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  supportText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  studyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 30,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing[3],
  },
  studyPillMuted: {
    backgroundColor: colors.slate[700],
  },
  studyPillText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    alignSelf: 'flex-start',
    minHeight: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: spacing[4],
  },
  toggleText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
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
  pressed: {
    opacity: 0.78,
  },
})
