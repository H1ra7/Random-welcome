import type { LucideIcon } from 'lucide-react'

import { cn } from '@heroui/react'

interface StatCardProps {
  label: string
  value: number | string
  hint?: string
  icon: LucideIcon
  tone?: 'accent' | 'success' | 'warning' | 'default'
}

const toneClass: Record<NonNullable<StatCardProps['tone']>, string> = {
  accent: 'bg-accent-soft text-accent-soft-foreground',
  success: 'bg-success-soft text-success-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  default: 'bg-default-soft text-default-soft-foreground'
}

/**
 * 概览页的统计卡片。
 */
const StatCard = ({ label, value, hint, icon: Icon, tone = 'default' }: StatCardProps) => (
  <div className="flex min-w-0 items-center gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
    <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', toneClass[tone])}>
      <Icon className="size-5" aria-hidden="true" />
    </span>
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-2xl font-semibold tabular-nums leading-tight">{value}</span>
      {hint ? <span className="truncate text-xs text-muted">{hint}</span> : null}
    </div>
  </div>
)

export default StatCard
