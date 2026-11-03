import { useEffect, useState } from 'react'

import { Surface, Toast } from '@heroui/react'

import { loginWithAuthKey } from './auth/request'
import { authChangedEventName, hasAuthToken } from './auth/token'
import LoginPanel from './components/common/LoginPanel'
import { LoadingPanel } from './components/common/StatusPanel'
import AppShell from './components/layout/AppShell'
import { ConfigProvider } from './config/ConfigContext'
import { useDevice } from './hooks/useDevice'
import { useTheme } from './hooks/useTheme'

const normalizePath = (path: string) => path.replace(/\/+$/, '') || '/'

const App = () => {
  const { isDark, toggleTheme } = useTheme()
  const device = useDevice()
  const [authenticating, setAuthenticating] = useState(true)
  const [authenticated, setAuthenticated] = useState(() => hasAuthToken())

  useEffect(() => {
    const handleAuthChange = () => setAuthenticated(hasAuthToken())
    window.addEventListener(authChangedEventName, handleAuthChange)
    window.addEventListener('storage', handleAuthChange)

    return () => {
      window.removeEventListener(authChangedEventName, handleAuthChange)
      window.removeEventListener('storage', handleAuthChange)
    }
  }, [])

  useEffect(() => {
    const boot = async () => {
      // 支持 Karin 主 Web 用 ?token=xxx 直接跳转进来（token 就是 HTTP_AUTH_KEY）。
      const params = new URLSearchParams(window.location.search)
      const token = params.get('token')

      if (!token) {
        setAuthenticating(false)
        return
      }

      try {
        await loginWithAuthKey(token)
        window.history.replaceState(null, '', normalizePath(window.location.pathname))
      } catch {
        // token 无效就让用户手动输入密钥，不阻塞进入登录页。
      } finally {
        setAuthenticating(false)
        setAuthenticated(hasAuthToken())
      }
    }

    void boot()
  }, [])

  if (authenticating) {
    return <LoadingPanel label="正在进入配置页" />
  }

  if (!authenticated) {
    return <LoginPanel onLogin={() => setAuthenticated(true)} />
  }

  return (
    <Surface className="min-h-screen">
      <Toast.Provider placement="top" />
      <ConfigProvider>
        <AppShell device={device} isDark={isDark} onToggleTheme={toggleTheme} />
      </ConfigProvider>
    </Surface>
  )
}

export default App
