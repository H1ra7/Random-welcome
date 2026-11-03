import { Chip, Separator } from '@heroui/react'
import { BookOpen, Eye, Info, Terminal, Users } from 'lucide-react'

import PageHeader from '../components/common/PageHeader'
import SectionCard from '../components/common/SectionCard'
import StatCard from '../components/common/StatCard'
import { useConfig } from '../config/ConfigContext'

interface CommandDoc {
  command: string
  description: string
}

const COMMANDS: CommandDoc[] = [
  { command: '#开启欢迎词', description: '在当前群开启新人欢迎' },
  { command: '#关闭欢迎词', description: '在当前群关闭新人欢迎' },
  { command: '#欢迎词设置', description: '查看当前群的开关、风格与预览状态' },
  { command: '#欢迎词预览开启', description: '允许在本群用命令预览欢迎词' },
  { command: '#欢迎词预览关闭', description: '关闭本群命令预览' },
  { command: '#随机欢迎词', description: '立即随机生成一条欢迎词' },
  { command: '#设置欢迎词风格 X', description: '把当前群的欢迎词风格切换为 X' },
  { command: '#添加欢迎词条 地点|角色1,角色2|食物1,食物2', description: '给当前群风格追加一条词库' },
  { command: '#添加欢迎词 模板', description: '给当前群风格追加一条模板' },
  { command: '#欢迎词风格列表', description: '列出全部可用风格名（群内会标出本群当前风格）' },
  { command: '#随机欢迎词列表', description: '仅主人可用：查看已开启欢迎词的群号' },
  { command: '#欢迎词帮助', description: '输出命令帮助' }
]

const formatBoolean = (value: boolean) => (value ? '开启' : '关闭')

/**
 * 概览页：关键统计 + 当前全局参数 + 群内命令速查。
 */
const OverviewPage = () => {
  const { state } = useConfig()
  if (!state) return null

  const { setting, groups, profiles } = state
  const enabledCount = groups.filter((group) => group.enabled).length
  const previewCount = groups.filter((group) => group.allow_preview).length
  const builtinProfileCount = profiles.filter((profile) => profile.builtin).length

  const summaryItems: Array<{ label: string; value: string }> = [
    { label: '默认风格', value: setting.default_profile },
    { label: '渲染模式', value: setting.render_mode === 'image' ? '图片卡片' : '纯文本' },
    { label: '@新人', value: formatBoolean(setting.mention_new_member) },
    { label: '延迟区间', value: `${setting.delay_min} - ${setting.delay_max} 秒` },
    { label: '去重窗口', value: `${setting.dedupe_window_sec} 秒` }
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="概览"
        description="一眼看清当前配置状态；群内命令与网页配置共用同一份设置。"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="群总数" value={groups.length} hint="已在配置里登记" icon={Users} tone="accent" />
        <StatCard label="已开启" value={enabledCount} hint="欢迎词生效的群" icon={Users} tone="success" />
        <StatCard label="群内预览已开启" value={previewCount} hint="允许命令预览" icon={Eye} tone="warning" />
        <StatCard
          label="风格数"
          value={profiles.length}
          hint={`内置 ${builtinProfileCount} 个`}
          icon={BookOpen}
          tone="default"
        />
      </div>

      <SectionCard
        title="当前全局参数"
        description="群规则未单独覆盖时，全部按这里的设置执行。"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {summaryItems.map((item) => (
            <div
              key={item.label}
              className="flex flex-col gap-1 rounded-xl border border-border bg-surface-secondary px-4 py-3"
            >
              <span className="text-xs text-muted">{item.label}</span>
              <span className="truncate text-sm font-semibold">{item.value}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <Terminal className="size-4 text-accent" aria-hidden="true" />
            <span>群内命令速查</span>
          </span>
        }
        description="在群里直接发送即可；带 X 的命令把 X 换成实际风格名。"
      >
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
          {COMMANDS.map((item) => (
            <div key={item.command} className="flex flex-col gap-1 border-b border-separator pb-3 last:border-b-0 lg:last:border-b-0">
              <code className="w-fit rounded-md bg-default px-2 py-1 font-mono text-xs sm:text-[13px]">
                {item.command}
              </code>
              <span className="text-xs text-muted">{item.description}</span>
            </div>
          ))}
        </div>
        <Separator />
        <div className="flex items-start gap-2 text-xs text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            词条命令中的三个部分用竖线 <code className="font-mono">|</code> 分隔，多个角色 / 食物用逗号分隔。
            内置词库和模板是只读的，运行时实际生效的是「内置 + 自定义」的合并结果。
          </span>
        </div>
      </SectionCard>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Chip size="sm" variant="soft" color="default">
          {state.plugin.name}
        </Chip>
        <span>v{state.plugin.version}</span>
        <span>·</span>
        <span>{state.plugin.description}</span>
      </div>
    </div>
  )
}

export default OverviewPage
