import React, { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { AppScreen } from '../../components/ui'
import { useLearnerTrack } from '../../hooks/useLearnerTrack'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'

type LearningDestination = 'AgenticLearning' | 'CompetitiveExam' | 'PreviousPapers'

interface LearningTile {
  title: string
  meta: string
  body: string
  icon: keyof typeof Ionicons.glyphMap
  color: string
  destination: LearningDestination
}

export default function LearningHomeScreen() {
  const navigation = useNavigation<any>()
  const role = useAuthStore((state) => state.user?.role)
  const { isJee, isCompetitive, curriculum } = useLearnerTrack()

  // Competitive destinations belong to B2C competitive learners only, matching
  // the web catalog. A B2B school learner never sees JEE surfaces or copy.
  const showCompetitive = role === 'b2c_student' && isCompetitive
  const showPreviousPapers = showCompetitive && isJee

  const tiles = useMemo(() => {
    const list: LearningTile[] = [
      {
        title: 'Agentic Learning',
        meta: curriculum.label ?? 'Your curriculum',
        body: 'Open weak concepts, study the lesson, and mark the pattern resolved.',
        icon: 'sparkles',
        color: colors.accent,
        destination: 'AgenticLearning',
      },
    ]

    if (showCompetitive) {
      list.push({
        title: isJee ? 'JEE resources' : 'Exam resources',
        meta: 'Competitive track',
        body: 'Open chapter maps, revision PDFs, and formula resources.',
        icon: 'book',
        color: colors.warning,
        destination: 'CompetitiveExam',
      })
    }

    if (showPreviousPapers) {
      list.push({
        title: 'JEE previous papers',
        meta: 'JEE track',
        body: 'Browse structured PYQs, review solutions, and start timed paper practice.',
        icon: 'library',
        color: colors.paperStudio.jee,
        destination: 'PreviousPapers',
      })
    }

    return list
  }, [curriculum.label, isJee, showCompetitive, showPreviousPapers])

  const heading = showCompetitive ? (isJee ? 'JEE workspace' : 'Exam workspace') : 'Your learning'
  const body = showCompetitive
    ? 'Agentic lessons, exam resources, and previous-year practice in one place.'
    : curriculum.label
      ? `Concept lessons built from your own attempts across ${curriculum.label}.`
      : 'Concept lessons built from your own attempts and checked work.'

  return (
    <AppScreen contentStyle={styles.screen}>
      <View style={styles.introPanel}>
        <View style={styles.introIcon}>
          <Ionicons name="school-outline" size={20} color={colors.accentStrong} />
        </View>
        <View style={styles.introCopy}>
          <Text style={styles.introKicker}>Learning</Text>
          <Text style={styles.introTitle}>{heading}</Text>
          <Text style={styles.introBody} numberOfLines={2}>
            {body}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.title}
            onPress={() => navigation.navigate(tile.destination)}
            accessibilityRole="button"
            accessibilityLabel={`${tile.title}. ${tile.body}`}
            style={({ pressed }) => [styles.tile, tiles.length === 1 && styles.tileWide, pressed && styles.tilePressed]}
          >
            <View style={styles.tileTop}>
              <View style={[styles.iconWrap, { backgroundColor: `${tile.color}14` }]}>
                <Ionicons name={tile.icon} size={20} color={tile.color} />
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />
            </View>
            <Text style={styles.tileMeta} numberOfLines={1}>{tile.meta}</Text>
            <Text style={styles.tileTitle}>{tile.title}</Text>
            <Text style={styles.tileBody}>{tile.body}</Text>
          </Pressable>
        ))}
      </View>

    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing[4],
    paddingBottom: spacing[16],
  },
  introPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    ...shadows.xs,
  },
  introIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  introCopy: {
    flex: 1,
    minWidth: 0,
  },
  introKicker: {
    ...typography.roles.eyebrow,
    color: colors.accent,
  },
  introTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 22,
    lineHeight: 27,
    marginTop: 2,
  },
  introBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing[1],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  tile: {
    width: '48.5%',
    minHeight: 138,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[3],
    justifyContent: 'space-between',
    ...shadows.xs,
  },
  tileWide: {
    width: '100%',
    minHeight: 124,
  },
  tilePressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileMeta: {
    ...typography.roles.eyebrow,
    color: colors.textSoft,
    letterSpacing: 0.4,
    fontSize: 9,
  },
  tileTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
    lineHeight: 19,
  },
  tileBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 15,
  },
})
