import type { LucideIcon } from 'lucide-react'
import { BookOpen, Eye, FileText, LayoutDashboard, Settings, Users } from 'lucide-react'

export type PageKey = 'overview' | 'settings' | 'groups' | 'lexicon' | 'templates' | 'preview'

export interface NavItem {
  key: PageKey
  label: string
  icon: LucideIcon
  hint: string
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: '概览', icon: LayoutDashboard, hint: '统计与命令速查' },
  { key: 'settings', label: '全局设置', icon: Settings, hint: '默认风格、渲染与延迟' },
  { key: 'groups', label: '群规则', icon: Users, hint: '按群开关与风格' },
  { key: 'lexicon', label: '词库', icon: BookOpen, hint: '地点 / 角色 / 食物' },
  { key: 'templates', label: '模板', icon: FileText, hint: '欢迎词模板与占位符' },
  { key: 'preview', label: '预览', icon: Eye, hint: '文本与图片预览' }
]
