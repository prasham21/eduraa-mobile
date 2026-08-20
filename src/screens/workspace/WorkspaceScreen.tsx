import React, { useMemo } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { AnimatedCard, AppScreen, GradientHeroCard, SelectableChip } from '../../components/ui'
import { b2cApi } from '../../api/b2c'
import { mobileControls, MobileControl, roleCanSeeControl } from '../../data/mobileControlCatalog'
import { useClassTeacherAccess } from '../../hooks/useClassTeacherAccess'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'

function roleLabel(role?: string) {
  return role ? role.replace(/_/g, ' ') : 'workspace'
}

function isCompetitiveProfile(user: ReturnType<typeof useAuthStore.getState>['user'], profile?: Awaited<ReturnType<typeof b2cApi.getProfile>>) {
  return (
    user?.b2c_education_level === 'competitive_exams' ||
    user?.b2c_education_level === 'competitive_exam' ||
    profile?.education_level === 'competitive_exams'
  )
}

function isJeeProfile(user: ReturnType<typeof useAuthStore.getState>['user'], profile?: Awaited<ReturnType<typeof b2cApi.getProfile>>) {
  const haystack = [
    user?.b2c_board,
    user?.b2c_standard,
    user?.b2c_target_exam,
    ...(user?.b2c_subjects ?? []),
    profile?.school_board,
    profile?.school_standard,
    ...(profile?.subjects ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes('jee')
}

function statusTone(status: MobileControl['nativeStatus']) {
  if (status === 'native') return colors.success
  if (status === 'partial') return colors.warning
  return colors.textMuted
}

function statusLabel(status: MobileControl['nativeStatus']) {
  if (status === 'native') return 'Ready'
  if (status === 'partial') return 'Building'
  return 'Mobile'
}

function ControlCard({ control, onPress }: { control: MobileControl; onPress: () => void }) {
  const tone = statusTone(control.nativeStatus)
  const iconName = control.icon as keyof typeof Ionicons.glyphMap

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.controlCard, pressed && styles.pressed]}>
      <View style={styles.controlTop}>
        <View style={styles.controlIcon}>
          <Ionicons name={iconName in Ionicons.glyphMap ? iconName : 'ellipse'} size={18} color={colors.accent} />
        </View>
        <View style={[styles.statusPill, { backgroundColor: `${tone}14` }]}>
          <Text style={[styles.statusText, { color: tone }]}>{statusLabel(control.nativeStatus)}</Text>
        </View>
      </View>
      <Text style={styles.controlTitle}>{control.label}</Text>
      <Text style={styles.controlBody}>{control.description}</Text>
      <Text style={styles.mobileHint}>Tap to open in mobile</Text>
    </Pressable>
  )
}

