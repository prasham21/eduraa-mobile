import apiClient from './client'

export interface AgenticLearningSubjectBucket {
  subject_id: string
  subject_name: string
  unresolved_count: number
  total_subtopics: number
  average_mastery: number
  last_activity_at?: string | null
  pyq_frequency?: number | null
  paper_weightage_pct?: number | null
  top_weak_topic?: string | null
  mastery_trend: number[]
}

export interface AgenticLearningQuickAction {
  id: string
  label: string
  description?: string | null
  icon: string
  action_kind: string
  target_subject_id?: string | null
  target_topic_id?: string | null
  target_payload?: Record<string, unknown> | null
  available: boolean
}

export interface AgenticLearningSubtopicCard {
  topic_id: string
  subject_id: string
  topic_name: string
  chapter_title?: string | null
  status: string
  mastery_score: number
  confidence: number
  attempt_count: number
  summary: string
  has_diagram: boolean
  last_activity_at?: string | null
  pyq_frequency?: number | null
  paper_types?: string[] | null
  branch?: string | null
  read_time_minutes?: number | null
}

export interface AgenticLearningLessonFigure {
  figure_id: string
  asset_url: string
  caption_text?: string | null
  alt_text?: string | null
  figure_type?: string | null
  page_number?: number | null
}

export interface AgenticLearningRelatedTopic {
  topic_id: string
  topic_name: string
  relation_kind: string
  label?: string | null
  /** 0-100. */
  student_mastery: number
}

export interface AgenticLearningTopicDetail {
  topic_id: string
  subject_id: string
  subject_name: string
  resolution_subject_id?: string | null
  subject_family: string
  curriculum_mode: string
  curriculum_label: string
  topic_name: string
  chapter_title?: string | null
  status: string
  mastery_score: number
  confidence: number
  evidence_strength: number
  repeated_mistake_index: number
  attempt_count: number
  improvement_trend?: string | null
  summary: string
  concept_explanation: string
  easy_ways_to_learn: string[]
  memory_tips: string[]
  recap_points: string[]
  diagram_kind?: string | null
  text_diagram?: string | null
  lesson_figure?: AgenticLearningLessonFigure | null
  practice_questions: string[]
  coach_note?: string | null
  resolved_at?: string | null
  lesson_source: string
  lesson_version: number
  generated_at: string
  pyq_frequency?: number | null
  paper_types?: string[] | null
  branch?: string | null
  weightage_label?: string | null
  related_topics?: AgenticLearningRelatedTopic[]
}

export interface AgenticLearningSubtopicList {
  subject_id: string
  subject_name: string
  subject_family: string
  items: AgenticLearningSubtopicCard[]
}

export const agenticLearningApi = {
  async getSubjects() {
    const response = await apiClient.get<{ subjects: AgenticLearningSubjectBucket[] }>('/agentic-learning/subjects')
    return response.data.subjects
  },

  async getQuickActions() {
    const response = await apiClient.get<{ actions: AgenticLearningQuickAction[] }>('/agentic-learning/quick-actions')
    return response.data.actions
  },

  async getSubtopics(subjectId: string) {
    const response = await apiClient.get<AgenticLearningSubtopicList>(`/agentic-learning/subjects/${subjectId}/subtopics`)
    return response.data
  },

  async getTopic(topicId: string) {
    const response = await apiClient.get<AgenticLearningTopicDetail>(`/agentic-learning/topics/${topicId}`)
    return response.data
  },

  async setTopicResolved(topicId: string, subjectId: string, resolved: boolean) {
    const response = await apiClient.post(`/agentic-learning/topics/${topicId}/resolve`, { subject_id: subjectId, resolved })
    return response.data
  },
}
