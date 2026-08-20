import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AppScreen } from '../../components/ui'
import { classTeacherApi, RosterStudent, toApiFailure } from '../../api/classTeacher'
import { classTeacherKeys, useActiveSemester, useClassTeacherAccess, useClassTeacherIdentity } from '../../hooks/useClassTeacherAccess'
import { useAppResume } from '../../hooks/useAppResume'
import { useClassTeacherStore } from '../../stores/classTeacherStore'
import { colors, layout, radius, shadows, spacing, typography } from '../../theme'
import { ClassContextBar, EmptyCard, FailureCard, InlineLoading, SearchField } from './components'

function studentName(student: RosterStudent) {
  return `${student.first_name} ${student.last_name}`.trim() || student.student_id
}

function divisionsSnapshot(students: RosterStudent[]) {
  const snapshot: Record<string, string> = {}
  for (const student of students) snapshot[student.id] = student.division ?? ''
  return snapshot
}

const StudentRow = React.memo(function StudentRow({
  student,
  selected,
  onToggle,
}: {
  student: RosterStudent
  selected: boolean
  onToggle: (id: string) => void
}) {
  const division = student.division?.trim()

  return (
    <Pressable
      onPress={() => onToggle(student.id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${studentName(student)}, ${division ? `division ${division}` : 'no division'}`}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, selected && styles.checkboxOn]}>
        {selected ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowName} numberOfLines={1}>
          {studentName(student)}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {student.student_id}
        </Text>
      </View>
      <View style={[styles.divisionPill, !division && styles.divisionPillEmpty]}>
        <Text style={[styles.divisionText, !division && styles.divisionTextEmpty]}>{division || 'None'}</Text>
      </View>
    </Pressable>
  )
})

export default function ClassRosterScreen() {
  const navigation = useNavigation<any>()
  const queryClient = useQueryClient()
  const access = useClassTeacherAccess()
  const { identity } = useClassTeacherIdentity()
  const { activeSemester } = useActiveSemester()
  const activeSemesterId = useClassTeacherStore((state) => state.activeSemesterId)

  const classSection = access.classSections[0]
  const standard = classSection?.standard

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targetDivision, setTargetDivision] = useState<string | null>(null)
  const baselineRef = useRef<Record<string, string>>({})
  const submitGuard = useRef(false)

  const rosterQuery = useQuery<RosterStudent[], unknown>({
    queryKey: classTeacherKeys.roster(standard),
    queryFn: () => classTeacherApi.getRoster(standard),
    enabled: Boolean(standard) && access.isAuthorized,
    retry: false,
  })

  const divisionsQuery = useQuery<string[], unknown>({
    queryKey: classTeacherKeys.divisions(standard),
    queryFn: () => classTeacherApi.getStandardDivisions(standard!),
    enabled: Boolean(standard) && access.isAuthorized,
    retry: false,
  })

  const roster = rosterQuery.data ?? []
  const divisions = divisionsQuery.data ?? []

  useEffect(() => {
    if (rosterQuery.data) baselineRef.current = divisionsSnapshot(rosterQuery.data)
  }, [rosterQuery.data])

  useEffect(() => {
    if (!targetDivision && divisions[0]) setTargetDivision(divisions[0])
  }, [divisions, targetDivision])

  // Drop selections for students who no longer appear in the canonical roster.
  useEffect(() => {
    if (!rosterQuery.data) return
    const present = new Set(rosterQuery.data.map((student) => student.id))
    setSelected((current) => {
      const next = new Set([...current].filter((id) => present.has(id)))
      return next.size === current.size ? current : next
    })
  }, [rosterQuery.data])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return roster
    return roster.filter((student) => {
      return (
        studentName(student).toLowerCase().includes(needle) ||
        student.student_id.toLowerCase().includes(needle) ||
        (student.division ?? '').toLowerCase().includes(needle)
      )
    })
  }, [roster, search])

  const assignMutation = useMutation({
    mutationFn: async (input: { standard: string; division: string; student_ids: string[] }) => {
      return classTeacherApi.assignDivision(input)
    },
    onSuccess: (canonical) => {
      // Trust the server's returned rows as the new truth for this standard.
      queryClient.setQueryData(classTeacherKeys.roster(standard), canonical)
      baselineRef.current = divisionsSnapshot(canonical)
      setSelected(new Set())
      void queryClient.invalidateQueries({ queryKey: classTeacherKeys.validation(classSection?.id, activeSemesterId ?? undefined) })
      void queryClient.invalidateQueries({ queryKey: classTeacherKeys.divisions(standard) })
    },
    onError: (error) => {
      const failure = toApiFailure(error)
      Alert.alert('Division not changed', failure.message)
      if (failure.kind === 'conflict' || failure.kind === 'not_found') void rosterQuery.refetch()
    },
    onSettled: () => {
      submitGuard.current = false
    },
  })

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAllVisible = () => {
    setSelected((current) => {
      const next = new Set(current)
      const allSelected = filtered.every((student) => next.has(student.id))
      for (const student of filtered) {
        if (allSelected) next.delete(student.id)
        else next.add(student.id)
      }
      return next
    })
  }

  const runAssign = (ids: string[], division: string) => {
    submitGuard.current = true
    assignMutation.mutate({ standard: standard!, division, student_ids: ids })
  }

  const handleAssign = async () => {
    if (!standard || !targetDivision || submitGuard.current || assignMutation.isPending) return
    const ids = [...selected]
    if (ids.length === 0) return

    // Re-read the roster first so a teammate's newer assignment is never
    // silently overwritten by a stale selection.
    let fresh: RosterStudent[]
    try {
      fresh = await classTeacherApi.getRoster(standard)
    } catch (error) {
      Alert.alert('Could not verify current data', toApiFailure(error).message)
      return
    }

    queryClient.setQueryData(classTeacherKeys.roster(standard), fresh)
    const freshSnapshot = divisionsSnapshot(fresh)
    const stillPresent = ids.filter((id) => id in freshSnapshot)
    const changed = stillPresent.filter((id) => freshSnapshot[id] !== (baselineRef.current[id] ?? ''))
    const missing = ids.length - stillPresent.length

    const summary = `Move ${stillPresent.length} student${stillPresent.length === 1 ? '' : 's'} to division ${targetDivision}.`

    if (stillPresent.length === 0) {
      baselineRef.current = freshSnapshot
      setSelected(new Set())
      Alert.alert('Selection is out of date', 'None of the selected students are on this roster any more. The list has been reloaded.')
      return
    }

    if (changed.length > 0 || missing > 0) {
      const parts: string[] = []
      if (changed.length > 0) parts.push(`${changed.length} selected student${changed.length === 1 ? ' was' : 's were'} moved by someone else`)
      if (missing > 0) parts.push(`${missing} left this roster`)
      Alert.alert(
        'Someone else changed this roster',
        `${parts.join(' and ')}. Reload to work from the current data, or apply your change anyway.\n\n${summary}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reload',
            onPress: () => {
              baselineRef.current = freshSnapshot
              setSelected(new Set())
            },
          },
          { text: 'Apply anyway', style: 'destructive', onPress: () => runAssign(stillPresent, targetDivision) },
        ],
      )
      return
    }

    Alert.alert('Change division?', `${summary} This updates the school record immediately.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change division', style: 'destructive', onPress: () => runAssign(stillPresent, targetDivision) },
    ])
  }

  // Protect an in-progress selection from an accidental back gesture.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event: any) => {
      if (selected.size === 0 || assignMutation.isPending) return
      event.preventDefault()
      Alert.alert('Discard selection?', `${selected.size} student${selected.size === 1 ? '' : 's'} are selected but not assigned yet.`, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
      ])
    })
    return unsubscribe
  }, [assignMutation.isPending, navigation, selected])

  const refreshAll = useCallback(() => {
    void rosterQuery.refetch()
    void divisionsQuery.refetch()
  }, [divisionsQuery, rosterQuery])

  useAppResume(refreshAll, access.isAuthorized)

  if (access.isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Checking your class assignment</Text>
      </AppScreen>
    )
  }

  if (access.failure || access.hasNoClass || !standard) {
    return (
      <AppScreen contentStyle={styles.padded}>
        {access.failure ? (
          <FailureCard failure={access.failure} onRetry={() => void access.refetch()} />
        ) : (
          <EmptyCard
            icon="school-outline"
            title="No class assigned to you"
            body="A roster appears here once the school approves your class-teacher assignment."
          />
        )}
      </AppScreen>
    )
  }

  const rosterFailure = rosterQuery.error ? toApiFailure(rosterQuery.error) : null
  const divisionsFailure = divisionsQuery.error ? toApiFailure(divisionsQuery.error) : null
  const allVisibleSelected = filtered.length > 0 && filtered.every((student) => selected.has(student.id))

  return (
    <AppScreen scroll={false} contentStyle={styles.screen}>
      <ClassContextBar
        identity={identity}
        standard={classSection?.standard}
        division={classSection?.division}
        semesterName={activeSemester?.name}
        isStale={rosterQuery.isFetching && roster.length > 0}
      />

      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Search name, ID, or division"
        accessibilityLabel="Search the class roster"
      />

      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>
          {rosterQuery.isLoading
            ? 'Loading roster'
            : `${filtered.length} of ${roster.length} student${roster.length === 1 ? '' : 's'}${selected.size ? ` · ${selected.size} selected` : ''}`}
        </Text>
        {filtered.length > 0 ? (
          <Pressable onPress={selectAllVisible} hitSlop={8} accessibilityRole="button" style={styles.selectAll}>
            <Text style={styles.selectAllText}>{allVisibleSelected ? 'Clear' : 'Select all'}</Text>
          </Pressable>
        ) : null}
      </View>

      {rosterFailure ? (
        <FailureCard failure={rosterFailure} onRetry={() => void rosterQuery.refetch()} />
      ) : rosterQuery.isLoading ? (
        <InlineLoading label="Loading students in your standard" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <StudentRow student={item} selected={selected.has(item.id)} onToggle={toggle} />}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={9}
          removeClippedSubviews
          refreshControl={<RefreshControl refreshing={rosterQuery.isFetching} onRefresh={refreshAll} tintColor={colors.accent} />}
          ListEmptyComponent={
            roster.length === 0 ? (
              <EmptyCard
                icon="people-outline"
                title="No students in this standard"
                body="Nothing has been enrolled into your standard yet. Pull to refresh once the school adds students."
              />
            ) : (
              <EmptyCard icon="search-outline" title="No match" body={`No student matches "${search.trim()}".`} />
            )
          }
        />
      )}

      <View style={styles.actionBar}>
        {divisionsFailure ? (
          <Text style={styles.actionWarning}>Divisions could not load, so assignment is unavailable. {divisionsFailure.message}</Text>
        ) : divisions.length === 0 && !divisionsQuery.isLoading ? (
          <Text style={styles.actionWarning}>This standard has no divisions configured, so students cannot be assigned yet.</Text>
        ) : (
          <>
            <Text style={styles.actionLabel}>Move to division</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.divisionRow}>
              {divisions.map((division) => {
                const isActive = division === targetDivision
                return (
                  <Pressable
                    key={division}
                    onPress={() => setTargetDivision(division)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={`Division ${division}`}
                    style={({ pressed }) => [styles.divisionChip, isActive && styles.divisionChipActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.divisionChipText, isActive && styles.divisionChipTextActive]}>{division}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </>
        )}

        <AnimatedButton
          label={
            selected.size === 0
              ? 'Select students to assign'
              : `Assign ${selected.size} student${selected.size === 1 ? '' : 's'} to ${targetDivision ?? '—'}`
          }
          loading={assignMutation.isPending}
          disabled={selected.size === 0 || !targetDivision || assignMutation.isPending}
          onPress={() => void handleAssign()}
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  summaryText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  selectAll: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  selectAllText: {
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
  rowSelected: {
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
  divisionPill: {
    minWidth: 42,
    alignItems: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  divisionPillEmpty: {
    backgroundColor: colors.dangerSurface,
  },
  divisionText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  divisionTextEmpty: {
    color: colors.dangerText,
  },
  actionBar: {
    gap: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    ...shadows.sm,
  },
  actionLabel: {
    ...typography.roles.eyebrow,
    color: colors.textMuted,
  },
  actionWarning: {
    color: colors.warning,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  divisionRow: {
    gap: spacing[2],
    paddingRight: spacing[2],
  },
  divisionChip: {
    minWidth: 48,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: spacing[4],
  },
  divisionChipActive: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
  },
  divisionChipText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  divisionChipTextActive: {
    color: colors.accentStrong,
  },
  pressed: {
    opacity: 0.78,
  },
})
