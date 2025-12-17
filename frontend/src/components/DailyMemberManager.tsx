import { useState, useEffect, useRef } from 'react'
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
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

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

  // 永久删除人员
  const handleDelete = async (id: number) => {
    if (!confirm('确定永久删除该人员？此操作将同时删除该人员的所有动态记录，且不可恢复！')) return
    try {
      await deleteDailyMember(id, true)
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

  // 拖拽排序
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDragEnd = async () => {
    if (draggedIndex === null || dragOverIndex === null || draggedIndex === dragOverIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    // 重新排序
    const newMembers = [...members]
    const [draggedMember] = newMembers.splice(draggedIndex, 1)
    newMembers.splice(dragOverIndex, 0, draggedMember)

    // 先更新本地状态
    setMembers(newMembers)
    setDraggedIndex(null)
    setDragOverIndex(null)

    // 批量更新 sort_order
    try {
      for (let i = 0; i < newMembers.length; i++) {
        if (newMembers[i].sort_order !== i) {
          await updateDailyMember(newMembers[i].id, { sort_order: i })
        }
      }
    } catch (e) {
      console.error(e)
      // 出错时重新加载
      await loadMembers()
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
            placeholder="输入人员全名，每行一个或用逗号分隔&#10;示例：&#10;陈志明&#10;赖锋军&#10;彭鸿&#10;谢立龙&#10;廖颖娴&#10;张智超&#10;宋兵兵&#10;叶显旺&#10;赖春英&#10;欧桂梅&#10;凌声明"
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
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                    member.is_active ? 'bg-white' : 'bg-slate-50 opacity-60'
                  } ${draggedIndex === index ? 'opacity-50' : ''} ${
                    dragOverIndex === index && draggedIndex !== index ? 'border-blue-400 border-2' : ''
                  }`}
                >
                  {/* 拖拽手柄 */}
                  <GripVertical className="w-4 h-4 text-slate-300 cursor-grab active:cursor-grabbing" />
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
