import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { submitForm, saveDraft, generateWeeklySummary, type SummaryForm as SummaryFormType, type CheckResult, type DailyMember } from '@/lib/api'
import { Loader2, Send, Save, CheckCircle, AlertCircle, Check, Sparkles } from 'lucide-react'
import { MemberSelectDialog } from './MemberSelectDialog'

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
  const [checkStep, setCheckStep] = useState('')  // 当前步骤 ID
  const [checkMessage, setCheckMessage] = useState('')
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [completedSteps, setCompletedSteps] = useState<string[]>([])  // 已完成的步骤
  
  // AI 生成相关状态
  const [memberSelectOpen, setMemberSelectOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  const handleChange = (field: keyof SummaryFormType, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setCheckResult(null)
  }

  // 自动格式化：将一行多条内容拆分为每条一行，并统一序号格式
  const formatContent = (text: string): string => {
    if (!text) return text
    
    let formatted = text
    
    // 1. 将 （1） （2） 格式转换为 1. 2. 格式
    formatted = formatted.replace(/（(\d+)）/g, '$1.')
    formatted = formatted.replace(/\((\d+)\)/g, '$1.')
    
    // 2. 在序号前插入换行（支持 1. 2. 1、2、 和转换后的格式）
    // 匹配 "非换行符非数字 + 数字 + (.|、)" 的模式，在数字前插入换行
    // 注意：前面必须是非数字字符，避免把 10. 拆成 1\n0.
    formatted = formatted.replace(/([^\n\d])(\d+[.、])/g, (match, before, number) => {
      // 如果前面是空白字符，可能已经格式化过，不处理
      if (/\s/.test(before)) return match
      return `${before}\n${number}`
    })
    
    // 也处理还未转换的 （数字） 格式
    formatted = formatted.replace(/([^\n])(（\d+）)/g, (match, before, number) => {
      if (/\s/.test(before)) return match
      return `${before}\n${number}`
    })
    
    // 3. 确保每行以句号结尾（如果不是标点结尾）
    const lines = formatted.split('\n')
    const processedLines = lines.map(line => {
      const trimmed = line.trim()
      if (!trimmed) return trimmed
      // 如果是以数字开头的内容行，且不以标点结尾，添加句号
      if (/^\d+[.、]/.test(trimmed)) {
        const lastChar = trimmed[trimmed.length - 1]
        if (!/[。？！；，、）]/.test(lastChar)) {
          return trimmed + '。'
        }
      }
      return trimmed
    })
    
    return processedLines.join('\n').trim()
  }

  const handleCheck = async () => {
    // 校验前先格式化内容
    const formattedWeeklyWork = formatContent(form.weekly_work)
    const formattedNextWeekPlan = formatContent(form.next_week_plan)
    
    // 如果格式化后有变化，更新表单
    if (formattedWeeklyWork !== form.weekly_work || formattedNextWeekPlan !== form.next_week_plan) {
      setForm(prev => ({
        ...prev,
        weekly_work: formattedWeeklyWork,
        next_week_plan: formattedNextWeekPlan
      }))
    }
    
    const content = `本周工作：\n${formattedWeeklyWork}\n\n下周计划：\n${formattedNextWeekPlan}`
    setChecking(true)
    setCheckStep('')
    setCompletedSteps([])
    setCheckMessage('正在初始化...')
    setCheckResult(null)
    
    try {
      const response = await fetch('/api/check/content/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content })
      })
      
      if (!response.ok) {
        throw new Error('请求失败')
      }
      
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      
      if (!reader) {
        throw new Error('无法读取响应')
      }
      
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              // 更新当前步骤
              if (data.step) {
                setCheckStep(data.step)
              }
              
              // 标记步骤完成
              if (data.completed && data.step) {
                setCompletedSteps(prev => 
                  prev.includes(data.step) ? prev : [...prev, data.step]
                )
              }
              
              setCheckMessage(data.message || data.error || '')
              
              if (data.error) {
                setMessage({ type: 'error', text: data.error })
              }
              
              if (data.step === 'done' && data.result) {
                setCheckResult(data.result)
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (e) {
      setMessage({ type: 'error', text: '校对失败，请重试' })
    } finally {
      setChecking(false)
      setCheckStep('')
      setCheckMessage('')
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

  // AI 生成本周工作
  const handleGenerateClick = () => {
    // 如果已有内容，先确认是否覆盖
    if (form.weekly_work.trim()) {
      if (!confirm('当前已有本周工作内容，AI 生成将覆盖现有内容，是否继续？')) {
        return
      }
    }
    setMemberSelectOpen(true)
  }

  const handleMemberSelect = async (member: DailyMember) => {
    if (!form.date_range) {
      setMessage({ type: 'error', text: '请先填写日期范围' })
      return
    }

    setGenerating(true)
    setMessage(null)
    
    try {
      const res = await generateWeeklySummary({
        member_id: member.id,
        date_range: form.date_range
      })
      
      // 填充生成的内容
      setForm(prev => ({
        ...prev,
        name: member.name,  // 同时填充姓名
        weekly_work: res.data.content
      }))
      
      setMessage({ 
        type: 'success', 
        text: `已根据 ${res.data.report_count} 条每日动态生成本周工作` 
      })
    } catch (e: any) {
      const errorMsg = e.response?.data?.detail || 'AI 生成失败，请重试'
      setMessage({ type: 'error', text: errorMsg })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>填写周小结</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-slate-500">请按编号列出本周完成的主要工作</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateClick}
              disabled={generating}
              className="h-6 text-xs px-2 flex-shrink-0"
            >
              {generating ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3 mr-1" />
              )}
              <span className="hidden sm:inline">从每日动态生成</span>
              <span className="sm:hidden">AI生成</span>
            </Button>
          </div>
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
            <p className="text-slate-600 mb-4">AI 正在校对你的内容</p>
            <div className="space-y-3">
              {/* 格式检查 */}
              <div className="flex items-center gap-3 text-sm">
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all duration-300 ${
                  completedSteps.includes('rule') 
                    ? 'border-green-400 bg-green-50' 
                    : checkStep === 'rule' 
                      ? 'border-slate-300' 
                      : 'border-slate-200'
                }`}>
                  {completedSteps.includes('rule') ? (
                    <Check className="w-3 h-3 text-green-500" />
                  ) : checkStep === 'rule' ? (
                    <div className="w-2 h-2 bg-slate-400 rounded-sm animate-pulse"></div>
                  ) : null}
                </div>
                <span className={`transition-colors duration-300 ${
                  completedSteps.includes('rule') ? 'text-green-600' : checkStep === 'rule' ? 'text-slate-500' : 'text-slate-400'
                }`}>格式与标点规范</span>
              </div>
              {/* 本周工作检查 */}
              <div className="flex items-center gap-3 text-sm">
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all duration-300 ${
                  completedSteps.includes('punct_weekly')
                    ? 'border-green-400 bg-green-50' 
                    : (checkStep === 'typo_weekly' || checkStep === 'punct_weekly')
                      ? 'border-slate-300' 
                      : 'border-slate-200'
                }`}>
                  {completedSteps.includes('punct_weekly') ? (
                    <Check className="w-3 h-3 text-green-500" />
                  ) : (checkStep === 'typo_weekly' || checkStep === 'punct_weekly') ? (
                    <div className="w-2 h-2 bg-slate-400 rounded-sm animate-pulse"></div>
                  ) : null}
                </div>
                <span className={`transition-colors duration-300 ${
                  completedSteps.includes('punct_weekly') 
                    ? 'text-green-600' 
                    : (checkStep === 'typo_weekly' || checkStep === 'punct_weekly') 
                      ? 'text-slate-500' 
                      : 'text-slate-400'
                }`}>本周工作内容校对</span>
              </div>
              {/* 下周计划检查 */}
              <div className="flex items-center gap-3 text-sm">
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all duration-300 ${
                  completedSteps.includes('punct_next')
                    ? 'border-green-400 bg-green-50' 
                    : (checkStep === 'typo_next' || checkStep === 'punct_next')
                      ? 'border-slate-300' 
                      : 'border-slate-200'
                }`}>
                  {completedSteps.includes('punct_next') ? (
                    <Check className="w-3 h-3 text-green-500" />
                  ) : (checkStep === 'typo_next' || checkStep === 'punct_next') ? (
                    <div className="w-2 h-2 bg-slate-400 rounded-sm animate-pulse"></div>
                  ) : null}
                </div>
                <span className={`transition-colors duration-300 ${
                  completedSteps.includes('punct_next') 
                    ? 'text-green-600' 
                    : (checkStep === 'typo_next' || checkStep === 'punct_next') 
                      ? 'text-slate-500' 
                      : 'text-slate-400'
                }`}>下周计划内容校对</span>
              </div>
            </div>
            {/* 当前步骤详情 */}
            {checkMessage && (
              <p className="text-xs text-slate-400 mt-4 pt-3 border-t border-slate-100">{checkMessage}</p>
            )}
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
                // 从 location 解析出是哪个区块的第几条/行
                // location 格式如: "本周工作第6条" 或 "下周计划第2条" 或 "下周计划第1行"
                const parseLocation = (loc: string) => {
                  const isWeeklyWork = loc.includes('本周工作')
                  const isNextWeekPlan = loc.includes('下周计划')
                  // 同时匹配 "第N条" 和 "第N行"
                  const match = loc.match(/第(\d+)[条行]/)
                  const itemIndex = match ? parseInt(match[1]) : 0
                  const isLineIndex = loc.includes('行')  // 是否是行号（缺少序号的情况）
                  return { isWeeklyWork, isNextWeekPlan, itemIndex, isLineIndex }
                }
                
                // 在指定的条目内替换
                const fixTextInItem = (text: string, itemIndex: number) => {
                  // 按行分割，找到以数字开头的行
                  const lines = text.split('\n')
                  let currentItemIndex = 0
                  
                  for (let i = 0; i < lines.length; i++) {
                    const line = lines[i]
                    // 检查是否是编号行（以数字开头）
                    if (/^\d+[.、。]/.test(line.trim())) {
                      currentItemIndex++
                      
                      if (currentItemIndex === itemIndex) {
                        // 找到目标行，在这一行内进行替换
                        const original = issue.original.trim()
                        const suggestion = issue.suggestion.trim()
                        
                        // 尝试多种变体（处理中英文标点差异）
                        const variants = [
                          original,
                          original.replace(/，/g, ','),
                          original.replace(/,/g, '，'),
                        ]
                        
                        for (const variant of variants) {
                          if (line.includes(variant)) {
                            lines[i] = line.replace(variant, suggestion)
                            return lines.join('\n')
                          }
                        }
                        
                        // 策略2：基于 original 和 suggestion 的差异进行修复
                        // 例如 original="资料。报告" suggestion="资料报告"
                        // 找出差异：删除了"。"
                        const findAndApplyDiff = (lineText: string) => {
                          // 找出 original 中有但 suggestion 中没有的字符（需要删除的）
                          // 或 suggestion 中有但 original 中没有的字符（需要添加的）
                          if (original.length > suggestion.length) {
                            // 删除操作：找到 original 中多余的部分
                            for (let j = 0; j < original.length; j++) {
                              const before = original.slice(0, j)
                              const after = original.slice(j + 1)
                              if (before + after === suggestion) {
                                // 找到了要删除的字符
                                const toDelete = original[j]
                                // 在行内找到 before + toDelete + after 的模式并删除 toDelete
                                const pattern = before + toDelete + after
                                if (lineText.includes(pattern)) {
                                  return lineText.replace(pattern, suggestion)
                                }
                                // 也尝试只删除该字符的第一次出现（在 before 之后）
                                const beforeIdx = lineText.indexOf(before)
                                if (beforeIdx >= 0) {
                                  const checkIdx = beforeIdx + before.length
                                  if (lineText[checkIdx] === toDelete) {
                                    return lineText.slice(0, checkIdx) + lineText.slice(checkIdx + 1)
                                  }
                                }
                              }
                            }
                          } else if (suggestion.length > original.length) {
                            // 添加操作
                            if (lineText.includes(original)) {
                              return lineText.replace(original, suggestion)
                            }
                          } else {
                            // 替换操作（长度相同）
                            if (lineText.includes(original)) {
                              return lineText.replace(original, suggestion)
                            }
                          }
                          return null
                        }
                        
                        const diffFixed = findAndApplyDiff(line)
                        if (diffFixed) {
                          lines[i] = diffFixed
                          return lines.join('\n')
                        }
                        
                        // 策略3：尝试用 context 定位
                        if (issue.context) {
                          let ctx = issue.context
                          if (ctx.endsWith('...')) ctx = ctx.slice(0, -3)
                          
                          if (line.includes(ctx)) {
                            const fixedCtx = ctx.replace(original, suggestion)
                            lines[i] = line.replace(ctx, fixedCtx)
                            return lines.join('\n')
                          }
                          
                          // 策略4：在 context 范围内应用差异修复
                          const ctxDiffFixed = findAndApplyDiff(ctx)
                          if (ctxDiffFixed && line.includes(ctx)) {
                            lines[i] = line.replace(ctx, ctxDiffFixed)
                            return lines.join('\n')
                          }
                        }
                        
                        break
                      }
                    }
                  }
                  
                  return text // 未找到，返回原文
                }
                
                const { isWeeklyWork, isNextWeekPlan, itemIndex, isLineIndex } = parseLocation(issue.location)
                
                let newWeeklyWork = form.weekly_work
                let newNextWeekPlan = form.next_week_plan
                
                // 简单替换函数（用于行号定位或回退）
                const simpleReplace = (text: string) => {
                  const original = issue.original.trim()
                  const suggestion = issue.suggestion.trim()
                  if (text.includes(original)) {
                    return text.replace(original, suggestion)
                  }
                  return text
                }
                
                if (isWeeklyWork && itemIndex > 0) {
                  if (isLineIndex) {
                    newWeeklyWork = simpleReplace(form.weekly_work)
                  } else {
                    const fixed = fixTextInItem(form.weekly_work, itemIndex)
                    // 如果精确定位失败，回退到简单替换
                    newWeeklyWork = fixed !== form.weekly_work ? fixed : simpleReplace(form.weekly_work)
                  }
                } else if (isNextWeekPlan && itemIndex > 0) {
                  if (isLineIndex) {
                    newNextWeekPlan = simpleReplace(form.next_week_plan)
                  } else {
                    const fixed = fixTextInItem(form.next_week_plan, itemIndex)
                    // 如果精确定位失败，回退到简单替换
                    newNextWeekPlan = fixed !== form.next_week_plan ? fixed : simpleReplace(form.next_week_plan)
                  }
                } else if (isWeeklyWork) {
                  newWeeklyWork = simpleReplace(form.weekly_work)
                } else if (isNextWeekPlan) {
                  newNextWeekPlan = simpleReplace(form.next_week_plan)
                } else {
                  // 完全无法解析 location，回退到简单替换（优先本周工作）
                  const original = issue.original.trim()
                  const suggestion = issue.suggestion.trim()
                  if (form.weekly_work.includes(original)) {
                    newWeeklyWork = form.weekly_work.replace(original, suggestion)
                  } else if (form.next_week_plan.includes(original)) {
                    newNextWeekPlan = form.next_week_plan.replace(original, suggestion)
                  }
                }
                
                // 检查是否有实际修改
                const hasChange = newWeeklyWork !== form.weekly_work || newNextWeekPlan !== form.next_week_plan
                
                if (hasChange) {
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
                } else {
                  alert('无法自动修复，请手动修改')
                }
              }
              
              // 来源标签
              const sourceLabel = {
                rule: { text: '规则', color: 'bg-blue-100 text-blue-700' },
                ai_typo: { text: 'AI错字', color: 'bg-purple-100 text-purple-700' },
                ai_punctuation: { text: 'AI标点', color: 'bg-orange-100 text-orange-700' },
              }[issue.source || 'rule'] || { text: '规则', color: 'bg-blue-100 text-blue-700' }
              
              return (
                <div key={i} className="text-sm mt-3 p-3 bg-white rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-slate-500">
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                        {issue.type === 'typo' ? '错字' : issue.type === 'punctuation' ? '标点' : issue.type === 'format' ? '格式' : '语法'}
                      </span>
                      <span>{issue.location}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs ${sourceLabel.color}`}>
                      {sourceLabel.text}
                    </span>
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

        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Button onClick={handleCheck} variant="outline" disabled={checking || !form.weekly_work} className="flex-1 sm:flex-none">
            {checking ? <Loader2 className="w-4 h-4 mr-1 sm:mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1 sm:mr-2" />}
            <span className="hidden sm:inline">AI 校对</span>
            <span className="sm:hidden">校对</span>
          </Button>
          <Button onClick={handleSaveDraft} variant="secondary" disabled={loading} className="flex-1 sm:flex-none">
            <Save className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">保存草稿</span>
            <span className="sm:hidden">草稿</span>
          </Button>
          <Button onClick={handleSubmit} disabled={loading} className="flex-1 sm:flex-none">
            {loading ? <Loader2 className="w-4 h-4 mr-1 sm:mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-1 sm:mr-2" />}
            提交
          </Button>
        </div>

        {/* 人员选择对话框 */}
        <MemberSelectDialog
          open={memberSelectOpen}
          onOpenChange={setMemberSelectOpen}
          onSelect={handleMemberSelect}
        />
      </CardContent>
    </Card>
  )
}
