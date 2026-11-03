import { authClient } from '../auth/request'
import type {
  ApiResponse,
  BotGroup,
  GlobalSetting,
  GroupRule,
  LexiconItem,
  PluginState,
  PreviewResult,
  RenderMode
} from '../types/api'

/** 插件自带 Web 接口的 base 路径（由 apps/web.js 挂载，全部走 Karin 登录态）。 */
export const API_BASE = '/api/random-welcome/v1'

/** 图片预览要真跑 puppeteer 渲染，单独给 30s 超时。 */
const PREVIEW_TIMEOUT = 30000

interface MutationResult {
  state: PluginState
  message: string
}

const unwrap = async <T>(request: Promise<{ data: ApiResponse<T> }>): Promise<T> => {
  const response = await request
  if (!response.data.success || response.data.data === undefined) {
    throw new Error(response.data.message || '请求失败')
  }
  return response.data.data
}

/** 写操作统一返回「新的完整 state + 后端消息」，页面用它覆盖本地状态并提示。 */
const unwrapMutation = async (
  request: Promise<{ data: ApiResponse<PluginState> }>
): Promise<MutationResult> => {
  const response = await request
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.message || '请求失败')
  }
  return { state: response.data.data, message: response.data.message || '已保存' }
}

/** 一次拿全页面需要的状态（含设置、群规则、风格与内容、限制）。 */
export const fetchState = () => unwrap<PluginState>(authClient.get(`${API_BASE}/state`))

/** 机器人当前所在的群，用于群规则页选群（可能为空数组）。 */
export const fetchBotGroups = () => unwrap<BotGroup[]>(authClient.get(`${API_BASE}/bot-groups`))

/** 保存全局设置，只提交需要改动的字段。 */
export const saveSetting = (setting: Partial<GlobalSetting>) =>
  unwrapMutation(authClient.post(`${API_BASE}/setting`, { setting }))

/** 整体覆盖群规则（删群就是从数组里去掉）。 */
export const saveGroups = (groups: GroupRule[]) =>
  unwrapMutation(authClient.post(`${API_BASE}/groups`, { groups }))

/** 覆盖某个风格的自定义词库 / 模板（内置层不受影响）。 */
export const saveContent = (profile: string, payload: { lexicon?: LexiconItem[]; templates?: string[] }) =>
  unwrapMutation(authClient.post(`${API_BASE}/content`, { profile, ...payload }))

/** 新建 / 改名 / 删除风格。 */
export const manageProfile = (action: 'create' | 'rename' | 'delete', name: string, nextName?: string) =>
  unwrapMutation(authClient.post(`${API_BASE}/profiles`, { action, name, nextName }))

/** 生成一条预览（mode=image 会真渲染图片，耗时 2-10 秒）。 */
export const previewWelcome = (profile: string, mode: RenderMode, groupId?: number) =>
  unwrap<PreviewResult>(authClient.post(`${API_BASE}/preview`, { profile, mode, groupId }, { timeout: PREVIEW_TIMEOUT }))
