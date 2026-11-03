import { useEffect, useMemo, useState } from 'react'

import {
  Button,
  Chip,
  Description,
  FieldError,
  Input,
  Label,
  Spinner,
  Switch,
  TextField,
  cn,
  toast
} from '@heroui/react'
import { Clock, Image as ImageIcon, Save, Type, UserCheck } from 'lucide-react'

import { saveSetting } from '../api/randomWelcome'
import PageHeader from '../components/common/PageHeader'
import ProfileSelect from '../components/common/ProfileSelect'
import SectionCard from '../components/common/SectionCard'
import { useConfig } from '../config/ConfigContext'
import type { GlobalSetting, RenderMode } from '../types/api'

const RENDER_MODES: Array<{ value: RenderMode; label: string; description: string; icon: typeof Type }> = [
  { value: 'text', label: '纯文本', description: '直接发送文字，速度快', icon: Type },
  { value: 'image', label: '图片卡片', description: 'puppeteer 渲染成图片', icon: ImageIcon }
]

/**
 * 全局设置页：默认风格、渲染模式、@新人、延迟区间、去重窗口。
 */
const SettingsPage = () => {
  const { state, applyState } = useConfig()
  const [draft, setDraft] = useState<GlobalSetting | null>(state?.setting ?? null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(state?.setting ?? null)
  }, [state?.setting])

  const limits = state?.limits

  const errors = useMemo(() => {
    const result: Record<string, string> = {}
    if (!draft || !limits) return result
    if (!Number.isFinite(draft.delay_min) || draft.delay_min < 0 || draft.delay_min > limits.delayMax) {
      result.delay_min = `延迟下限需在 0-${limits.delayMax} 秒之间`
    }
    if (!Number.isFinite(draft.delay_max) || draft.delay_max < 0 || draft.delay_max > limits.delayMax) {
      result.delay_max = `延迟上限需在 0-${limits.delayMax} 秒之间`
    }
    if (!result.delay_min && !result.delay_max && draft.delay_max < draft.delay_min) {
      result.delay_max = '延迟上限不能小于下限'
    }
    if (!Number.isFinite(draft.dedupe_window_sec) || draft.dedupe_window_sec < 0 || draft.dedupe_window_sec > limits.dedupeMax) {
      result.dedupe_window_sec = `去重窗口需在 0-${limits.dedupeMax} 秒之间`
    }
    return result
  }, [draft, limits])

  if (!state || !draft || !limits) return null

  const dirty = JSON.stringify(draft) !== JSON.stringify(state.setting)
  const hasError = Object.keys(errors).length > 0

  const update = (patch: Partial<GlobalSetting>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  const handleSave = async () => {
    if (hasError) {
      toast.warning('请先修正表单里的问题')
      return
    }

    setSaving(true)
    try {
      const result = await saveSetting(draft)
      applyState(result.state)
      toast.success(result.message)
    } catch (saveError) {
      toast.danger('保存失败', {
        description: saveError instanceof Error ? saveError.message : '未知错误'
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="全局设置"
        description="这里的参数是所有群的默认值，群规则里可以单独覆盖。"
        actions={
          <>
            {dirty ? (
              <Chip color="warning" size="sm" variant="soft">有未保存改动</Chip>
            ) : null}
            <Button isDisabled={!dirty || hasError} isPending={saving} variant="primary" onPress={handleSave}>
              {saving ? <Spinner color="current" size="sm" aria-label="保存中" /> : <Save className="size-4" aria-hidden="true" />}
              <span>保存设置</span>
            </Button>
          </>
        }
      />

      <SectionCard title="欢迎词风格" description="新入群时默认使用的词库 / 模板组合。">
        <div className="max-w-md">
          <ProfileSelect
            label="默认风格"
            profiles={state.profiles}
            value={draft.default_profile}
            onChange={(value) => update({ default_profile: value })}
          />
        </div>
      </SectionCard>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <ImageIcon className="size-4 text-accent" aria-hidden="true" />
            <span>渲染模式</span>
          </span>
        }
        description="纯文本发送最快；图片卡片需要 @karinjs/plugin-puppeteer，渲染会多花 2-10 秒。"
      >
        <div className="grid gap-2 sm:max-w-lg sm:grid-cols-2">
          {RENDER_MODES.map((mode) => {
            const active = draft.render_mode === mode.value
            const Icon = mode.icon
            return (
              <button
                key={mode.value}
                aria-pressed={active}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
                  active
                    ? 'border-accent bg-accent-soft'
                    : 'border-border bg-surface hover:bg-surface-secondary'
                )}
                type="button"
                onClick={() => update({ render_mode: mode.value })}
              >
                <Icon className={cn('mt-0.5 size-4 shrink-0', active ? 'text-accent' : 'text-muted')} aria-hidden="true" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{mode.label}</span>
                  <span className="text-xs text-muted">{mode.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <UserCheck className="size-4 text-accent" aria-hidden="true" />
            <span>提醒与节奏</span>
          </span>
        }
      >
        <Switch
          isSelected={draft.mention_new_member}
          onChange={(isSelected) => update({ mention_new_member: isSelected })}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>
            <Label className="font-semibold">@新人</Label>
            <Description>欢迎词里带上 @新成员；关闭后只发文字。</Description>
          </Switch.Content>
        </Switch>

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            fullWidth
            isInvalid={Boolean(errors.delay_min)}
            type="number"
            value={String(draft.delay_min)}
            onChange={(next) => update({ delay_min: next === '' ? 0 : Math.floor(Number(next)) })}
          >
            <Label className="font-semibold">延迟下限</Label>
            <Input max={limits.delayMax} min={0} />
            {errors.delay_min
              ? <FieldError>{errors.delay_min}</FieldError>
              : <Description>秒</Description>}
          </TextField>

          <TextField
            fullWidth
            isInvalid={Boolean(errors.delay_max)}
            type="number"
            value={String(draft.delay_max)}
            onChange={(next) => update({ delay_max: next === '' ? 0 : Math.floor(Number(next)) })}
          >
            <Label className="font-semibold">延迟上限</Label>
            <Input max={limits.delayMax} min={0} />
            {errors.delay_max
              ? <FieldError>{errors.delay_max}</FieldError>
              : <Description>秒</Description>}
          </TextField>

          <TextField
            fullWidth
            isInvalid={Boolean(errors.dedupe_window_sec)}
            type="number"
            value={String(draft.dedupe_window_sec)}
            onChange={(next) => update({ dedupe_window_sec: next === '' ? 0 : Math.floor(Number(next)) })}
          >
            <Label className="font-semibold">去重窗口</Label>
            <Input max={limits.dedupeMax} min={0} />
            {errors.dedupe_window_sec
              ? <FieldError>{errors.dedupe_window_sec}</FieldError>
              : <Description>同一人 N 秒内只欢迎一次</Description>}
          </TextField>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <Clock className="size-3.5" aria-hidden="true" />
          <span>延迟在区间内随机取值，单位为秒；去重窗口填 0 表示不去重。</span>
        </div>
      </SectionCard>

      <div className="flex items-center justify-end gap-3">
        {dirty ? <span className="text-sm text-muted">{hasError ? '还有字段未通过校验' : '改动尚未保存'}</span> : null}
        <Button isDisabled={!dirty || hasError} isPending={saving} variant="primary" onPress={handleSave}>
          <Save className="size-4" aria-hidden="true" />
          <span>保存设置</span>
        </Button>
      </div>
    </div>
  )
}

export default SettingsPage
