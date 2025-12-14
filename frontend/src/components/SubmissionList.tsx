import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listSubmissions, deleteSubmission, checkSubmission, exportSubmission, batchCheckSubmissions, type Submission } from '@/lib/api'
import { Loader2, Download, Trash2, CheckCircle, FileText, ChevronDown, ChevronRight, Calendar, Eye, MoreHorizontal } from 'lucide-react'
import { SubmissionDetail } from './SubmissionDetail'

interface Props {
  refreshKey?: number
}

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' }> = {
  draft: { label: '草稿', variant: 'secondary' },
  submitted: { label: '已提交', variant: 'default' },
  checked: { label: '已校对', variant: 'warning' },
  archived: { label: '已归档', variant: 'success' },
}



// 根据日期范围和提交时间推断完整的年份日期
function getDisplayDateRange(dateRange: string, createdAt: string): string {
  // dateRange 格式如 "12.7-12.13" 或 "12.28-1.3"
  const match = dateRange.match(/(\d+)\.(\d+)-(\d+)\.(\d+)/)
  if (!match) return dateRange
  
  const [, startMonth, startDay, endMonth, endDay] = match.map(Number)
  const submitDate = new Date(createdAt)
  const submitYear = submitDate.getFullYear()
  
  // 判断年份：如果结束月份小于开始月份，说明跨年
  let startYear = submitYear
  let endYear = submitYear
  
  if (endMonth < startMonth) {
    // 跨年情况，如 12.28-1.3
    // 根据提交时间判断：如果提交时间在1月，则开始年份是上一年
    if (submitDate.getMonth() + 1 <= 2) {
      startYear = submitYear - 1
    } else {
      endYear = submitYear + 1
    }
  }
  
  return `${startYear}.${startMonth}.${startDay}-${endYear}.${endMonth}.${endDay}`
}

// 单条记录组件，处理移动端按钮折叠
function SubmissionItem({ 
  submission: sub, 
  actionLoading, 
  onView, 
  onCheck, 
  onExport, 
  onDelete 
}: { 
  submission: Submission
  actionLoading: number | null
  onView: () => void
  onCheck: () => void
  onExport: () => void
  onDelete: () => void
}) {
  const [actionsExpanded, setActionsExpanded] = useState(false)
  
  return (
    <div className="p-4 hover:bg-slate-50">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{sub.name}</span>
            <Badge variant={statusMap[sub.status]?.variant || 'default'}>
              {statusMap[sub.status]?.label || sub.status}
            </Badge>
            {sub.check_result && sub.check_result.total_issues > 0 && (
              <Badge variant="warning">{sub.check_result.total_issues} 个问题</Badge>
            )}
          </div>
          <div className="text-sm text-slate-500 mt-1">
            {new Date(sub.created_at).toLocaleString()}
          </div>
        </div>
        
        {/* 桌面端：直接显示按钮 */}
        <div className="hidden sm:flex gap-2">
          <Button size="sm" variant="outline" onClick={onView} title="查看详情">
            <Eye className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onCheck} disabled={actionLoading === sub.id} title="校对">
            {actionLoading === sub.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          </Button>
          <Button size="sm" variant="outline" onClick={onExport} disabled={actionLoading === sub.id} title="导出">
            <Download className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={actionLoading === sub.id} title="删除">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
        
        {/* 移动端：折叠按钮 */}
        <button 
          className="sm:hidden h-7 w-7 p-0 flex items-center justify-center rounded-md hover:bg-slate-100 transition-colors"
          onClick={() => setActionsExpanded(!actionsExpanded)}
        >
          <MoreHorizontal className="w-4 h-4 text-slate-500" />
        </button>
      </div>
      
      {/* 移动端展开的操作按钮 */}
      {actionsExpanded && (
        <div className="flex gap-2 mt-3 pt-3 border-t sm:hidden">
          <Button size="sm" variant="outline" onClick={onView} className="flex-1">
            <Eye className="w-4 h-4 mr-1" />
            查看
          </Button>
          <Button size="sm" variant="outline" onClick={onExport} disabled={actionLoading === sub.id} className="flex-1">
            <Download className="w-4 h-4 mr-1" />
            导出
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={actionLoading === sub.id} className="flex-1">
            <Trash2 className="w-4 h-4 mr-1" />
            删除
          </Button>
        </div>
      )}
    </div>
  )
}

