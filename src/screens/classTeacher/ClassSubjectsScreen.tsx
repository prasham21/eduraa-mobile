import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AppScreen } from '../../components/ui'
import {
  ClassSemesterConfig,
  ClassSemesterConfigInput,
  SubjectGroupRule,
  SubjectOption,
  classTeacherApi,
  toApiFailure,
} from '../../api/classTeacher'
import { classTeacherKeys, useActiveSemester, useClassTeacherAccess, useClassTeacherIdentity } from '../../hooks/useClassTeacherAccess'
import { useAppResume } from '../../hooks/useAppResume'
import { useClassTeacherStore } from '../../stores/classTeacherStore'
import { colors, layout, radius, shadows, spacing, typography } from '../../theme'
import { ClassContextBar, EmptyCard, FailureCard, InlineLoading, SearchField } from './components'

interface DraftGroup {
  name: string
  rule: SubjectGroupRule
  required_count: number
}

interface DraftSubject {
  subject_id: string
  is_mandatory: boolean
  group_name: string | null
}

interface Draft {
  expected_subject_count: number
  groups: DraftGroup[]
  subjects: DraftSubject[]
}

function configToDraft(config: ClassSemesterConfig): Draft {
  const groupNameById = new Map(config.groups.map((group) => [group.id, group.name]))
  return {
    expected_subject_count: config.expected_subject_count,
    groups: config.groups.map((group) => ({ name: group.name, rule: group.rule, required_count: group.required_count })),
    subjects: config.subjects.map((subject) => ({
      subject_id: subject.subject_id,
      is_mandatory: subject.is_mandatory,
      group_name: subject.group_id ? groupNameById.get(subject.group_id) ?? null : null,
    })),
  }
}

/** Stable string used to compare a draft against the loaded server state. */
function draftFingerprint(draft: Draft) {
  const groups = [...draft.groups]
    .map((group) => `${group.name.trim().toLowerCase()}|${group.rule}|${group.required_count}`)
    .sort()
    .join(';')
  const subjects = [...draft.subjects]
    .map((subject) => `${subject.subject_id}|${subject.is_mandatory ? 1 : 0}|${(subject.group_name ?? '').trim().toLowerCase()}`)
    .sort()
    .join(';')
  return `${draft.expected_subject_count}::${groups}::${subjects}`
}

function draftToPayload(draft: Draft): ClassSemesterConfigInput {
  const groupNames = new Set(draft.groups.map((group) => group.name.trim().toLowerCase()))
  return {
    expected_subject_count: draft.expected_subject_count,
    groups: draft.groups.map((group) => ({
      name: group.name.trim(),
      rule: group.rule,
      required_count: group.rule === 'choose_one' ? 1 : group.required_count,
    })),
    subjects: draft.subjects.map((subject) => {
      const name = subject.group_name?.trim()
      const keep = name && groupNames.has(name.toLowerCase())
      return { subject_id: subject.subject_id, is_mandatory: subject.is_mandatory, group_name: keep ? name : null }
    }),
  }
}

