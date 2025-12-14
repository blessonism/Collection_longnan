import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { submitForm, saveDraft, checkContent, type SummaryForm as SummaryFormType, type CheckResult } from '@/lib/api'
import { Loader2, Send, Save, CheckCircle, AlertCircle } from 'lucide-react'

// 计算最近一周的日期范围（周五或之前显示本周，周六/周日显示上周）
// 周期为：周六 到 周五
function getWeekDateRange(): string {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=周日, 1=周一, ..., 6=周六
  
  // 计算目标周五：如果今天是周六(6)或周日(0)，取刚过去的周五；否则取本周五
  const friday = new Date(today)
  if (dayOfWeek === 6) {
    // 周六：往前1天是周五
    friday.setDate(today.getDate() - 1)
  } else if (dayOfWeek === 0) {
    // 周日：往前2天是周五
    friday.setDate(today.getDate() - 2)
  } else {
    // 周一到周五：计算本周五
    friday.setDate(today.getDate() + (5 - dayOfWeek))
  }
  
  // 计算对应周六（周五往前6天）
  const saturday = new Date(friday)
  saturday.setDate(friday.getDate() - 6)
  
  const formatDate = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`
  return `${formatDate(saturday)}-${formatDate(friday)}`
}

interface Props {
  onSubmitSuccess?: () => void
}

export function SummaryForm({ onSubmitSuccess }: Props) {
  const dateRange = useMemo(() => getWeekDateRange(), [])
  
  const [form, setForm] = useState<SummaryFormType>({
    name: '',
    date_range: dateRange,
    weekly_work: '',
    next_week_plan: '',
  })
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleChange = (field: keyof SummaryFormType, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setCheckResult(null)
  }

  const handleCheck = async () => {
    const content = `本周工作：\n${form.weekly_work}\n\n下周计划：\n${form.next_week_plan}`
    setChecking(true)
    try {
      const res = await checkContent(content)
      setCheckResult(res.data)
    } catch (e) {
      setMessage({ type: 'error', text: '校对失败，请重试' })
    } finally {
      setChecking(false)
    }
  }

  const handleSubmit = async () => {
    if (!form.name || !form.date_range || !form.weekly_work) {
      setMessage({ type: 'error', text: '请填写必填项' })
      return
    }
    setLoading(true)
    try {
      await submitForm(form)
      setMessage({ type: 'success', text: '提交成功！' })
      setForm({ name: '', date_range: '', weekly_work: '', next_week_plan: '' })
      setCheckResult(null)
      onSubmitSuccess?.()
    } catch (e) {
      setMessage({ type: 'error', text: '提交失败，请重试' })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveDraft = async () => {
    setLoading(true)
    try {
      await saveDraft(form)
      setMessage({ type: 'success', text: '草稿已保存' })
    } catch (e) {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>填写周小结</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">姓名 *</label>
            <Input
              value={form.name}
              onChange={e => handleChange('name', e.target.value)}
              placeholder="请输入姓名"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">日期范围</label>
            <Input
              value={form.date_range}
              onChange={e => handleChange('date_range', e.target.value)}
              placeholder="如：12.6-12.12"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">本周工作 *</label>
          <p className="text-xs text-slate-500 mb-2">请按编号列出本周完成的主要工作</p>
          <Textarea
            value={form.weekly_work}
            onChange={e => handleChange('weekly_work', e.target.value)}
            placeholder={"【示例】\n1.参加部门周例会，汇报项目进展情况。\n2.完成年度工作总结报告初稿撰写。\n3.对接财务部门，核对本季度预算执行情况。\n4.组织召开项目协调会，推进重点任务落实。"}
            rows={8}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">下周计划</label>
          <p className="text-xs text-slate-500 mb-2">请按编号列出下周的工作计划</p>
          <Textarea
            value={form.next_week_plan}
            onChange={e => handleChange('next_week_plan', e.target.value)}
            placeholder={"【示例】\n1.继续推进重点项目建设进度。\n2.准备下周工作汇报材料。\n3.跟进各项待办事项落实情况。"}
            rows={5}
          />
        </div>

        {checking && (
          <div className="py-6 px-6 rounded-lg border border-slate-200 bg-slate-50/30">
            <p className="text-slate-600 mb-4">AI 正在阅读你的文字</p>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-4 h-4 rounded border border-slate-300 flex items-center justify-center">
                  <div className="w-2 h-2 bg-slate-400 rounded-sm animate-pulse"></div>
                </div>
                <span className="text-slate-500">检查错别字</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-4 h-4 rounded border border-slate-200"></div>
                <span className="text-slate-400">检查标点符号</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-4 h-4 rounded border border-slate-200"></div>
                <span className="text-slate-400">检查语句通顺</span>
              </div>
            </div>
          </div>
        )}

        {!checking && checkResult && (
          <div className={`p-4 rounded-md ${checkResult.total_issues > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              {checkResult.total_issues > 0 ? (
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-600" />
              )}
              <span className="font-medium">
                {checkResult.total_issues > 0 ? `发现 ${checkResult.total_issues} 个问题` : '校对完成，未发现问题 ✨'}
              </span>
            </div>
            {checkResult.issues.map((issue, i) => {
              // 高亮上下文中的错误部分
              const highlightContext = (context: string, original: string) => {
                if (!context || !original) return context
                const parts = context.split(original)
                if (parts.length === 1) return context
                return parts.map((part, idx) => (
                  <span key={idx}>
                    {part}
                    {idx < parts.length - 1 && (
                      <span className="bg-red-100 text-red-700 font-medium px-0.5 rounded">{original}</span>
                    )}
                  </span>
                ))
              }
              
              // 一键修复
              const handleFix = () => {
                const fixText = (text: string) => {
                  // 直接替换 original 为 suggestion
                  // 对于序号空格问题，original 是 "1. "，suggestion 是 "1."
                  return text.replace(issue.original, issue.suggestion)
                }
                
                const newWeeklyWork = fixText(form.weekly_work)
                const newNextWeekPlan = fixText(form.next_week_plan)
                
                setForm(prev => ({
                  ...prev,
                  weekly_work: newWeeklyWork,
                  next_week_plan: newNextWeekPlan
                }))
                
                // 从校对结果中移除已修复的问题
                setCheckResult(prev => prev ? {
                  ...prev,
                  total_issues: prev.total_issues - 1,
                  issues: prev.issues.filter((_, idx) => idx !== i)
                } : null)
              }
              
              return (
                <div key={i} className="text-sm mt-3 p-3 bg-white rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-slate-500">
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                        {issue.type === 'typo' ? '错字' : issue.type === 'punctuation' ? '标点' : '语法'}
                      </span>
                      <span>{issue.location}</span>
                    </div>
                  </div>
                  {issue.context && (
                    <div className="text-slate-600 mb-2 leading-relaxed">
                      {highlightContext(issue.context, issue.original)}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-red-500 line-through">{issue.original}</span>
                      <span className="text-slate-400">→</span>
                      <span className="text-green-600 font-medium">{issue.suggestion}</span>
                    </div>
                    <Button
                      onClick={handleFix}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                    >
                      一键修复
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {message && (
          <div className={`p-3 rounded-md text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={handleCheck} variant="outline" disabled={checking || !form.weekly_work}>
            {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
            AI 校对
          </Button>
          <Button onClick={handleSaveDraft} variant="secondary" disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            保存草稿
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            提交
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
