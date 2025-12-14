import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { createAdminApi, type RuleConfig, type PromptConfig } from '@/lib/api'
import { Loader2, Save, RotateCcw, LogIn, LogOut, Settings, FileText } from 'lucide-react'

export function AdminPanel() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'rules' | 'prompt'>('rules')

  const [rules, setRules] = useState<RuleConfig>({
    check_number_format: true,
    check_extra_spaces: true,
    check_english_punctuation: true,
    check_slash_to_semicolon: true,
    check_consecutive_punctuation: true,
    check_ending_punctuation: true,
    check_english_brackets: true,
  })

  const [prompt, setPrompt] = useState<PromptConfig>({
    typo_prompt: '',
    punctuation_prompt: '',
    check_typo: true,
    check_punctuation_semantic: true,
  })

  const adminApi = isLoggedIn ? createAdminApi(username, password) : null

  const handleLogin = async () => {
    setLoading(true)
    setLoginError('')
    try {
      const api = createAdminApi(username, password)
      await api.verify()
      setIsLoggedIn(true)
      loadConfig(api)
    } catch {
      setLoginError('用户名或密码错误')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
    setUsername('')
    setPassword('')
  }

  const loadConfig = async (api = adminApi) => {
    if (!api) return
    setLoading(true)
    try {
      const [rulesRes, promptRes] = await Promise.all([
        api.getRules(),
        api.getPrompt()
      ])
      setRules(rulesRes.data)
      setPrompt(promptRes.data)
    } catch (e) {
      setMessage({ type: 'error', text: '加载配置失败' })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveRules = async () => {
    if (!adminApi) return
    setSaving(true)
    try {
      await adminApi.updateRules(rules)
      setMessage({ type: 'success', text: '规则配置已保存' })
    } catch {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleSavePrompt = async () => {
    if (!adminApi) return
    setSaving(true)
    try {
      await adminApi.updatePrompt(prompt)
      setMessage({ type: 'success', text: 'Prompt 配置已保存' })
    } catch {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!adminApi) return
    if (!confirm('确定要重置所有配置为默认值吗？')) return
    setLoading(true)
    try {
      await adminApi.resetConfig()
      await loadConfig()
      setMessage({ type: 'success', text: '已重置为默认配置' })
    } catch {
      setMessage({ type: 'error', text: '重置失败' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [message])

  // 登录界面
  if (!isLoggedIn) {
    return (
      <Card className="max-w-md mx-auto mt-20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            管理员登录
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>用户名</Label>
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="请输入用户名"
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <div>
            <Label>密码</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入密码"
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>
          {loginError && (
            <p className="text-sm text-red-500">{loginError}</p>
          )}
          <Button onClick={handleLogin} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
            登录
          </Button>
        </CardContent>
      </Card>
    )
  }

  const ruleLabels: Record<keyof RuleConfig, string> = {
    check_number_format: '序号格式检查（必须是 1. 2. 3. 格式）',
    check_extra_spaces: '多余空格检查（中文间不应有空格）',
    check_english_punctuation: '英文标点检查（逗号、分号、冒号、问号、感叹号）',
    check_slash_to_semicolon: '斜杠转分号检查（中文语境中 / 应为 ；）',
    check_consecutive_punctuation: '连续重复标点检查（如 。。 应为 。）',
    check_ending_punctuation: '句末标点检查（每条必须以句号结尾，无句号则提醒）',
    check_english_brackets: '英文括号检查（括号内有中文时转中文括号）',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Settings className="w-5 h-5" />
          系统配置
        </h2>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" />
          退出登录
        </Button>
      </div>

      {message && (
        <div className={`p-3 rounded-md text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'rules' 
              ? 'border-slate-900 text-slate-900' 
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Settings className="w-4 h-4 inline mr-2" />
          规则检查配置
        </button>
        <button
          onClick={() => setActiveTab('prompt')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'prompt' 
              ? 'border-slate-900 text-slate-900' 
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText className="w-4 h-4 inline mr-2" />
          AI Prompt 配置
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : activeTab === 'rules' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">规则检查配置</CardTitle>
            <p className="text-sm text-slate-500">启用或禁用各项规则检查</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {(Object.keys(ruleLabels) as Array<keyof RuleConfig>).map(key => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <Label htmlFor={key} className="cursor-pointer">{ruleLabels[key]}</Label>
                <Switch
                  id={key}
                  checked={rules[key]}
                  onCheckedChange={checked => setRules(prev => ({ ...prev, [key]: checked }))}
                />
              </div>
            ))}
            <div className="flex gap-3 pt-4">
              <Button onClick={handleSaveRules} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                保存配置
              </Button>
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="w-4 h-4 mr-2" />
                重置默认
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* 开关配置 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI 检查开关</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>启用错别字检查（AI）</Label>
                <Switch
                  checked={prompt.check_typo}
                  onCheckedChange={checked => setPrompt(prev => ({ ...prev, check_typo: checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>启用标点语义检查（AI）</Label>
                <Switch
                  checked={prompt.check_punctuation_semantic}
                  onCheckedChange={checked => setPrompt(prev => ({ ...prev, check_punctuation_semantic: checked }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* 错字检查器 Prompt */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">错字检查器 Prompt</CardTitle>
              <p className="text-xs text-slate-500">定义 AI 错字检查的行为规则</p>
            </CardHeader>
            <CardContent>
              <Textarea
                value={prompt.typo_prompt}
                onChange={e => setPrompt(prev => ({ ...prev, typo_prompt: e.target.value }))}
                rows={15}
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>

          {/* 标点检查器 Prompt */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">标点检查器 Prompt</CardTitle>
              <p className="text-xs text-slate-500">定义 AI 标点语义检查的行为规则</p>
            </CardHeader>
            <CardContent>
              <Textarea
                value={prompt.punctuation_prompt}
                onChange={e => setPrompt(prev => ({ ...prev, punctuation_prompt: e.target.value }))}
                rows={15}
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>

          {/* 保存按钮 */}
          <div className="flex gap-3">
            <Button onClick={handleSavePrompt} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              保存配置
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              重置默认
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
