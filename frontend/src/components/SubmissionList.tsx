import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listSubmissions, deleteSubmission, checkSubmission, exportSubmission, type Submission } from '@/lib/api'
import { Loader2, Download, Trash2, CheckCircle, FileText } from 'lucide-react'

interface Props {
  refreshKey?: number
}

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' }> = {
  draft: { label: '草稿', variant: 'secondary' },
  submitted: { label: '已提交', variant: 'default' },
  checked: { label: '已校对', variant: 'warning' },
  archived: { label: '已归档', variant: 'success' },
}

export function SubmissionList({ refreshKey }: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<number | null>(null)

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
      link.download = `${name}_周小结_${dateRange.replace('.', '_')}.docx`
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
        {submissions.length === 0 ? (
          <div className="text-center text-slate-500 py-8">暂无记录</div>
        ) : (
          <div className="space-y-3">
            {submissions.map(sub => (
              <div key={sub.id} className="flex items-center justify-between p-4 border rounded-lg">
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
                    {sub.date_range} · {new Date(sub.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCheck(sub.id)}
                    disabled={actionLoading === sub.id}
                  >
                    {actionLoading === sub.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExport(sub.id, sub.name, sub.date_range)}
                    disabled={actionLoading === sub.id}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(sub.id)}
                    disabled={actionLoading === sub.id}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
