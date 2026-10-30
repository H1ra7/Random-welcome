/**
 * 无状态业务：只处理「一次抽卡」，不读群级开关。
 * 命令层和事件层共用，避免 #发迎新卡 / #抽专属卡 被群级 enabled 连带禁用。
 */
import { logger, redis, segment } from "node-karin";
import {
  ADMIN_ONLY_TEXT,
  buildWelcomeImage,
  buildWelcomeMessageArray,
  getGroupInfo,
  isAdminOrMaster,
  normalizeGroupTitle,
  renderMode,
} from "./welcome.js";

const PRIVATE_DRAW_REDIS_PREFIX = "random_welcome:daily_draw";
const PRIVATE_DRAW_CD_TEXT = "你今天已经抽过啦，明天再来试试~";
const PRIVATE_DRAW_USAGE_TEXT = "格式错误，请使用：#抽专属卡 群号";
const PRIVATE_DRAW_GROUP_ONLY_TEXT = "该指令请在私聊中使用：#抽专属卡 群号";
const ADMIN_DRAW_USAGE_TEXT = "格式错误，请使用：#发迎新卡 @某人";
const MEMBER_INFO_FAIL_TEXT = "获取目标成员信息失败，请确认对方在本群且@格式正确。";

/**
 * 群临时会话的发送通道。
 * Karin 1.18.0 对 groupTemp 的 sendMsg 只带 user_id，NapCat 需要 group_id+user_id 才能回临时会话；
 * 这里在 OneBot 环境下直接走 send_private_msg，失败再回退标准 e.reply。
 */
function toOneBotElements(payload) {
  const parts = Array.isArray(payload) ? payload : [payload];
  const elements = [];
  for (const part of parts) {
    if (typeof part === "string") {
      elements.push({ type: "text", data: { text: part } });
    } else if (part?.type === "text") {
      elements.push({ type: "text", data: { text: part.text } });
    } else if (part?.type === "image") {
      elements.push({ type: "image", data: { file: part.file } });
    } else {
      return null;
    }
  }
  return elements.length > 0 ? elements : null;
}

async function replyPrivateDraw(e, payload, groupId) {
  const userId = Number(e.userId);
  if (e.isGroupTemp && groupId && Number.isFinite(userId) && typeof e.bot?.sendApi === "function") {
    const message = toOneBotElements(payload);
    if (message) {
      try {
        await e.bot.sendApi("send_private_msg", {
          user_id: userId,
          group_id: Number(groupId),
          message,
        });
        return;
      } catch (error) {
        logger.warn(`[random-welcome] 群临时会话发送失败，回退 e.reply: ${String(error?.message || error)}`);
      }
    }
  }
  await e.reply(payload);
}

export function getFirstAtUserId(e) {
  const atData = e?.at;
  if (Array.isArray(atData) && atData.length > 0) {
    const first = String(atData[0]).trim();
    if (/^\d+$/.test(first)) {
      return first;
    }
  }

  const msg = typeof e?.msg === "string" ? e.msg : "";
  const match = msg.match(/\[CQ:at,qq=(\d+)\]/);
  return match?.[1] ?? null;
}

function getSecondsUntilDayEnd() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 1000));
}

async function redisGet(key) {
  if (!redis?.get) {
    throw new Error("Redis 客户端不可用");
  }
  return redis.get(key);
}

async function redisSetWithExpire(key, value, ttlSec) {
  if (!redis) {
    throw new Error("Redis 客户端不可用");
  }
  if (typeof redis.setEx === "function") {
    await redis.setEx(key, ttlSec, value);
    return;
  }
  if (typeof redis.setex === "function") {
    await redis.setex(key, ttlSec, value);
    return;
  }
  if (typeof redis.set === "function") {
    try {
      await redis.set(key, value, { EX: ttlSec });
      return;
    } catch {
      await redis.set(key, value, "EX", ttlSec);
      return;
    }
  }
  throw new Error("Redis 不支持带过期时间的写入");
}

