import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listSubmissions, deleteSubmission, checkSubmission, exportSubmission, type Submission } from '@/lib/api'
import { Loader2, Download, Trash2, CheckCircle, FileText, ChevronDown, ChevronRight, Calendar, Eye } from 'lucide-react'
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

interface GroupedSubmissions {
  dateRange: string
  displayRange: string  // 带年份的显示文本
  submissions: Submission[]
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

export function SubmissionList({ refreshKey }: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

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
    } finally {
      setActionLoading(null)
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
        {groupedSubmissions.length === 0 ? (
          <div className="text-center text-slate-500 py-8">暂无记录</div>
        ) : (
          <div className="space-y-4">
            {groupedSubmissions.map((group, index) => {
              const isExpanded = expandedGroups.has(group.dateRange)
              return (
                <div key={group.dateRange} className="border rounded-lg overflow-hidden">
                  {/* 分组标题 */}
                  <button
                    onClick={() => toggleGroup(group.dateRange)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
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
                    </div>
                  </button>
                  
                  {/* 分组内容 */}
                  {isExpanded && (
                    <div className="divide-y">
                      {group.submissions.map(sub => (
                        <div key={sub.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
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
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedSubmission(sub)
                                setDetailOpen(true)
                              }}
                              title="查看详情"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCheck(sub.id)}
                              disabled={actionLoading === sub.id}
                              title="校对"
                            >
                              {actionLoading === sub.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleExport(sub.id, sub.name, sub.date_range)}
                              disabled={actionLoading === sub.id}
                              title="导出"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(sub.id)}
                              disabled={actionLoading === sub.id}
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
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
