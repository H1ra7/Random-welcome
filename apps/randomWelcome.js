import plugin from "../../../lib/plugins/plugin.js";
import common from "../../../lib/common/common.js";
import config from "../utils/config.js";
import { renderWelcomeCard } from "../utils/renderer.js";

const PLUGIN_NAME = "专属入群欢迎词";
const PLUGIN_DESCRIPTION = "入群随机欢迎文案";
const PREVIEW_PLUGIN_NAME = "小说群欢迎词配置与预览";
const PREVIEW_PLUGIN_DESCRIPTION = "配置本群欢迎词开关及预览";
const EVENT_GROUP_INCREASE = "notice.group.increase";
const EVENT_MESSAGE = "message";
const PLUGIN_PRIORITY = 100;
const COMMAND_RULE_REG = "^(?:#(?:随机)?欢迎词帮助|#随机欢迎词列表|#欢迎词风格列表|#欢迎词设置|#欢迎词@(?:开启|关闭)|#设置欢迎词风格(?:\\s+.+)?|#添加欢迎词条(?:\\s+.+)?|#添加欢迎词(?:\\s+.+)?|#(?:开启|关闭)(?:随机)?欢迎词|#(?:随机欢迎词|欢迎词)(?:测试)?(?:\\s*\\d+)?|#发迎新卡(?:\\s+.+)?|#抽专属卡(?:\\s+\\d+)?)$";
const COMMAND_RULE_FNC = "handleCommand";
const CMD_ENABLE = "#开启欢迎词";
const CMD_ENABLE_RANDOM = "#开启随机欢迎词";
const CMD_DISABLE = "#关闭欢迎词";
const CMD_DISABLE_RANDOM = "#关闭随机欢迎词";
const CMD_PROFILE_SET = "#设置欢迎词风格";
const CMD_TEMPLATE_ADD = "#添加欢迎词";
const CMD_LEXICON_ADD = "#添加欢迎词条";
const CMD_PROFILE_LIST = "#欢迎词风格列表";
const CMD_GROUP_LIST = "#随机欢迎词列表";
const CMD_HELP = "#欢迎词帮助";
const CMD_HELP_ALIAS = "#随机欢迎词帮助";
const CMD_PREVIEW_1 = "#随机欢迎词";
const CMD_PREVIEW_2 = "#欢迎词";
const CMD_PREVIEW_TEST_1 = "#随机欢迎词测试";
const CMD_PREVIEW_TEST_2 = "#欢迎词测试";
const CMD_MENTION_ENABLE = "#欢迎词@开启";
const CMD_MENTION_DISABLE = "#欢迎词@关闭";
const CMD_GROUP_SETTING = "#欢迎词设置";
const CMD_ADMIN_DRAW = "#发迎新卡";
const CMD_PRIVATE_DRAW = "#抽专属卡";
const ADMIN_ONLY_TEXT = "仅群管理员/群主/机器人主人可执行该命令。";
const ADMIN_DRAW_USAGE_TEXT = "格式错误，请使用：#发迎新卡 @某人";
const PRIVATE_DRAW_USAGE_TEXT = "格式错误，请使用：#抽专属卡 群号";
const PRIVATE_DRAW_GROUP_ONLY_TEXT = "该指令请在私聊中使用：#抽专属卡 群号";
const PRIVATE_DRAW_CD_TEXT = "你今天已经抽过啦，明天再来试试~";
const PRIVATE_DRAW_REDIS_PREFIX = "random_welcome:daily_draw";
const MAX_TEMPLATE_LENGTH = 300;
const MAX_LEXICON_LOCATION_LENGTH = 30;
const MAX_LEXICON_ITEM_LENGTH = 30;
const DEFAULT_DEDUPE_WINDOW_SEC = 30;
const RENDER_MODE_IMAGE = "image";
const EMPTY_TEXT = "";
const TITLE_MAX_LENGTH = 18;
const welcomeDedupMap = new Map();
const lastPickedMap = new Map();

