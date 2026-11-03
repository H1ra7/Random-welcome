import { useState } from 'react'

import { Button, Chip, ScrollShadow, cn } from '@heroui/react'
import { LogOut, Moon, RefreshCw, Sparkles, Sun } from 'lucide-react'

import { clearAuthTokens } from '../../auth/token'
import { useConfig } from '../../config/ConfigContext'
import type { DeviceLayout } from '../../hooks/useDevice'
import { NAV_ITEMS, type PageKey } from '../../navigation'
import GroupsPage from '../../pages/GroupsPage'
import LexiconPage from '../../pages/LexiconPage'
import OverviewPage from '../../pages/OverviewPage'
import PreviewPage from '../../pages/PreviewPage'
import SettingsPage from '../../pages/SettingsPage'
import TemplatesPage from '../../pages/TemplatesPage'
import { ErrorPanel, LoadingPanel } from '../common/StatusPanel'

interface AppShellProps {
  device: DeviceLayout
  isDark: boolean
  onToggleTheme: () => void
}

const renderPage = (page: PageKey) => {
  switch (page) {
    case 'settings':
      return <SettingsPage />
    case 'groups':
      return <GroupsPage />
    case 'lexicon':
      return <LexiconPage />
    case 'templates':
      return <TemplatesPage />
    case 'preview':
      return <PreviewPage />
    case 'overview':
    default:
      return <OverviewPage />
  }
}

/**
 * 应用外壳：桌面端左侧固定导航，移动端顶部横向 tab。
 */
const AppShell = ({ device, isDark, onToggleTheme }: AppShellProps) => {
  const { state, loading, error, reload } = useConfig()
  const [page, setPage] = useState<PageKey>('overview')

  if (loading && !state) {
    return <LoadingPanel label="正在读取配置" />
  }

  if (!state) {
    return (
      <div className="mx-auto max-w-3xl px-4">
        <ErrorPanel message={error || '无法读取配置'} onRetry={reload} />
      </div>
    )
  }

  const version = state.plugin.version

  const themeToggleLabel = isDark ? '切换到亮色' : '切换到暗色'

  const actions = (
    <div className="flex items-center gap-1">
      <Button isIconOnly aria-label={themeToggleLabel} size="sm" variant="tertiary" onPress={onToggleTheme}>
        {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
      </Button>
      <Button isIconOnly aria-label="刷新配置" size="sm" variant="tertiary" onPress={() => void reload()}>
        <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" />
      </Button>
      <Button isIconOnly aria-label="退出登录" size="sm" variant="tertiary" onPress={clearAuthTokens}>
        <LogOut className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )

  return (
    <div className="flex min-h-screen">
      {device === 'desktop' ? (
        <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border bg-surface">
          <div className="flex items-center gap-3 px-5 py-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">随机欢迎词</span>
              <span className="truncate text-xs text-muted">v{version}</span>
            </div>
          </div>

          <ScrollShadow hideScrollBar className="flex-1 px-3 py-2" size={32}>
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const active = item.key === page
                return (
                  <button
                    key={item.key}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                      active
                        ? 'bg-accent-soft font-semibold text-accent-soft-foreground'
                        : 'text-foreground/80 hover:bg-surface-secondary'
                    )}
                    title={item.hint}
                    type="button"
                    onClick={() => setPage(item.key)}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </nav>
          </ScrollShadow>

          <div className="flex flex-col gap-1 border-t border-border px-5 py-4">
            <span className="text-xs text-muted">{state.plugin.name}</span>
            <span className="line-clamp-2 text-xs text-muted">{state.plugin.description}</span>
          </div>
        </aside>
      ) : null}

      <div className={cn('flex min-h-screen min-w-0 flex-1 flex-col', device === 'desktop' && 'pl-60')}>
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              {device !== 'desktop' ? (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Sparkles className="size-4" aria-hidden="true" />
                </span>
              ) : null}
              <h1 className="truncate text-base font-semibold sm:text-lg">随机欢迎词</h1>
              <Chip color="accent" size="sm" variant="soft">v{version}</Chip>
            </div>
            <div className="ml-auto shrink-0">{actions}</div>
          </div>

          {device !== 'desktop' ? (
            <div className="overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max items-center gap-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon
                  const active = item.key === page
                  return (
                    <button
                      key={item.key}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-accent-soft font-semibold text-accent-soft-foreground'
                          : 'text-muted hover:bg-surface-secondary'
                      )}
                      type="button"
                      onClick={() => setPage(item.key)}
                    >
                      <Icon className="size-3.5" aria-hidden="true" />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {error ? (
            <div className="mb-4 rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">
              {error}
            </div>
          ) : null}
          {renderPage(page)}
        </main>
      </div>
    </div>
  )
}

export default AppShell
