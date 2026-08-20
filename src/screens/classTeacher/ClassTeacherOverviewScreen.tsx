import React, { useCallback, useEffect, useMemo } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { AnimatedCard, AppScreen, GradientHeroCard } from '../../components/ui'
import { classTeacherApi, ClassValidationReport, Semester, toApiFailure } from '../../api/classTeacher'
import { classTeacherKeys, useClassTeacherAccess, useClassTeacherIdentity } from '../../hooks/useClassTeacherAccess'
import { useAppResume } from '../../hooks/useAppResume'
import { useClassTeacherStore } from '../../stores/classTeacherStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import { ClassContextBar, EmptyCard, FailureCard, InlineLoading, NavRow, SectionHeaderRow, StatTile } from './components'

function readinessTone(report?: ClassValidationReport) {
  if (!report) return colors.textMuted
  if (report.issues.length === 0 && report.unassigned_students === 0) return colors.success
  if (report.unassigned_students > 0) return colors.danger
  return colors.warning
}

function readinessHeadline(report?: ClassValidationReport) {
  if (!report) return 'Class readiness will appear once the report loads.'
  if (report.total_students === 0) return 'No students are on this class roster yet.'
  if (report.unassigned_students > 0) {
    return `${report.unassigned_students} of ${report.total_students} students still need a division.`
  }
  if (report.issues.length > 0) {
    return `${report.issues.length} student${report.issues.length === 1 ? '' : 's'} have subject gaps to close.`
  }
  return 'Every student on this roster has a division and a complete subject set.'
}

