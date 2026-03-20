import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath, pathToFileURL } from "url";

const currentFilePath = fileURLToPath(import.meta.url);
const pluginRoot = path.resolve(path.dirname(currentFilePath), "..");

const PLUGIN_NAME = "random-welcome";
const TPL_PATH = path.join(pluginRoot, "resources", "welcome", "index.html");
const RES_PATH = path.join(pluginRoot, "resources").replace(/\\/g, "/") + "/";
const CSS_FILE_URL = pathToFileURL(path.join(pluginRoot, "resources", "welcome", "index.css")).href;
const BG_DIR = path.join(pluginRoot, "resources", "welcome", "backgrounds");
const QQ_AVATAR_API = "https://q1.qlogo.cn/g?b=qq&s=640&nk=";
const SCREENSHOT_NAME = `${PLUGIN_NAME}-welcome-card`;
const BG_EXT_SET = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const NO_BG = "";

async function pickRandomBackgroundUrl() {
  try {
    const entries = await fs.readdir(BG_DIR, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && BG_EXT_SET.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name);
    if (files.length === 0) {
      return NO_BG;
    }
    const randomFile = files[Math.floor(Math.random() * files.length)];
    return pathToFileURL(path.join(BG_DIR, randomFile)).href;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      logger.warn(`[${PLUGIN_NAME}] 读取背景图目录失败: ${String(error?.message || error)}`);
    }
    return NO_BG;
  }
}

/**
 * 渲染欢迎卡片为图片 Buffer。
 * @param {object} puppeteer  Yunzai 全局 puppeteer（renderer）实例
 * @param {object} opts
 * @param {string|number} opts.userId   新入群者 QQ
 * @param {string} opts.nickname        新入群者昵称
 * @param {string} opts.groupName       群名称
 * @param {number} opts.memberCount     群成员数
 * @param {string} opts.storyText       随机生成的欢迎文案（纯文本）
 * @param {string} opts.groupTitle      群头衔（用于徽章显示）
 * @param {string} opts.location        地点名
 * @param {string} opts.role            职业 / 角色
 * @param {string} opts.food            美食
 * @returns {Promise<Buffer|false>}     图片 Buffer 或 false
 */
export async function renderWelcomeCard(puppeteer, opts) {
  if (!puppeteer?.screenshot) {
    logger.error(`[${PLUGIN_NAME}] Puppeteer 渲染器不可用`);
    return false;
  }
  const backgroundImageUrl = await pickRandomBackgroundUrl();

  const data = {
    tplFile: TPL_PATH,
    resPath: RES_PATH,
    cssFileUrl: CSS_FILE_URL,
    avatarUrl: `${QQ_AVATAR_API}${opts.userId}`,
    nickname: opts.nickname || "旅行者",
    userId: String(opts.userId),
    groupName: opts.groupName || "未知群聊",
    memberCount: opts.memberCount ?? "?",
    storyText: opts.storyText || "欢迎来到这里。",
    groupTitle: typeof opts.groupTitle === "string" ? opts.groupTitle : "",
    location: opts.location || "",
    role: opts.role || "",
    food: opts.food || "",
    backgroundImageUrl,
    imgType: "png",
    omitBackground: true,
    quality: 100,
  };

  return puppeteer.screenshot(SCREENSHOT_NAME, data);
}
