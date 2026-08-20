import React, { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { AnimatedButton, AnimatedCard } from '../../components/ui'
import type { ApiFailure } from '../../api/classTeacher'
import type { ClassTeacherIdentity } from '../../hooks/useClassTeacherAccess'
import { colors, radius, shadows, spacing, typography } from '../../theme'

/**
 * The class context banner. Issue #61 requires school, standard, division,
 * semester, and class-teacher identity to be visible on every surface, so this
 * renders above every screen in the workspace and states plainly when a value
 * has not loaded rather than guessing one.
 */
export function ClassContextBar({
  identity,
  standard,
  division,
  semesterName,
  isStale,
}: {
  identity: ClassTeacherIdentity
  standard?: string | null
  division?: string | null
  semesterName?: string | null
  isStale?: boolean
}) {
  const school = identity.schoolName?.trim()
  const branch = identity.branchName?.trim()
  const scope = [school, branch].filter(Boolean).join(' · ')
  const classLabel = standard && division ? `Class ${standard}-${division}` : standard ? `Class ${standard}` : 'Class not set'

  return (
    <View style={styles.contextBar} accessibilityRole="header">
      <View style={styles.contextTop}>
        <View style={styles.contextIcon}>
          <Ionicons name="school" size={16} color={colors.accentStrong} />
        </View>
        <View style={styles.contextCopy}>
          <Text style={styles.contextClass} numberOfLines={2}>
            {classLabel}
          </Text>
          <Text style={styles.contextScope} numberOfLines={2}>
            {scope || 'School not linked to this account'}
          </Text>
        </View>
      </View>

      <View style={styles.contextChips}>
        <ContextChip icon="calendar-outline" label={semesterName?.trim() || 'Semester not selected'} />
        <ContextChip icon="person-circle-outline" label={identity.teacherName} />
        {identity.teacherCode ? <ContextChip icon="id-card-outline" label={identity.teacherCode} /> : null}
      </View>

      {isStale ? (
        <View style={styles.staleRow}>
          <Ionicons name="time-outline" size={13} color={colors.warning} />
          <Text style={styles.staleText}>Showing the last loaded copy while it refreshes.</Text>
        </View>
      ) : null}
    </View>
  )
}

function ContextChip({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.contextChip}>
      <Ionicons name={icon} size={12} color={colors.textSecondary} />
      <Text style={styles.contextChipText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const FAILURE_TITLES: Record<ApiFailure['kind'], string> = {
  offline: 'You are offline',
  session_expired: 'Session expired',
  not_authorized: 'Not your class',
  not_found: 'No longer available',
  invalid: 'Change was rejected',
  conflict: 'Someone else edited this',
  server: 'Server could not respond',
  unknown: 'Something went wrong',
}

/** Renders an ApiFailure honestly — the server's reason, never a guess. */
export function FailureCard({
  failure,
  onRetry,
  retryLabel = 'Try again',
}: {
  failure: ApiFailure
  onRetry?: () => void
  retryLabel?: string
}) {
  const canRetry = onRetry && failure.kind !== 'session_expired' && failure.kind !== 'not_authorized'

  return (
    <AnimatedCard style={styles.failureCard}>
      <View style={styles.failureHeader}>
        <View style={styles.failureIcon}>
          <Ionicons
            name={failure.kind === 'offline' ? 'cloud-offline' : failure.kind === 'not_authorized' ? 'lock-closed' : 'alert-circle'}
            size={18}
            color={colors.danger}
          />
        </View>
        <Text style={styles.failureTitle}>{FAILURE_TITLES[failure.kind]}</Text>
      </View>
      <Text style={styles.failureBody}>
        {failure.kind === 'not_authorized'
          ? 'This class is not assigned to your account, so the server declined the request.'
          : failure.kind === 'not_found'
            ? 'This class or semester no longer exists on the server.'
            : failure.message}
      </Text>
      {failure.detail && failure.detail !== failure.message ? <Text style={styles.failureDetail}>Server said: {failure.detail}</Text> : null}
      {canRetry ? <AnimatedButton label={retryLabel} variant="secondary" onPress={onRetry} /> : null}
    </AnimatedCard>
  )
}

export function SectionHeaderRow({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
      </View>
      {action}
    </View>
  )
}

export function SearchField({
  value,
  onChange,
  placeholder,
  accessibilityLabel,
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  accessibilityLabel: string
}) {
  return (
    <View style={styles.searchRow}>
      <Ionicons name="search" size={16} color={colors.textSoft} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSoft}
        style={styles.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={accessibilityLabel}
      />
      {value ? (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={styles.searchClear}
        >
          <Ionicons name="close-circle" size={17} color={colors.textSoft} />
        </Pressable>
      ) : null}
    </View>
  )
}

export function StatTile({ label, value, tone = colors.text }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, { color: tone }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

export function InlineLoading({ label }: { label: string }) {
  return (
    <View style={styles.inlineLoading}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.inlineLoadingText}>{label}</Text>
    </View>
  )
}

export function EmptyCard({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  return (
    <AnimatedCard style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={20} color={colors.accentStrong} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </AnimatedCard>
  )
}

/** A tappable row that reads as one target and meets the 48pt minimum. */
export function NavRow({
  icon,
  title,
  body,
  meta,
  tone = colors.accent,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  body: string
  meta?: string
  tone?: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [styles.navRow, pressed && styles.pressed, disabled && styles.navRowDisabled]}
    >
      <View style={[styles.navIcon, { backgroundColor: `${tone}16` }]}>
        <Ionicons name={icon} size={19} color={tone} />
      </View>
      <View style={styles.navCopy}>
        <View style={styles.navTitleRow}>
          <Text style={styles.navTitle} numberOfLines={1}>
            {title}
          </Text>
          {meta ? <Text style={[styles.navMeta, { color: tone }]}>{meta}</Text> : null}
        </View>
        <Text style={styles.navBody}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  contextBar: {
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    gap: spacing[3],
    ...shadows.xs,
  },
  contextTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  contextIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  contextCopy: {
    flex: 1,
    gap: 2,
  },
  contextClass: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
    lineHeight: 22,
  },
  contextScope: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  contextChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.full,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    maxWidth: '100%',
  },
  contextChipText: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  staleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  staleText: {
    flex: 1,
    color: colors.warning,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 15,
  },
  failureCard: {
    gap: spacing[3],
    borderColor: colors.dangerBorder,
  },
  failureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  failureIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSurface,
  },
  failureTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
  },
  failureBody: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  failureDetail: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  sectionCopy: {
    flex: 1,
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[4],
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    paddingVertical: spacing[2],
  },
  searchClear: {
    minWidth: 24,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTile: {
    flex: 1,
    minWidth: 84,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
    gap: 2,
  },
  statValue: {
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 21,
  },
  statLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
  },
  inlineLoadingText: {
    ...typography.roles.label,
    color: colors.textMuted,
  },
  emptyCard: {
    gap: spacing[2],
    alignItems: 'flex-start',
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
  },
  emptyBody: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...shadows.xs,
  },
  navRowDisabled: {
    opacity: 0.55,
  },
  navIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCopy: {
    flex: 1,
    gap: 2,
  },
  navTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  navTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  navMeta: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  navBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  pressed: {
    opacity: 0.78,
  },
})
