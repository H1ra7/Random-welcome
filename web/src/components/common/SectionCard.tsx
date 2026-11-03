import type { ReactNode } from 'react'

import { Card, Description, cn } from '@heroui/react'

interface SectionCardProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** 内容区默认纵向排列；需要自定义时传 false 自行布局。 */
  stacked?: boolean
}

/**
 * 卡片式分区容器：标题 + 说明 + 右上角操作 + 内容。
 */
const SectionCard = ({ title, description, actions, children, className, stacked = true }: SectionCardProps) => (
  <Card className={cn('min-w-0', className)}>
    <Card.Header className="flex flex-row items-start justify-between gap-4 px-5 pt-5 sm:px-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Card.Title className="text-base font-semibold sm:text-lg">{title}</Card.Title>
        {description ? <Description className="text-sm">{description}</Description> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </Card.Header>
    <Card.Content className={cn('px-5 pb-5 pt-4 sm:px-6 sm:pb-6', stacked && 'flex flex-col gap-5')}>
      {children}
    </Card.Content>
  </Card>
)

export default SectionCard
