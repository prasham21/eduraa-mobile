import { create } from 'zustand'

interface ClassTeacherState {
  /** Semester selected for the whole class-teacher workspace. */
  activeSemesterId: string | null
  setActiveSemesterId: (semesterId: string | null) => void
  reset: () => void
}

export const useClassTeacherStore = create<ClassTeacherState>((set) => ({
  activeSemesterId: null,
  setActiveSemesterId: (activeSemesterId) => set({ activeSemesterId }),
  reset: () => set({ activeSemesterId: null }),
}))