export default function WorkspaceScreen() {
  const navigation = useNavigation<any>()
  const user = useAuthStore((state) => state.user)

  const b2cQuery = useQuery({
    queryKey: ['workspace-b2c-profile', user?.id],
    queryFn: b2cApi.getProfile,
    enabled: user?.role === 'b2c_student',
  })

  // Class-teacher capability is confirmed against the server rather than read
  // off the JWT, so a stale token neither grants nor hides the workspace.
  const classTeacherAccess = useClassTeacherAccess({ enabled: user?.role === 'teacher' })

  const controls = useMemo(() => {
    if (!user?.role) return []
    const competitive = isCompetitiveProfile(user, b2cQuery.data)
    const jee = isJeeProfile(user, b2cQuery.data)

    return mobileControls.filter((control) => {
      if (control.hiddenOnWeb) return false
      if (!roleCanSeeControl(user.role, control)) return false
      if (control.requiresClassTeacher && !classTeacherAccess.isAuthorized) return false
      if (control.requiresCompetitiveExam && !competitive) return false
      if (control.requiresJee && !jee) return false
      return true
    })
  }, [b2cQuery.data, classTeacherAccess.isAuthorized, user])

  const nativeCount = controls.filter((control) => control.nativeStatus === 'native').length
  const partialCount = controls.filter((control) => control.nativeStatus === 'partial').length

  const openControl = (control: MobileControl) => {
    if (control.id === 'approvals') {
      const parent = navigation.getParent?.()
      if (parent?.getState?.().routeNames?.includes('StaffApprovals')) {
        parent.navigate('StaffApprovals')
        return
      }
      navigation.navigate('Approvals')
      return
    }

    if (control.id === 'attendance') {
      const parent = navigation.getParent?.()
      if (parent?.getState?.().routeNames?.includes('StaffAttendance')) {
        parent.navigate('StaffAttendance')
        return
      }
      if (parent?.getState?.().routeNames?.includes('Attendance')) {
        parent.navigate('Attendance')
        return
      }
      navigation.navigate('Attendance')
      return
    }

    if (control.id === 'scan-upload') {
      const parent = navigation.getParent?.()
      if (parent?.getState?.().routeNames?.includes('StaffScanUpload')) {
        parent.navigate('StaffScanUpload')
        return
      }
      if (parent?.getState?.().routeNames?.includes('ScanUpload')) {
        parent.navigate('ScanUpload')
        return
      }
      navigation.navigate('ScanUpload')
      return
    }

    if (control.id === 'class-teacher') {
      navigation.navigate('ClassTeacherOverview')
      return
    }

    if (control.id === 'exams' || control.id === 'student-exams') {
      const parent = navigation.getParent?.()
      if (parent?.getState?.().routeNames?.includes('StaffExams')) {
        parent.navigate('StaffExams')
        return
      }
      if (parent?.getState?.().routeNames?.includes('Exams')) {
        parent.navigate('Exams')
        return
      }
      navigation.navigate('Exams')
      return
    }

    if (control.target.kind === 'tab' && control.nativeStatus !== 'web-only') {
      const parent = navigation.getParent?.()
      if (parent) {
        const parentRouteNames = parent.getState?.().routeNames ?? []
        const isStaffTabs = parentRouteNames.includes('StaffHome')
        if (isStaffTabs && control.target.tab === 'AIStudio') {
          parent.navigate('StaffAIStudio')
          return
        }
        if (isStaffTabs && control.target.tab === 'Papers' && control.target.screen === 'GeneratePaper') {
          navigation.navigate('StaffGeneratePaper')
          return
        }
        if (isStaffTabs && control.target.tab === 'Papers') {
          navigation.navigate('StaffPapers')
          return
        }
        if (isStaffTabs && control.target.tab === 'Results') {
          navigation.navigate('StaffResults')
          return
        }
        if (isStaffTabs && control.target.tab === 'Home') {
          parent.navigate('StaffHome')
          return
        }
        if (isStaffTabs) {
          navigation.navigate('Feature', { featureId: control.id })
          return
        }
        parent.navigate(control.target.tab, control.target.screen ? { screen: control.target.screen, params: control.target.params } : undefined)
        return
      }
      if (control.target.tab === 'AIStudio') {
        navigation.navigate('StaffAIStudio')
        return
      }
      if (control.target.tab === 'Papers' && control.target.screen === 'GeneratePaper') {
        navigation.navigate('StaffGeneratePaper')
        return
      }
      if (control.target.tab === 'Papers') {
        navigation.navigate('StaffPapers')
        return
      }
      if (control.target.tab === 'Results') {
        navigation.navigate('StaffResults')
        return
      }
      return
    }

    navigation.navigate('Feature', { featureId: control.id })
  }

  return (
    <AppScreen contentStyle={styles.screen}>
      <GradientHeroCard
        eyebrow="CONTROL CENTER"
        title={`${roleLabel(user?.role)} controls`}
        subtitle="Role-aware mobile controls for the same workflows available after login."
      />

      <AnimatedCard style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryValue}>{controls.length}</Text>
            <Text style={styles.summaryLabel}>Visible</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryValue}>{nativeCount}</Text>
            <Text style={styles.summaryLabel}>Native</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryValue}>{partialCount}</Text>
            <Text style={styles.summaryLabel}>Partial</Text>
          </View>
        </View>
        {user?.role === 'b2c_student' && b2cQuery.isLoading ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.inlineLoadingText}>Checking JEE/competitive filters</Text>
          </View>
        ) : null}
        {user?.role === 'teacher' && classTeacherAccess.isLoading ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.inlineLoadingText}>Checking your class-teacher assignment</Text>
          </View>
        ) : null}
      </AnimatedCard>

      <View style={styles.chipRow}>
        <SelectableChip label="Website controls" selected />
        <SelectableChip label={roleLabel(user?.role)} selected={false} />
      </View>

      {(['core', 'learning', 'operations', 'admin', 'profile', 'advanced'] as const).map((section) => {
        const sectionControls = controls.filter((control) => control.section === section)
        if (!sectionControls.length) return null

        return (
          <View key={section} style={styles.section}>
            <Text style={styles.sectionTitle}>{section}</Text>
            {sectionControls.map((control) => (
              <ControlCard key={control.id} control={control} onPress={() => openControl(control)} />
            ))}
          </View>
        )
      })}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
  },
  summaryCard: {
    gap: spacing[4],
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  summaryMetric: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
  },
  summaryValue: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 22,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  section: {
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.roles.eyebrow,
    color: colors.accent,
  },
  controlCard: {
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    gap: spacing[3],
    ...shadows.sm,
  },
  controlTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  statusPill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  statusText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  controlTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
  },
  controlBody: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  mobileHint: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  pressed: {
    opacity: 0.78,
  },
})
