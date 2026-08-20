import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../api/client'
import { useAuthStore } from '../stores/authStore'
import type { AccountMinimal } from '../types'

export type ExamTrack = 'jee' | 'neet' | 'cbse' | 'icse' | 'state' | 'general' | 'unknown'

const KNOWN_TRACKS: ExamTrack[] = ['jee', 'neet', 'cbse', 'icse', 'state', 'general']

function normalized(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

/**
 * The learner's exam track, derived only from their own profile.
 *
 * The web reads `exam_track` and treats an unset value as `cbse`; on mobile an
 * unset value stays `unknown` so a B2B school learner is never labelled with a
 * board the account does not actually claim. JEE chrome still lights up for
 * every account the app already routes to the competitive experience, so the
 * B2C behaviour is unchanged.
 */
export function resolveLearnerTrack(user: AccountMinimal | null) {
  const rawTrack = normalized(user?.exam_track)
  const targetExam = normalized(user?.b2c_target_exam)
  const board = normalized(user?.b2c_board)
  const educationLevel = normalized(user?.b2c_education_level).replace(/[^a-z0-9]+/g, '_')

  const isJee =
    rawTrack === 'jee' ||
    rawTrack.startsWith('jee_') ||
    targetExam.includes('jee') ||
    board.includes('jee')

  const isCompetitive =
    isJee ||
    rawTrack === 'neet' ||
    educationLevel === 'competitive_exams' ||
    educationLevel === 'competitive_exam' ||
    Boolean(targetExam)

  const examTrack: ExamTrack = isJee
    ? 'jee'
    : (KNOWN_TRACKS.find((track) => track === rawTrack) ?? 'unknown')

  return {
    examTrack,
    isJee,
    isCompetitive,
    isSchool: !isCompetitive,
    /** B2B learners belong to a school and are provisioned by it. */
    isSchoolAccount: user?.role === 'student',
  }
}

interface StudentMasterProfileResponse {
  profile: {
    board: string
    standard: string
    division?: string | null
    school_name?: string | null
    branch_name?: string | null
  }
  class_teacher_name?: string | null
  subjects?: { subject_name: string; source: string }[]
}

/**
 * Track plus the curriculum context to show a B2B learner.
 *
 * The curriculum label comes from the student's own school record; if that
 * request fails we show nothing rather than guessing a board or class.
 */
export function useLearnerTrack() {
  const user = useAuthStore((state) => state.user)
  const track = useMemo(() => resolveLearnerTrack(user), [user])

  const profileQuery = useQuery<StudentMasterProfileResponse, unknown>({
    queryKey: ['learner', 'school-profile', user?.id],
    queryFn: async () => {
      const response = await apiClient.get<StudentMasterProfileResponse>('/roster/student/master-profile')
      return response.data
    },
    enabled: user?.role === 'student',
    retry: false,
    staleTime: 5 * 60_000,
  })

  const curriculum = useMemo(() => {
    if (user?.role === 'student') {
      const profile = profileQuery.data?.profile
      if (!profile) return { label: null as string | null, schoolName: null as string | null, subjectCount: null as number | null }
      const parts = [profile.board?.trim(), profile.standard?.trim() ? `Class ${profile.standard.trim()}` : null].filter(Boolean)
      const division = profile.division?.trim()
      return {
        label: [parts.join(' · '), division ? `Div ${division}` : null].filter(Boolean).join(' · ') || null,
        schoolName: profile.school_name?.trim() || null,
        subjectCount: profileQuery.data?.subjects?.length ?? null,
      }
    }

    const parts = [user?.b2c_board?.trim(), user?.b2c_standard?.trim()].filter(Boolean)
    return {
      label: parts.join(' · ') || user?.b2c_target_exam?.trim() || null,
      schoolName: null,
      subjectCount: user?.b2c_subjects?.length ?? null,
    }
  }, [profileQuery.data, user])

  return {
    ...track,
    curriculum,
    isCurriculumLoading: profileQuery.isLoading,
    /** True when the school record could not be read, so context is missing. */
    isCurriculumUnavailable: Boolean(profileQuery.error),
  }
}

export default useLearnerTrack