export function parsePrivateDrawGroupId(msg) {
  const match = msg.match(/^#抽专属卡(?:\s+(\d+))?$/);
  return match?.[1] ?? null;
}

/** 单成员信息：群信息取不到时不阻塞卡片生成 */
async function resolveUserForCard(e, groupId, userId, fallbackGroupName) {
  const [groupInfo, memberInfo] = await Promise.all([
    getGroupInfo(e, groupId),
    e.bot.getGroupMemberInfo(String(groupId), String(userId)).catch((error) => {
      logger.warn(`[random-welcome] 获取群成员信息失败: ${String(error?.message || error)}`);
      return null;
    }),
  ]);

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

/** #发迎新卡 @某人 */
export async function handleAdminDraw(e, msg) {
  if (!msg.startsWith("#发迎新卡")) {
    return false;
  }
  if (!e.isGroup || !e.groupId) {
    await e.reply("该指令需要在群聊中使用~");
    return true;
  }
  if (!isAdminOrMaster(e)) {
    await e.reply(ADMIN_ONLY_TEXT);
    return true;
  }

  const targetUserId = getFirstAtUserId(e);
  if (!targetUserId) {
    await e.reply(ADMIN_DRAW_USAGE_TEXT);
    return true;
  }

  let userInfo = null;
  try {
    userInfo = await resolveUserForCard(e, e.groupId, targetUserId);
    if (!userInfo.memberInfo) {
      throw new Error("无法获取群成员信息");
    }
  } catch (error) {
    logger.error(`[random-welcome] #发迎新卡 获取成员信息失败: ${String(error?.message || error)}`);
    await e.reply(MEMBER_INFO_FAIL_TEXT);
    return true;
  }

  if (renderMode()) {
    const image = await buildWelcomeImage(e, e.groupId, userInfo, true);
    if (image) {
      await e.reply(image);
      return true;
    }
    logger.error("[random-welcome] #发迎新卡 图片渲染失败，回退纯文本发送");
  }

  await e.reply([segment.at(targetUserId), ...buildWelcomeMessageArray(e, e.groupId, false)]);
  return true;
}

/** #抽专属卡 群号（私聊/群临时会话，每人每天一次） */
export async function handlePrivateDraw(e, msg) {
  if (!msg.startsWith("#抽专属卡")) {
    return false;
  }
  // 群临时会话不是 isPrivate（contact.scene === "groupTemp"），但同样是点对点可用
  if (!e.isPrivate && !e.isGroupTemp) {
    await e.reply(PRIVATE_DRAW_GROUP_ONLY_TEXT);
    return true;
  }

  const groupId = parsePrivateDrawGroupId(msg);
  if (!groupId) {
    await replyPrivateDraw(e, PRIVATE_DRAW_USAGE_TEXT, null);
    return true;
  }
  const reply = (payload) => replyPrivateDraw(e, payload, groupId);

  const userId = String(e.userId);
  if (!/^\d+$/.test(userId) || userId === "0") {
    await reply("无法识别你的账号信息，请稍后再试。");
    return true;
  }

  const cdKey = `${PRIVATE_DRAW_REDIS_PREFIX}:${userId}`;
  try {
    if (await redisGet(cdKey)) {
      await reply(PRIVATE_DRAW_CD_TEXT);
      return true;
    }
  } catch (error) {
    logger.error(`[random-welcome] 读取私聊抽卡冷却失败: ${String(error?.message || error)}`);
    await reply("抽卡冷却服务暂不可用，请稍后再试。");
    return true;
  }

  let userInfo = null;
  try {
    userInfo = await resolveUserForCard(e, groupId, userId, "未知群聊");
    if (!userInfo.memberInfo) {
      throw new Error("无法获取群成员信息");
    }
  } catch (error) {
    logger.error(`[random-welcome] #抽专属卡 成员校验失败: ${String(error?.message || error)}`);
    await reply("无法获取你的群成员信息，请检查群号并确认你在该群内。");
    return true;
  }

  let replyPayload = null;
  if (renderMode()) {
    replyPayload = await buildWelcomeImage(e, groupId, userInfo, true);
    if (!replyPayload) {
      logger.error("[random-welcome] #抽专属卡 图片渲染失败，回退纯文本发送");
    }
  }

  if (!replyPayload) {
    replyPayload = [`来自「${userInfo.groupName}」的专属欢迎词：`, ...buildWelcomeMessageArray(e, groupId, false)];
  }

  try {
    await redisSetWithExpire(cdKey, groupId, getSecondsUntilDayEnd());
  } catch (error) {
    logger.error(`[random-welcome] 写入私聊抽卡冷却失败: ${String(error?.message || error)}`);
    await reply("抽卡冷却服务暂不可用，请稍后再试。");
    return true;
  }

  await reply(replyPayload);
  return true;
}
