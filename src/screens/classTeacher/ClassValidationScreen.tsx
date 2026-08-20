import React, { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, View, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { AppScreen } from '../../components/ui'
import { ClassValidationReport, ValidationIssue, classTeacherApi, toApiFailure } from '../../api/classTeacher'
import { classTeacherKeys, useActiveSemester, useClassTeacherAccess, useClassTeacherIdentity } from '../../hooks/useClassTeacherAccess'
import { useAppResume } from '../../hooks/useAppResume'
import { useClassTeacherStore } from '../../stores/classTeacherStore'
import { colors, layout, radius, shadows, spacing, typography } from '../../theme'
import { ClassContextBar, EmptyCard, FailureCard, InlineLoading, SearchField, StatTile } from './components'

function IssueCard({ issue }: { issue: ValidationIssue }) {
  const shortfall = issue.expected_subjects - issue.total_subjects

  return (
    <View style={styles.issueCard}>
      <View style={styles.issueTop}>
        <Text style={styles.issueName} numberOfLines={2}>
          {issue.student_name}
        </Text>
        <View style={styles.issueCountPill}>
          <Text style={styles.issueCountText}>
            {issue.total_subjects}/{issue.expected_subjects}
          </Text>
        </View>
      </View>

      {shortfall > 0 ? (
        <Text style={styles.issueLine}>
          {shortfall} subject{shortfall === 1 ? '' : 's'} short of the expected count.
        </Text>
      ) : null}

      {issue.missing_mandatory.length > 0 ? (
        <View style={styles.issueGroup}>
          <View style={styles.issueGroupHeader}>
            <Ionicons name="lock-closed" size={12} color={colors.danger} />
            <Text style={styles.issueGroupTitle}>Missing mandatory</Text>
          </View>
          <Text style={styles.issueGroupBody}>{issue.missing_mandatory.join(', ')}</Text>
        </View>
      ) : null}

      {issue.group_issues.length > 0 ? (
        <View style={styles.issueGroup}>
          <View style={styles.issueGroupHeader}>
            <Ionicons name="git-branch-outline" size={12} color={colors.warning} />
            <Text style={styles.issueGroupTitle}>Elective group</Text>
          </View>
          {issue.group_issues.map((detail, index) => (
            <Text key={`${issue.student_id}-group-${index}`} style={styles.issueGroupBody}>
              {detail}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  )
}

export default function ClassValidationScreen() {
  const access = useClassTeacherAccess()
  const { identity } = useClassTeacherIdentity()
  const { activeSemester } = useActiveSemester()
  const activeSemesterId = useClassTeacherStore((state) => state.activeSemesterId)
  const classSection = access.classSections[0]
  const classId = classSection?.id
  const [search, setSearch] = useState('')

  const validationQuery = useQuery<ClassValidationReport, unknown>({
    queryKey: classTeacherKeys.validation(classId, activeSemesterId ?? undefined),
    queryFn: () => classTeacherApi.getValidation(classId!, activeSemesterId),
    enabled: Boolean(classId) && access.isAuthorized,
    retry: false,
  })

  const report = validationQuery.data
  const issues = report?.issues ?? []

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return issues
    return issues.filter(
      (issue) =>
        issue.student_name.toLowerCase().includes(needle) ||
        issue.missing_mandatory.some((subject) => subject.toLowerCase().includes(needle)),
    )
  }, [issues, search])

  const refresh = useCallback(() => {
    void validationQuery.refetch()
  }, [validationQuery])

  useAppResume(refresh, access.isAuthorized)

  if (access.isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Checking your class assignment</Text>
      </AppScreen>
    )
  }

  if (access.failure || access.hasNoClass || !classId) {
    return (
      <AppScreen contentStyle={styles.padded}>
        {access.failure ? (
          <FailureCard failure={access.failure} onRetry={() => void access.refetch()} />
        ) : (
          <EmptyCard icon="school-outline" title="No class assigned to you" body="A validation report needs an approved class-teacher assignment." />
        )}
      </AppScreen>
    )
  }

  const failure = validationQuery.error ? toApiFailure(validationQuery.error) : null

  const header = (
    <View style={styles.header}>
      <ClassContextBar
        identity={identity}
        standard={classSection?.standard}
        division={classSection?.division}
        semesterName={activeSemester?.name}
        isStale={validationQuery.isFetching && Boolean(report)}
      />

      {failure ? <FailureCard failure={failure} onRetry={refresh} /> : null}

      {validationQuery.isLoading ? <InlineLoading label="Checking every student's subject set" /> : null}

      {report ? (
        <>
          <View style={styles.statRow}>
            <StatTile label="On roster" value={String(report.total_students)} />
            <StatTile label="With division" value={String(report.assigned_students)} tone={colors.success} />
            <StatTile
              label="No division"
              value={String(report.unassigned_students)}
              tone={report.unassigned_students > 0 ? colors.danger : colors.text}
            />
          </View>

          <Text style={styles.summaryLine}>
            {report.issues.length === 0
              ? `No subject gaps found. Every student is enrolled in at least the ${report.expected_subject_count} expected subject${report.expected_subject_count === 1 ? '' : 's'}.`
              : `${report.issues.length} student${report.issues.length === 1 ? '' : 's'} need attention against the ${report.expected_subject_count} expected subject${report.expected_subject_count === 1 ? '' : 's'}.`}
          </Text>

          {report.issues.length > 0 ? (
            <SearchField value={search} onChange={setSearch} placeholder="Search student or subject" accessibilityLabel="Search validation issues" />
          ) : null}
        </>
      ) : null}
    </View>
  )

  return (
    <AppScreen scroll={false} contentStyle={styles.screen}>
      <FlatList
        data={report ? filtered : []}
        keyExtractor={(item) => item.student_id}
        ListHeaderComponent={header}
        renderItem={({ item }) => <IssueCard issue={item} />}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        refreshControl={<RefreshControl refreshing={validationQuery.isFetching} onRefresh={refresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          !report ? null : report.total_students === 0 ? (
            <EmptyCard
              icon="people-outline"
              title="No students to validate"
              body="This class has no roster yet, so there is nothing to check."
            />
          ) : report.issues.length === 0 ? (
            <EmptyCard
              icon="shield-checkmark-outline"
              title="Class is ready"
              body="Every student has a division and a complete subject set for this semester. Nothing needs your attention."
            />
          ) : (
            <EmptyCard icon="search-outline" title="No match" body={`No flagged student matches "${search.trim()}".`} />
          )
        }
      />
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 0,
    paddingBottom: layout.bottomTabHeight + spacing[3],
  },
  padded: {
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
  header: {
    gap: spacing[4],
    paddingBottom: spacing[3],
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    gap: spacing[3],
    paddingBottom: spacing[6],
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  summaryLine: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  issueCard: {
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    gap: spacing[2],
    ...shadows.xs,
  },
  issueTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  issueName: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
    lineHeight: 20,
  },
  issueCountPill: {
    borderRadius: radius.full,
    backgroundColor: colors.warningBg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  issueCountText: {
    color: colors.warningText,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  issueLine: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  issueGroup: {
    gap: spacing[1],
    borderRadius: radius.sm,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
  },
  issueGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  issueGroupTitle: {
    ...typography.roles.eyebrow,
    color: colors.textSecondary,
  },
  issueGroupBody: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
})
