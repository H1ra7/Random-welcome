import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { fetchBotGroups, fetchState } from '../api/randomWelcome'
import type { BotGroup, PluginState } from '../types/api'

interface ConfigContextValue {
  state: PluginState | null
  botGroups: BotGroup[]
  loading: boolean
  error: string
  reload: () => Promise<void>
  /** 所有写操作成功后都用后端返回的完整 state 覆盖本地状态。 */
  applyState: (next: PluginState) => void
}

const ConfigContext = createContext<ConfigContextValue | null>(null)

/**
 * 全站共享「随机欢迎词」的状态：进入页面拉一次 /state，写操作后覆盖。
 */
export const ConfigProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<PluginState | null>(null)
  const [botGroups, setBotGroups] = useState<BotGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const nextState = await fetchState()
      setState(nextState)
      // 群列表拿不到不影响页面使用（群号允许手输），失败时退回空数组。
      const groups = await fetchBotGroups().catch(() => [] as BotGroup[])
      setBotGroups(groups)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const applyState = useCallback((next: PluginState) => {
    setState(next)
  }, [])

  const value = useMemo<ConfigContextValue>(() => ({
    state,
    botGroups,
    loading,
    error,
    reload,
    applyState
  }), [state, botGroups, loading, error, reload, applyState])

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}

export const useConfig = (): ConfigContextValue => {
  const context = useContext(ConfigContext)
  if (!context) throw new Error('useConfig 必须在 ConfigProvider 内使用')
  return context
}
