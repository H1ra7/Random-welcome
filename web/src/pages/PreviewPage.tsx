import { useMemo, useState } from 'react'

import {
  Button,
  Card,
  Chip,
  Description,
  Label,
  ListBox,
  Select,
  Spinner,
  toast
} from '@heroui/react'
import { Image as ImageIcon, Sparkles, Type } from 'lucide-react'

import { previewWelcome } from '../api/randomWelcome'
import PageHeader from '../components/common/PageHeader'
import ProfileSelect from '../components/common/ProfileSelect'
import SectionCard from '../components/common/SectionCard'
import { EmptyHint } from '../components/common/StatusPanel'
import { useConfig } from '../config/ConfigContext'
import type { PreviewResult, RenderMode } from '../types/api'

const NO_GROUP = '__none__'

/**
 * 预览页：选风格（可加选群）后生成文本或图片，图片走 puppeteer 真渲染。
 */
const PreviewPage = () => {
  const { state, botGroups } = useConfig()
  const [profile, setProfile] = useState(() => state?.setting.default_profile ?? '')
  const [groupId, setGroupId] = useState(NO_GROUP)
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [loadingMode, setLoadingMode] = useState<RenderMode | null>(null)

  const groupOptions = useMemo(() => {
    if (!state) return []
    const map = new Map<number, string>()
    for (const group of state.groups) {
      map.set(group.id, '')
    }
    for (const group of botGroups) {
      map.set(group.id, group.name)
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.id - right.id)
  }, [state, botGroups])

  if (!state) return null

  const currentProfile = state.profiles.some((item) => item.name === profile)
    ? profile
    : state.profiles[0]?.name ?? state.setting.default_profile

  const handleGenerate = async (mode: RenderMode) => {
    setLoadingMode(mode)
    try {
      const next = await previewWelcome(
        currentProfile,
        mode,
        groupId === NO_GROUP ? undefined : Number(groupId)
      )
      setResult(next)
      if (next.warning) {
        toast.warning('预览提示', { description: next.warning })
      }
    } catch (previewError) {
      toast.danger('预览失败', {
        description: previewError instanceof Error ? previewError.message : '未知错误'
      })
    } finally {
      setLoadingMode(null)
    }
  }

  const imageLoading = loadingMode === 'image'

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="预览"
        description="用当前词库和模板随机拼一条欢迎词；图片模式会真实渲染卡片，可能要等几秒。"
      />

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" aria-hidden="true" />
            <span>生成设置</span>
          </span>
        }
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <ProfileSelect
            label="风格"
            profiles={state.profiles}
            value={currentProfile}
            onChange={(value) => setProfile(value)}
          />

          <Select
            aria-label="预览群"
            fullWidth
            placeholder="不指定群"
            value={groupId}
            variant="secondary"
            onChange={(nextValue) => {
              if (nextValue === null || Array.isArray(nextValue)) return
              setGroupId(String(nextValue))
            }}
          >
            <Label className="font-semibold">预览群（可选）</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id={NO_GROUP} textValue="不指定群">
                  <Label>不指定群</Label>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {groupOptions.map((group) => (
                  <ListBox.Item key={group.id} id={String(group.id)} textValue={`${group.name} ${group.id}`}>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Label>{group.name || `群 ${group.id}`}</Label>
                      <Description>{group.id}</Description>
                    </div>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button isDisabled={loadingMode !== null} isPending={loadingMode === 'text'} variant="secondary" onPress={() => handleGenerate('text')}>
            {loadingMode === 'text' ? <Spinner color="current" size="sm" aria-label="生成文本中" /> : <Type className="size-4" aria-hidden="true" />}
            <span>生成文本</span>
          </Button>
          <Button isDisabled={loadingMode !== null} isPending={imageLoading} variant="primary" onPress={() => handleGenerate('image')}>
            {imageLoading ? <Spinner color="current" size="sm" aria-label="生成图片中" /> : <ImageIcon className="size-4" aria-hidden="true" />}
            <span>{imageLoading ? '正在渲染图片…' : '生成图片'}</span>
          </Button>
          {imageLoading ? (
            <span className="text-xs text-muted">图片渲染通常需要 2-10 秒，请稍候</span>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="预览结果"
        description="文本与图片都来自后端 /preview 接口。"
        actions={
          result ? (
            <>
              <Chip color="accent" size="sm" variant="soft">{result.profile}</Chip>
              <Chip color="default" size="sm" variant="soft">{result.mode === 'image' ? '图片' : '文本'}</Chip>
            </>
          ) : null
        }
      >
        {!result ? (
          <EmptyHint>还没有生成结果，选好风格后点上面的按钮试试。</EmptyHint>
        ) : (
          <div className="flex flex-col gap-4">
            {result.warning ? (
              <Card className="border border-warning/40 bg-warning-soft">
                <Card.Content className="px-4 py-3 text-sm text-warning-soft-foreground">{result.warning}</Card.Content>
              </Card>
            ) : null}

            {result.text ? (
              <div className="rounded-xl border border-border bg-surface-secondary p-4">
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{result.text}</pre>
              </div>
            ) : null}

            {result.image ? (
              <div className="overflow-hidden rounded-xl border border-border bg-surface-secondary">
                <img alt="欢迎词图片预览" className="block h-auto w-full" src={result.image} />
              </div>
            ) : null}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

export default PreviewPage
