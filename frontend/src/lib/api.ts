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
