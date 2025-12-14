import { useState } from 'react'
import { SummaryForm } from '@/components/SummaryForm'
import { SubmissionList } from '@/components/SubmissionList'
import { ArchivePanel } from '@/components/ArchivePanel'
import { AdminPanel } from '@/components/AdminPanel'
import { FileText, Package, PenLine, Settings } from 'lucide-react'

type Tab = 'submit' | 'list' | 'archive' | 'admin'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('submit')
  const [refreshKey, setRefreshKey] = useState(0)

  const tabs = [
    { id: 'submit' as Tab, label: '填写周小结', icon: PenLine },
    { id: 'list' as Tab, label: '提交记录', icon: FileText },
    { id: 'archive' as Tab, label: '批量归档', icon: Package },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">周小结管理平台</h1>
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
          <div className="max-w-4xl mx-auto px-4">
            <div className="flex gap-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </nav>
      )}

      <main className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === 'submit' && (
          <SummaryForm onSubmitSuccess={() => setRefreshKey(k => k + 1)} />
        )}
        {activeTab === 'list' && (
          <SubmissionList refreshKey={refreshKey} />
        )}
        {activeTab === 'archive' && (
          <ArchivePanel />
        )}
        {activeTab === 'admin' && (
          <AdminPanel />
        )}
      </main>
    </div>
  )
}

export default App
