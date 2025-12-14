import { useState, useEffect, useRef } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  listDailyMembers,
  getDailySummary,
  createDailyReport,
  deleteDailyReport,
  optimizeDaily,
  type DailyMember,
  type DailyReportSummary,
} from '@/lib/api'
import {
  Calendar,
  Users,
  Copy,
  Check,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Send,
  Sparkles,
  X,
} from 'lucide-react'

// 格式化日期为 YYYY-MM-DD（使用本地时区）
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 解析日期字符串
function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}

// 字符级别的差异对比（简化版 LCS）
type DiffSegment = { text: string; type: 'same' | 'del' | 'add' }

function diffStrings(oldStr: string, newStr: string): { oldParts: DiffSegment[]; newParts: DiffSegment[] } {
  // 找最长公共子序列的简化实现
  const oldParts: DiffSegment[] = []
  const newParts: DiffSegment[] = []
  
  let i = 0, j = 0
  let sameOld = '', sameNew = ''
  let diffOld = '', diffNew = ''
  
  // 找公共前缀
  while (i < oldStr.length && j < newStr.length && oldStr[i] === newStr[j]) {
    sameOld += oldStr[i]
    sameNew += newStr[j]
    i++
    j++
  }
  
  if (sameOld) {
    oldParts.push({ text: sameOld, type: 'same' })
    newParts.push({ text: sameNew, type: 'same' })
  }
  
  // 找公共后缀
  let oi = oldStr.length - 1
  let ni = newStr.length - 1
  let suffixOld = '', suffixNew = ''
  
  while (oi >= i && ni >= j && oldStr[oi] === newStr[ni]) {
    suffixOld = oldStr[oi] + suffixOld
    suffixNew = newStr[ni] + suffixNew
    oi--
    ni--
  }
  
  // 中间不同的部分
  if (i <= oi) {
    diffOld = oldStr.slice(i, oi + 1)
    oldParts.push({ text: diffOld, type: 'del' })
  }
  if (j <= ni) {
    diffNew = newStr.slice(j, ni + 1)
    newParts.push({ text: diffNew, type: 'add' })
  }
  
  // 公共后缀
  if (suffixOld) {
    oldParts.push({ text: suffixOld, type: 'same' })
    newParts.push({ text: suffixNew, type: 'same' })
  }
  
  return { oldParts, newParts }
}

// 解析每日动态行，提取序号+姓名前缀和内容
function parseDailyLine(line: string): { prefix: string; content: string } | null {
  const match = line.match(/^(\d+、[^\s]+\s*)(.*)$/)
  if (match) {
    return { prefix: match[1], content: match[2] }
  }
  return null
}

// 基于序号匹配的智能差异对比
function diffDailyReport(original: string, modified: string): {
  lines: Array<{
    originalLine: string
    modifiedLine: string
    hasChange: boolean
    originalParts?: DiffSegment[]
    modifiedParts?: DiffSegment[]
    prefix?: string
  }>
} {
  const originalLines = original.split('\n')
  const modifiedLines = modified.split('\n')
  
  // 构建修改后的行索引（按序号）
  const modifiedByNumber: Record<string, string> = {}
  modifiedLines.forEach(line => {
    const match = line.match(/^(\d+)、/)
    if (match) {
      modifiedByNumber[match[1]] = line
    }
  })
  
  const result: Array<{
    originalLine: string
    modifiedLine: string
    hasChange: boolean
    originalParts?: DiffSegment[]
    modifiedParts?: DiffSegment[]
    prefix?: string
  }> = []
  
  originalLines.forEach((origLine, idx) => {
    const numberMatch = origLine.match(/^(\d+)、/)
    
    if (numberMatch) {
      const num = numberMatch[1]
      const modLine = modifiedByNumber[num] || ''
      const hasChange = origLine !== modLine
      
      if (hasChange && modLine) {
        const origParsed = parseDailyLine(origLine)
        const modParsed = parseDailyLine(modLine)
        
        if (origParsed && modParsed) {
          // 只对内容部分做 diff
          const { oldParts, newParts } = diffStrings(origParsed.content, modParsed.content)
          result.push({
            originalLine: origLine,
            modifiedLine: modLine,
            hasChange: true,
            prefix: origParsed.prefix,
            originalParts: oldParts,
            modifiedParts: newParts,
          })
        } else {
          // 整行 diff
          const { oldParts, newParts } = diffStrings(origLine, modLine)
          result.push({
            originalLine: origLine,
            modifiedLine: modLine,
            hasChange: true,
            originalParts: oldParts,
            modifiedParts: newParts,
          })
        }
      } else {
        result.push({
          originalLine: origLine,
          modifiedLine: modLine || origLine,
          hasChange: false,
        })
      }
    } else {
      const modLine = modifiedLines[idx] || ''
      const hasChange = origLine !== modLine
      if (hasChange) {
        const { oldParts, newParts } = diffStrings(origLine, modLine)
        result.push({
          originalLine: origLine,
          modifiedLine: modLine,
          hasChange: true,
          originalParts: oldParts,
          modifiedParts: newParts,
        })
      } else {
        result.push({
          originalLine: origLine,
          modifiedLine: modLine,
          hasChange: false,
        })
      }
    }
  })
  
  return { lines: result }
}

