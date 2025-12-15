import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { listDailyMembers, type DailyMember } from '@/lib/api'
import { Loader2, User } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (member: DailyMember) => void
}

export function MemberSelectDialog({ open, onOpenChange, onSelect }: Props) {
  const [members, setMembers] = useState<DailyMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      loadMembers()
    }
  }, [open])

  const loadMembers = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listDailyMembers(false) // 只获取活跃人员
      setMembers(res.data)
    } catch (e) {
      setError('加载人员列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (member: DailyMember) => {
    onSelect(member)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>选择人员</DialogTitle>
        </DialogHeader>
        
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        )}

        {error && (
          <div className="text-center py-8 text-red-500">{error}</div>
        )}

        {!loading && !error && members.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            暂无人员，请先在每日动态模块添加人员
          </div>
        )}

        {!loading && !error && members.length > 0 && (
          <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
            {members.map(member => (
              <Button
                key={member.id}
                variant="outline"
                className="h-auto py-3 flex flex-col items-center gap-1"
                onClick={() => handleSelect(member)}
              >
                <User className="w-4 h-4 text-slate-400" />
                <span className="text-sm">{member.name}</span>
              </Button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
