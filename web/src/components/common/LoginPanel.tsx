import type { FormEvent } from 'react'
import { useState } from 'react'

import { Button, Card, Description, Form, Input, Label, Spinner, Surface, TextField } from '@heroui/react'
import { Eye, EyeOff, KeyRound, LogIn } from 'lucide-react'

import { loginWithAuthKey } from '../../auth/request'

interface LoginPanelProps {
  onLogin: () => void
}

/**
 * Karin HTTP 鉴权登录面板：用 HTTP_AUTH_KEY 换 Karin Web token。
 */
const LoginPanel = ({ onLogin }: LoginPanelProps) => {
  const [authKey, setAuthKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = authKey.trim()
    if (!value) {
      setError('请输入 Karin HTTP 鉴权密钥')
      return
    }

    try {
      setLoading(true)
      setError('')
      await loginWithAuthKey(value)
      onLogin()
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Surface className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
            <KeyRound className="size-6" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">Karin 鉴权</h1>
            <p className="text-sm text-muted">使用 Karin HTTP 鉴权密钥登录后管理随机欢迎词配置。</p>
          </div>
        </div>

        <Card>
          <Card.Content className="p-5 sm:p-6">
            <Form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              <TextField fullWidth isInvalid={Boolean(error)} value={authKey} onChange={setAuthKey}>
                <Label className="font-semibold">HTTP 鉴权密钥</Label>
                <div className="flex items-center gap-2">
                  <Input
                    autoComplete="current-password"
                    className="min-w-0 flex-1"
                    placeholder="请输入 Karin 的 HTTP_AUTH_KEY"
                    type={showKey ? 'text' : 'password'}
                  />
                  <Button
                    isIconOnly
                    aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                    type="button"
                    variant="tertiary"
                    onPress={() => setShowKey((current) => !current)}
                  >
                    {showKey
                      ? <EyeOff className="size-4" aria-hidden="true" />
                      : <Eye className="size-4" aria-hidden="true" />}
                  </Button>
                </div>
                <Description>{error || '登录态与 Karin 主 Web 共用，登录一次即可。'}</Description>
              </TextField>

              <Button fullWidth isPending={loading} type="submit">
                {({ isPending }) => (
                  <>
                    {isPending
                      ? <Spinner color="current" size="sm" aria-label="登录中" />
                      : <LogIn className="size-4" aria-hidden="true" />}
                    <span>登录</span>
                  </>
                )}
              </Button>
            </Form>
          </Card.Content>
        </Card>
      </div>
    </Surface>
  )
}

export default LoginPanel
