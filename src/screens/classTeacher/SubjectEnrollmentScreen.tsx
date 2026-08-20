import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AppScreen } from '../../components/ui'
import { SubjectEnrollment, SubjectEnrollmentStudent, classTeacherApi, toApiFailure } from '../../api/classTeacher'
import { classTeacherKeys, useActiveSemester, useClassTeacherAccess, useClassTeacherIdentity } from '../../hooks/useClassTeacherAccess'
import { useAppResume } from '../../hooks/useAppResume'
import { useClassTeacherStore } from '../../stores/classTeacherStore'
import { colors, layout, radius, shadows, spacing, typography } from '../../theme'
import { ClassContextBar, EmptyCard, FailureCard, InlineLoading, SearchField } from './components'

type RouteParams = {
  subjectId: string
  subjectName: string
}

function fullName(student: SubjectEnrollmentStudent) {
  return `${student.first_name} ${student.last_name}`.trim() || student.student_id
}

function enrolledIds(enrollment: SubjectEnrollment) {
  return new Set(enrollment.students.filter((student) => student.enrolled).map((student) => student.id))
}

function sameSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false
  for (const value of a) if (!b.has(value)) return false
  return true
}

const EnrollmentRow = React.memo(function EnrollmentRow({
  student,
  enrolled,
  onToggle,
}: {
  student: SubjectEnrollmentStudent
  enrolled: boolean
  onToggle: (id: string) => void
}) {
  const division = student.division?.trim()

  return (
    <Pressable
      onPress={() => onToggle(student.id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: enrolled }}
      accessibilityLabel={`${fullName(student)}${division ? `, division ${division}` : ''}, ${enrolled ? 'enrolled' : 'not enrolled'}`}
      style={({ pressed }) => [styles.row, enrolled && styles.rowOn, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, enrolled && styles.checkboxOn]}>
        {enrolled ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowName} numberOfLines={1}>
          {fullName(student)}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {student.student_id}
          {division ? ` · Division ${division}` : ''}
        </Text>
      </View>
    </Pressable>
  )
})