function getHelpText(isGroup, groupId) {
  const title = isGroup ? "随机欢迎词帮助（群聊）" : "随机欢迎词帮助（私聊）";
  const profile = isGroup && groupId ? config.getGroupProfile(groupId) : config.setting.default_profile;
  const groupRule = isGroup && groupId ? config.getGroupRule(groupId) : null;
  const groupSetting = isGroup && groupRule
    ? `\n本群状态：\n- 开关：${groupRule.enabled ? "开启" : "关闭"}\n- 风格：${profile}\n- @新人：${groupRule.mention_new_member ? "开启" : "关闭"}`
    : "";
  return `${title}
功能：
- 新人入群时自动发送随机欢迎词（地点+身份+美食）
- 支持按群设置开关、风格、@新人
- 支持入群事件去重，避免重复欢迎

可用命令：
- #欢迎词帮助 / #随机欢迎词帮助
- #随机欢迎词 / #欢迎词 / #随机欢迎词测试 / #欢迎词测试
- #欢迎词风格列表
- #欢迎词设置（仅群聊）
- #发迎新卡 @某人（仅群聊，管理权限）
- #抽专属卡 群号（仅私聊，每人每天 1 次）
- #开启欢迎词 / #开启随机欢迎词（仅群聊，管理权限）
- #关闭欢迎词 / #关闭随机欢迎词（仅群聊，管理权限）
- #欢迎词@开启 / #欢迎词@关闭（仅群聊，管理权限）
- #设置欢迎词风格 风格名（仅群聊，管理权限）
- #添加欢迎词 模板内容（仅群聊，管理权限）
- #添加欢迎词条 地点|角色1,角色2|食物1,食物2（仅群聊，管理权限）
- #随机欢迎词列表（仅机器人主人）

权限说明：
- 管理权限 = 群管理员 / 群主 / 机器人主人${groupSetting}`;
}

function pickRandom(items, contextKey = null) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  if (items.length === 1) return items[0];

  let index = Math.floor(Math.random() * items.length);
  if (contextKey) {
    let attempts = 0;
    while (lastPickedMap.get(contextKey) === index && attempts < 5) {
      index = Math.floor(Math.random() * items.length);
      attempts++;
    }
    lastPickedMap.set(contextKey, index);
  }
  return items[index];
}

function wrapQuoted(text) {
  if (typeof text !== "string") {
    return "";
  }
  const value = text.trim();
  if (!value) {
    return "";
  }
  return `「${value}」`;
}

function parseTemplate(templateStr, params, e) {
  if (!templateStr) return [""];
  
  const parts = templateStr.split(/(\{.*?\})/);
  const msgArr = [];
  
  for (let part of parts) {
    if (!part) continue;
    switch (part) {
      case "{at_user}":
        if (params.allowAt && e?.isGroup && e.user_id) {
          msgArr.push(segment.at(e.user_id));
        }
        break;
      case "{location}":
        msgArr.push(params.location || "");
        break;
      case "{role}":
        msgArr.push(params.role || "");
        break;
      case "{food}":
        msgArr.push(params.food || "");
        break;
      case "{bot_name}":
        msgArr.push(params.botName || "机器人");
        break;
      default:
        msgArr.push(part);
        break;
    }
  }
  return msgArr;
}

function toPlainText(msgArr) {
  if (!Array.isArray(msgArr) || msgArr.length === 0) {
    return "";
  }
  let text = "";
  for (const part of msgArr) {
    if (typeof part === "string") {
      text += part;
    }
  }
  return text.trim();
}

function getPuppeteerRenderer(e) {
  if (e?.runtime?.puppeteer?.screenshot) {
    return e.runtime.puppeteer;
  }
  return null;
}

function toImageMessage(imageData) {
  if (Buffer.isBuffer(imageData)) {
    return segment.image(imageData);
  }
  return imageData;
}

function normalizeGroupTitle(title) {
  if (typeof title !== "string") {
    return EMPTY_TEXT;
  }
  const value = title.trim();
  if (!value) {
    return EMPTY_TEXT;
  }
  return value.slice(0, TITLE_MAX_LENGTH);
}

