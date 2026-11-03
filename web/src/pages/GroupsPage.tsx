import { useEffect, useMemo, useState } from 'react'

import {
  Button,
  Chip,
  Description,
  Input,
  Label,
  ListBox,
  Select,
  Separator,
  Spinner,
  Switch,
  TextField,
  toast
} from '@heroui/react'
import { Plus, Save, Trash2, Users } from 'lucide-react'

import { saveGroups } from '../api/randomWelcome'
import PageHeader from '../components/common/PageHeader'
import ProfileSelect from '../components/common/ProfileSelect'
import SectionCard from '../components/common/SectionCard'
import { EmptyHint } from '../components/common/StatusPanel'
import { useConfig } from '../config/ConfigContext'
import type { GroupRule } from '../types/api'

const cloneGroups = (groups: GroupRule[]): GroupRule[] => groups.map((group) => ({ ...group }))

/**
 * 群规则页：按群开关欢迎、@新人、群内预览与风格。改动统一保存（整体覆盖）。
 */
const GroupsPage = () => {
  const { state, botGroups, applyState } = useConfig()
  const [draft, setDraft] = useState<GroupRule[]>(() => cloneGroups(state?.groups ?? []))
  const [manualId, setManualId] = useState('')
  const [selectedBotGroup, setSelectedBotGroup] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(cloneGroups(state?.groups ?? []))
  }, [state?.groups])

  const botGroupMap = useMemo(() => {
    const map = new Map<number, { name: string; memberCount: number }>()
    for (const group of botGroups) {
      map.set(group.id, { name: group.name, memberCount: group.memberCount })
    }
    return map
  }, [botGroups])

  if (!state) return null

  const dirty = JSON.stringify(draft) !== JSON.stringify(state.groups)
  const enabledCount = draft.filter((group) => group.enabled).length
  const previewCount = draft.filter((group) => group.allow_preview).length

  const updateGroup = (id: number, patch: Partial<GroupRule>) => {
    setDraft((current) => current.map((group) => (group.id === id ? { ...group, ...patch } : group)))
  }

  const removeGroup = (id: number) => {
    setDraft((current) => current.filter((group) => group.id !== id))
  }

  const handleAdd = () => {
    const raw = manualId.trim() || selectedBotGroup
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      toast.warning('请输入有效的群号')
      return
    }
    if (draft.some((group) => group.id === id)) {
      toast.warning('该群已经在列表里了')
      return
    }

    setDraft((current) => [
      ...current,
      {
        id,
        enabled: true,
        profile: state.setting.default_profile,
        mention_new_member: state.setting.mention_new_member,
        allow_preview: false
      }
    ])
    setManualId('')
    setSelectedBotGroup('')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await saveGroups(draft)
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
        title="群规则"
        description="每个群可以单独开关欢迎词、@新人、群内预览，并指定风格。"
        actions={
          <>
            {dirty ? <Chip color="warning" size="sm" variant="soft">有未保存改动</Chip> : null}
            <Button isDisabled={!dirty} isPending={saving} variant="primary" onPress={handleSave}>
              {saving ? <Spinner color="current" size="sm" aria-label="保存中" /> : <Save className="size-4" aria-hidden="true" />}
              <span>保存群规则</span>
            </Button>
          </>
        }
      />

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <Plus className="size-4 text-accent" aria-hidden="true" />
            <span>添加群</span>
          </span>
        }
        description="可以从机器人当前所在的群里选，也可以直接手输群号。"
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto] lg:items-end">
          <Select
            aria-label="从机器人所在的群选择"
            fullWidth
            isDisabled={botGroups.length === 0}
            placeholder={botGroups.length === 0 ? '机器人暂时没有可选的群' : '选择机器人群'}
            value={selectedBotGroup}
            variant="secondary"
            onChange={(nextValue) => {
              if (nextValue === null || Array.isArray(nextValue)) return
              setSelectedBotGroup(String(nextValue))
              setManualId('')
            }}
          >
            <Label className="font-semibold">从机器人群选择</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {botGroups.map((group) => (
                  <ListBox.Item key={group.id} id={String(group.id)} textValue={`${group.name} ${group.id}`}>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Label>{group.name || '未命名群'}</Label>
                      <Description>
                        {group.id} · {group.memberCount} 人
                      </Description>
                    </div>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <TextField
            fullWidth
            value={manualId}
            onChange={(next) => {
              setManualId(next.replace(/\D/g, ''))
              if (next) setSelectedBotGroup('')
            }}
          >
            <Label className="font-semibold">手输群号</Label>
            <Input inputMode="numeric" placeholder="例如 123456789" />
          </TextField>

          <Button variant="secondary" onPress={handleAdd}>
            <Plus className="size-4" aria-hidden="true" />
            <span>添加</span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Users className="size-3.5" aria-hidden="true" />
          <span>当前列表 {draft.length} 个群，已开启 {enabledCount} 个，群内预览 {previewCount} 个。</span>
        </div>
      </SectionCard>

      <div className="flex flex-col gap-3">
        {draft.length === 0 ? (
          <EmptyHint>还没有配置任何群，用上面的「添加群」先加一个吧。</EmptyHint>
        ) : null}

        {draft.map((group) => {
          const botGroup = botGroupMap.get(group.id)
          return (
            <div key={group.id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{group.id}</span>
                    <Chip color={group.enabled ? 'success' : 'default'} size="sm" variant="soft">
                      {group.enabled ? '已开启' : '未开启'}
                    </Chip>
                    {group.allow_preview ? (
                      <Chip color="warning" size="sm" variant="soft">群内预览</Chip>
                    ) : null}
                  </div>
                  <span className="truncate text-sm text-muted">
                    {botGroup?.name || '名字未知（不在机器人群列表里）'}
                    {botGroup ? ` · ${botGroup.memberCount} 人` : ''}
                  </span>
                </div>
                <Button isIconOnly aria-label={`删除群 ${group.id}`} size="sm" variant="danger-soft" onPress={() => removeGroup(group.id)}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>

              <Separator className="my-4" />

              <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
                <Switch isSelected={group.enabled} onChange={(value) => updateGroup(group.id, { enabled: value })}>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Content>
                    <Label className="text-sm font-semibold">欢迎开关</Label>
                  </Switch.Content>
                </Switch>

                <Switch isSelected={group.mention_new_member} onChange={(value) => updateGroup(group.id, { mention_new_member: value })}>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Content>
                    <Label className="text-sm font-semibold">@新人</Label>
                  </Switch.Content>
                </Switch>

                <Switch isSelected={group.allow_preview} onChange={(value) => updateGroup(group.id, { allow_preview: value })}>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Content>
                    <Label className="text-sm font-semibold">群内预览</Label>
                  </Switch.Content>
                </Switch>

                <div className="min-w-48 flex-1 sm:max-w-64">
                  <ProfileSelect
                    label="本群风格"
                    profiles={state.profiles}
                    value={group.profile}
                    onChange={(value) => updateGroup(group.id, { profile: value })}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {draft.length > 0 ? (
        <div className="flex items-center justify-end gap-3">
          {dirty ? <span className="text-sm text-muted">改动尚未保存</span> : null}
          <Button isDisabled={!dirty} isPending={saving} variant="primary" onPress={handleSave}>
            <Save className="size-4" aria-hidden="true" />
            <span>保存群规则</span>
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default GroupsPage