export default function SubjectEnrollmentScreen() {
  const route = useRoute()
  const navigation = useNavigation<any>()
  const queryClient = useQueryClient()
  const { subjectId, subjectName } = route.params as RouteParams

  const access = useClassTeacherAccess()
  const { identity } = useClassTeacherIdentity()
  const { activeSemester } = useActiveSemester()
  const activeSemesterId = useClassTeacherStore((state) => state.activeSemesterId)
  const classSection = access.classSections[0]
  const classId = classSection?.id

  const [selection, setSelection] = useState<Set<string> | null>(null)
  const [search, setSearch] = useState('')
  const baselineRef = useRef<Set<string> | null>(null)
  const submitGuard = useRef(false)

  const enrollmentQuery = useQuery<SubjectEnrollment, unknown>({
    queryKey: classTeacherKeys.enrollments(classId, subjectId, activeSemesterId ?? undefined),
    queryFn: () => classTeacherApi.getSubjectEnrollments(classId!, subjectId, activeSemesterId),
    enabled: Boolean(classId) && access.isAuthorized,
    retry: false,
  })

  const students = enrollmentQuery.data?.students ?? []

  useEffect(() => {
    if (!enrollmentQuery.data) return
    const serverSelection = enrolledIds(enrollmentQuery.data)
    setSelection((current) => {
      // Preserve unsaved edits across a background refetch.
      if (current && baselineRef.current && !sameSet(current, baselineRef.current)) return current
      baselineRef.current = serverSelection
      return new Set(serverSelection)
    })
    if (!baselineRef.current) baselineRef.current = serverSelection
  }, [enrollmentQuery.data])

  const isDirty = Boolean(selection && baselineRef.current && !sameSet(selection, baselineRef.current))

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return students
    return students.filter(
      (student) =>
        fullName(student).toLowerCase().includes(needle) ||
        student.student_id.toLowerCase().includes(needle) ||
        (student.division ?? '').toLowerCase().includes(needle),
    )
  }, [search, students])

  const saveMutation = useMutation({
    mutationFn: async (payload: { student_ids: string[]; select_all: boolean }) =>
      classTeacherApi.updateSubjectEnrollments(classId!, subjectId, activeSemesterId, payload),
    onSuccess: (canonical) => {
      queryClient.setQueryData(classTeacherKeys.enrollments(classId, subjectId, activeSemesterId ?? undefined), canonical)
      const serverSelection = enrolledIds(canonical)
      baselineRef.current = serverSelection
      setSelection(new Set(serverSelection))
      void queryClient.invalidateQueries({ queryKey: classTeacherKeys.validation(classId, activeSemesterId ?? undefined) })
      void queryClient.invalidateQueries({ queryKey: ['class-teacher', 'enrollment-counts'] })
    },
    onError: (error) => {
      Alert.alert('Enrollment not saved', toApiFailure(error).message)
    },
    onSettled: () => {
      submitGuard.current = false
    },
  })

  const toggle = useCallback((id: string) => {
    setSelection((current) => {
      if (!current) return current
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAllVisible = () => {
    setSelection((current) => {
      if (!current) return current
      const next = new Set(current)
      const allOn = filtered.every((student) => next.has(student.id))
      for (const student of filtered) {
        if (allOn) next.delete(student.id)
        else next.add(student.id)
      }
      return next
    })
  }

  const handleSave = async () => {
    if (!classId || !selection || submitGuard.current || saveMutation.isPending || !isDirty) return

    // Re-read before writing: this endpoint replaces the whole enrollment list,
    // so a stale draft would silently discard someone else's newer change.
    let fresh: SubjectEnrollment
    try {
      fresh = await classTeacherApi.getSubjectEnrollments(classId, subjectId, activeSemesterId)
    } catch (error) {
      Alert.alert('Could not verify current enrollment', toApiFailure(error).message)
      return
    }

    const serverSelection = enrolledIds(fresh)
    const everyone = students.length > 0 && selection.size === students.length
    const commit = () => {
      submitGuard.current = true
      saveMutation.mutate({ student_ids: [...selection], select_all: everyone })
    }

    if (baselineRef.current && !sameSet(serverSelection, baselineRef.current)) {
      Alert.alert(
        'Someone else changed this enrollment',
        `${subjectName} enrollment changed on the server since you opened it. Discard your edits to load theirs, or overwrite with yours.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard mine',
            onPress: () => {
              baselineRef.current = serverSelection
              setSelection(new Set(serverSelection))
              queryClient.setQueryData(classTeacherKeys.enrollments(classId, subjectId, activeSemesterId ?? undefined), fresh)
            },
          },
          { text: 'Overwrite', style: 'destructive', onPress: commit },
        ],
      )
      return
    }

    const removing = [...(baselineRef.current ?? [])].filter((id) => !selection.has(id)).length
    const adding = [...selection].filter((id) => !(baselineRef.current ?? new Set()).has(id)).length
    const parts = [adding ? `enroll ${adding}` : null, removing ? `remove ${removing}` : null].filter(Boolean).join(' and ')

    Alert.alert(
      removing > 0 ? 'Remove students from this subject?' : 'Save enrollment?',
      `This will ${parts} student${adding + removing === 1 ? '' : 's'} for ${subjectName}. Removing a student deletes their enrollment record for this semester.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save enrollment', style: removing > 0 ? 'destructive' : 'default', onPress: commit },
      ],
    )
  }

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event: any) => {
      if (!isDirty || saveMutation.isPending) return
      event.preventDefault()
      Alert.alert('Discard enrollment changes?', `Your changes to ${subjectName} have not been saved.`, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
      ])
    })
    return unsubscribe
  }, [isDirty, navigation, saveMutation.isPending, subjectName])

  const refresh = useCallback(() => {
    if (isDirty) return
    void enrollmentQuery.refetch()
  }, [enrollmentQuery, isDirty])

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
          <EmptyCard icon="school-outline" title="No class assigned to you" body="Enrollment editing needs an approved class-teacher assignment." />
        )}
      </AppScreen>
    )
  }

  const failure = enrollmentQuery.error ? toApiFailure(enrollmentQuery.error) : null
  const enrolledCount = selection?.size ?? 0
  const allVisibleOn = filtered.length > 0 && selection != null && filtered.every((student) => selection.has(student.id))

  return (
    <AppScreen scroll={false} contentStyle={styles.screen}>
      <ClassContextBar
        identity={identity}
        standard={classSection?.standard}
        division={classSection?.division}
        semesterName={activeSemester?.name}
        isStale={enrollmentQuery.isFetching && students.length > 0}
      />

      <View style={styles.subjectHeader}>
        <View style={styles.subjectIcon}>
          <Ionicons name="library" size={17} color={colors.accentStrong} />
        </View>
        <View style={styles.subjectCopy}>
          <Text style={styles.subjectName} numberOfLines={2}>
            {subjectName}
          </Text>
          <Text style={styles.subjectMeta}>
            {enrollmentQuery.isLoading ? 'Loading enrollment' : `${enrolledCount} of ${students.length} students enrolled`}
          </Text>
        </View>
      </View>

      <SearchField value={search} onChange={setSearch} placeholder="Search name, ID, or division" accessibilityLabel="Search students" />

      {filtered.length > 0 ? (
        <View style={styles.bulkRow}>
          <Text style={styles.bulkText}>
            {search.trim() ? `${filtered.length} matching` : `${students.length} on roster`}
          </Text>
          <Pressable onPress={toggleAllVisible} hitSlop={8} accessibilityRole="button" style={styles.bulkAction}>
            <Text style={styles.bulkActionText}>{allVisibleOn ? 'Unenroll shown' : 'Enroll shown'}</Text>
          </Pressable>
        </View>
      ) : null}

      {failure ? (
        <FailureCard failure={failure} onRetry={() => void enrollmentQuery.refetch()} />
      ) : enrollmentQuery.isLoading ? (
        <InlineLoading label="Loading who can take this subject" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <EnrollmentRow student={item} enrolled={Boolean(selection?.has(item.id))} onToggle={toggle} />
          )}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={9}
          removeClippedSubviews
          refreshControl={<RefreshControl refreshing={enrollmentQuery.isFetching && !isDirty} onRefresh={refresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            students.length === 0 ? (
              <EmptyCard
                icon="people-outline"
                title="No students to enroll"
                body="This class has no students assigned to a division yet. Assign divisions on the roster screen first."
              />
            ) : (
              <EmptyCard icon="search-outline" title="No match" body={`No student matches "${search.trim()}".`} />
            )
          }
        />
      )}

      <View style={styles.saveBar}>
        <Text style={isDirty ? styles.dirtyNote : styles.cleanNote}>
          {isDirty ? 'Unsaved enrollment changes' : 'Enrollment matches the school record'}
        </Text>
        <AnimatedButton
          label={isDirty ? `Save ${enrolledCount} enrolled` : 'No changes to save'}
          loading={saveMutation.isPending}
          disabled={!isDirty || saveMutation.isPending}
          onPress={() => void handleSave()}
        />
      </View>
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
  subjectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  subjectIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  subjectCopy: {
    flex: 1,
    gap: 2,
  },
  subjectName: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 19,
    lineHeight: 24,
  },
  subjectMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
  },
  bulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  bulkText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  bulkAction: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  bulkActionText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    gap: spacing[2],
    paddingBottom: spacing[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 60,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  rowOn: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.xs,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  rowMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
  },
  saveBar: {
    gap: spacing[2],
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    ...shadows.sm,
  },
  dirtyNote: {
    color: colors.warning,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  cleanNote: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.78,
  },
})