async function getGroupTitle(e) {
  const senderTitle = normalizeGroupTitle(e?.sender?.title);
  if (senderTitle) {
    return senderTitle;
  }

  const memberTitle = normalizeGroupTitle(e?.member?.title);
  if (memberTitle) {
    return memberTitle;
  }

  if (!e?.group?.pickMember || !e?.user_id) {
    return EMPTY_TEXT;
  }

  try {
    const memberInfo = await e.group.pickMember(e.user_id).getInfo();
    return normalizeGroupTitle(memberInfo?.title);
  } catch (error) {
    logger.warn(`[random-welcome] 获取群头衔失败: ${String(error?.message || error)}`);
    return EMPTY_TEXT;
  }
}

function getMemberCount(e) {
  return e?.group?.memberCount ?? e?.group?.member_count ?? e?.group?.info?.memberCount ?? e?.group?.info?.member_count ?? e?.group?.memberNum ?? "?";
}

function getFirstAtUserId(e) {
  const atData = e?.at;
  if (Array.isArray(atData) && atData.length > 0) {
    const first = Number(atData[0]);
    if (Number.isFinite(first) && first > 0) {
      return first;
    }
  }

  const directAt = Number(atData);
  if (Number.isFinite(directAt) && directAt > 0) {
    return directAt;
  }

  const msg = typeof e?.msg === "string" ? e.msg : EMPTY_TEXT;
  const match = msg.match(/\[CQ:at,qq=(\d+)\]/);
  if (match && match[1]) {
    return Number(match[1]);
  }
  return null;
}

function getSecondsUntilDayEnd() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const sec = Math.ceil((end.getTime() - now.getTime()) / 1000);
  return Math.max(1, sec);
}

function getRedisClient() {
  return globalThis.redis || global.redis || null;
}

async function redisGet(key) {
  const redisClient = getRedisClient();
  if (!redisClient?.get) {
    throw new Error("Redis 客户端不可用");
  }
  return redisClient.get(key);
}

async function redisSetWithExpire(key, value, ttlSec) {
  const redisClient = getRedisClient();
  if (!redisClient) {
    throw new Error("Redis 客户端不可用");
  }
  if (typeof redisClient.setEx === "function") {
    await redisClient.setEx(key, ttlSec, value);
    return;
  }
  if (typeof redisClient.setex === "function") {
    await redisClient.setex(key, ttlSec, value);
    return;
  }
  if (typeof redisClient.set === "function") {
    try {
      await redisClient.set(key, value, { EX: ttlSec });
      return;
    } catch (error) {
      await redisClient.set(key, value, "EX", ttlSec);
      return;
    }
  }
  throw new Error("Redis 不支持带过期时间的写入");
}

async function getMemberInfoFromBot(groupId, userId) {
  const bot = globalThis.Bot || global.Bot;
  if (!bot) {
    throw new Error("Bot 实例不可用");
  }

  const normalizedGroupId = Number(groupId);
  const normalizedUserId = Number(userId);
  let group = null;
  let memberInfo = null;
  let groupName = EMPTY_TEXT;

  if (typeof bot.pickGroup === "function") {
    group = bot.pickGroup(normalizedGroupId);
    groupName = group?.group_name || group?.info?.group_name || EMPTY_TEXT;
  }

  if (group?.pickMember) {
    try {
      memberInfo = await group.pickMember(normalizedUserId).getInfo();
    } catch (error) {
      memberInfo = null;
    }

    if (!groupName && typeof group.getInfo === "function") {
      try {
        const groupInfo = await group.getInfo();
        groupName = groupInfo?.group_name || groupName;
      } catch (error) {
        logger.warn(`[random-welcome] 获取群名称失败: ${String(error?.message || error)}`);
      }
    }
  }

  if (!memberInfo && typeof bot.getGroupMemberInfo === "function") {
    memberInfo = await bot.getGroupMemberInfo(normalizedGroupId, normalizedUserId);
  }

  if (!groupName && typeof bot.getGroupInfo === "function") {
    try {
      const info = await bot.getGroupInfo(normalizedGroupId);
      groupName = info?.group_name || groupName;
    } catch (error) {
      logger.warn(`[random-welcome] getGroupInfo 获取群名称失败: ${String(error?.message || error)}`);
    }
  }

  if (!memberInfo) {
    throw new Error("无法获取群成员信息");
  }

  return {
    groupName: groupName || "未知群聊",
    memberInfo,
  };
}