export function DailyPanel() {
  const [selectedDate, setSelectedDate] = useState(() => formatDate(new Date()))
  const [members, setMembers] = useState<DailyMember[]>([])
  const [summary, setSummary] = useState<DailyReportSummary | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [submitting, setSubmitting] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [contents, setContents] = useState<Record<number, string>>({})
  const [originalContents, setOriginalContents] = useState<Record<number, string>>({})
  const [optimizing, setOptimizing] = useState(false)
  const [optimizedText, setOptimizedText] = useState<string | null>(null)
  const [showOptimizeModal, setShowOptimizeModal] = useState(false)
  const [editingOptimized, setEditingOptimized] = useState('')
  
  // 用于取消过期请求
  const abortControllerRef = useRef<AbortController | null>(null)

  // 初始加载人员列表（只加载一次）
  useEffect(() => {
    const loadMembers = async () => {
      try {
        const res = await listDailyMembers()
        setMembers(res.data)
      } catch (e) {
        console.error(e)
      }
    }
    loadMembers()
  }, [])

  // 加载某天的汇总数据
  const loadSummary = async (date: string) => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setSummaryLoading(true)
    setOptimizedText(null) // 切换日期时清除优化结果
    try {
      const res = await getDailySummary(date)
      setSummary(res.data)
      
      // 更新已提交的内容，保留未提交的输入
      const serverContents: Record<number, string> = {}
      res.data.reports.forEach((r) => {
        serverContents[r.member_id] = r.content
      })
      setOriginalContents(serverContents)
      setContents((prev) => {
        const updated = { ...prev }
        res.data.reports.forEach((r) => {
          updated[r.member_id] = r.content
        })
        return updated
      })
    } catch (e: any) {
      if (e.name !== 'CanceledError') {
        console.error(e)
      }
    } finally {
      setSummaryLoading(false)
      setInitialLoading(false)
    }
  }

  // 日期变化时加载汇总
  useEffect(() => {
    loadSummary(selectedDate)
  }, [selectedDate])

  // 日期导航
  const goToPrevDay = () => {
    const date = parseDate(selectedDate)
    date.setDate(date.getDate() - 1)
    setSelectedDate(formatDate(date))
  }

  const goToNextDay = () => {
    const date = parseDate(selectedDate)
    date.setDate(date.getDate() + 1)
    setSelectedDate(formatDate(date))
  }

  const goToToday = () => {
    setSelectedDate(formatDate(new Date()))
  }

  // 提交单个人员的动态（空内容时会删除已有记录）
  const handleSubmit = async (memberId: number) => {
    const content = contents[memberId]?.trim() || ''

    setSubmitting(memberId)
    try {
      await createDailyReport({
        member_id: memberId,
        date: selectedDate,
        content,
      })
      await loadSummary(selectedDate)
      // 如果是清空操作，同时清空输入框
      if (!content) {
        setContents((prev) => ({ ...prev, [memberId]: '' }))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(null)
    }
  }

  // 删除动态
  const handleDelete = async (reportId: number) => {
    if (!confirm('确定删除这条动态？')) return
    try {
      await deleteDailyReport(reportId)
      await loadSummary(selectedDate)
    } catch (e) {
      console.error(e)
    }
  }

  // 复制汇总文本
  const handleCopy = async () => {
    const textToCopy = optimizedText || summary?.summary_text
    if (!textToCopy) return
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error(e)
    }
  }

  // AI 优化
  const handleOptimize = async () => {
    if (!summary?.summary_text) return
    setOptimizing(true)
    try {
      const res = await optimizeDaily(summary.summary_text)
      setEditingOptimized(res.data.optimized_content)
      setShowOptimizeModal(true)
    } catch (e) {
      console.error(e)
      alert('优化失败，请重试')
    } finally {
      setOptimizing(false)
    }
  }

  // 采纳优化结果
  const handleAcceptOptimized = () => {
    setOptimizedText(editingOptimized)
    setShowOptimizeModal(false)
  }

  // 取消优化
  const handleCancelOptimize = () => {
    setShowOptimizeModal(false)
    setEditingOptimized('')
  }

  // 获取人员的提交状态
  const getReportForMember = (memberId: number) => {
    return summary?.reports.find((r) => r.member_id === memberId)
  }

  // 初始加载时显示全屏 loading
  if (initialLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* 日期选择器 */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={goToPrevDay}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2 px-3">
                <Calendar className="w-4 h-4 text-slate-500" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-auto"
                />
              </div>
              <Button variant="outline" size="icon" onClick={goToNextDay}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday}>
                今天
              </Button>
              {summaryLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              ) : (
                <Badge variant="secondary">
                  <Users className="w-3 h-3 mr-1" />
                  {summary?.submitted_count || 0}/{summary?.total_members || 0}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 汇总预览 */}
      {summary && summary.submitted_count > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">汇总预览</CardTitle>
                {optimizedText && (
                  <Badge variant="success" className="text-xs">已优化</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleOptimize}
                  disabled={optimizing}
                >
                  {optimizing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      优化中
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-1" />
                      快速优化
                    </>
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-1" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      复制
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-50 rounded-lg p-3 text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">
              {optimizedText || summary.summary_text}
            </div>
            {optimizedText && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-2 text-xs text-slate-500"
                onClick={() => setOptimizedText(null)}
              >
                查看原文
              </Button>
            )}
          </CardContent>
        </Card>
      )}


      {/* 人员列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4" />
            填写动态
            <span className="text-sm font-normal text-slate-500">
              ({summary?.date_display})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              暂无人员名单，请先在管理员设置中导入名单
            </div>
          ) : (
            <div className="space-y-4">
              {members.map((member) => {
                const report = getReportForMember(member.id)
                const isSubmitted = !!report
                const content = contents[member.id] || ''
                const originalContent = originalContents[member.id] || ''
                const hasChanged = content.trim() !== originalContent.trim()

                return (
                  <div
                    key={member.id}
                    className={`p-3 rounded-lg border transition-colors ${
                      isSubmitted ? 'bg-green-50 border-green-200' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{member.name}</span>
                        {isSubmitted && (
                          <Badge variant="success" className="text-xs">
                            已提交
                          </Badge>
                        )}
                      </div>
                      {isSubmitted && report && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(report.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Textarea
                        placeholder={`请输入${member.name}的今日动态...`}
                        value={content}
                        onChange={(e) =>
                          setContents((prev) => ({
                            ...prev,
                            [member.id]: e.target.value,
                          }))
                        }
                        rows={2}
                        className="text-sm flex-1"
                      />
                      <Button
                        onClick={() => handleSubmit(member.id)}
                        disabled={!hasChanged || submitting === member.id}
                        className="self-end"
                      >
                        {submitting === member.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI 优化对比弹窗 */}
      {showOptimizeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                <h2 className="text-lg font-semibold">AI 优化结果</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={handleCancelOptimize}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              {(() => {
                const diff = diffDailyReport(summary?.summary_text || '', editingOptimized)
                const changeCount = diff.lines.filter(l => l.hasChange).length
                return (
                  <div className="space-y-4">
                    {/* 修改统计 */}
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <span>共 {changeCount} 处修改</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-3 h-3 bg-red-100 border border-red-200 rounded"></span>
                        <span>删除</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-3 h-3 bg-green-100 border border-green-200 rounded"></span>
                        <span>新增</span>
                      </span>
                    </div>
                    
                    {/* 逐行对比 */}
                    <div className="border rounded-lg overflow-hidden text-sm">
                      {diff.lines.map((line, i) => (
                        <div key={i} className={i > 0 ? 'border-t border-slate-100' : ''}>
                          {line.hasChange ? (
                            <div className="space-y-1 py-2 px-3 bg-slate-50">
                              {/* 原文 - 删除的部分用红色高亮 */}
                              <div className="flex items-start gap-2">
                                <span className="text-red-500 font-medium select-none w-4">−</span>
                                <span className="flex-1">
                                  {line.prefix && <span className="text-slate-600">{line.prefix}</span>}
                                  {line.originalParts?.map((part, pi) => (
                                    <span
                                      key={pi}
                                      className={part.type === 'del' ? 'bg-red-200 text-red-800 rounded px-0.5' : 'text-slate-600'}
                                    >
                                      {part.text}
                                    </span>
                                  ))}
                                </span>
                              </div>
                              {/* 新文 - 新增的部分用绿色高亮 */}
                              <div className="flex items-start gap-2">
                                <span className="text-green-500 font-medium select-none w-4">+</span>
                                <span className="flex-1">
                                  {line.prefix && <span className="text-slate-600">{line.prefix}</span>}
                                  {line.modifiedParts?.map((part, pi) => (
                                    <span
                                      key={pi}
                                      className={part.type === 'add' ? 'bg-green-200 text-green-800 rounded px-0.5' : 'text-slate-600'}
                                    >
                                      {part.text}
                                    </span>
                                  ))}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="py-1.5 px-3 text-slate-600">
                              {line.originalLine || '\u00A0'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    {/* 可编辑区域 */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-purple-600">编辑优化结果</span>
                        <Badge variant="outline" className="text-xs text-purple-600 border-purple-200">可修改</Badge>
                      </div>
                      <Textarea
                        value={editingOptimized}
                        onChange={(e) => setEditingOptimized(e.target.value)}
                        className="h-40 text-sm resize-none"
                        placeholder="你可以在这里修改优化后的内容..."
                      />
                    </div>
                  </div>
                )
              })()}
            </div>
            
            <div className="flex items-center justify-end gap-3 p-4 border-t bg-slate-50">
              <Button variant="outline" onClick={handleCancelOptimize}>
                取消
              </Button>
              <Button onClick={handleAcceptOptimized}>
                <Check className="w-4 h-4 mr-1" />
                采纳
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
