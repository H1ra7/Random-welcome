import { useEffect, useMemo, useState } from 'react'

import {
  Button,
  Card,
  Chip,
  Label,
  Separator,
  Spinner,
  TextArea,
  TextField,
  toast
} from '@heroui/react'
import { FileText, Plus, Save, Trash2 } from 'lucide-react'

import { saveContent } from '../api/randomWelcome'
import PageHeader from '../components/common/PageHeader'
import ProfileManager from '../components/common/ProfileManager'
import ProfileSelect from '../components/common/ProfileSelect'
import SectionCard from '../components/common/SectionCard'
import { EmptyHint } from '../components/common/StatusPanel'
import { useConfig } from '../config/ConfigContext'

const PLACEHOLDERS: Array<{ token: string; description: string }> = [
  { token: '{location}', description: '词库里的地点' },
  { token: '{role}', description: '词库里的角色' },
  { token: '{food}', description: '词库里的食物' },
  { token: '{bot_name}', description: '机器人名字' },
  { token: '{at_user}', description: '@新成员（关闭 @新人 时会被去掉）' }
]

/**
 * 模板页：内置模板只读，自定义模板可增删改，支持占位符。
 */
const TemplatesPage = () => {
  const { state, applyState } = useConfig()
  const [profile, setProfile] = useState(() => state?.setting.default_profile ?? '')
  const [draft, setDraft] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const content = useMemo(() => {
    if (!state) return undefined
    return state.contents.find((item) => item.name === profile) ?? state.contents[0]
  }, [state, profile])

  useEffect(() => {
    if (!content) return
    if (content.name !== profile) setProfile(content.name)
    setDraft([...content.templatesCustom])
    setFormError('')
  }, [content, profile])

  if (!state || !content) return null

  const limits = state.limits
  const dirty = JSON.stringify(draft) !== JSON.stringify(content.templatesCustom)

  const updateTemplate = (index: number, value: string) => {
    setDraft((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)))
  }

  const removeTemplate = (index: number) => {
    setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const addTemplate = () => {
    setDraft((current) => [...current, ''])
  }

  const handleSave = async () => {
    const cleaned: string[] = []
    const errors: string[] = []

    draft.forEach((item, index) => {
      const text = item.trim()
      if (!text) {
        errors.push(`第 ${index + 1} 条模板是空的`)
        return
      }
      if (text.length > limits.templateLength) {
        errors.push(`第 ${index + 1} 条模板超过 ${limits.templateLength} 字`)
        return
      }
      cleaned.push(text)
    })

    if (errors.length > 0) {
      setFormError(errors.join('；'))
      toast.warning('模板还有问题', { description: errors[0] })
      return
    }

    setFormError('')
    setSaving(true)
    try {
      const result = await saveContent(content.name, { templates: cleaned })
      applyState(result.state)
      toast.success(result.message, { description: `风格「${content.name}」` })
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : '未知错误'
      setFormError(message)
      toast.danger('保存失败', { description: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="模板"
        description="模板决定欢迎词的句式；占位符会在发送时从词库里随机取值替换。"
        actions={
          <>
            {dirty ? <Chip color="warning" size="sm" variant="soft">有未保存改动</Chip> : null}
            <Button isPending={saving} variant="primary" onPress={handleSave}>
              {saving ? <Spinner color="current" size="sm" aria-label="保存中" /> : <Save className="size-4" aria-hidden="true" />}
              <span>保存模板</span>
            </Button>
          </>
        }
      />

      <SectionCard
        title="选择风格"
        description="每个风格都有自己的一套模板。"
        actions={<ProfileManager profiles={state.profiles} defaultProfile={state.setting.default_profile} onState={applyState} />}
      >
        <div className="grid gap-3 sm:max-w-xl sm:grid-cols-2">
          <ProfileSelect
            label="当前风格"
            profiles={state.profiles}
            value={content.name}
            onChange={(value) => setProfile(value)}
          />
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface-secondary px-4 py-3">
            <span className="text-xs text-muted">模板数量</span>
            <span className="text-sm font-semibold">
              内置 {content.templatesBuiltin.length} · 自定义 {content.templatesCustom.length}
            </span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="可用占位符" description="写模板时直接把这些 token 放进文案里。">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {PLACEHOLDERS.map((item) => (
            <div key={item.token} className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-surface-secondary px-3 py-2">
              <code className="w-fit rounded-md bg-default px-1.5 py-0.5 font-mono text-xs">{item.token}</code>
              <span className="text-xs text-muted">{item.description}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      {formError ? (
        <Card className="border border-danger/40 bg-danger-soft">
          <Card.Content className="px-4 py-3 text-sm text-danger-soft-foreground">{formError}</Card.Content>
        </Card>
      ) : null}

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <FileText className="size-4 text-accent" aria-hidden="true" />
            <span>内置模板</span>
            <Chip color="default" size="sm" variant="soft">只读</Chip>
          </span>
        }
        description="随插件发布，不能删除或修改。"
      >
        {content.templatesBuiltin.length === 0 ? (
          <EmptyHint>这个风格没有内置模板。</EmptyHint>
        ) : (
          <div className="flex flex-col gap-3">
            {content.templatesBuiltin.map((template, index) => (
              <div key={index} className="rounded-xl border border-border bg-surface-secondary p-4">
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{template}</pre>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={`自定义模板（${draft.length}）`}
        description={`每条最多 ${limits.templateLength} 字；保存后与内置模板合并生效。`}
        actions={
          <Button size="sm" variant="secondary" onPress={addTemplate}>
            <Plus className="size-4" aria-hidden="true" />
            <span>新增模板</span>
          </Button>
        }
      >
        {draft.length === 0 ? (
          <EmptyHint>还没有自定义模板，点右上角「新增模板」添加一条。</EmptyHint>
        ) : null}

        <div className="flex flex-col gap-3">
          {draft.map((template, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-muted">
                  第 {index + 1} 条
                  <span className="ml-2 font-normal tabular-nums">
                    {template.length}/{limits.templateLength}
                  </span>
                </span>
                <Button isIconOnly aria-label={`删除第 ${index + 1} 条模板`} size="sm" variant="danger-soft" onPress={() => removeTemplate(index)}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>

              <TextField fullWidth value={template} onChange={(next) => updateTemplate(index, next)}>
                <Label className="sr-only">{`第 ${index + 1} 条模板`}</Label>
                <TextArea rows={4} placeholder="{at_user} 来自 {location} 的 {role} 走进了群聊，先来一份 {food} 吧。" />
              </TextField>
            </div>
          ))}
        </div>

        <Separator />
        <div className="flex items-center justify-end gap-3">
          {dirty ? <span className="text-sm text-muted">改动尚未保存</span> : null}
          <Button isPending={saving} variant="primary" onPress={handleSave}>
            <Save className="size-4" aria-hidden="true" />
            <span>保存模板</span>
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}

export default TemplatesPage
