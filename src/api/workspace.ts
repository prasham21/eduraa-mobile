import apiClient from './client'
import type { Role } from '../types'

export interface WorkspaceSnapshotBlock {
  label: string
  state: 'ready' | 'empty' | 'blocked'
  data: unknown
  message?: string
}

async function read(label: string, path: string, params?: Record<string, unknown>): Promise<WorkspaceSnapshotBlock> {
  try {
    const response = await apiClient.get(path, { params })
    const data = response.data
    return {
      label,
      state: Array.isArray(data) && data.length === 0 ? 'empty' : 'ready',
      data,
    }
  } catch (error) {
    const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
    return {
      label,
      state: 'blocked',
      data: null,
      message: detail || 'This mobile snapshot could not load right now.',
    }
  }
}

export const workspaceApi = {
  async getFeatureSnapshot(featureId: string, role?: Role | null): Promise<WorkspaceSnapshotBlock[]> {
    switch (featureId) {
      case 'approvals':
        return Promise.all([
          read('Pending principals', '/approvals/principals/pending'),
          read('Pending teachers', '/approvals/teachers/pending'),
          read('Pending students', '/approvals/students/pending'),
          read('Class teacher requests', '/approvals/class-teacher-requests/pending'),
          read('Teacher profile updates', '/approvals/teacher-profile-updates/pending'),
        ])
      case 'attendance':
        if (role === 'student' || role === 'b2c_student') {
          return Promise.all([read('My attendance summary', '/attendance/students/me/summary'), read('Correction requests', '/attendance/corrections')])
        }
        if (role === 'teacher') {
          return Promise.all([
            read('Today', '/attendance/teacher/today'),
            read('Teacher summary', '/attendance/dashboard/teacher-summary'),
            read('Correction requests', '/attendance/corrections'),
          ])
        }
        return Promise.all([read('Leadership summary', '/attendance/dashboard/leadership'), read('Correction requests', '/attendance/corrections')])
      case 'exams':
        return Promise.all([read('Exams', '/exams')])
      case 'scan-upload':
        return Promise.all([read('Upload options', '/checked-papers/options'), read('Recent checked papers', '/checked-papers')])
      case 'teacher-students':
        return Promise.all([read('Students', '/roster/teacher/students'), read('Teacher profile map', '/roster/teacher/master-profile')])
      case 'teacher':
        return Promise.all([read('Teacher profile', '/roster/teacher/master-profile'), read('Cohort insights', '/agentic-learning/cohort-insights')])
      case 'principal-profile':
      case 'principal':
        return Promise.all([read('Leadership attendance', '/attendance/dashboard/leadership'), read('Pending approvals', '/approvals/teachers/pending')])
      case 'index-books':
        return Promise.all([read('JEE static banks', '/documents/static-banks/jee'), read('Documents', '/documents')])
      case 'index-notes':
        return Promise.all([read('Teacher notes', '/notes'), read('Note options', '/notes/options')])
      case 'admin':
      case 'developer':
        return Promise.all([read('Schools', '/schools'), read('Admin teachers', '/admin/teachers')])
      case 'admin-cheat-sheets':
      case 'cheat-sheets':
      case 'competitive-exam':
        return Promise.all([read('Learning resources', '/learning-resources'), read('Cheat sheets', '/cheat-sheets')])
      case 'layout-sampler':
        return Promise.all([read('Session', '/auth/session')])
      default:
        return Promise.all([read('Session', '/auth/session')])
    }
  },
}
