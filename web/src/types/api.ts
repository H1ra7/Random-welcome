export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
  code?: number
}

export interface PluginMeta {
  name: string
  version: string
  description: string
}

export type RenderMode = 'text' | 'image'

export interface GlobalSetting {
  default_profile: string
  render_mode: RenderMode
  mention_new_member: boolean
  dedupe_window_sec: number
  delay_min: number
  delay_max: number
}

export interface GroupRule {
  id: number
  enabled: boolean
  profile: string
  mention_new_member: boolean
  allow_preview: boolean
}

export interface ProfileSummary {
  name: string
  builtin: boolean
  groupCount: number
  lexiconCount: number
  templateCount: number
}

export interface LexiconItem {
  location: string
  roles: string[]
  foods: string[]
}

export interface ProfileContent {
  name: string
  builtin: boolean
  lexiconBuiltin: LexiconItem[]
  lexiconCustom: LexiconItem[]
  templatesBuiltin: string[]
  templatesCustom: string[]
}

export interface StateLimits {
  templateLength: number
  lexiconLocationLength: number
  lexiconItemLength: number
  delayMax: number
  dedupeMax: number
}

export interface PluginState {
  plugin: PluginMeta
  setting: GlobalSetting
  groups: GroupRule[]
  profiles: ProfileSummary[]
  contents: ProfileContent[]
  limits: StateLimits
}

export interface BotGroup {
  id: number
  name: string
  memberCount: number
  botId: string
}

export interface PreviewResult {
  profile: string
  mode: RenderMode
  text: string
  image: string | null
  warning?: string
}
