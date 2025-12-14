import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { type Submission, type CheckResult, exportSubmission, updateSubmission } from '@/lib/api'
import { Download, CheckCircle, Loader2, AlertCircle, Pencil, X, Save, Check } from 'lucide-react'

interface Props {
  submission: Submission | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate?: (updatedSubmission?: Submission) => void
}

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' }> = {
  draft: { label: '草稿', variant: 'secondary' },
  submitted: { label: '已提交', variant: 'default' },
  checked: { label: '已校对', variant: 'warning' },
  archived: { label: '已归档', variant: 'success' },
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  
  return isMobile
}

function DetailContent({ submission, onUpdate }: { submission: Submission; onUpdate?: (updatedSubmission?: Submission) => void }) {
  const [exporting, setExporting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // 流式校对状态
  const [checking, setChecking] = useState(false)
  const [checkStep, setCheckStep] = useState('')
  const [checkMessage, setCheckMessage] = useState('')
  const [completedSteps, setCompletedSteps] = useState<string[]>([])
  const [checkResult, setCheckResult] = useState<CheckResult | null>(submission.check_result)
  
  // 编辑表单状态
  const [editForm, setEditForm] = useState({
    name: submission.name,
    date_range: submission.date_range,
    weekly_work: submission.weekly_work,
    next_week_plan: submission.next_week_plan,
  })

  // 当 submission 变化时重置状态
  useEffect(() => {
    setEditForm({
      name: submission.name,
      date_range: submission.date_range,
      weekly_work: submission.weekly_work,
      next_week_plan: submission.next_week_plan,
    })
    setCheckResult(submission.check_result)
    setEditing(false)
  }, [submission.id, submission.check_result])

  // 流式校对
  const handleCheck = async () => {
    const content = `本周工作：\n${editForm.weekly_work}\n\n下周计划：\n${editForm.next_week_plan}`
    setChecking(true)
    setCheckStep('')
    setCompletedSteps([])
    setCheckMessage('正在初始化...')
    setCheckResult(null)
    
    try {
      const response = await fetch('http://localhost:8000/api/check/content/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content })
      })
      
      if (!response.ok) throw new Error('请求失败')
      
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('无法读取响应')
      
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
              if (data.step) setCheckStep(data.step)
              if (data.completed && data.step) {
                setCompletedSteps(prev => prev.includes(data.step) ? prev : [...prev, data.step])
              }
              setCheckMessage(data.message || data.error || '')
              if (data.step === 'done' && data.result) {
                setCheckResult(data.result)
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch {
      setCheckMessage('校对失败，请重试')
    } finally {
      setChecking(false)
      setCheckStep('')
      setCheckMessage('')
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await exportSubmission(submission.id)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = `${submission.name}周小结(${submission.date_range}).docx`
      link.click()
      window.URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await updateSubmission(submission.id, editForm)
      setEditing(false)
      setCheckResult(null) // 清除校对结果
      onUpdate?.(res.data)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditForm({
      name: submission.name,
      date_range: submission.date_range,
      weekly_work: submission.weekly_work,
      next_week_plan: submission.next_week_plan,
    })
    setEditing(false)
  }

  // 一键修复逻辑
  const handleFix = (issue: CheckResult['issues'][0], issueIndex: number) => {
    const parseLocation = (loc: string) => {
      const isWeeklyWork = loc.includes('本周工作')
      const isNextWeekPlan = loc.includes('下周计划')
      const match = loc.match(/第(\d+)[条行]/)
      const itemIndex = match ? parseInt(match[1]) : 0
      const isLineIndex = loc.includes('行')
      return { isWeeklyWork, isNextWeekPlan, itemIndex, isLineIndex }
    }
    
    const fixTextInItem = (text: string, itemIndex: number) => {
      const lines = text.split('\n')
      let currentItemIndex = 0
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (/^\d+[.、。]/.test(line.trim())) {
          currentItemIndex++
          if (currentItemIndex === itemIndex) {
            const original = issue.original.trim()
            const suggestion = issue.suggestion.trim()
            
            // 尝试直接替换
            const variants = [original, original.replace(/，/g, ','), original.replace(/,/g, '，')]
            for (const variant of variants) {
              if (line.includes(variant)) {
                lines[i] = line.replace(variant, suggestion)
                return lines.join('\n')
              }
            }
            
            // 尝试差异修复
            if (original.length > suggestion.length) {
              for (let j = 0; j < original.length; j++) {
                const before = original.slice(0, j)
                const after = original.slice(j + 1)
                if (before + after === suggestion) {
                  const pattern = original
                  if (line.includes(pattern)) {
                    lines[i] = line.replace(pattern, suggestion)
                    return lines.join('\n')
                  }
                }
              }
            }
            
            // 尝试 context 定位
            if (issue.context) {
              let ctx = issue.context
              if (ctx.endsWith('...')) ctx = ctx.slice(0, -3)
              if (line.includes(ctx)) {
                const fixedCtx = ctx.replace(original, suggestion)
                lines[i] = line.replace(ctx, fixedCtx)
                return lines.join('\n')
              }
            }
            break
          }
        }
      }
      return text
    }
    
    const simpleReplace = (text: string) => {
      const original = issue.original.trim()
      const suggestion = issue.suggestion.trim()
      return text.includes(original) ? text.replace(original, suggestion) : text
    }
    
    const { isWeeklyWork, isNextWeekPlan, itemIndex, isLineIndex } = parseLocation(issue.location)
    
    let newWeeklyWork = editForm.weekly_work
    let newNextWeekPlan = editForm.next_week_plan
    
    if (isWeeklyWork && itemIndex > 0) {
      newWeeklyWork = isLineIndex ? simpleReplace(editForm.weekly_work) : fixTextInItem(editForm.weekly_work, itemIndex)
    } else if (isNextWeekPlan && itemIndex > 0) {
      newNextWeekPlan = isLineIndex ? simpleReplace(editForm.next_week_plan) : fixTextInItem(editForm.next_week_plan, itemIndex)
    } else if (isWeeklyWork) {
      newWeeklyWork = simpleReplace(editForm.weekly_work)
    } else if (isNextWeekPlan) {
      newNextWeekPlan = simpleReplace(editForm.next_week_plan)
    } else {
      const original = issue.original.trim()
      if (editForm.weekly_work.includes(original)) {
        newWeeklyWork = simpleReplace(editForm.weekly_work)
      } else {
        newNextWeekPlan = simpleReplace(editForm.next_week_plan)
      }
    }
    
    const hasChange = newWeeklyWork !== editForm.weekly_work || newNextWeekPlan !== editForm.next_week_plan
    
    if (hasChange) {
      setEditForm(prev => ({ ...prev, weekly_work: newWeeklyWork, next_week_plan: newNextWeekPlan }))
      setCheckResult(prev => prev ? {
        ...prev,
        total_issues: prev.total_issues - 1,
        issues: prev.issues.filter((_, idx) => idx !== issueIndex)
      } : null)
      // 自动进入编辑模式
      if (!editing) setEditing(true)
    } else {
      alert('无法自动修复，请手动修改')
    }
  }

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

  return (
    <div className="space-y-6 mt-4">
      {/* 基本信息 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant={statusMap[submission.status]?.variant || 'default'}>
            {statusMap[submission.status]?.label || submission.status}
          </Badge>
          <span className="text-sm text-slate-500">
            提交于 {new Date(submission.created_at).toLocaleString()}
          </span>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="w-4 h-4 mr-1" />
            编辑
          </Button>
        )}
      </div>

      {/* 编辑模式：姓名和日期 */}
      {editing && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">姓名</label>
            <Input value={editForm.name} onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">日期范围</label>
            <Input value={editForm.date_range} onChange={e => setEditForm(prev => ({ ...prev, date_range: e.target.value }))} />
          </div>
        </div>
      )}

      {/* 流式校对进度 */}
      {checking && (
        <div className="py-4 px-4 rounded-lg border border-slate-200 bg-slate-50/30">
          <p className="text-slate-600 mb-3 text-sm">AI 正在校对内容</p>
          <div className="space-y-2">
            {[
              { id: 'rule', label: '格式与标点规范' },
              { id: 'punct_weekly', label: '本周工作内容校对', activeSteps: ['typo_weekly', 'punct_weekly'] },
              { id: 'punct_next', label: '下周计划内容校对', activeSteps: ['typo_next', 'punct_next'] },
            ].map(item => {
              const isCompleted = completedSteps.includes(item.id)
              const isActive = item.activeSteps ? item.activeSteps.includes(checkStep) : checkStep === item.id
              return (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                    isCompleted ? 'border-green-400 bg-green-50' : isActive ? 'border-slate-300' : 'border-slate-200'
                  }`}>
                    {isCompleted ? <Check className="w-3 h-3 text-green-500" /> : isActive ? <div className="w-2 h-2 bg-slate-400 rounded-sm animate-pulse" /> : null}
                  </div>
                  <span className={isCompleted ? 'text-green-600' : isActive ? 'text-slate-500' : 'text-slate-400'}>{item.label}</span>
                </div>
              )
            })}
          </div>
          {checkMessage && <p className="text-xs text-slate-400 mt-3 pt-2 border-t border-slate-100">{checkMessage}</p>}
        </div>
      )}

      {/* 校对结果 */}
      {!checking && checkResult && (
        <div className={`p-3 rounded-lg ${checkResult.total_issues > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
          <div className="flex items-center gap-2 text-sm">
            {checkResult.total_issues > 0 ? (
              <><AlertCircle className="w-4 h-4 text-yellow-600" /><span className="text-yellow-700">发现 {checkResult.total_issues} 个问题</span></>
            ) : (
              <><CheckCircle className="w-4 h-4 text-green-600" /><span className="text-green-700">校对通过，未发现问题 ✨</span></>
            )}
          </div>
          {checkResult.issues && checkResult.issues.length > 0 && (
            <div className="mt-3 space-y-2">
              {checkResult.issues.map((issue, i) => {
                const sourceLabel = {
                  rule: { text: '规则', color: 'bg-blue-100 text-blue-700' },
                  ai_typo: { text: 'AI错字', color: 'bg-purple-100 text-purple-700' },
                  ai_punctuation: { text: 'AI标点', color: 'bg-orange-100 text-orange-700' },
                }[issue.source || 'rule'] || { text: '规则', color: 'bg-blue-100 text-blue-700' }
                
                return (
                <div key={i} className="text-sm p-2 bg-white rounded border border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 text-slate-500">
                      <span className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">
                        {issue.type === 'typo' ? '错字' : issue.type === 'punctuation' ? '标点' : '格式'}
                      </span>
                      <span>{issue.location}</span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${sourceLabel.color}`}>
                      {sourceLabel.text}
                    </span>
                  </div>
                  {issue.context && (
                    <div className="text-slate-600 mb-2 leading-relaxed text-xs">{highlightContext(issue.context, issue.original)}</div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-red-500 line-through">{issue.original}</span>
                      <span className="text-slate-400">→</span>
                      <span className="text-green-600">{issue.suggestion}</span>
                    </div>
                    <Button onClick={() => handleFix(issue, i)} variant="outline" size="sm" className="h-6 text-xs px-2">
                      修复
                    </Button>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      )}

      {/* 本周工作 */}
      <div>
        <h4 className="text-sm font-medium text-slate-700 mb-2">本周工作</h4>
        {editing ? (
          <Textarea value={editForm.weekly_work} onChange={e => setEditForm(prev => ({ ...prev, weekly_work: e.target.value }))} rows={8} className="text-sm" />
        ) : (
          <div className="p-3 bg-slate-50 rounded-lg text-sm whitespace-pre-wrap leading-relaxed">{submission.weekly_work || '（无内容）'}</div>
        )}
      </div>

      {/* 下周计划 */}
      <div>
        <h4 className="text-sm font-medium text-slate-700 mb-2">下周计划</h4>
        {editing ? (
          <Textarea value={editForm.next_week_plan} onChange={e => setEditForm(prev => ({ ...prev, next_week_plan: e.target.value }))} rows={5} className="text-sm" />
        ) : (
          <div className="p-3 bg-slate-50 rounded-lg text-sm whitespace-pre-wrap leading-relaxed">{submission.next_week_plan || '（无内容）'}</div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3 pt-2 border-t">
        {editing ? (
          <>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              保存
            </Button>
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
              <X className="w-4 h-4 mr-2" />
              取消
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={handleCheck} disabled={checking}>
              {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              校对
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              导出
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

export function SubmissionDetail({ submission, open, onOpenChange, onUpdate }: Props) {
  const isMobile = useIsMobile()
  if (!submission) return null

  const title = `${submission.name} 的周小结`
  const description = submission.date_range

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DetailContent submission={submission} onUpdate={onUpdate} />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <DetailContent submission={submission} onUpdate={onUpdate} />
      </SheetContent>
    </Sheet>
  )
}
