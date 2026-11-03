import type { ReactNode } from 'react'

import { Button, Description, Spinner, Surface } from '@heroui/react'
import { AlertCircle, RotateCw } from 'lucide-react'

export const LoadingPanel = ({ label }: { label: string }) => (
  <Surface className="flex min-h-screen items-center justify-center gap-3">
    <Spinner size="sm" aria-label={label} />
    <Description>{label}</Description>
  </Surface>
)

interface ErrorPanelProps {
  message: string
  onRetry: () => void
  children?: ReactNode
}

export const ErrorPanel = ({ message, onRetry }: ErrorPanelProps) => (
  <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
    <span className="flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger-soft-foreground">
      <AlertCircle className="size-6" aria-hidden="true" />
    </span>
    <div className="flex flex-col gap-1">
      <p className="font-semibold">加载失败</p>
      <p className="max-w-md text-sm text-muted">{message}</p>
    </div>
    <Button variant="secondary" onPress={onRetry}>
      <RotateCw className="size-4" aria-hidden="true" />
      <span>重试</span>
    </Button>
  </div>
)

export const EmptyHint = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
    {children}
  </p>
)