async function buildWelcomeImage(e, groupId, customUserInfo = null, isManual = false) {
  const renderer = getPuppeteerRenderer(e);
  if (!renderer) {
    return false;
  }
  const storyText = toPlainText(buildWelcomeMessageArray(e, groupId, false)) || "欢迎来到这里。";
  const customTitle = normalizeGroupTitle(customUserInfo?.groupTitle);
  let groupTitle = customTitle;
  if (!customUserInfo && !groupTitle) {
    groupTitle = await getGroupTitle(e);
  }
  const memberCount = isManual
    ? EMPTY_TEXT
    : (customUserInfo?.memberCount ?? getMemberCount(e));
  return renderWelcomeCard(renderer, {
    userId: customUserInfo?.userId ?? e.user_id,
    nickname: customUserInfo?.nickname || e?.sender?.card || e?.sender?.nickname || "旅行者",
    groupName: customUserInfo?.groupName || e?.group_name || e?.group?.info?.group_name || "未知群聊",
    memberCount,
    storyText,
    groupTitle,
  });
}

function buildWelcomeMessageArray(e, groupId, allowAt = true) {
  const { profile, lexicon, templates } = config.getWelcomeData(groupId);
  if (!lexicon || lexicon.length === 0) return ["（欢迎词词库加载失败，请检查配置）"];

  const place = pickRandom(lexicon, `lexicon_${groupId}`);
  if (!place) return ["（获取地点异常）"];

  const params = {
    location: wrapQuoted(place.location || ""),
    role: wrapQuoted(pickRandom(place.roles, `role_${groupId}`) || ""),
    food: wrapQuoted(pickRandom(place.foods, `food_${groupId}`) || ""),
    botName: global.Bot?.nickname || "机器人",
    allowAt,
  };

  if (!templates || templates.length === 0) return [`（风格 ${profile} 的模板加载失败，请检查配置）`];

  const templateStr = pickRandom(templates, `template_${groupId}`);
  return parseTemplate(templateStr, params, e);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseLexiconInput(text) {
  const parts = text.split("|").map((part) => part.trim());
  if (parts.length !== 3) {
    return null;
  }
  const [location, roleText, foodText] = parts;
  if (location.length > MAX_LEXICON_LOCATION_LENGTH) {
    return null;
  }
  const roles = roleText.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
  const foods = foodText.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
  if (roles.some((item) => item.length > MAX_LEXICON_ITEM_LENGTH) || foods.some((item) => item.length > MAX_LEXICON_ITEM_LENGTH)) {
    return null;
  }
  if (!location || roles.length === 0 || foods.length === 0) {
    return null;
  }
  return { location, roles, foods };
}

function isAdminOrMaster(e) {
  if (e.isMaster) {
    return true;
  }
  const role = e.sender?.role;
  return role === "admin" || role === "owner";
}

function isEnableCommand(msg) {
  return msg === CMD_ENABLE || msg === CMD_ENABLE_RANDOM;
}

function isDisableCommand(msg) {
  return msg === CMD_DISABLE || msg === CMD_DISABLE_RANDOM;
}

function isPreviewCommand(msg) {
  return /^#(?:随机欢迎词|欢迎词)(?:测试)?(?:\s*\d+)?$/.test(msg);
}

function isAdminDrawCommand(msg) {
  return msg.startsWith(CMD_ADMIN_DRAW);
}

function isPrivateDrawCommand(msg) {
  return msg.startsWith(CMD_PRIVATE_DRAW);
}

function parsePrivateDrawGroupId(msg) {
  const match = msg.match(/^#抽专属卡(?:\s+(\d+))?$/);
  if (!match || !match[1]) {
    return null;
  }
  const groupId = Number(match[1]);
  if (!Number.isFinite(groupId) || groupId <= 0) {
    return null;
  }
  return groupId;
}

function getConfiguredDedupeWindowSec() {
  const sec = Number(config.setting.dedupe_window_sec);
  return Number.isFinite(sec) && sec >= 0 ? sec : DEFAULT_DEDUPE_WINDOW_SEC;
}

function getDedupeWindowMs() {
  return Math.floor(getConfiguredDedupeWindowSec() * 1000);
}

function shouldSkipDuplicateWelcome(groupId, userId) {
  const dedupeWindowMs = getDedupeWindowMs();
  if (dedupeWindowMs <= 0) {
    return false;
  }
  const now = Date.now();
  for (const [key, ts] of welcomeDedupMap.entries()) {
    if (now - ts > dedupeWindowMs) {
      welcomeDedupMap.delete(key);
    }
  }
  const dedupeKey = `${groupId}:${userId}`;
  const lastTs = welcomeDedupMap.get(dedupeKey);
  if (lastTs && now - lastTs <= dedupeWindowMs) {
    return true;
  }
  welcomeDedupMap.set(dedupeKey, now);
  return false;
}

export class NovelRandomWelcome extends plugin {
  constructor() {
    super({
      name: PLUGIN_NAME,
      dsc: PLUGIN_DESCRIPTION,
      event: EVENT_GROUP_INCREASE,
      priority: PLUGIN_PRIORITY,
    });
  }

  async accept() {
    if (!this.e.group_id) {
      return false;
    }

    const { setting } = config;

    if (this.e.user_id === this.e.self_id) {
      return false;
    }

    // 检查本群是否开启
    if (!config.isGroupEnabled(this.e.group_id)) {
      return false;
    }

    if (shouldSkipDuplicateWelcome(this.e.group_id, this.e.user_id)) {
      return false;
    }

    // 随机延迟防刷屏风控
    const minDelay = Number(setting.delay_min) || 0;
    const maxDelay = Number(setting.delay_max) || 0;
    if (maxDelay >= minDelay && maxDelay > 0) {
      const waitTime = minDelay + Math.random() * (maxDelay - minDelay);
      await sleep(waitTime * 1000);
    }

    const groupRule = config.getGroupRule(this.e.group_id);
    if (config.setting.render_mode === RENDER_MODE_IMAGE) {
      const imageBuf = await buildWelcomeImage(this.e, this.e.group_id);
      if (imageBuf) {
        const imageMsg = toImageMessage(imageBuf);
        if (groupRule.mention_new_member) {
          await this.reply([segment.at(this.e.user_id), imageMsg]);
        } else {
          await this.reply(imageMsg);
        }
        return true;
      }
      logger.error("[random-welcome] 图片渲染失败，回退纯文本发送");
    }
    await this.reply(buildWelcomeMessageArray(this.e, this.e.group_id, groupRule.mention_new_member));
    return true;
  }
}

export class NovelRandomWelcomePreview extends plugin {
  constructor() {
    super({
      name: PREVIEW_PLUGIN_NAME,
      dsc: PREVIEW_PLUGIN_DESCRIPTION,
      event: EVENT_MESSAGE,
      priority: PLUGIN_PRIORITY,
      rule: [
        {
          reg: COMMAND_RULE_REG,
          fnc: COMMAND_RULE_FNC,
        },
      ],
    });
  }

  async handleAdminDraw(msg) {
    if (!isAdminDrawCommand(msg)) {
      return false;
    }
    if (!this.e.isGroup || !this.e.group_id) {
      await this.reply("该指令需要在群聊中使用~");
      return true;
    }
    if (!isAdminOrMaster(this.e)) {
      await this.reply(ADMIN_ONLY_TEXT);
      return true;
    }

    const targetUserId = getFirstAtUserId(this.e);
    if (!targetUserId) {
      await this.reply(ADMIN_DRAW_USAGE_TEXT);
      return true;
    }

    let memberInfo = null;
    try {
      if (this.e.group?.pickMember) {
        memberInfo = await this.e.group.pickMember(targetUserId).getInfo();
      }
      if (!memberInfo) {
        const detail = await getMemberInfoFromBot(this.e.group_id, targetUserId);
        memberInfo = detail.memberInfo;
      }
    } catch (error) {
      logger.error(`[random-welcome] #发迎新卡 获取成员信息失败: ${String(error?.message || error)}`);
      await this.reply("获取目标成员信息失败，请确认对方在本群且@格式正确。");
      return true;
    }

    const customUserInfo = {
      userId: targetUserId,
      nickname: memberInfo?.card || memberInfo?.nickname || `QQ${targetUserId}`,
      groupName: this.e.group_name || this.e.group?.info?.group_name || "未知群聊",
      groupTitle: normalizeGroupTitle(memberInfo?.title),
      memberCount: EMPTY_TEXT,
    };

    if (config.setting.render_mode === RENDER_MODE_IMAGE) {
      const imageBuf = await buildWelcomeImage(this.e, this.e.group_id, customUserInfo, true);
      if (imageBuf) {
        await this.reply(toImageMessage(imageBuf));
        return true;
      }
      logger.error("[random-welcome] #发迎新卡 图片渲染失败，回退纯文本发送");
    }

    await this.reply([segment.at(targetUserId), ...buildWelcomeMessageArray(this.e, this.e.group_id, false)]);
    return true;
  }

  async handlePrivateDraw(msg) {
    if (!isPrivateDrawCommand(msg)) {
      return false;
    }
    if (this.e.isGroup) {
      await this.reply(PRIVATE_DRAW_GROUP_ONLY_TEXT);
      return true;
    }

    const groupId = parsePrivateDrawGroupId(msg);
    if (!groupId) {
      await this.reply(PRIVATE_DRAW_USAGE_TEXT);
      return true;
    }

    const userId = Number(this.e.user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      await this.reply("无法识别你的账号信息，请稍后再试。");
      return true;
    }

    const cdKey = `${PRIVATE_DRAW_REDIS_PREFIX}:${userId}`;
    try {
      const cdValue = await redisGet(cdKey);
      if (cdValue) {
        await this.reply(PRIVATE_DRAW_CD_TEXT);
        return true;
      }
    } catch (error) {
      logger.error(`[random-welcome] 读取私聊抽卡冷却失败: ${String(error?.message || error)}`);
      await this.reply("抽卡冷却服务暂不可用，请稍后再试。");
      return true;
    }

    let detail = null;
    try {
      detail = await getMemberInfoFromBot(groupId, userId);
    } catch (error) {
      logger.error(`[random-welcome] #抽专属卡 成员校验失败: ${String(error?.message || error)}`);
      await this.reply("无法获取你的群成员信息，请检查群号并确认你在该群内。");
      return true;
    }

    const customUserInfo = {
      userId,
      nickname: detail.memberInfo?.card || detail.memberInfo?.nickname || this.e.sender?.nickname || "旅行者",
      groupName: detail.groupName,
      groupTitle: normalizeGroupTitle(detail.memberInfo?.title),
      memberCount: EMPTY_TEXT,
    };

    let replyPayload = null;
    if (config.setting.render_mode === RENDER_MODE_IMAGE) {
      const imageBuf = await buildWelcomeImage(this.e, groupId, customUserInfo, true);
      if (imageBuf) {
        replyPayload = toImageMessage(imageBuf);
      } else {
        logger.error("[random-welcome] #抽专属卡 图片渲染失败，回退纯文本发送");
      }
    }

    if (!replyPayload) {
      replyPayload = [`来自「${detail.groupName}」的专属欢迎词：`, ...buildWelcomeMessageArray(this.e, groupId, false)];
    }

    try {
      await redisSetWithExpire(cdKey, String(groupId), getSecondsUntilDayEnd());
    } catch (error) {
      logger.error(`[random-welcome] 写入私聊抽卡冷却失败: ${String(error?.message || error)}`);
      await this.reply("抽卡冷却服务暂不可用，请稍后再试。");
      return true;
    }

    await this.reply(replyPayload);
    return true;
  }

  async handleCommand() {
    const msg = this.e.msg.trim();
    const isMaster = this.e.isMaster;

    if (msg === CMD_HELP || msg === CMD_HELP_ALIAS) {
      await this.reply(getHelpText(Boolean(this.e.isGroup), this.e.group_id));
      return true;
    }

    if (await this.handleAdminDraw(msg)) {
      return true;
    }

    if (await this.handlePrivateDraw(msg)) {
      return true;
    }

    // 列表命令 (仅限 Master)
    if (msg === CMD_GROUP_LIST) {
      if (!isMaster) {
        await this.reply("只有主人才能查看全局欢迎词列表哦~");
        return true;
      }
      const groups = config.getEnabledGroups();
      if (groups.length === 0) {
        await this.reply("目前没有任何群开启随机欢迎词。");
      } else {
        await this.reply(`当前开启随机欢迎词的群聊 (${groups.length}个)：\n${groups.join("\n")}`);
      }
      return true;
    }

    if (msg === CMD_PROFILE_LIST) {
      const profiles = config.listProfiles();
      if (!this.e.isGroup || !this.e.group_id) {
        await this.reply(`可用欢迎词风格：\n${profiles.join("\n")}`);
        return true;
      }
      const current = config.getGroupProfile(this.e.group_id);
      await this.reply(`可用欢迎词风格：\n${profiles.join("\n")}\n\n本群当前风格：${current}`);
      return true;
    }

    if (!this.e.isGroup || !this.e.group_id) {
      if (isEnableCommand(msg) || isDisableCommand(msg) || msg === CMD_GROUP_SETTING || msg === CMD_MENTION_ENABLE || msg === CMD_MENTION_DISABLE || msg.startsWith(CMD_PROFILE_SET) || msg.startsWith(CMD_TEMPLATE_ADD) || msg.startsWith(CMD_LEXICON_ADD)) {
        await this.reply("该指令需要在群聊中使用~");
        return true;
      }
      if (isPreviewCommand(msg)) {
        await this.sendPreview(msg, undefined, false);
        return true;
      }
      return false;
    }

    if (msg === CMD_GROUP_SETTING) {
      const groupRule = config.getGroupRule(this.e.group_id);
      const delayMin = Number(config.setting.delay_min) || 0;
      const delayMax = Number(config.setting.delay_max) || 0;
      const dedupeSec = getConfiguredDedupeWindowSec();
      const mentionText = groupRule.mention_new_member ? "开启" : "关闭";
      const enabledText = groupRule.enabled ? "开启" : "关闭";
      await this.reply(`本群欢迎词设置：\n开关：${enabledText}\n风格：${groupRule.profile}\n@新人：${mentionText}\n延迟：${delayMin}-${delayMax} 秒\n去重窗口：${dedupeSec} 秒`);
      return true;
    }

    if (isEnableCommand(msg) || isDisableCommand(msg)) {
      if (!isAdminOrMaster(this.e)) {
        await this.reply(ADMIN_ONLY_TEXT);
        return true;
      }

      const isEnable = isEnableCommand(msg);
      const changed = config.setGroupEnable(this.e.group_id, isEnable);

      if (isEnable) {
        await this.reply(changed ? "本群已成功开启随机欢迎词~" : "本群已经开启过随机欢迎词了~");
      } else {
        await this.reply(changed ? "本群已关闭随机欢迎词播报。" : "本群原本就没有开启随机欢迎词哦。");
      }
      return true;
    }

    if (msg.startsWith(CMD_PROFILE_SET)) {
      if (!isAdminOrMaster(this.e)) {
        await this.reply(ADMIN_ONLY_TEXT);
        return true;
      }
      const profile = msg.slice(CMD_PROFILE_SET.length).trim();
      if (!profile) {
        await this.reply("格式错误，请使用：#设置欢迎词风格 风格名");
        return true;
      }
      if (!config.profileExists(profile)) {
        await this.reply(`风格不存在：${profile}\n可用风格：\n${config.listProfiles().join("\n")}`);
        return true;
      }
      const changed = config.setGroupProfile(this.e.group_id, profile);
      await this.reply(changed ? `本群欢迎词风格已设置为：${profile}` : `本群欢迎词风格已是：${profile}`);
      return true;
    }

    if (msg === CMD_MENTION_ENABLE || msg === CMD_MENTION_DISABLE) {
      if (!isAdminOrMaster(this.e)) {
        await this.reply(ADMIN_ONLY_TEXT);
        return true;
      }
      const enableMention = msg === CMD_MENTION_ENABLE;
      const changed = config.setGroupMention(this.e.group_id, enableMention);
      const stateText = enableMention ? "开启" : "关闭";
      await this.reply(changed ? `本群欢迎词 @新人 已${stateText}。` : `本群欢迎词 @新人 已经是${stateText}状态。`);
      return true;
    }

    if (msg.startsWith(CMD_LEXICON_ADD)) {
      if (!isAdminOrMaster(this.e)) {
        await this.reply(ADMIN_ONLY_TEXT);
        return true;
      }
      const payload = msg.slice(CMD_LEXICON_ADD.length).trim();
      const item = parseLexiconInput(payload);
      if (!item) {
        await this.reply(`格式错误，请使用：#添加欢迎词条 地点|角色1,角色2|食物1,食物2\n限制：地点最多 ${MAX_LEXICON_LOCATION_LENGTH} 字，角色/食物每项最多 ${MAX_LEXICON_ITEM_LENGTH} 字`);
        return true;
      }
      const profile = config.getGroupProfile(this.e.group_id);
      const ok = config.addLexiconItem(profile, item);
      await this.reply(ok ? `已添加词条到风格：${profile}` : "添加失败，请检查词条格式");
      return true;
    }

    if (msg.startsWith(CMD_TEMPLATE_ADD)) {
      if (!isAdminOrMaster(this.e)) {
        await this.reply(ADMIN_ONLY_TEXT);
        return true;
      }
      const payload = msg.slice(CMD_TEMPLATE_ADD.length).trim();
      if (!payload) {
        await this.reply("格式错误，请使用：#添加欢迎词 模板内容");
        return true;
      }
      if (payload.length > MAX_TEMPLATE_LENGTH) {
        await this.reply(`模板过长，请控制在 ${MAX_TEMPLATE_LENGTH} 字以内。`);
        return true;
      }
      const profile = config.getGroupProfile(this.e.group_id);
      const ok = config.addTemplate(profile, payload);
      await this.reply(ok ? `已添加模板到风格：${profile}` : "添加失败，请检查模板内容");
      return true;
    }

    if (isPreviewCommand(msg)) {
      const groupRule = config.getGroupRule(this.e.group_id);
      await this.sendPreview(msg, this.e.group_id, groupRule.mention_new_member);
      return true;
    }

    return false;
  }

  async sendPreview(msg, groupId, allowAt) {
    const match = msg.match(/^#(?:随机欢迎词|欢迎词)(?:测试)?(?:\s*(\d+))?$/);
    const count = match && match[1] ? Math.max(1, Math.min(100, parseInt(match[1]))) : 1;

    if (count === 1) {
      if (config.setting.render_mode === RENDER_MODE_IMAGE) {
        const imageBuf = await buildWelcomeImage(this.e, groupId);
        if (imageBuf) {
          const imageMsg = toImageMessage(imageBuf);
          if (allowAt && this.e?.isGroup && this.e?.user_id) {
            await this.reply([segment.at(this.e.user_id), imageMsg]);
          } else {
            await this.reply(imageMsg);
          }
          return;
        }
        logger.error("[random-welcome] 预览图渲染失败，回退纯文本发送");
      }
      await this.reply(buildWelcomeMessageArray(this.e, groupId, allowAt));
      return;
    }

    const senderName = this.e.sender?.card || this.e.sender?.nickname || "匿名消息";
    const senderUin = String(Number(this.e.user_id) || 80000000);

    const rawNodes = [];
    rawNodes.push({
      message: `随机欢迎词预览 (${count}条)`,
      nickname: senderName,
      user_id: senderUin
    });

    for (let i = 0; i < count; i++) {
        rawNodes.push({
            message: buildWelcomeMessageArray(this.e, groupId, allowAt),
            nickname: senderName,
            user_id: senderUin
        });
    }

    if (this.e.group?.sendForwardMsg) {
      await this.e.group.sendForwardMsg(rawNodes);
    } else if (this.e.friend?.sendForwardMsg) {
      await this.e.friend.sendForwardMsg(rawNodes);
    } else {
      const messages = [];
      messages.push(`随机欢迎词预览 (${count}条)`);
      for (let i = 0; i < count; i++) {
        messages.push(buildWelcomeMessageArray(this.e, groupId, allowAt));
      }
      await this.reply(await common.makeForwardMsg(this.e, messages));
    }
  }
}
