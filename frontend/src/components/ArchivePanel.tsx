import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listSubmissions, createArchive, getManifest, type Submission, type ArchiveConfig } from '@/lib/api'
import { Loader2, Package, FileText, AlertTriangle, Calendar } from 'lucide-react'

// 预设命名模板
const NAMING_TEMPLATES = [
  { label: '序号_姓名_周小结_日期范围', value: '{序号}_{姓名}_周小结_{日期范围}' },
  { label: '姓名周小结(日期范围)', value: '{姓名}周小结({日期范围})' },
  { label: '姓名_周小结_日期范围', value: '{姓名}_周小结_{日期范围}' },
  { label: '序号_姓名_日期范围', value: '{序号}_{姓名}_{日期范围}' },
]

interface DateGroup {
  dateRange: string
  submissions: Submission[]
  checkedCount: number
  uncheckedCount: number
}

export function ArchivePanel() {
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [archiving, setArchiving] = useState(false)
  const [manifest, setManifest] = useState<string | null>(null)
  const [config, setConfig] = useState<Omit<ArchiveConfig, 'submission_ids'>>({
    naming_template: '{序号}_{姓名}_周小结_{日期范围}',
    start_number: 1,
    number_padding: 2,
  })

  // 按日期范围分组
  const groupedByDate = useMemo(() => {
    const groups: Record<string, DateGroup> = {}
    
    allSubmissions.forEach(sub => {
      if (!groups[sub.date_range]) {
        groups[sub.date_range] = {
          dateRange: sub.date_range,
          submissions: [],
          checkedCount: 0,
          uncheckedCount: 0,
        }
      }
      groups[sub.date_range].submissions.push(sub)
      // checked 和 archived 都算已校验，可以打包
      if (sub.status === 'checked' || sub.status === 'archived') {
        groups[sub.date_range].checkedCount++
      } else {
        groups[sub.date_range].uncheckedCount++
      }
    })
    
    // 按日期排序（最新的在前）
    return Object.values(groups).sort((a, b) => {
      const parseDate = (range: string) => {
        const match = range.match(/(\d+)\.(\d+)/)
        if (match) return parseInt(match[1]) * 100 + parseInt(match[2])
        return 0
      }
      return parseDate(b.dateRange) - parseDate(a.dateRange)
    })
  }, [allSubmissions])

  // 获取选中分组的可打包记录（已校验或已归档）
  const selectedSubmissions = useMemo(() => {
    if (!selectedGroup) return []
    const group = groupedByDate.find(g => g.dateRange === selectedGroup)
    return group ? group.submissions.filter(s => s.status === 'checked' || s.status === 'archived') : []
  }, [selectedGroup, groupedByDate])

  // 获取选中分组的未校验记录（不包括已归档）
  const uncheckedInGroup = useMemo(() => {
    if (!selectedGroup) return []
    const group = groupedByDate.find(g => g.dateRange === selectedGroup)
    return group ? group.submissions.filter(s => s.status !== 'checked' && s.status !== 'archived') : []
  }, [selectedGroup, groupedByDate])

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 获取所有提交记录（不限状态）
        const res = await listSubmissions()
        setAllSubmissions(res.data)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handlePreview = async () => {
    if (selectedSubmissions.length === 0) return
    setArchiving(true)
    try {
      const res = await getManifest({ ...config, submission_ids: selectedSubmissions.map(s => s.id) })
      setManifest(res.data.manifest_text)
    } finally {
      setArchiving(false)
    }
  }

  const handleArchive = async () => {
    if (selectedSubmissions.length === 0) return
    setArchiving(true)
    try {
      const res = await createArchive({ ...config, submission_ids: selectedSubmissions.map(s => s.id) })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = `周小结归档_${selectedGroup}.zip`
      link.click()
      window.URL.revokeObjectURL(url)
    } finally {
      setArchiving(false)
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
          <Package className="w-5 h-5" />
          批量归档
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-4">
          <div className="sm:col-span-3 md:col-span-1">
            <label className="text-sm font-medium mb-1 block">命名模板</label>
            <select
              value={config.naming_template}
              onChange={e => setConfig(prev => ({ ...prev, naming_template: e.target.value }))}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              {NAMING_TEMPLATES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:contents">
            <div>
              <label className="text-sm font-medium mb-1 block">起始序号</label>
              <Input
                type="number"
                value={config.start_number}
                onChange={e => setConfig(prev => ({ ...prev, start_number: parseInt(e.target.value) || 1 }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">序号位数</label>
              <Input
                type="number"
                value={config.number_padding}
                onChange={e => setConfig(prev => ({ ...prev, number_padding: parseInt(e.target.value) || 2 }))}
              />
            </div>
          </div>
        </div>

        {/* 时间组选择 */}
        <div className="border rounded-lg">
          <div className="p-3 border-b bg-slate-50">
            <span className="text-sm font-medium">选择要归档的周期</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {groupedByDate.length === 0 ? (
              <div className="text-center text-slate-500 py-8">暂无提交记录</div>
            ) : (
              groupedByDate.map(group => (
                <label
                  key={group.dateRange}
                  className={`flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-slate-50 cursor-pointer gap-2 ${
                    selectedGroup === group.dateRange ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <input
                      type="radio"
                      name="dateGroup"
                      checked={selectedGroup === group.dateRange}
                      onChange={() => {
                        setSelectedGroup(group.dateRange)
                        setManifest(null)
                      }}
                      className="w-4 h-4 flex-shrink-0"
                    />
                    <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0 hidden sm:block" />
                    <span className="font-medium text-sm sm:text-base">{group.dateRange}</span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                    {/* 移动端：简短标签 */}
                    <span className="sm:hidden inline-flex items-center rounded-full bg-green-500 text-white text-[10px] font-medium px-1.5 py-0 leading-4">{group.checkedCount} 已校</span>
                    {group.uncheckedCount > 0 && (
                      <span className="sm:hidden inline-flex items-center rounded-full bg-yellow-500 text-white text-[10px] font-medium px-1.5 py-0 leading-4">{group.uncheckedCount} 未校</span>
                    )}
                    {/* PC端：完整标签 */}
                    <Badge variant="success" className="hidden sm:inline-flex">{group.checkedCount} 已校验</Badge>
                    {group.uncheckedCount > 0 && (
                      <Badge variant="warning" className="hidden sm:inline-flex">{group.uncheckedCount} 未校验</Badge>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* 未校验提示 */}
        {selectedGroup && uncheckedInGroup.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800">
                  该周期有 {uncheckedInGroup.length} 份未校验的记录
                </p>
                <p className="text-sm text-yellow-700 mt-1">
                  未校验的记录不会被归档：{uncheckedInGroup.map(s => s.name).join('、')}
                </p>
                <p className="text-xs text-yellow-600 mt-2">
                  请先在"提交记录"页面完成校验后再归档
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 已选择的记录预览 */}
        {selectedGroup && selectedSubmissions.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm font-medium mb-2">将归档 {selectedSubmissions.length} 份记录：</p>
            <div className="flex flex-wrap gap-2">
              {selectedSubmissions.map(sub => (
                <Badge key={sub.id} variant="secondary">{sub.name}</Badge>
              ))}
            </div>
          </div>
        )}

        {manifest && (
          <div className="bg-slate-50 p-3 sm:p-4 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium text-sm sm:text-base">文件清单预览</span>
            </div>
            {/* 桌面端（md 以上）：原始格式 */}
            <div className="hidden md:block overflow-x-auto">
              <pre className="text-sm whitespace-pre font-mono">{manifest}</pre>
            </div>
            {/* 移动端和平板（md 以下）：简化列表格式 */}
            <div className="md:hidden space-y-2">
              <div className="text-xs text-slate-500 border-b border-slate-200 pb-2">
                {manifest.split('\n').slice(0, 2).join(' · ')}
              </div>
              <div className="space-y-1.5">
                {manifest.split('\n').filter(line => /^\d+\s+/.test(line.trim())).map((line, idx) => {
                  const parts = line.trim().split(/\s+/)
                  const seq = parts[0]
                  const name = parts[parts.length - 1]
                  const filename = parts.slice(1, -1).join(' ')
                  return (
                    <div key={idx} className="text-xs bg-white rounded p-2 border border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-mono">{seq}</span>
                        <span className="font-medium">{name}</span>
                      </div>
                      <div className="text-slate-500 mt-1 break-all">{filename}</div>
                    </div>
                  )
                })}
              </div>
              <div className="text-xs text-slate-500 border-t border-slate-200 pt-2">
                共计：{manifest.split('\n').filter(line => /^\d+\s+/.test(line.trim())).length} 份
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Button variant="outline" onClick={handlePreview} disabled={selectedSubmissions.length === 0 || archiving} className="w-full sm:w-auto">
            <FileText className="w-4 h-4 mr-2 sm:hidden" />
            预览清单
          </Button>
          <Button onClick={handleArchive} disabled={selectedSubmissions.length === 0 || archiving} className="w-full sm:w-auto">
            {archiving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Package className="w-4 h-4 mr-2" />}
            <span className="hidden sm:inline">打包下载（{selectedSubmissions.length} 份）</span>
            <span className="sm:hidden">下载 {selectedSubmissions.length} 份</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