export function SubmissionList({ refreshKey }: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [batchCheckingGroup, setBatchCheckingGroup] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 按日期范围分组，并计算带年份的显示文本
  const groupedSubmissions = useMemo(() => {
    const groups: Record<string, { submissions: Submission[], displayRange: string }> = {}
    
    submissions.forEach(sub => {
      if (!groups[sub.date_range]) {
        // 使用第一条记录的提交时间来推断年份
        const displayRange = getDisplayDateRange(sub.date_range, sub.created_at)
        groups[sub.date_range] = { submissions: [], displayRange }
      }
      groups[sub.date_range].submissions.push(sub)
    })
    
    // 转换为数组并按日期排序（最新的在前）
    return Object.entries(groups)
      .map(([dateRange, { submissions: subs, displayRange }]) => ({ 
        dateRange, 
        displayRange,
        submissions: subs 
      }))
      .sort((a, b) => {
        // 使用 displayRange 进行排序（带年份更准确）
        const parseDate = (range: string) => {
          const match = range.match(/(\d+)\.(\d+)\.(\d+)/)
          if (match) {
            return parseInt(match[1]) * 10000 + parseInt(match[2]) * 100 + parseInt(match[3])
          }
          return 0
        }
        return parseDate(b.displayRange) - parseDate(a.displayRange)
      })
  }, [submissions])

  // 初始化展开状态：第一个分组默认展开
  useEffect(() => {
    if (groupedSubmissions.length > 0 && expandedGroups.size === 0) {
      setExpandedGroups(new Set([groupedSubmissions[0].dateRange]))
    }
  }, [groupedSubmissions])

  const toggleGroup = (dateRange: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(dateRange)) {
        next.delete(dateRange)
      } else {
        next.add(dateRange)
      }
      return next
    })
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await listSubmissions()
      setSubmissions(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [refreshKey])

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除？')) return
    setActionLoading(id)
    try {
      await deleteSubmission(id)
      fetchData()
    } finally {
      setActionLoading(null)
    }
  }

  const handleCheck = async (id: number) => {
    setActionLoading(id)
    try {
      await checkSubmission(id)
      fetchData()
    } finally {
      setActionLoading(null)
    }
  }

  const handleExport = async (id: number, name: string, dateRange: string) => {
    setActionLoading(id)
    try {
      const res = await exportSubmission(id)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = `${name}周小结(${dateRange}).docx`
      link.click()
      window.URL.revokeObjectURL(url)
      // 导出后刷新列表以更新状态
      fetchData()
    } finally {
      setActionLoading(null)
    }
  }

  const handleBatchCheck = async (group: { dateRange: string, submissions: Submission[] }) => {
    setBatchCheckingGroup(group.dateRange)
    setMessage(null)
    try {
      const ids = group.submissions.map(s => s.id)
      const res = await batchCheckSubmissions(ids)
      const { success, failed } = res.data
      if (failed > 0) {
        setMessage({ type: 'error', text: `校验完成：${success} 份成功，${failed} 份失败` })
      } else {
        setMessage({ type: 'success', text: `校验完成：${success} 份全部成功 ✓` })
      }
      fetchData()
      // 3秒后自动清除消息
      setTimeout(() => setMessage(null), 3000)
    } catch (e) {
      setMessage({ type: 'error', text: '批量校验失败，请重试' })
    } finally {
      setBatchCheckingGroup(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          提交记录
        </CardTitle>
      </CardHeader>
      <CardContent>
        {message && (
          <div className={`mb-4 p-3 rounded-md text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {message.text}
          </div>
        )}
        {groupedSubmissions.length === 0 ? (
          <div className="text-center text-slate-500 py-8">暂无记录</div>
        ) : (
          <div className="space-y-4">
            {groupedSubmissions.map((group) => {
              const isExpanded = expandedGroups.has(group.dateRange)
              return (
                <div key={group.dateRange} className="border rounded-lg overflow-hidden">
                  {/* 分组标题 */}
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
                    <button
                      onClick={() => toggleGroup(group.dateRange)}
                      className="flex items-center gap-2 hover:bg-slate-100 -ml-2 px-2 py-1 rounded transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      )}
                      <Calendar className="w-4 h-4 text-slate-500" />
                      <span className="font-medium">{group.displayRange}</span>
                      <Badge variant="secondary" className="ml-2">
                        {group.submissions.length} 人
                      </Badge>
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleBatchCheck(group)
                      }}
                      disabled={batchCheckingGroup === group.dateRange}
                      title="一键校验该分组所有记录"
                    >
                      {batchCheckingGroup === group.dateRange ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4 mr-1" />
                      )}
                      一键校验
                    </Button>
                  </div>
                  
                  {/* 分组内容 */}
                  {isExpanded && (
                    <div className="divide-y">
                      {group.submissions.map(sub => (
                        <SubmissionItem
                          key={sub.id}
                          submission={sub}
                          actionLoading={actionLoading}
                          onView={() => {
                            setSelectedSubmission(sub)
                            setDetailOpen(true)
                          }}
                          onCheck={() => handleCheck(sub.id)}
                          onExport={() => handleExport(sub.id, sub.name, sub.date_range)}
                          onDelete={() => handleDelete(sub.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      {/* 详情面板 */}
      <SubmissionDetail
        submission={selectedSubmission}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdate={async (updatedSubmission?: Submission) => {
          // 如果传入了更新后的数据，直接使用
          if (updatedSubmission) {
            setSelectedSubmission(updatedSubmission)
          }
          // 刷新列表
          await fetchData()
        }}
      />
    </Card>
  )
}
