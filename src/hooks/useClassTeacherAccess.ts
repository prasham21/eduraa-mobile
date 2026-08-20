import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../api/client'
import { ApiFailure, ClassSection, Semester, classTeacherApi, toApiFailure } from '../api/classTeacher'
import { useClassTeacherStore } from '../stores/classTeacherStore'
import { useAuthStore } from '../stores/authStore'

export const classTeacherKeys = {
  classes: ['class-teacher', 'classes'] as const,
  identity: ['class-teacher', 'identity'] as const,
  semesters: ['class-teacher', 'semesters'] as const,
  subjects: ['class-teacher', 'subjects'] as const,
  roster: (standard: string | undefined) => ['class-teacher', 'roster', standard ?? 'default'] as const,
  divisions: (standard: string | undefined) => ['class-teacher', 'divisions', standard ?? 'default'] as const,
  config: (classId: string | undefined, semesterId: string | undefined) =>
    ['class-teacher', 'config', classId ?? 'none', semesterId ?? 'default'] as const,
  enrollments: (classId: string | undefined, subjectId: string | undefined, semesterId: string | undefined) =>
    ['class-teacher', 'enrollments', classId ?? 'none', subjectId ?? 'none', semesterId ?? 'default'] as const,
  validation: (classId: string | undefined, semesterId: string | undefined) =>
    ['class-teacher', 'validation', classId ?? 'none', semesterId ?? 'default'] as const,
}

export interface ClassTeacherIdentity {
  teacherName: string
  teacherCode?: string | null
  schoolName?: string | null
  branchName?: string | null
  standard?: string | null
  division?: string | null
  isApproved?: boolean | null
  assignmentStatus?: string | null
}

interface TeacherMasterProfileResponse {
  profile: {
    teacher_id: string
    first_name: string
    last_name: string
    school_name?: string | null
    branch_name?: string | null
    class_teacher_opt_in?: boolean | null
    class_teacher_standard?: string | null
    class_teacher_division?: string | null
    is_approved: boolean
  }
  assignment_status?: string | null
}

/**
 * Server-verified class-teacher authorization.
 *
 * The JWT carries `class_teacher_opt_in`, but a client flag must never be the
 * gate — the backend returns an empty list for teachers without an approved
 * class-teacher profile and 403s every management route, so the list is the
 * source of truth.
 */
export function useClassTeacherAccess(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const query = useQuery<ClassSection[], unknown>({
    queryKey: classTeacherKeys.classes,
    queryFn: classTeacherApi.getMyClasses,
    enabled,
    retry: false,
    staleTime: 30_000,
  })

  const failure: ApiFailure | null = query.error ? toApiFailure(query.error) : null
  const classSections = query.data ?? []

  return {
    isLoading: enabled && query.isLoading,
    isFetching: query.isFetching,
    classSections,
    /** Authorized only when the server actually returned a class. */
    isAuthorized: enabled && !failure && classSections.length > 0,
    /** Reached the server, but this teacher owns no class section. */
    hasNoClass: enabled && !failure && !query.isLoading && classSections.length === 0,
    failure,
    refetch: query.refetch,
  }
}

/**
 * School / branch / class-teacher identity for the workspace header.
 * Best-effort: the workspace stays usable if this call fails, falling back to
 * the signed-in account rather than inventing a school name.
 */
export function useClassTeacherIdentity() {
  const user = useAuthStore((state) => state.user)

  const query = useQuery<TeacherMasterProfileResponse, unknown>({
    queryKey: classTeacherKeys.identity,
    queryFn: async () => {
      const response = await apiClient.get<TeacherMasterProfileResponse>('/roster/teacher/master-profile')
      return response.data
    },
    retry: false,
    staleTime: 5 * 60_000,
  })

  const identity = useMemo<ClassTeacherIdentity>(() => {
    const profile = query.data?.profile
    const fallbackName = user?.display_name?.trim() || 'Class teacher'
    return {
      teacherName: profile ? `${profile.first_name} ${profile.last_name}`.trim() || fallbackName : fallbackName,
      teacherCode: profile?.teacher_id ?? null,
      schoolName: profile?.school_name ?? null,
      branchName: profile?.branch_name ?? null,
      standard: profile?.class_teacher_standard ?? user?.class_teacher_standard ?? null,
      division: profile?.class_teacher_division ?? user?.class_teacher_division ?? null,
      isApproved: profile?.is_approved ?? null,
      assignmentStatus: query.data?.assignment_status ?? null,
    }
  }, [query.data, user])

  return { identity, isLoading: query.isLoading, isPartial: Boolean(query.error) }
}

/**
 * The semester every class-teacher surface is acting on. Shared so the context
 * bar names the real semester instead of claiming none is selected.
 */
export function useActiveSemester() {
  const activeSemesterId = useClassTeacherStore((state) => state.activeSemesterId)

  const query = useQuery<Semester[], unknown>({
    queryKey: classTeacherKeys.semesters,
    queryFn: classTeacherApi.getSemesters,
    retry: false,
    staleTime: 60_000,
  })

  const semesters = query.data ?? []
  const activeSemester = semesters.find((semester) => semester.id === activeSemesterId) ?? semesters[0]

  return { activeSemester, semesters, isLoading: query.isLoading }
}
