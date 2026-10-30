/**
 * 欢迎词核心：配置读取、随机抽取、模板渲染、取群成员信息、生图。
 * 事件层（入群）与命令层（预览/抽卡/迎新卡）共用。
 */
import { logger, segment } from "node-karin";
import config from "./config.js";
import { renderWelcomeCard } from "./renderer.js";

const EMPTY_TEXT = "";
const TITLE_MAX_LENGTH = 18;
const RENDER_MODE_IMAGE = "image";
const lastPickedMap = new Map();
const MEMBER_LOOKUP_ATTEMPTS = 2;
const MEMBER_LOOKUP_RETRY_MS = 800;

export function pickRandom(items, contextKey = null) {
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

export function wrapQuoted(text) {
  if (typeof text !== "string") {
    return "";
  }
  const value = text.trim();
  return value ? `「${value}」` : "";
}

export function toPlainText(msgArr) {
  if (!Array.isArray(msgArr) || msgArr.length === 0) {
    return "";
  }
  return msgArr.filter((part) => typeof part === "string").join("").trim();
}

export function normalizeGroupTitle(title) {
  if (typeof title !== "string") {
    return EMPTY_TEXT;
  }
  return title.trim().slice(0, TITLE_MAX_LENGTH);
}

export function parseTemplate(templateStr, params) {
  if (!templateStr) return [""];

  const parts = templateStr.split(/(\{.*?\})/);
  const msgArr = [];

  for (const part of parts) {
    if (!part) continue;
    switch (part) {
      case "{at_user}":
        if (params.allowAt && params.atUserId) {
          msgArr.push(segment.at(String(params.atUserId)));
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

export async function getGroupInfo(e, groupId) {
  if (!groupId) return null;
  try {
    return await e.bot.getGroupInfo(String(groupId));
  } catch (error) {
    logger.warn(`[random-welcome] 获取群信息失败: ${String(error?.message || error)}`);
    return null;
  }
}

/** 取群成员信息；通知触发时缓存可能未就绪，失败重试一次 */
export async function resolveGroupUser(e, groupId, userId, options = {}) {
  const { requireMember = false, fallbackGroupName = e.contact?.name } = options;
  let memberInfo = null;

  for (let attempt = 0; attempt < MEMBER_LOOKUP_ATTEMPTS && !memberInfo; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, MEMBER_LOOKUP_RETRY_MS));
    }
    memberInfo = await e.bot.getGroupMemberInfo(String(groupId), String(userId)).catch((error) => {
      logger.warn(`[random-welcome] 获取群成员信息失败: ${String(error?.message || error)}`);
      return null;
    });
  }

  const groupInfo = await getGroupInfo(e, groupId);

  if (requireMember && !memberInfo) {
    throw new Error("无法获取群成员信息");
  }

  return {
    userId: String(userId),
    nickname: memberInfo?.card || memberInfo?.nick || `QQ${userId}`,
    groupName: groupInfo?.groupName || fallbackGroupName || "未知群聊",
    groupTitle: normalizeGroupTitle(memberInfo?.uniqueTitle),
    memberLevel: Number(memberInfo?.level) > 0 ? Number(memberInfo.level) : null,
    memberCount: groupInfo?.memberCount ?? "?",
    memberInfo,
  };
}

export function buildWelcomeMessageArray(e, groupId, allowAt = true, atUserId = null) {
  const { profile, lexicon, templates } = config.getWelcomeData(groupId);
  if (!lexicon || lexicon.length === 0) return ["（欢迎词词库加载失败，请检查配置）"];

  const place = pickRandom(lexicon, `lexicon_${groupId}`);
  if (!place) return ["（获取地点异常）"];

  const params = {
    location: wrapQuoted(place.location || ""),
    role: wrapQuoted(pickRandom(place.roles, `role_${groupId}`) || ""),
    food: wrapQuoted(pickRandom(place.foods, `food_${groupId}`) || ""),
    botName: e?.bot?.selfName || e?.bot?.account?.name || "机器人",
    allowAt,
    atUserId: atUserId ?? e?.userId,
  };

  if (!templates || templates.length === 0) return [`（风格 ${profile} 的模板加载失败，请检查配置）`];

  return parseTemplate(pickRandom(templates, `template_${groupId}`), params);
}

async function getMemberCount(e, groupId) {
  const groupInfo = await getGroupInfo(e, groupId);
  return groupInfo?.memberCount ?? "?";
}

/** 返回 segment.image 或 false */
export async function buildWelcomeImage(e, groupId, userInfo = null, isManual = false) {
  // 预览/主动发卡只传了群号：补一次成员信息，否则拿不到群名、群头衔和成员等级
  let profile = userInfo;
  if (!profile && groupId) {
    profile = await resolveGroupUser(e, groupId, e.userId).catch((error) => {
      logger.warn(`[random-welcome] 预览获取成员信息失败: ${String(error?.message || error)}`);
      return null;
    });
  }

  const userId = profile?.userId ?? e.userId;
  const memberCount = isManual ? EMPTY_TEXT : (profile?.memberCount ?? await getMemberCount(e, groupId));
  const memberLevelText = profile?.memberLevel != null ? `LV.${profile.memberLevel}` : "";
  const storyText = toPlainText(buildWelcomeMessageArray(e, groupId, false)) || "欢迎来到这里。";

  try {
    const image = await renderWelcomeCard({
      userId,
      nickname: profile?.nickname || e.sender?.card || e.sender?.nick || `QQ${userId}`,
      groupName: profile?.groupName || e.contact?.name || "未知群聊",
      memberCount,
      storyText,
      groupTitle: profile?.groupTitle || memberLevelText || normalizeGroupTitle(e.sender?.title),
    });
    if (!image) {
      return false;
    }
    // render.render 返回裸 base64；NapCat/OneBot 只认 base64:// 前缀，裸串会报「识别URL失败」并丢消息
    const file = String(image).startsWith("base64://") ? String(image) : `base64://${image}`;
    return segment.image(file);
  } catch (error) {
    logger.error(`[random-welcome] 图片渲染失败: ${String(error?.message || error)}`);
    return false;
  }
}

export function renderMode() {
  return config.setting.render_mode === RENDER_MODE_IMAGE;
}

export function isAdminOrMaster(e) {
  if (e.isMaster) {
    return true;
  }
  return e.sender?.role === "admin" || e.sender?.role === "owner";
}

export const ADMIN_ONLY_TEXT = "仅群管理员/群主/机器人主人可执行该命令。";
