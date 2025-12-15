import { useState, useEffect, useRef } from 'react'
import { SummaryForm } from '@/components/SummaryForm'
import { SubmissionList } from '@/components/SubmissionList'
import { ArchivePanel } from '@/components/ArchivePanel'
import { AdminPanel } from '@/components/AdminPanel'
import { DailyPanel } from '@/components/DailyPanel'
import { FileText, Package, PenLine, Settings, CalendarDays } from 'lucide-react'

type Tab = 'submit' | 'list' | 'archive' | 'daily' | 'admin'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('daily')
  const [displayTab, setDisplayTab] = useState<Tab>('daily')
  const [isVisible, setIsVisible] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const isFirstRender = useRef(true)

  // Tab 切换时的淡入淡出效果
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    
    // 先淡出
    setIsVisible(false)
    
    // 等淡出完成后切换内容并淡入
    const timer = setTimeout(() => {
      setDisplayTab(activeTab)
      setIsVisible(true)
    }, 150)
    
    return () => clearTimeout(timer)
  }, [activeTab])

  const tabs = [
    { id: 'daily' as Tab, label: '每日动态', shortLabel: '动态', icon: CalendarDays },
    { id: 'submit' as Tab, label: '填写周小结', shortLabel: '周报', icon: PenLine },
    { id: 'list' as Tab, label: '提交记录', shortLabel: '记录', icon: FileText },
    { id: 'archive' as Tab, label: '批量归档', shortLabel: '归档', icon: Package },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 
            className="text-xl font-bold cursor-pointer hover:text-slate-600 transition-colors"
            onClick={() => setActiveTab('submit')}
          >
            动态管理平台
          </h1>
          <button
            onClick={() => setActiveTab('admin')}
            className={`p-2 rounded-md transition-colors ${
              activeTab === 'admin' 
                ? 'bg-slate-100 text-slate-900' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
            title="管理员设置"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {activeTab !== 'admin' && (
        <nav className="bg-white border-b">
          <div className="max-w-4xl mx-auto px-2 sm:px-4">
            <div className="flex">
              {tabs.map(tab => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1 sm:gap-2 px-1.5 sm:px-4 py-3 font-medium border-b-2 transition-all ${
                      isActive
                        ? 'border-slate-900 text-slate-900'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <tab.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? '' : 'opacity-70'}`} />
                    {/* 移动端：选中显示完整标签，未选中显示缩写 */}
                    <span className={`sm:hidden whitespace-nowrap ${
                      isActive ? 'text-sm' : 'text-xs opacity-70'
                    }`}>
                      {isActive ? tab.label : tab.shortLabel}
                    </span>
                    {/* 桌面端：始终显示完整标签 */}
                    <span className={`hidden sm:inline text-sm whitespace-nowrap ${
                      isActive ? '' : 'opacity-70'
                    }`}>
                      {tab.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </nav>
      )}

      <main className="max-w-4xl mx-auto px-2 sm:px-4 py-4 sm:py-6">
        <div className={`transition-opacity duration-150 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          {/* 使用 hidden 而非条件渲染，保持组件状态 */}
          <div className={displayTab === 'submit' ? '' : 'hidden'}>
            <SummaryForm onSubmitSuccess={() => setRefreshKey(k => k + 1)} />
          </div>
          <div className={displayTab === 'list' ? '' : 'hidden'}>
            <SubmissionList refreshKey={refreshKey} />
          </div>
          <div className={displayTab === 'archive' ? '' : 'hidden'}>
            <ArchivePanel />
          </div>
          <div className={displayTab === 'daily' ? '' : 'hidden'}>
            <DailyPanel />
          </div>
          <div className={displayTab === 'admin' ? '' : 'hidden'}>
            <AdminPanel />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
