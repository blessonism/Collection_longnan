import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

// 类型定义
export interface Submission {
  id: number
  name: string
  date_range: string
  weekly_work: string
  next_week_plan: string
  source: string
  status: string
  check_result: CheckResult | null
  created_at: string
}

export interface CheckIssue {
  type: string
  severity: string
  location: string
  context: string
  original: string
  suggestion: string
  source: 'rule' | 'ai_typo' | 'ai_punctuation'  // 问题来源
}

export interface CheckResult {
  total_issues: number
  issues: CheckIssue[]
}

export interface SummaryForm {
  name: string
  date_range: string
  weekly_work: string
  next_week_plan: string
}

export interface ArchiveConfig {
  submission_ids: number[]
  naming_template: string
  start_number: number
  number_padding: number
}

// API 方法
export const submitForm = (data: SummaryForm) => 
  api.post<Submission>('/form/submit', data)

export const saveDraft = (data: SummaryForm) => 
  api.post<Submission>('/form/draft', data)

export const exportSubmission = (id: number) => 
  api.get(`/form/export/${id}`, { responseType: 'blob' })

export const checkContent = (text: string) => 
  api.post<CheckResult>('/check/content', { text })

export const checkSubmission = (id: number) => 
  api.post<CheckResult>(`/check/${id}`)

export const batchCheckSubmissions = (ids: number[]) =>
  api.post<{ success: number; failed: number }>('/check/batch', { submission_ids: ids })

export const getCheckResult = (id: number) => 
  api.get<CheckResult>(`/check/${id}/result`)

export const listSubmissions = (params?: { date_range?: string; status?: string }) => 
  api.get<Submission[]>('/submissions/', { params })

export const getSubmission = (id: number) => 
  api.get<Submission>(`/submissions/${id}`)

export const updateSubmission = (id: number, data: Partial<SummaryForm>) =>
  api.put<Submission>(`/submissions/${id}`, data)

export const deleteSubmission = (id: number) => 
  api.delete(`/submissions/${id}`)

export const createArchive = (config: ArchiveConfig) => 
  api.post('/archive/', config, { responseType: 'blob' })

export const getManifest = (config: ArchiveConfig) => 
  api.post<{ manifest: any[]; manifest_text: string }>('/archive/manifest', config)

// 管理员接口
export interface RuleConfig {
  check_number_format: boolean
  check_extra_spaces: boolean
  check_english_punctuation: boolean
  check_slash_to_semicolon: boolean
  check_consecutive_punctuation: boolean
  check_ending_punctuation: boolean
  check_english_brackets: boolean
}

export interface PromptConfig {
  typo_prompt: string
  punctuation_prompt: string
  daily_optimize_prompt: string
  weekly_summary_prompt: string
  check_typo: boolean
  check_punctuation_semantic: boolean
}

// 创建带认证的 API 实例
export const createAdminApi = (username: string, password: string) => {
  const adminApi = axios.create({
    baseURL: '/api/admin',
    auth: { username, password }
  })
  return {
    verify: () => adminApi.get('/verify'),
    getRules: () => adminApi.get<RuleConfig>('/rules'),
    updateRules: (rules: RuleConfig) => adminApi.put('/rules', rules),
    getPrompt: () => adminApi.get<PromptConfig>('/prompt'),
    updatePrompt: (prompt: PromptConfig) => adminApi.put('/prompt', prompt),
    resetConfig: () => adminApi.post('/reset'),
  }
}

export default api


// ========== 每日动态相关 ==========

export interface DailyMember {
  id: number
  name: string
  sort_order: number
  is_active: boolean
}

export interface DailyReport {
  id: number
  member_id: number
  member_name: string
  date: string
  content: string
}

export interface DailyReportSummary {
  date: string
  date_display: string
  total_members: number
  submitted_count: number
  reports: DailyReport[]
  summary_text: string
}

// 人员管理
export const listDailyMembers = (includeInactive = false) =>
  api.get<DailyMember[]>('/daily/members', { params: { include_inactive: includeInactive } })

export const createDailyMember = (data: { name: string; sort_order?: number }) =>
  api.post<DailyMember>('/daily/members', data)

export const importDailyMembers = (names: string[]) =>
  api.post<DailyMember[]>('/daily/members/import', { names })

export const updateDailyMember = (id: number, data: Partial<DailyMember>) =>
  api.put<DailyMember>(`/daily/members/${id}`, data)

export const deleteDailyMember = (id: number) =>
  api.delete(`/daily/members/${id}`)

// 动态记录
export const createDailyReport = (data: { member_id: number; date: string; content: string }) =>
  api.post<DailyReport>('/daily/reports', data)

export const listDailyReports = (date: string) =>
  api.get<DailyReport[]>('/daily/reports', { params: { report_date: date } })

export const getDailySummary = (date: string) =>
  api.get<DailyReportSummary>('/daily/reports/summary', { params: { report_date: date } })

export const updateDailyReport = (id: number, content: string) =>
  api.put<DailyReport>(`/daily/reports/${id}`, { content })

export const deleteDailyReport = (id: number) =>
  api.delete(`/daily/reports/${id}`)

export const listDailyDates = () =>
  api.get<string[]>('/daily/dates')


// AI 优化每日动态
export const optimizeDaily = (content: string) =>
  api.post<{ optimized_content: string }>('/daily/optimize', { content })


// ========== 周小结生成 ==========

export interface GenerateWeeklySummaryRequest {
  member_id: number
  date_range: string
}

export interface GenerateWeeklySummaryResponse {
  content: string
  start_date: string
  end_date: string
  report_count: number
}

export const generateWeeklySummary = (data: GenerateWeeklySummaryRequest) =>
  api.post<GenerateWeeklySummaryResponse>('/daily/generate-weekly-summary', data)
