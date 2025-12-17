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
  optimizeDaily,
  acceptOptimized,
  restoreOriginal,
  type DailyMember,
  type DailyReportSummary,
  type DailyReport,
} from '@/lib/api'
import {
  Calendar,
  Users,
  Copy,
  Check,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Save,
  Sparkles,
  X,
  History,
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

// 解析优化后的汇总文本，提取每个人的内容
function parseOptimizedText(text: string): Array<{ member_name: string; content: string }> {
  const lines = text.split('\n')
  const results: Array<{ member_name: string; content: string }> = []
  
  for (const line of lines) {
    // 匹配格式：数字、姓名 内容（姓名和内容之间必须有空格）
    // 例如：1、张三 上午参加会议，下午处理业务。
    const match = line.match(/^\d+、(\S+)\s+(.+)$/)
    if (match) {
      results.push({
        member_name: match[1],
        content: match[2].trim()
      })
    }
  }
  
  return results
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
  const [originalSummaryText, setOriginalSummaryText] = useState<string | null>(null) // 优化前的原始汇总文本
  const [showingOriginalSummary, setShowingOriginalSummary] = useState(false) // 汇总区域是否显示原始内容
  const [showOptimizeModal, setShowOptimizeModal] = useState(false)
  const [editingOptimized, setEditingOptimized] = useState('')
  const [contentVisible, setContentVisible] = useState(true)
  const [accepting, setAccepting] = useState(false)
  // 记录哪些成员正在显示原始内容（用于切换）
  const [showingOriginal, setShowingOriginal] = useState<Record<number, boolean>>({})
  // 存储原始内容（从服务器获取）
  const [serverOriginalContents, setServerOriginalContents] = useState<Record<number, string | null>>({})
  
  // 用于取消过期请求
  const abortControllerRef = useRef<AbortController | null>(null)
  const prevDateRef = useRef(selectedDate)

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
  const loadSummary = async (date: string, preserveContents = false) => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    
    setSummaryLoading(true)
    try {
      const res = await getDailySummary(date)
      setSummary(res.data)
      
      // 设置该日期的已提交内容
      const serverContents: Record<number, string> = {}
      const serverOriginals: Record<number, string | null> = {}
      res.data.reports.forEach((r) => {
        serverContents[r.member_id] = r.content
        serverOriginals[r.member_id] = r.original_content || null
      })
      setOriginalContents(serverContents)
      setServerOriginalContents(serverOriginals)
      
      // 检查是否有任何记录被优化过（有 original_content）
      const hasAnyOptimized = res.data.reports.some(r => r.original_content)
      
      // 只有在非保留模式下才重置 contents
      if (!preserveContents) {
        setContents(serverContents)
        setShowingOriginal({})  // 重置显示状态
        setShowingOriginalSummary(false)
        
        // 如果有优化过的记录，生成原始汇总文本
        if (hasAnyOptimized) {
          // 根据各条记录的 original_content 生成原始汇总
          const originalLines: string[] = [`每日动态（${res.data.date_display}）`]
          res.data.reports.forEach((r, i) => {
            // 使用 original_content（如果有）或 content
            const contentToUse = r.original_content || r.content
            originalLines.push(`${i + 1}、${r.member_name} ${contentToUse}`)
          })
          setOriginalSummaryText(originalLines.join('\n'))
          setOptimizedText(res.data.summary_text) // 当前的 summary_text 就是优化后的
        } else {
          setOptimizedText(null)
          setOriginalSummaryText(null)
        }
      } else {
        // 保留模式：只更新已保存的内容，保留用户正在编辑的内容
        setContents(prev => {
          const newContents = { ...prev }
          // 更新服务器返回的内容
          Object.keys(serverContents).forEach(key => {
            newContents[Number(key)] = serverContents[Number(key)]
          })
          return newContents
        })
      }
    } catch (e: any) {
      if (e.name !== 'CanceledError') {
        console.error(e)
      }
    } finally {
      setSummaryLoading(false)
      setInitialLoading(false)
    }
  }
  
  // 日期变化时加载汇总（带淡入淡出效果）
  useEffect(() => {
    const isDateChange = prevDateRef.current !== selectedDate
    prevDateRef.current = selectedDate
    
    if (isDateChange) {
      // 先淡出
      setContentVisible(false)
      // 等淡出动画完成后加载数据
      const timer = setTimeout(async () => {
        await loadSummary(selectedDate)
        // 数据加载完成后淡入
        setContentVisible(true)
      }, 150)
      return () => clearTimeout(timer)
    } else {
      loadSummary(selectedDate)
    }
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
      // 保存成功后，更新 originalContents 以反映新的服务器状态
      setOriginalContents(prev => ({
        ...prev,
        [memberId]: content
      }))
      // 同步更新 contents（去除首尾空格）
      setContents(prev => ({
        ...prev,
        [memberId]: content
      }))
      // 重置该成员的优化状态（因为内容已被手动修改）
      setServerOriginalContents(prev => ({
        ...prev,
        [memberId]: null
      }))
      setShowingOriginal(prev => ({
        ...prev,
        [memberId]: false
      }))
      // 重置汇总区域的优化状态（因为单条内容变化会影响汇总）
      setOptimizedText(null)
      setOriginalSummaryText(null)
      setShowingOriginalSummary(false)
      // 重新加载汇总数据以更新统计
      const res = await getDailySummary(selectedDate)
      setSummary(res.data)
      // 更新服务器原始内容状态
      const newServerOriginals: Record<number, string | null> = {}
      res.data.reports.forEach((r) => {
        newServerOriginals[r.member_id] = r.original_content || null
      })
      setServerOriginalContents(newServerOriginals)
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(null)
    }
  }



  // 复制汇总文本（复制当前显示的内容）
  const handleCopy = async () => {
    const textToCopy = showingOriginalSummary 
      ? originalSummaryText 
      : (optimizedText || summary?.summary_text)
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
  const handleAcceptOptimized = async () => {
    if (!summary) return
    
    setAccepting(true)
    try {
      // 解析优化后的文本
      const parsedReports = parseOptimizedText(editingOptimized)
      
      if (parsedReports.length === 0) {
        alert('无法解析优化后的内容，请检查格式')
        return
      }
      
      // 在 API 调用之前保存原始汇总文本（如果还没有保存过）
      const originalText = !originalSummaryText ? summary.summary_text : originalSummaryText
      
      // 调用 API 批量更新
      const res = await acceptOptimized({
        date: selectedDate,
        reports: parsedReports
      })
      
      if (res.data.skipped_names.length > 0) {
        alert(`以下姓名未匹配到：${res.data.skipped_names.join('、')}`)
      }
      
      // 设置原始汇总文本
      setOriginalSummaryText(originalText)
      
      // 更新成功，重新加载数据（使用 preserveContents 模式避免重置状态）
      await loadSummary(selectedDate, true)
      setOptimizedText(editingOptimized)
      setShowingOriginalSummary(false) // 采纳后显示优化后的内容
      setShowOptimizeModal(false)
    } catch (e) {
      console.error(e)
      alert('采纳失败，请重试')
    } finally {
      setAccepting(false)
    }
  }

  // 取消优化
  const handleCancelOptimize = () => {
    setShowOptimizeModal(false)
    setEditingOptimized('')
  }

  // 切换显示原始内容/优化后内容
  const toggleOriginalContent = async (memberId: number, reportId: number) => {
    const isShowingOriginal = showingOriginal[memberId]
    
    if (isShowingOriginal) {
      // 当前显示原始内容，切换回优化后内容
      setShowingOriginal(prev => ({ ...prev, [memberId]: false }))
      // 恢复显示当前内容
      const report = summary?.reports.find(r => r.member_id === memberId)
      if (report) {
        setContents(prev => ({ ...prev, [memberId]: report.content }))
      }
    } else {
      // 当前显示优化后内容，切换到原始内容
      const originalContent = serverOriginalContents[memberId]
      if (originalContent) {
        setShowingOriginal(prev => ({ ...prev, [memberId]: true }))
        setContents(prev => ({ ...prev, [memberId]: originalContent }))
      }
    }
  }

  // 恢复原始内容到数据库
  const handleRestoreOriginal = async (reportId: number, memberId: number) => {
    try {
      await restoreOriginal(reportId)
      // 重新加载数据
      await loadSummary(selectedDate)
    } catch (e) {
      console.error(e)
      alert('恢复失败，请重试')
    }
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
        <CardContent className="py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center justify-center gap-1 sm:gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={goToPrevDay}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-1 sm:gap-2 px-1 sm:px-3">
                <Calendar className="w-4 h-4 text-slate-500 hidden sm:block" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-auto text-sm"
                />
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={goToNextDay}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" className="h-8" onClick={goToToday}>
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
          <CardHeader className="pb-2 px-3 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">汇总预览</CardTitle>
                {originalSummaryText && (
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${showingOriginalSummary ? 'text-slate-500 border-slate-300' : 'text-purple-600 border-purple-200'}`}
                  >
                    {showingOriginalSummary ? '原始内容' : '已优化'}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* 切换原始/优化内容按钮 */}
                {originalSummaryText && (
                  <button
                    onClick={() => setShowingOriginalSummary(!showingOriginalSummary)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all ${
                      showingOriginalSummary
                        ? 'bg-purple-100 text-purple-700'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                    title={showingOriginalSummary ? '查看优化后' : '查看原始内容'}
                  >
                    <History className="w-3 h-3" />
                    <span className="hidden sm:inline">{showingOriginalSummary ? '优化后' : '原始'}</span>
                  </button>
                )}
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-8 text-xs sm:text-sm"
                  onClick={handleOptimize}
                  disabled={optimizing}
                >
                  {optimizing ? (
                    <>
                      <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 animate-spin" />
                      优化中
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      优化
                    </>
                  )}
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs sm:text-sm" onClick={handleCopy}>
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      复制
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <div className="bg-slate-50 rounded-lg p-2 sm:p-3 text-sm whitespace-pre-wrap max-h-48 sm:max-h-60 overflow-y-auto">
              {showingOriginalSummary ? originalSummaryText : (optimizedText || summary.summary_text)}
            </div>
          </CardContent>
        </Card>
      )}


      {/* 人员列表 */}
      <Card>
        <CardHeader className="px-3 sm:px-6 pb-2 sm:pb-4">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-slate-700">
            <Users className="w-4 h-4 text-slate-400" />
            填写动态
            <span className="text-xs font-normal text-slate-400">
              {summary?.date_display}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 pt-0">
          {members.length === 0 ? (
            <div className="text-center text-slate-400 py-8 text-sm">
              暂无人员名单，请先在管理员设置中导入名单
            </div>
          ) : (
            <div className={`space-y-3 transition-opacity duration-150 ${contentVisible ? 'opacity-100' : 'opacity-0'}`}>
              {members.map((member) => {
                const report = getReportForMember(member.id)
                const isSubmitted = !!report
                const content = contents[member.id] ?? ''
                const originalContent = originalContents[member.id] ?? ''
                const hasOriginal = !!serverOriginalContents[member.id]
                const isShowingOriginal = showingOriginal[member.id]
                // 当处于"查看原始内容"模式时，不算作有变化
                const hasChanged = !isShowingOriginal && content !== originalContent

                return (
                  <div
                    key={member.id}
                    className={`p-3 rounded-lg border transition-all ${
                      isSubmitted 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {/* 姓名、状态和保存按钮 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">{member.name}</span>
                        {isSubmitted && (
                          <Badge variant="success" className="text-xs">已提交</Badge>
                        )}
                        {hasOriginal && (
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${isShowingOriginal ? 'text-slate-500 border-slate-300' : 'text-purple-600 border-purple-200'}`}
                          >
                            {isShowingOriginal ? '原始内容' : '已优化'}
                          </Badge>
                        )}
                        {hasChanged && (
                          <span className="text-xs text-amber-500">未保存</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {/* 历史记录按钮 - 有原始内容时显示 */}
                        {hasOriginal && report && (
                          <button
                            onClick={() => toggleOriginalContent(member.id, report.id)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all ${
                              isShowingOriginal
                                ? 'bg-purple-100 text-purple-700'
                                : 'text-slate-500 hover:bg-slate-100'
                            }`}
                            title={isShowingOriginal ? '查看优化后' : '查看原始内容'}
                          >
                            <History className="w-3 h-3" />
                            <span className="hidden sm:inline">{isShowingOriginal ? '优化后' : '原始'}</span>
                          </button>
                        )}
                        {/* 保存按钮 - 有变化时可点击（包括清空操作） */}
                        <button
                          onClick={() => handleSubmit(member.id)}
                          disabled={!hasChanged || submitting === member.id}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all ${
                            hasChanged
                              ? 'bg-slate-900 text-white hover:bg-slate-800' 
                              : 'text-slate-300 cursor-not-allowed'
                          }`}
                        >
                          {submitting === member.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Save className="w-3 h-3" />
                          )}
                          <span>保存</span>
                        </button>
                      </div>
                    </div>
                    {/* 输入区域 - 自动扩展高度 */}
                    <textarea
                      placeholder={`输入${member.name}的今日动态...`}
                      value={content}
                      onChange={(e) => {
                        // 用户手动编辑时，退出"查看原始内容"模式
                        if (isShowingOriginal) {
                          setShowingOriginal((prev) => ({ ...prev, [member.id]: false }))
                        }
                        setContents((prev) => ({
                          ...prev,
                          [member.id]: e.target.value,
                        }))
                      }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement
                        target.style.height = 'auto'
                        target.style.height = Math.max(60, target.scrollHeight) + 'px'
                      }}
                      ref={(el) => {
                        // 初始化时设置高度
                        if (el && content) {
                          el.style.height = 'auto'
                          el.style.height = Math.max(60, el.scrollHeight) + 'px'
                        }
                      }}
                      className="text-sm w-full min-h-[60px] resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI 优化对比弹窗 */}
      {showOptimizeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />
                <h2 className="text-base sm:text-lg font-semibold">AI 优化结果</h2>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancelOptimize}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="flex-1 overflow-auto p-3 sm:p-4">
              {(() => {
                const diff = diffDailyReport(summary?.summary_text || '', editingOptimized)
                const changeCount = diff.lines.filter(l => l.hasChange).length
                return (
                  <div className="space-y-3 sm:space-y-4">
                    {/* 修改统计 */}
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-500">
                      <span>共 {changeCount} 处修改</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-red-100 border border-red-200 rounded"></span>
                        <span>删除</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-100 border border-green-200 rounded"></span>
                        <span>新增</span>
                      </span>
                    </div>
                    
                    {/* 逐行对比 */}
                    <div className="border rounded-lg overflow-hidden text-xs sm:text-sm">
                      {diff.lines.map((line, i) => (
                        <div key={i} className={i > 0 ? 'border-t border-slate-100' : ''}>
                          {line.hasChange ? (
                            <div className="space-y-1 py-1.5 sm:py-2 px-2 sm:px-3 bg-slate-50">
                              {/* 原文 - 删除的部分用红色高亮 */}
                              <div className="flex items-start gap-1 sm:gap-2">
                                <span className="text-red-500 font-medium select-none w-3 sm:w-4 flex-shrink-0">−</span>
                                <span className="flex-1 break-all">
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
                              <div className="flex items-start gap-1 sm:gap-2">
                                <span className="text-green-500 font-medium select-none w-3 sm:w-4 flex-shrink-0">+</span>
                                <span className="flex-1 break-all">
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
                            <div className="py-1 sm:py-1.5 px-2 sm:px-3 text-slate-600 break-all">
                              {line.originalLine || '\u00A0'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    {/* 可编辑区域 */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs sm:text-sm font-medium text-purple-600">编辑优化结果</span>
                        <Badge variant="outline" className="text-xs text-purple-600 border-purple-200">可修改</Badge>
                      </div>
                      <Textarea
                        value={editingOptimized}
                        onChange={(e) => setEditingOptimized(e.target.value)}
                        className="h-32 sm:h-40 text-xs sm:text-sm resize-none"
                        placeholder="你可以在这里修改优化后的内容..."
                      />
                    </div>
                  </div>
                )
              })()}
            </div>
            
            <div className="flex items-center justify-end gap-2 sm:gap-3 p-3 sm:p-4 border-t bg-slate-50">
              <Button variant="outline" size="sm" className="h-8 sm:h-9" onClick={handleCancelOptimize} disabled={accepting}>
                取消
              </Button>
              <Button size="sm" className="h-8 sm:h-9" onClick={handleAcceptOptimized} disabled={accepting}>
                {accepting ? (
                  <>
                    <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 animate-spin" />
                    保存中
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    采纳并保存
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
