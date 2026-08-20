import React, { useMemo } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState } from '../../components/ui'
import { agenticLearningApi, AgenticLearningTopicDetail } from '../../api/agenticLearning'
import { toApiFailure } from '../../api/errors'
import { buildAssetUrl } from '../../api/client'
import { masteryTone as masteryToneColor, ratioToPercent } from './agenticStatus'
import { useLearnerTrack } from '../../hooks/useLearnerTrack'
import { colors, radius, shadows, spacing, typography } from '../../theme'

type RouteParams = {
  topicId: string
}

type Tone = {
  accent: string
  label: string
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function masteryTone(value: number): Tone {
  if (value >= 75) return { accent: colors.success, label: 'Stable' }
  if (value >= 45) return { accent: colors.warning, label: 'Needs polish' }
  return { accent: colors.danger, label: 'Repair now' }
}

function cleanStatus(status: string) {
  return status.replace(/_/g, ' ')
}

function splitConcept(text: string) {
  const normalized = text.replace(/\s+/g, ' ')
  return (normalized.match(/[^.!?]+[.!?]?/g) ?? [])
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Paper weightage is competitive-exam framing, so it is only appended for a
 * learner actually on that track.
 */
function compactMeta(topic: AgenticLearningTopicDetail, showExamMetrics: boolean) {
  return [topic.subject_name, topic.chapter_title, showExamMetrics ? topic.weightage_label : null].filter(Boolean).join(' / ')
}

function StatTile({ label, value, icon, tone }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap; tone: string }) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: `${tone}16` }]}>
        <Ionicons name={icon} size={15} color={tone} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function RouteStep({
  index,
  title,
  caption,
  icon,
  tone,
  active,
}: {
  index: number
  title: string
  caption: string
  icon: keyof typeof Ionicons.glyphMap
  tone: string
  active?: boolean
}) {
  return (
    <View style={[styles.routeStep, active && styles.routeStepActive]}>
      <View style={styles.routeRail}>
        <View style={[styles.routeNode, { backgroundColor: active ? tone : colors.backgroundElevated, borderColor: `${tone}66` }]}>
          <Ionicons name={icon} size={16} color={active ? colors.white : tone} />
        </View>
        <Text style={[styles.routeIndex, { color: tone }]}>0{index}</Text>
      </View>
      <View style={styles.routeCopy}>
        <Text style={styles.routeTitle}>{title}</Text>
        <Text style={styles.routeCaption}>{caption}</Text>
      </View>
    </View>
  )
}

function ListSection({
  title,
  items,
  icon,
  tone,
}: {
  title: string
  items: string[]
  icon: keyof typeof Ionicons.glyphMap
  tone: string
}) {
  if (!items.length) return null

  return (
    <AnimatedCard style={styles.listCard}>
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.sectionIcon, { backgroundColor: `${tone}14` }]}>
          <Ionicons name={icon} size={17} color={tone} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.smartList}>
        {items.slice(0, 5).map((item, index) => (
          <View key={`${title}-${index}`} style={styles.smartRow}>
            <View style={[styles.smartNumber, { backgroundColor: `${tone}14` }]}>
              <Text style={[styles.smartNumberText, { color: tone }]}>{index + 1}</Text>
            </View>
            <Text style={styles.smartText}>{item}</Text>
          </View>
        ))}
      </View>
    </AnimatedCard>
  )
}

function PracticePrompt({ prompt, index }: { prompt: string; index: number }) {
  return (
    <View style={styles.practicePrompt}>
      <View style={styles.practiceNumber}>
        <Text style={styles.practiceNumberText}>{index + 1}</Text>
      </View>
      <Text style={styles.practiceText}>{prompt}</Text>
    </View>
  )
}