export default function ClassSubjectsScreen() {
  const navigation = useNavigation<any>()
  const queryClient = useQueryClient()
  const access = useClassTeacherAccess()
  const { identity } = useClassTeacherIdentity()
  const { activeSemester } = useActiveSemester()
  const activeSemesterId = useClassTeacherStore((state) => state.activeSemesterId)

  const classSection = access.classSections[0]
  const classId = classSection?.id

  const [draft, setDraft] = useState<Draft | null>(null)
  const [search, setSearch] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const baselineRef = useRef<string | null>(null)
  const submitGuard = useRef(false)

  const configQuery = useQuery<ClassSemesterConfig, unknown>({
    queryKey: classTeacherKeys.config(classId, activeSemesterId ?? undefined),
    queryFn: () => classTeacherApi.getSemesterConfig(classId!, activeSemesterId),
    enabled: Boolean(classId) && access.isAuthorized,
    retry: false,
  })

  const subjectsQuery = useQuery<SubjectOption[], unknown>({
    queryKey: classTeacherKeys.subjects,
    queryFn: classTeacherApi.getSubjects,
    enabled: access.isAuthorized,
    retry: false,
  })

  // Adopt server state as the draft baseline whenever a fresh config arrives
  // and the teacher has no unsaved edits.
  useEffect(() => {
    if (!configQuery.data) return
    const next = configToDraft(configQuery.data)
    const fingerprint = draftFingerprint(next)
    setDraft((current) => {
      if (current && baselineRef.current && draftFingerprint(current) !== baselineRef.current) return current
      baselineRef.current = fingerprint
      return next
    })
    if (baselineRef.current === null) baselineRef.current = fingerprint
  }, [configQuery.data])

  const subjects = subjectsQuery.data ?? []
  const subjectNameById = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject.name])), [subjects])

  const configuredIds = useMemo(() => new Set((draft?.subjects ?? []).map((subject) => subject.subject_id)), [draft])
  const configuredSubjectIds = useMemo(() => [...configuredIds], [configuredIds])

  const isDirty = Boolean(draft && baselineRef.current && draftFingerprint(draft) !== baselineRef.current)

  /**
   * Enrolled headcount per configured subject. Mirrors the web page, which
   * reads each subject's enrollment list to show a count.
   */
  const countsQuery = useQuery<Record<string, number | null>, unknown>({
    queryKey: ['class-teacher', 'enrollment-counts', classId ?? 'none', activeSemesterId ?? 'default', configuredSubjectIds.join(',')],
    enabled: Boolean(classId) && access.isAuthorized && configuredSubjectIds.length > 0 && !isDirty,
    retry: false,
    queryFn: async () => {
      const entries = await Promise.all(
        configuredSubjectIds.map(async (subjectId) => {
          try {
            const enrollment = await classTeacherApi.getSubjectEnrollments(classId!, subjectId, activeSemesterId)
            return [subjectId, enrollment.students.filter((student) => student.enrolled).length] as const
          } catch {
            // A single unreadable subject must not blank the whole screen.
            return [subjectId, null] as const
          }
        }),
      )
      return Object.fromEntries(entries)
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (payload: ClassSemesterConfigInput) => classTeacherApi.updateSemesterConfig(classId!, activeSemesterId, payload),
    onSuccess: (canonical) => {
      queryClient.setQueryData(classTeacherKeys.config(classId, activeSemesterId ?? undefined), canonical)
      const next = configToDraft(canonical)
      baselineRef.current = draftFingerprint(next)
      setDraft(next)
      void queryClient.invalidateQueries({ queryKey: classTeacherKeys.validation(classId, activeSemesterId ?? undefined) })
      void queryClient.invalidateQueries({ queryKey: ['class-teacher', 'enrollment-counts'] })
    },
    onError: (error) => {
      Alert.alert('Subjects not saved', toApiFailure(error).message)
    },
    onSettled: () => {
      submitGuard.current = false
    },
  })

  const updateDraft = (mutate: (current: Draft) => Draft) => {
    setDraft((current) => (current ? mutate(current) : current))
  }

  const toggleSubject = useCallback((subjectId: string) => {
    updateDraft((current) => {
      const exists = current.subjects.some((subject) => subject.subject_id === subjectId)
      return {
        ...current,
        subjects: exists
          ? current.subjects.filter((subject) => subject.subject_id !== subjectId)
          : [...current.subjects, { subject_id: subjectId, is_mandatory: false, group_name: null }],
      }
    })
  }, [])

  const toggleMandatory = (subjectId: string) => {
    updateDraft((current) => ({
      ...current,
      subjects: current.subjects.map((subject) =>
        subject.subject_id === subjectId ? { ...subject, is_mandatory: !subject.is_mandatory } : subject,
      ),
    }))
  }

  const cycleGroup = (subjectId: string) => {
    updateDraft((current) => {
      if (current.groups.length === 0) return current
      const names = current.groups.map((group) => group.name)
      return {
        ...current,
        subjects: current.subjects.map((subject) => {
          if (subject.subject_id !== subjectId) return subject
          const index = subject.group_name ? names.indexOf(subject.group_name) : -1
          const nextIndex = index + 1
          return { ...subject, group_name: nextIndex >= names.length ? null : names[nextIndex] }
        }),
      }
    })
  }

  const addGroup = () => {
    const name = newGroupName.trim()
    if (!name || !draft) return
    if (draft.groups.some((group) => group.name.trim().toLowerCase() === name.toLowerCase())) {
      Alert.alert('Group already exists', `"${name}" is already a group in this semester.`)
      return
    }
    updateDraft((current) => ({ ...current, groups: [...current.groups, { name, rule: 'choose_one', required_count: 1 }] }))
    setNewGroupName('')
  }

  const removeGroup = (name: string) => {
    updateDraft((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.name !== name),
      subjects: current.subjects.map((subject) => (subject.group_name === name ? { ...subject, group_name: null } : subject)),
    }))
  }

  const updateGroupRule = (name: string) => {
    updateDraft((current) => ({
      ...current,
      groups: current.groups.map((group) => {
        if (group.name !== name) return group
        const rule: SubjectGroupRule = group.rule === 'choose_one' ? 'choose_n' : 'choose_one'
        return { ...group, rule, required_count: rule === 'choose_one' ? 1 : Math.max(1, group.required_count) }
      }),
    }))
  }

  const stepGroupCount = (name: string, delta: number) => {
    updateDraft((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.name === name ? { ...group, required_count: Math.min(20, Math.max(1, group.required_count + delta)) } : group,
      ),
    }))
  }

  const stepExpected = (delta: number) => {
    updateDraft((current) => ({
      ...current,
      expected_subject_count: Math.min(50, Math.max(0, current.expected_subject_count + delta)),
    }))
  }

  const handleSave = async () => {
    if (!draft || !classId || submitGuard.current || saveMutation.isPending || !isDirty) return

    // Verify nobody changed the configuration while this draft was open.
    let fresh: ClassSemesterConfig
    try {
      fresh = await classTeacherApi.getSemesterConfig(classId, activeSemesterId)
    } catch (error) {
      Alert.alert('Could not verify current setup', toApiFailure(error).message)
      return
    }

    const serverFingerprint = draftFingerprint(configToDraft(fresh))
    const commit = () => {
      submitGuard.current = true
      saveMutation.mutate(draftToPayload(draft))
    }

    if (baselineRef.current && serverFingerprint !== baselineRef.current) {
      Alert.alert(
        'Someone else changed this setup',
        'The subject configuration on the server no longer matches what you started from. Discard your edits to load theirs, or overwrite with yours.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard mine',
            onPress: () => {
              const next = configToDraft(fresh)
              baselineRef.current = draftFingerprint(next)
              setDraft(next)
              queryClient.setQueryData(classTeacherKeys.config(classId, activeSemesterId ?? undefined), fresh)
            },
          },
          { text: 'Overwrite', style: 'destructive', onPress: commit },
        ],
      )
      return
    }

    Alert.alert(
      'Save subject setup?',
      `${draft.subjects.length} subject${draft.subjects.length === 1 ? '' : 's'} for this class, expecting ${draft.expected_subject_count} per student. Removing a subject also removes its enrollments.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: commit },
      ],
    )
  }

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event: any) => {
      if (!isDirty || saveMutation.isPending) return
      event.preventDefault()
      Alert.alert('Discard subject changes?', 'Your subject setup edits have not been saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
      ])
    })
    return unsubscribe
  }, [isDirty, navigation, saveMutation.isPending])

  const refreshAll = useCallback(() => {
    if (isDirty) return
    void configQuery.refetch()
    void subjectsQuery.refetch()
    void countsQuery.refetch()
  }, [configQuery, countsQuery, isDirty, subjectsQuery])

  useAppResume(refreshAll, access.isAuthorized)

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
          <EmptyCard
            icon="school-outline"
            title="No class assigned to you"
            body="Subject setup appears here once the school approves your class-teacher assignment."
          />
        )}
      </AppScreen>
    )
  }

  const configFailure = configQuery.error ? toApiFailure(configQuery.error) : null
  const subjectsFailure = subjectsQuery.error ? toApiFailure(subjectsQuery.error) : null
  const counts = countsQuery.data ?? {}

  const filteredCatalog = (() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return subjects
    return subjects.filter((subject) => subject.name.toLowerCase().includes(needle) || (subject.code ?? '').toLowerCase().includes(needle))
  })()

  const header = (
    <View style={styles.header}>
      <ClassContextBar
        identity={identity}
        standard={classSection?.standard}
        division={classSection?.division}
        semesterName={activeSemester?.name}
        isStale={configQuery.isFetching && Boolean(draft)}
      />

      {configFailure ? <FailureCard failure={configFailure} onRetry={() => void configQuery.refetch()} /> : null}

      {draft ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardKicker}>Subjects expected per student</Text>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => stepExpected(-1)}
                disabled={draft.expected_subject_count <= 0}
                accessibilityRole="button"
                accessibilityLabel="Decrease expected subject count"
                style={({ pressed }) => [styles.stepper, pressed && styles.pressed, draft.expected_subject_count <= 0 && styles.stepperOff]}
              >
                <Ionicons name="remove" size={20} color={colors.accentStrong} />
              </Pressable>
              <Text style={styles.stepperValue}>{draft.expected_subject_count}</Text>
              <Pressable
                onPress={() => stepExpected(1)}
                disabled={draft.expected_subject_count >= 50}
                accessibilityRole="button"
                accessibilityLabel="Increase expected subject count"
                style={({ pressed }) => [styles.stepper, pressed && styles.pressed, draft.expected_subject_count >= 50 && styles.stepperOff]}
              >
                <Ionicons name="add" size={20} color={colors.accentStrong} />
              </Pressable>
            </View>
            <Text style={styles.cardBody}>
              Validation flags any student whose enrolled subject count falls short of this number. Set 0 to skip the count check.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardKicker}>Elective groups</Text>
            <Text style={styles.cardBody}>
              Group subjects a student picks between, such as a second language. Tap a group to switch between choosing exactly one and
              choosing several.
            </Text>

            {draft.groups.map((group) => (
              <View key={group.name} style={styles.groupRow}>
                <Pressable
                  onPress={() => updateGroupRule(group.name)}
                  accessibilityRole="button"
                  accessibilityLabel={`${group.name}, rule ${group.rule === 'choose_one' ? 'choose one' : 'choose several'}`}
                  style={({ pressed }) => [styles.groupMain, pressed && styles.pressed]}
                >
                  <Text style={styles.groupName} numberOfLines={1}>
                    {group.name}
                  </Text>
                  <Text style={styles.groupRule}>{group.rule === 'choose_one' ? 'Choose exactly one' : `Choose ${group.required_count}`}</Text>
                </Pressable>
                {group.rule === 'choose_n' ? (
                  <View style={styles.groupCount}>
                    <Pressable
                      onPress={() => stepGroupCount(group.name, -1)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Decrease required count for ${group.name}`}
                    >
                      <Ionicons name="remove-circle-outline" size={22} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => stepGroupCount(group.name, 1)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Increase required count for ${group.name}`}
                    >
                      <Ionicons name="add-circle-outline" size={22} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                ) : null}
                <Pressable
                  onPress={() => removeGroup(group.name)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove group ${group.name}`}
                  style={styles.groupRemove}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            ))}

            <View style={styles.addGroupRow}>
              <TextInput
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="New group name"
                placeholderTextColor={colors.textSoft}
                style={styles.addGroupInput}
                maxLength={100}
                returnKeyType="done"
                onSubmitEditing={addGroup}
                accessibilityLabel="New elective group name"
              />
              <Pressable
                onPress={addGroup}
                disabled={!newGroupName.trim()}
                accessibilityRole="button"
                accessibilityLabel="Add elective group"
                style={({ pressed }) => [styles.addGroupButton, pressed && styles.pressed, !newGroupName.trim() && styles.stepperOff]}
              >
                <Ionicons name="add" size={20} color={colors.accentStrong} />
              </Pressable>
            </View>
          </View>
        </>
      ) : configQuery.isLoading ? (
        <InlineLoading label="Loading this semester's subject setup" />
      ) : null}

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>School subjects</Text>
        <Text style={styles.sectionMeta}>
          {subjectsQuery.isLoading
            ? 'Loading the school subject catalog'
            : `${configuredIds.size} of ${subjects.length} selected for this class`}
        </Text>
      </View>

      <SearchField value={search} onChange={setSearch} placeholder="Search subjects" accessibilityLabel="Search school subjects" />

      {subjectsFailure ? <FailureCard failure={subjectsFailure} onRetry={() => void subjectsQuery.refetch()} /> : null}
    </View>
  )

  return (
    <AppScreen scroll={false} contentStyle={styles.screen}>
      <FlatList
        data={draft ? filteredCatalog : []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={9}
        removeClippedSubviews
        refreshControl={<RefreshControl refreshing={configQuery.isFetching && !isDirty} onRefresh={refreshAll} tintColor={colors.accent} />}
        ListEmptyComponent={
          !draft ? null : subjects.length === 0 && !subjectsQuery.isLoading ? (
            <EmptyCard
              icon="library-outline"
              title="No subjects in the school catalog"
              body="This class cannot be configured until your school adds subjects. Nothing is being hidden here."
            />
          ) : filteredCatalog.length === 0 ? (
            <EmptyCard icon="search-outline" title="No match" body={`No subject matches "${search.trim()}".`} />
          ) : null
        }
        renderItem={({ item }) => {
          const selectedSubject = draft?.subjects.find((subject) => subject.subject_id === item.id)
          const enrolled = counts[item.id]
          return (
            <View style={[styles.subjectCard, selectedSubject && styles.subjectCardOn]}>
              <Pressable
                onPress={() => toggleSubject(item.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: Boolean(selectedSubject) }}
                accessibilityLabel={`${item.name}${selectedSubject ? ', included in this class' : ', not included'}`}
                style={({ pressed }) => [styles.subjectTop, pressed && styles.pressed]}
              >
                <View style={[styles.checkbox, selectedSubject && styles.checkboxOn]}>
                  {selectedSubject ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
                </View>
                <View style={styles.subjectCopy}>
                  <Text style={styles.subjectName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {item.code ? <Text style={styles.subjectCode}>{item.code}</Text> : null}
                </View>
              </Pressable>

              {selectedSubject ? (
                <View style={styles.subjectControls}>
                  <Pressable
                    onPress={() => toggleMandatory(item.id)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: selectedSubject.is_mandatory }}
                    accessibilityLabel={`${item.name} mandatory`}
                    style={({ pressed }) => [
                      styles.controlChip,
                      selectedSubject.is_mandatory && styles.controlChipOn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={selectedSubject.is_mandatory ? 'lock-closed' : 'lock-open-outline'}
                      size={13}
                      color={selectedSubject.is_mandatory ? colors.accentStrong : colors.textSecondary}
                    />
                    <Text style={[styles.controlChipText, selectedSubject.is_mandatory && styles.controlChipTextOn]}>
                      {selectedSubject.is_mandatory ? 'Mandatory' : 'Optional'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => cycleGroup(item.id)}
                    disabled={(draft?.groups.length ?? 0) === 0}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name} group: ${selectedSubject.group_name ?? 'none'}`}
                    style={({ pressed }) => [
                      styles.controlChip,
                      selectedSubject.group_name && styles.controlChipOn,
                      pressed && styles.pressed,
                      (draft?.groups.length ?? 0) === 0 && styles.stepperOff,
                    ]}
                  >
                    <Ionicons name="git-branch-outline" size={13} color={selectedSubject.group_name ? colors.accentStrong : colors.textSecondary} />
                    <Text style={[styles.controlChipText, selectedSubject.group_name && styles.controlChipTextOn]} numberOfLines={1}>
                      {selectedSubject.group_name ?? 'No group'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      navigation.navigate('SubjectEnrollment', {
                        subjectId: item.id,
                        subjectName: subjectNameById.get(item.id) ?? item.name,
                      })
                    }
                    disabled={isDirty}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit enrollment for ${item.name}`}
                    style={({ pressed }) => [styles.enrollChip, pressed && styles.pressed, isDirty && styles.stepperOff]}
                  >
                    <Text style={styles.enrollChipText}>
                      {isDirty
                        ? 'Save to edit enrollment'
                        : countsQuery.isLoading
                          ? 'Enrolled …'
                          : enrolled == null
                            ? 'Enrolled —'
                            : `${enrolled} enrolled`}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.accentStrong} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          )
        }}
      />

      {draft ? (
        <View style={styles.saveBar}>
          {isDirty ? (
            <Text style={styles.dirtyNote}>Unsaved subject changes. Enrollment editing unlocks after saving.</Text>
          ) : (
            <Text style={styles.cleanNote}>Saved. Tap a selected subject's enrollment chip to choose who takes it.</Text>
          )}
          <AnimatedButton
            label={isDirty ? 'Save subject setup' : 'No changes to save'}
            loading={saveMutation.isPending}
            disabled={!isDirty || saveMutation.isPending}
            onPress={() => void handleSave()}
          />
        </View>
      ) : null}
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
    paddingBottom: spacing[4],
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    gap: spacing[3],
    ...shadows.xs,
  },
  cardKicker: {
    ...typography.roles.eyebrow,
    color: colors.accent,
  },
  cardBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
  },
  stepper: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  stepperOff: {
    opacity: 0.4,
  },
  stepperValue: {
    minWidth: 44,
    textAlign: 'center',
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 26,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    minHeight: 52,
  },
  groupMain: {
    flex: 1,
    gap: 2,
    paddingVertical: spacing[1],
  },
  groupName: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 14,
  },
  groupRule: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  groupCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  groupRemove: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  addGroupInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: spacing[3],
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
  },
  addGroupButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  listHeader: {
    gap: 2,
  },
  sectionTitle: {
    ...typography.roles.title,
    color: colors.text,
  },
  sectionMeta: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  subjectCard: {
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[3],
    gap: spacing[3],
  },
  subjectCardOn: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
  },
  subjectTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 44,
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
  subjectCopy: {
    flex: 1,
    gap: 2,
  },
  subjectName: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
    lineHeight: 20,
  },
  subjectCode: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  subjectControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  controlChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: spacing[3],
    maxWidth: '100%',
  },
  controlChipOn: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurfaceStrong,
  },
  controlChipText: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  controlChipTextOn: {
    color: colors.accentStrong,
  },
  enrollChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: spacing[3],
  },
  enrollChipText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
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
