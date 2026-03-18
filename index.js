import { NovelRandomWelcome, NovelRandomWelcomePreview } from "./apps/randomWelcome.js"

const loadStart = Date.now()

const apps = Object.freeze({
  NovelRandomWelcome,
  NovelRandomWelcomePreview
})

const cost = Date.now() - loadStart
const mark = globalThis.logger?.mark ? globalThis.logger.mark.bind(globalThis.logger) : console.log
const info = globalThis.logger?.info ? globalThis.logger.info.bind(globalThis.logger) : console.log
const border = "########################################"

mark(border)
mark(`# [random-welcome] 启动成功 >_< 耗时: ${cost}ms #`)
info("# 功能：专属入群欢迎     #")
info("# 指令：#开启欢迎词 / #欢迎词风格列表           #")
mark(border)

export { apps }
