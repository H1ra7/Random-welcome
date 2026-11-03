import { useEffect, useMemo, useState } from 'react'

import {
  Button,
  Card,
  Chip,
  Description,
  Input,
  Label,
  Separator,
  Spinner,
  TextField,
  toast
} from '@heroui/react'
import { BookOpen, Plus, Save, Trash2 } from 'lucide-react'

import { saveContent } from '../api/randomWelcome'
import PageHeader from '../components/common/PageHeader'
import ProfileManager from '../components/common/ProfileManager'
import ProfileSelect from '../components/common/ProfileSelect'
import SectionCard from '../components/common/SectionCard'
import { EmptyHint } from '../components/common/StatusPanel'
import TagInput from '../components/common/TagInput'
import { useConfig } from '../config/ConfigContext'
import type { LexiconItem } from '../types/api'
import { deepClone, normalizeTags } from '../utils/tags'

const TagList = ({ tags, color }: { tags: string[]; color: 'accent' | 'success' }) => (
  <div className="flex flex-wrap gap-1.5">
    {tags.map((tag) => (
      <Chip key={tag} color={color} size="sm" variant="soft">
        {tag}
      </Chip>
    ))}
  </div>
)

/**
 * 词库页：内置词条只读，自定义词条可增删改；运行时生效的是两者合并结果。
 */
const LexiconPage = () => {
  const { state, applyState } = useConfig()
  const [profile, setProfile] = useState(() => state?.setting.default_profile ?? '')
  const [draft, setDraft] = useState<LexiconItem[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const content = useMemo(() => {
    if (!state) return undefined
    return state.contents.find((item) => item.name === profile) ?? state.contents[0]
  }, [state, profile])

  useEffect(() => {
    if (!content) return
    if (content.name !== profile) setProfile(content.name)
    setDraft(deepClone(content.lexiconCustom))
    setFormError('')
  }, [content, profile])

  if (!state || !content) return null

  const limits = state.limits
  const dirty = JSON.stringify(draft) !== JSON.stringify(content.lexiconCustom)

  const updateItem = (index: number, patch: Partial<LexiconItem>) => {
    setDraft((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)))
  }

  const removeItem = (index: number) => {
    setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const addItem = () => {
    setDraft((current) => [...current, { location: '', roles: [], foods: [] }])
  }

  const handleSave = async () => {
    const cleaned: LexiconItem[] = []
    const errors: string[] = []

    draft.forEach((item, index) => {
      const location = item.location.trim()
      const roles = normalizeTags(item.roles)
      const foods = normalizeTags(item.foods)
      const isEmpty = !location && roles.length === 0 && foods.length === 0
      if (isEmpty) return

      if (!location) {
        errors.push(`第 ${index + 1} 条自定义词条缺少地点`)
        return
      }
      if (location.length > limits.lexiconLocationLength) {
        errors.push(`第 ${index + 1} 条的地点超过 ${limits.lexiconLocationLength} 字`)
        return
      }
      if (roles.length === 0 || foods.length === 0) {
        errors.push(`词条「${location}」的角色和食物都不能为空`)
        return
      }
      cleaned.push({ location, roles, foods })
    })

    if (errors.length > 0) {
      setFormError(errors.join('；'))
      toast.warning('词库还有问题', { description: errors[0] })
      return
    }

    setFormError('')
    setSaving(true)
    try {
      const result = await saveContent(content.name, { lexicon: cleaned })
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
        title="词库"
        description="每个风格由「地点 + 角色列表 + 食物列表」组成；内置词条只读，自定义词条可自由增删。"
        actions={
          <>
            {dirty ? <Chip color="warning" size="sm" variant="soft">有未保存改动</Chip> : null}
            <Button isPending={saving} variant="primary" onPress={handleSave}>
              {saving ? <Spinner color="current" size="sm" aria-label="保存中" /> : <Save className="size-4" aria-hidden="true" />}
              <span>保存词库</span>
            </Button>
          </>
        }
      />

      <SectionCard
        title="选择风格"
        description="切换风格会载入对应词库；内置与自定义条目都会展示。"
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
            <span className="text-xs text-muted">词条数量</span>
            <span className="text-sm font-semibold">
              内置 {content.lexiconBuiltin.length} · 自定义 {content.lexiconCustom.length}
            </span>
          </div>
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
            <BookOpen className="size-4 text-accent" aria-hidden="true" />
            <span>内置词条</span>
            <Chip color="default" size="sm" variant="soft">只读</Chip>
          </span>
        }
        description="随插件发布，不能删除或修改；升级插件时会自动更新。"
      >
        {content.lexiconBuiltin.length === 0 ? (
          <EmptyHint>这个风格没有内置词条。</EmptyHint>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {content.lexiconBuiltin.map((item, index) => (
              <div key={`${item.location}-${index}`} className="flex flex-col gap-2 rounded-xl border border-border bg-surface-secondary p-4">
                <span className="text-sm font-semibold">{item.location}</span>
                <TagList color="accent" tags={item.roles} />
                <TagList color="success" tags={item.foods} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={`自定义词条（${draft.length}）`}
        description="保存后与内置词条合并生效；留空的整条会被忽略。"
        actions={
          <Button size="sm" variant="secondary" onPress={addItem}>
            <Plus className="size-4" aria-hidden="true" />
            <span>新增词条</span>
          </Button>
        }
      >
        {draft.length === 0 ? (
          <EmptyHint>还没有自定义词条，点右上角「新增词条」添加一条。</EmptyHint>
        ) : null}

        <div className="flex flex-col gap-3">
          {draft.map((item, index) => (
            <div key={index} className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-muted">第 {index + 1} 条</span>
                <Button isIconOnly aria-label={`删除第 ${index + 1} 条词条`} size="sm" variant="danger-soft" onPress={() => removeItem(index)}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>

              <TextField
                fullWidth
                value={item.location}
                onChange={(next) => updateItem(index, { location: next })}
              >
                <Label className="font-semibold">地点</Label>
                <Input maxLength={limits.lexiconLocationLength} placeholder="例如：帕尔纳丝" />
                <Description>最多 {limits.lexiconLocationLength} 字</Description>
              </TextField>

              <div className="flex flex-col gap-1.5">
                <Label className="font-semibold">角色</Label>
                <TagInput
                  ariaLabel={`第 ${index + 1} 条词条的角色`}
                  maxLength={limits.lexiconItemLength}
                  placeholder="输入角色后回车，可用逗号分隔多个"
                  value={item.roles}
                  onChange={(next) => updateItem(index, { roles: next })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="font-semibold">食物</Label>
                <TagInput
                  ariaLabel={`第 ${index + 1} 条词条的食物`}
                  maxLength={limits.lexiconItemLength}
                  placeholder="输入食物后回车，可用逗号分隔多个"
                  value={item.foods}
                  onChange={(next) => updateItem(index, { foods: next })}
                />
              </div>
            </div>
          ))}
        </div>

        <Separator />
        <div className="flex items-center justify-end gap-3">
          {dirty ? <span className="text-sm text-muted">改动尚未保存</span> : null}
          <Button isPending={saving} variant="primary" onPress={handleSave}>
            <Save className="size-4" aria-hidden="true" />
            <span>保存词库</span>
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}

export default LexiconPage