export default function ClassTeacherOverviewScreen() {
  const navigation = useNavigation<any>()
  const access = useClassTeacherAccess()
  const { identity, isPartial: identityPartial } = useClassTeacherIdentity()
  const activeSemesterId = useClassTeacherStore((state) => state.activeSemesterId)
  const setActiveSemesterId = useClassTeacherStore((state) => state.setActiveSemesterId)

  const classSection = access.classSections[0]

  const semestersQuery = useQuery<Semester[], unknown>({
    queryKey: classTeacherKeys.semesters,
    queryFn: classTeacherApi.getSemesters,
    enabled: access.isAuthorized,
    retry: false,
  })

  const semesters = semestersQuery.data ?? []
  const activeSemester = useMemo(
    () => semesters.find((semester) => semester.id === activeSemesterId) ?? semesters[0],
    [activeSemesterId, semesters],
  )

  useEffect(() => {
    if (!activeSemesterId && semesters[0]) setActiveSemesterId(semesters[0].id)
  }, [activeSemesterId, semesters, setActiveSemesterId])

  const validationQuery = useQuery<ClassValidationReport, unknown>({
    queryKey: classTeacherKeys.validation(classSection?.id, activeSemester?.id),
    queryFn: () => classTeacherApi.getValidation(classSection!.id, activeSemester?.id),
    enabled: Boolean(classSection?.id) && access.isAuthorized,
    retry: false,
  })

  const rosterQuery = useQuery({
    queryKey: classTeacherKeys.roster(classSection?.standard),
    queryFn: () => classTeacherApi.getRoster(classSection?.standard),
    enabled: Boolean(classSection?.standard) && access.isAuthorized,
    retry: false,
  })

  const refreshAll = useCallback(() => {
    void access.refetch()
    void semestersQuery.refetch()
    void validationQuery.refetch()
    void rosterQuery.refetch()
  }, [access, rosterQuery, semestersQuery, validationQuery])

  useAppResume(refreshAll, access.isAuthorized)

  if (access.isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Checking your class assignment</Text>
      </AppScreen>
    )
  }

  if (access.failure) {
    return (
      <AppScreen contentStyle={styles.screen}>
        <GradientHeroCard
          eyebrow="CLASS TEACHER"
          title="Workspace locked"
          subtitle="Class management is only available to teachers with an approved class-teacher assignment."
        />
        <FailureCard failure={access.failure} onRetry={() => void access.refetch()} />
      </AppScreen>
    )
  }

  if (access.hasNoClass) {
    return (
      <AppScreen contentStyle={styles.screen}>
        <GradientHeroCard
          eyebrow="CLASS TEACHER"
          title="No class assigned to you"
          subtitle="Your account is signed in, but the school has not approved a class-teacher assignment for it yet."
        />
        <EmptyCard
          icon="school-outline"
          title="Nothing to manage yet"
          body="Once a principal approves your class-teacher request, your class, roster, and semester setup appear here. Nothing is hidden behind this screen in the meantime."
        />
      </AppScreen>
    )
  }

  const report = validationQuery.data
  const rosterCount = rosterQuery.data?.length
  const validationFailure = validationQuery.error ? toApiFailure(validationQuery.error) : null
  const semestersFailure = semestersQuery.error ? toApiFailure(semestersQuery.error) : null

  return (
    <AppScreen
      contentStyle={styles.screen}
      refreshControl={
        <RefreshControl refreshing={access.isFetching && !access.isLoading} onRefresh={refreshAll} tintColor={colors.accent} />
      }
    >
      <ClassContextBar
        identity={identity}
        standard={classSection?.standard}
        division={classSection?.division}
        semesterName={activeSemester?.name}
        isStale={validationQuery.isFetching && Boolean(report)}
      />

      {identityPartial ? (
        <Text style={styles.partialNote}>School details could not load, so only your class assignment is shown.</Text>
      ) : null}

      <AnimatedCard style={styles.readinessCard}>
        <Text style={styles.readinessKicker}>Class readiness</Text>
        {validationQuery.isLoading ? (
          <InlineLoading label="Building the readiness report" />
        ) : validationFailure ? (
          <FailureCard failure={validationFailure} onRetry={() => void validationQuery.refetch()} />
        ) : (
          <>
            <Text style={[styles.readinessHeadline, { color: readinessTone(report) }]}>{readinessHeadline(report)}</Text>
            <View style={styles.statRow}>
              <StatTile label="On roster" value={report ? String(report.total_students) : '—'} />
              <StatTile label="With division" value={report ? String(report.assigned_students) : '—'} tone={colors.success} />
              <StatTile
                label="Needs division"
                value={report ? String(report.unassigned_students) : '—'}
                tone={report && report.unassigned_students > 0 ? colors.danger : colors.text}
              />
            </View>
            <Text style={styles.readinessMeta}>
              {report
                ? `Expecting ${report.expected_subject_count} subject${report.expected_subject_count === 1 ? '' : 's'} per student this semester.`
                : 'Subject expectations load with the report.'}
            </Text>
          </>
        )}
      </AnimatedCard>

      <SectionHeaderRow
        title="Semester"
        meta={
          semestersFailure
            ? 'Semesters could not load.'
            : semesters.length === 0
              ? 'No semesters are configured for this school.'
              : 'Every subject and enrollment change below applies to the selected semester.'
        }
      />

      {semestersQuery.isLoading ? (
        <InlineLoading label="Loading semesters" />
      ) : semestersFailure ? (
        <FailureCard failure={semestersFailure} onRetry={() => void semestersQuery.refetch()} />
      ) : semesters.length === 0 ? (
        <EmptyCard
          icon="calendar-outline"
          title="No semester to select"
          body="Subject configuration and enrollment need a semester. Ask your school admin to add one, then pull to refresh."
        />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.semesterRow}>
          {semesters.map((semester) => {
            const selected = semester.id === activeSemester?.id
            return (
              <Pressable
                key={semester.id}
                onPress={() => setActiveSemesterId(semester.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Semester ${semester.name}`}
                style={({ pressed }) => [styles.semesterChip, selected && styles.semesterChipActive, pressed && styles.pressed]}
              >
                <Text style={[styles.semesterChipText, selected && styles.semesterChipTextActive]} numberOfLines={1}>
                  {semester.name}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      )}

      <SectionHeaderRow title="Manage" meta="Each area writes straight to the school record." />

      <View style={styles.navList}>
        <NavRow
          icon="people"
          title="Roster and divisions"
          body="Review every student in your standard and move them between divisions."
          meta={rosterCount != null ? `${rosterCount}` : undefined}
          onPress={() => navigation.navigate('ClassRoster')}
        />
        <NavRow
          icon="library"
          title="Subjects and enrollment"
          body="Set the subjects this class takes, then choose who is enrolled in each one."
          tone={colors.info}
          meta={report ? `${report.expected_subject_count} expected` : undefined}
          onPress={() => navigation.navigate('ClassSubjects')}
          disabled={!activeSemester}
        />
        <NavRow
          icon="shield-checkmark"
          title="Validation report"
          body="See exactly which students are missing a mandatory subject or a group choice."
          tone={report && report.issues.length > 0 ? colors.warning : colors.success}
          meta={report ? `${report.issues.length} issue${report.issues.length === 1 ? '' : 's'}` : undefined}
          onPress={() => navigation.navigate('ClassValidation')}
        />
      </View>

      {!activeSemester && semesters.length > 0 ? (
        <Text style={styles.partialNote}>Select a semester to open subject configuration.</Text>
      ) : null}

      <View style={styles.footerNote}>
        <Ionicons name="lock-closed-outline" size={13} color={colors.textSoft} />
        <Text style={styles.footerNoteText}>
          The server checks your school, class, and division authorization on every read and write, so nothing here can reach another
          teacher's class.
        </Text>
      </View>
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
    gap: spacing[3],
  },
  loadingText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  partialNote: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  readinessCard: {
    gap: spacing[3],
  },
  readinessKicker: {
    ...typography.roles.eyebrow,
    color: colors.accent,
  },
  readinessHeadline: {
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 19,
    lineHeight: 25,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  readinessMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  semesterRow: {
    gap: spacing[2],
    paddingRight: spacing[4],
  },
  semesterChip: {
    minHeight: 44,
    justifyContent: 'center',
    maxWidth: 220,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: spacing[4],
  },
  semesterChipActive: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
  },
  semesterChipText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  semesterChipTextActive: {
    color: colors.accentStrong,
  },
  navList: {
    gap: spacing[3],
  },
  footerNote: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'flex-start',
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
    ...shadows.xs,
  },
  footerNoteText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.78,
  },
})