export default function AgenticTopicScreen() {
  const route = useRoute()
  const { topicId } = route.params as RouteParams
  const navigation = useNavigation<any>()
  const queryClient = useQueryClient()
  const { isJee } = useLearnerTrack()
  const showExamMetrics = isJee

  const topicQuery = useQuery({
    queryKey: ['agentic-topic', topicId],
    queryFn: () => agenticLearningApi.getTopic(topicId),
    retry: false,
  })

  const resolveMutation = useMutation({
    mutationFn: async () => {
      const topic = topicQuery.data
      if (!topic) return null
      return agenticLearningApi.setTopicResolved(topic.topic_id, topic.subject_id, topic.status !== 'resolved')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agentic-topic', topicId] })
      await queryClient.invalidateQueries({ queryKey: ['agentic-subjects'] })
      await queryClient.invalidateQueries({ queryKey: ['agentic-subtopics'] })
    },
    onError: (error) => {
      const failure = toApiFailure(error)
      Alert.alert(failure.kind === 'offline' ? 'You are offline' : 'Update failed', failure.message)
    },
  })

  const topic = topicQuery.data
  const conceptPieces = useMemo(() => splitConcept(topic?.concept_explanation ?? ''), [topic?.concept_explanation])

  if (topicQuery.isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading lesson</Text>
      </AppScreen>
    )
  }

  if (topicQuery.isError || !topic) {
    const failure = topicQuery.error ? toApiFailure(topicQuery.error) : null
    const canRetry = !failure || (failure.kind !== 'session_expired' && failure.kind !== 'not_authorized')
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState
          title={
            failure?.kind === 'offline'
              ? 'You are offline'
              : failure?.kind === 'session_expired'
                ? 'Session expired'
                : failure?.kind === 'not_authorized'
                  ? 'Not your lesson'
                  : 'Lesson unavailable'
          }
          message={
            failure?.kind === 'offline'
              ? 'This lesson needs a connection. Reconnect and try again.'
              : failure?.kind === 'not_authorized'
                ? 'This concept lesson belongs to another account.'
                : failure?.detail ?? failure?.message ?? 'This concept lesson could not be loaded.'
          }
          onAction={canRetry ? () => void topicQuery.refetch() : undefined}
        />
      </AppScreen>
    )
  }

  const isResolved = topic.status === 'resolved'
  const mastery = clampPercent(topic.mastery_score)
  // confidence / evidence_strength arrive as 0-1 ratios, unlike mastery_score.
  const confidence = ratioToPercent(topic.confidence)
  const evidence = ratioToPercent(topic.evidence_strength)
  const tone = masteryTone(mastery)
  const conceptLead = conceptPieces.slice(0, 2).join(' ')
  const conceptSupport = conceptPieces.slice(2, 6)
  const openLoops = Math.max(0, 100 - mastery)
  const practiceCount = topic.practice_questions.length

  return (
    <AppScreen contentStyle={styles.screen}>
      <LinearGradient colors={['#111827', '#7c2d12', '#f97316']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={styles.heroKickerWrap}>
            <Ionicons name="sparkles" size={14} color={colors.orangeScale[200]} />
            <Text style={styles.heroKicker}>{topic.curriculum_label}</Text>
          </View>
          <View style={[styles.heroStatusPill, isResolved && styles.heroStatusResolved]}>
            <Text style={styles.heroStatusText}>{isResolved ? 'Resolved' : cleanStatus(topic.status)}</Text>
          </View>
        </View>

        <Text style={styles.heroTitle}>{topic.topic_name}</Text>
        <Text style={styles.heroMeta}>{compactMeta(topic, showExamMetrics)}</Text>

        <View style={styles.heroMission}>
          <View style={styles.missionCopy}>
            <Text style={styles.missionKicker}>Smart focus</Text>
            <Text style={styles.missionText}>
              {tone.label}: close {openLoops}% of the gap with one concept pass, one recall pass, and a short practice burst.
            </Text>
          </View>
          <View style={styles.masteryOrb}>
            <Text style={styles.masteryOrbValue}>{mastery}%</Text>
            <Text style={styles.masteryOrbLabel}>ready</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.statGrid}>
        <StatTile label="Mastery" value={`${mastery}%`} icon="analytics" tone={tone.accent} />
        <StatTile label="Confidence" value={`${confidence}%`} icon="pulse" tone={colors.info} />
        <StatTile label="Attempts" value={`${topic.attempt_count}`} icon="repeat" tone={colors.violet[600]} />
        <StatTile label="Evidence" value={`${evidence}%`} icon="documents" tone={colors.success} />
      </View>

      <AnimatedCard style={styles.routeCard} elevated>
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.sectionIcon, styles.routeHeaderIcon]}>
            <Ionicons name="trail-sign" size={17} color={colors.accent} />
          </View>
          <View style={styles.sectionHeaderCopy}>
            <Text style={styles.sectionTitle}>Lesson route</Text>
            <Text style={styles.sectionSubtitle}>A compact path from understanding to recall.</Text>
          </View>
        </View>
        <View style={styles.routeList}>
          <RouteStep
            index={1}
            title="Concept repair"
            caption={conceptLead || topic.summary}
            icon="bulb"
            tone={colors.accent}
            active
          />
          <RouteStep
            index={2}
            title="Recall anchors"
            caption={`${topic.easy_ways_to_learn.length + topic.memory_tips.length} short hooks to remember the idea.`}
            icon="flash"
            tone={colors.info}
          />
          <RouteStep
            index={3}
            title={showExamMetrics ? 'Exam transfer' : 'Check yourself'}
            caption={practiceCount ? `${practiceCount} prompts ready for a quick check.` : 'Use the recap to create a fast self-check.'}
            icon="barbell"
            tone={colors.violet[600]}
          />
        </View>
      </AnimatedCard>

      <AnimatedCard style={styles.conceptCard}>
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.sectionIcon, { backgroundColor: colors.accentSurface }]}>
            <Ionicons name="library" size={17} color={colors.accent} />
          </View>
          <Text style={styles.sectionTitle}>Core idea</Text>
        </View>
        <Text style={styles.conceptLead}>{conceptLead || topic.summary}</Text>
        {conceptSupport.length > 0 ? (
          <View style={styles.conceptSupportList}>
            {conceptSupport.map((part, index) => (
              <View key={`concept-${index}`} style={styles.conceptSupportRow}>
                <View style={styles.conceptDot} />
                <Text style={styles.conceptSupportText}>{part}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {topic.lesson_figure ? (
          <View style={styles.figureWrap}>
            <Image
              source={{ uri: buildAssetUrl(topic.lesson_figure.asset_url) }}
              style={styles.figure}
              resizeMode="contain"
              accessible
              accessibilityLabel={topic.lesson_figure.alt_text ?? `Figure for ${topic.topic_name}`}
            />
            {topic.lesson_figure.caption_text ? (
              <Text style={styles.figureCaption}>{topic.lesson_figure.caption_text}</Text>
            ) : null}
          </View>
        ) : null}
        {topic.text_diagram ? (
          <View style={styles.whiteboard}>
            <View style={styles.whiteboardTop}>
              <Ionicons name="git-network" size={15} color={colors.info} />
              <Text style={styles.whiteboardTitle}>Mental model</Text>
            </View>
            <Text style={styles.diagramText}>{topic.text_diagram}</Text>
          </View>
        ) : null}
      </AnimatedCard>

      <ListSection title="Easy ways to learn" items={topic.easy_ways_to_learn} icon="rocket" tone={colors.accent} />
      <ListSection title="Memory anchors" items={topic.memory_tips} icon="bookmark" tone={colors.info} />
      <ListSection title="Recap points" items={topic.recap_points} icon="checkmark-circle" tone={colors.success} />

      {topic.practice_questions.length > 0 ? (
        <AnimatedCard style={styles.practiceCard} elevated>
          <View style={styles.practiceHeader}>
            <View>
              <Text style={styles.practiceKicker}>Practice burst</Text>
              <Text style={styles.practiceTitle}>{showExamMetrics ? 'Prove it under exam language' : 'Prove you can apply it'}</Text>
            </View>
            <View style={styles.practiceBadge}>
              <Text style={styles.practiceBadgeText}>{practiceCount}</Text>
            </View>
          </View>
          {topic.practice_questions.slice(0, 4).map((prompt, index) => (
            <PracticePrompt key={`practice-${index}`} prompt={prompt} index={index} />
          ))}
        </AnimatedCard>
      ) : null}

      {(topic.related_topics ?? []).length > 0 ? (
        <AnimatedCard style={styles.relatedCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIcon, { backgroundColor: colors.infoSurface }]}>
              <Ionicons name="git-network" size={17} color={colors.info} />
            </View>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>Connected concepts</Text>
              <Text style={styles.sectionSubtitle}>How this topic links to the rest of your map.</Text>
            </View>
          </View>
          {(topic.related_topics ?? []).map((related) => {
            const relationLabel = related.label?.trim() || related.relation_kind.replace(/_/g, ' ')
            const relatedTone = masteryToneColor(related.student_mastery)
            return (
              <Pressable
                key={related.topic_id}
                onPress={() => navigation.push('AgenticTopic', { topicId: related.topic_id })}
                accessibilityRole="button"
                accessibilityLabel={`${related.topic_name}, ${relationLabel}, ${Math.round(related.student_mastery)} percent mastery`}
                style={({ pressed }) => [styles.relatedRow, pressed && styles.relatedRowPressed]}
              >
                <View style={[styles.relatedDot, { backgroundColor: relatedTone }]} />
                <View style={styles.relatedCopy}>
                  <Text style={styles.relatedName} numberOfLines={2}>
                    {related.topic_name}
                  </Text>
                  <Text style={styles.relatedRelation}>{relationLabel}</Text>
                </View>
                <Text style={[styles.relatedMastery, { color: relatedTone }]}>{Math.round(related.student_mastery)}%</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSoft} />
              </Pressable>
            )
          })}
        </AnimatedCard>
      ) : null}

      {topic.coach_note ? (
        <AnimatedCard style={styles.coachCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIcon, { backgroundColor: colors.warningSurface }]}>
              <Ionicons name="school" size={17} color={colors.warning} />
            </View>
            <Text style={styles.sectionTitle}>Coach note</Text>
          </View>
          <Text style={styles.coachText}>{topic.coach_note}</Text>
        </AnimatedCard>
      ) : null}

      <AnimatedCard style={styles.actionCard}>
        <View style={styles.actionCopy}>
          <Text style={styles.actionTitle}>{isResolved ? 'This concept is closed' : 'Close the loop when it feels automatic'}</Text>
          <Text style={styles.actionText}>
            {isResolved ? 'Reopen it if the next attempt shows the same mistake.' : 'Mark resolved after you can explain it and answer the practice burst without notes.'}
          </Text>
        </View>
        <AnimatedButton
          label={resolveMutation.isPending ? 'Updating...' : isResolved ? 'Mark active again' : 'Mark resolved'}
          variant={isResolved ? 'secondary' : 'primary'}
          loading={resolveMutation.isPending}
          icon={<Ionicons name={isResolved ? 'refresh' : 'checkmark'} size={18} color={isResolved ? colors.accentStrong : colors.white} />}
          onPress={() => resolveMutation.mutate()}
        />
      </AnimatedCard>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  figureWrap: {
    gap: spacing[2],
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
  },
  figure: {
    width: '100%',
    height: 190,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
  },
  figureCaption: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  relatedCard: {
    gap: spacing[3],
  },
  relatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  relatedRowPressed: {
    opacity: 0.78,
  },
  relatedDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  relatedCopy: {
    flex: 1,
    gap: 2,
  },
  relatedName: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 14,
    lineHeight: 19,
  },
  relatedRelation: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  relatedMastery: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  heroCard: {
    borderRadius: radius['2xl'],
    padding: spacing[5],
    gap: spacing[4],
    overflow: 'hidden',
    ...shadows.hero,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  heroKickerWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  heroKicker: {
    ...typography.roles.eyebrow,
    color: colors.orangeScale[100],
    letterSpacing: 0.7,
  },
  heroStatusPill: {
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  heroStatusResolved: {
    backgroundColor: 'rgba(16,185,129,0.22)',
    borderColor: 'rgba(167,243,208,0.42)',
  },
  heroStatusText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  heroTitle: {
    color: colors.white,
    fontFamily: typography.fonts.heading,
    fontSize: 31,
    lineHeight: 36,
    letterSpacing: 0,
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    lineHeight: 18,
  },
  heroMission: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: spacing[3],
  },
  missionCopy: {
    flex: 1,
    gap: spacing[1],
  },
  missionKicker: {
    color: colors.orangeScale[100],
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  missionText: {
    color: colors.white,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 13,
    lineHeight: 19,
  },
  masteryOrb: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  masteryOrbValue: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 22,
    lineHeight: 26,
  },
  masteryOrbLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  statTile: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 96,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[3],
    justifyContent: 'space-between',
    ...shadows.xs,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 21,
    lineHeight: 25,
  },
  statLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  routeCard: {
    gap: spacing[4],
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeHeaderIcon: {
    backgroundColor: colors.accentSurface,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
    lineHeight: 23,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  routeList: {
    gap: spacing[3],
  },
  routeStep: {
    flexDirection: 'row',
    gap: spacing[3],
    borderRadius: radius.xl,
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[3],
  },
  routeStepActive: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.borderBrand,
  },
  routeRail: {
    width: 40,
    alignItems: 'center',
    gap: spacing[1],
  },
  routeNode: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  routeIndex: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
  },
  routeCopy: {
    flex: 1,
    gap: spacing[1],
  },
  routeTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  routeCaption: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  conceptCard: {
    gap: spacing[4],
  },
  conceptLead: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
    lineHeight: 25,
  },
  conceptSupportList: {
    gap: spacing[3],
  },
  conceptSupportRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  conceptDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    marginTop: 7,
    backgroundColor: colors.accent,
  },
  conceptSupportText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
  },
  whiteboard: {
    borderRadius: radius.xl,
    backgroundColor: colors.infoSurface,
    borderWidth: 1,
    borderColor: colors.sky[100],
    padding: spacing[4],
    gap: spacing[3],
  },
  whiteboardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  whiteboardTitle: {
    color: colors.info,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  diagramText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    lineHeight: 19,
  },
  listCard: {
    gap: spacing[4],
  },
  smartList: {
    gap: spacing[3],
  },
  smartRow: {
    flexDirection: 'row',
    gap: spacing[3],
    alignItems: 'flex-start',
  },
  smartNumber: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  smartNumberText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  smartText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
  },
  practiceCard: {
    gap: spacing[4],
    backgroundColor: colors.slate[950],
    borderColor: 'rgba(255,255,255,0.08)',
  },
  practiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  practiceKicker: {
    color: colors.orangeScale[300],
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  practiceTitle: {
    color: colors.white,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 19,
    lineHeight: 24,
    marginTop: spacing[1],
  },
  practiceBadge: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  practiceBadgeText: {
    color: colors.white,
    fontFamily: typography.fonts.heading,
    fontSize: 18,
  },
  practicePrompt: {
    flexDirection: 'row',
    gap: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: spacing[3],
  },
  practiceNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249,115,22,0.20)',
  },
  practiceNumberText: {
    color: colors.orangeScale[200],
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  practiceText: {
    flex: 1,
    color: 'rgba(255,255,255,0.86)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
  },
  coachCard: {
    gap: spacing[4],
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
  },
  coachText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 13,
    lineHeight: 20,
  },
  actionCard: {
    gap: spacing[4],
  },
  actionCopy: {
    gap: spacing[1],
  },
  actionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 19,
    lineHeight: 24,
  },
  actionText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
  },
})
