import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  listDailyMembers,
  importDailyMembers,
  updateDailyMember,
  deleteDailyMember,
  type DailyMember,
} from '@/lib/api'
import { Users, Upload, Loader2, Trash2, GripVertical, Save } from 'lucide-react'

export function DailyMemberManager() {
  const [members, setMembers] = useState<DailyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  const loadMembers = async () => {
    setLoading(true)
    try {
      const res = await listDailyMembers(true) // 包含已禁用的
      setMembers(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [])

  // 批量导入
  const handleImport = async () => {
    const names = importText
      .split(/[\n,，、]/)
      .map((n) => n.trim())
      .filter((n) => n)
    if (names.length === 0) return

    setImporting(true)
    try {
      await importDailyMembers(names)
      setImportText('')
      await loadMembers()
    } catch (e) {
      console.error(e)
    } finally {
      setImporting(false)
    }
  }

  // 编辑人员
  const handleEdit = (member: DailyMember) => {
    setEditingId(member.id)
    setEditName(member.name)
  }

  const handleSave = async (id: number) => {
    if (!editName.trim()) return
    try {
      await updateDailyMember(id, { name: editName.trim() })
      setEditingId(null)
      await loadMembers()
    } catch (e) {
      console.error(e)
    }
  }

  // 删除/禁用人员
  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该人员？')) return
    try {
      await deleteDailyMember(id)
      await loadMembers()
    } catch (e) {
      console.error(e)
    }
  }

  // 切换启用状态
  const handleToggleActive = async (member: DailyMember) => {
    try {
      await updateDailyMember(member.id, { is_active: !member.is_active })
      await loadMembers()
    } catch (e) {
      console.error(e)
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
    <div className="space-y-4">
      {/* 批量导入 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="w-4 h-4" />
            批量导入人员
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="输入人员名单，每行一个或用逗号分隔&#10;示例：&#10;志明同志&#10;锋军同志&#10;彭鸿同志&#10;立龙同志&#10;颖娴同志&#10;智超同志&#10;兵兵同志&#10;显旺同志&#10;春英同志&#10;桂梅同志&#10;声明同志"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={6}
            className="mb-3"
          />
          <Button onClick={handleImport} disabled={importing || !importText.trim()}>
            {importing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            导入
          </Button>
        </CardContent>
      </Card>

      {/* 人员列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4" />
            人员名单
            <Badge variant="secondary">{members.filter((m) => m.is_active).length} 人</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-center text-slate-500 py-4">暂无人员，请先导入名单</div>
          ) : (
            <div className="space-y-2">
              {members.map((member, index) => (
                <div
                  key={member.id}
                  className={`flex items-center gap-2 p-2 rounded-lg border ${
                    member.is_active ? 'bg-white' : 'bg-slate-50 opacity-60'
                  }`}
                >
                  <GripVertical className="w-4 h-4 text-slate-300" />
                  <span className="text-sm text-slate-500 w-6">{index + 1}.</span>

                  {editingId === member.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 h-8"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleSave(member.id)}
                      />
                      <Button size="sm" onClick={() => handleSave(member.id)}>
                        <Save className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        取消
                      </Button>
                    </>
                  ) : (
                    <>
                      <span
                        className="flex-1 cursor-pointer hover:text-blue-600"
                        onClick={() => handleEdit(member)}
                      >
                        {member.name}
                      </span>
                      {!member.is_active && (
                        <Badge variant="secondary" className="text-xs">
                          已禁用
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleActive(member)}
                        className="text-xs"
                      >
                        {member.is_active ? '禁用' : '启用'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => handleDelete(member.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
