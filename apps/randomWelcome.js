import { common, karin, logger, redis, segment } from "node-karin";
import config from "../utils/config.js";
import { renderWelcomeCard } from "../utils/renderer.js";

const PLUGIN_NAME = "专属入群欢迎词";
const PREVIEW_PLUGIN_NAME = "小说群欢迎词配置与预览";
const EVENT_GROUP_MEMBER_ADD = "notice.groupMemberAdd";
const PLUGIN_PRIORITY = 100;
const COMMAND_RULE_REG = /^(?:#(?:随机)?欢迎词帮助|#随机欢迎词列表|#欢迎词风格列表|#欢迎词设置|#欢迎词@(?:开启|关闭)|#设置欢迎词风格(?:\s+.+)?|#添加欢迎词条(?:\s+.+)?|#添加欢迎词(?:\s+.+)?|#(?:开启|关闭)(?:随机)?欢迎词|#(?:随机欢迎词|欢迎词)(?:测试)?(?:\s*\d+)?|#发迎新卡(?:\s+.+)?|#抽专属卡(?:\s+\d+)?)$/;
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

function getHelpNodes(isGroup, groupId) {
  const profile = isGroup && groupId ? config.getGroupProfile(groupId) : config.setting.default_profile;
  const groupRule = isGroup && groupId ? config.getGroupRule(groupId) : null;
  const nodes = [
    `【功能】\n- 新人入群时自动发送随机欢迎词（地点+身份+美食）\n- 支持按群设置开关、风格、@新人\n- 支持入群事件去重，避免重复欢迎`,
    `【预览】\n- #随机欢迎词 / #欢迎词\n- #随机欢迎词测试 / #欢迎词测试\n- #随机欢迎词 5（数字=条数，合并转发，上限 100）`,
    `【群管理】\n- #欢迎词设置：查看本群配置\n- #开启欢迎词 / #开启随机欢迎词\n- #关闭欢迎词 / #关闭随机欢迎词\n- #欢迎词@开启 / #欢迎词@关闭\n- #设置欢迎词风格 风格名\n- #欢迎词风格列表`,
    `【词库维护】\n- #添加欢迎词 模板内容\n  占位符：{location} {role} {food} {bot_name} {at_user}\n- #添加欢迎词条 地点|角色1,角色2|食物1,食物2\n  写入 config/ 下 YAML，立即生效`,
    `【其它】\n- #发迎新卡 @某人：管理员手动发卡（仅群聊）\n- #抽专属卡 群号：每人每天 1 次（仅私聊）\n- #随机欢迎词列表：查看已开启的群（仅主人）\n\n权限：管理指令需 群管理员 / 群主 / 机器人主人`,
  ];
  if (groupRule) {
    nodes.push(
      `【本群状态】\n- 开关：${groupRule.enabled ? "开启" : "关闭"}\n- 风格：${profile}\n- @新人：${groupRule.mention_new_member ? "开启" : "关闭"}`,
    );
  }
  return nodes;
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

function parseTemplate(templateStr, params) {
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

function getFirstAtUserId(e) {
  const atData = e?.at;
  if (Array.isArray(atData) && atData.length > 0) {
    const first = String(atData[0]).trim();
    if (/^\d+$/.test(first)) {
      return first;
    }
  }

  const msg = typeof e?.msg === "string" ? e.msg : EMPTY_TEXT;
  const match = msg.match(/\[CQ:at,qq=(\d+)\]/);
  if (match && match[1]) {
    return match[1];
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

async function getGroupInfo(e, groupId) {
  if (!groupId) return null;
  try {
    return await e.bot.getGroupInfo(String(groupId));
  } catch (error) {
    logger.warn(`[random-welcome] 获取群信息失败: ${String(error?.message || error)}`);
    return null;
  }
}

async function resolveGroupUser(e, groupId, userId, options = {}) {
  const { requireMember = false, fallbackGroupName = e.contact?.name } = options;
  const [groupInfo, memberInfo] = await Promise.all([
    getGroupInfo(e, groupId),
    e.bot.getGroupMemberInfo(String(groupId), String(userId)).catch((error) => {
      logger.warn(`[random-welcome] 获取群成员信息失败: ${String(error?.message || error)}`);
      return null;
    }),
  ]);

  if (requireMember && !memberInfo) {
    throw new Error("无法获取群成员信息");
  }

  return {
    userId: String(userId),
    nickname: memberInfo?.card || memberInfo?.nick || `QQ${userId}`,
    groupName: groupInfo?.groupName || fallbackGroupName || "未知群聊",
    groupTitle: normalizeGroupTitle(memberInfo?.uniqueTitle),
    memberCount: groupInfo?.memberCount ?? "?",
  };
}

function buildWelcomeMessageArray(e, groupId, allowAt = true, atUserId = null) {
  const { profile, lexicon, templates } = config.getWelcomeData(groupId);
  if (!lexicon || lexicon.length === 0) return ["（欢迎词词库加载失败，请检查配置）"];

  const place = pickRandom(lexicon, `lexicon_${groupId}`);
  if (!place) return ["（获取地点异常）"];

  const atTarget = atUserId ?? e?.userId;
  const params = {
    location: wrapQuoted(place.location || ""),
    role: wrapQuoted(pickRandom(place.roles, `role_${groupId}`) || ""),
    food: wrapQuoted(pickRandom(place.foods, `food_${groupId}`) || ""),
    botName: e?.bot?.selfName || e?.bot?.account?.name || "机器人",
    allowAt,
    atUserId: atTarget,
  };

  if (!templates || templates.length === 0) return [`（风格 ${profile} 的模板加载失败，请检查配置）`];

  const templateStr = pickRandom(templates, `template_${groupId}`);
  return parseTemplate(templateStr, params);
}

async function getMemberCount(e, groupId) {
  const groupInfo = await getGroupInfo(e, groupId);
  return groupInfo?.memberCount ?? "?";
}

async function buildWelcomeImage(e, groupId, userInfo = null, isManual = false) {
  const userId = userInfo?.userId ?? e.userId;
  const memberCount = isManual ? EMPTY_TEXT : (userInfo?.memberCount ?? await getMemberCount(e, groupId));
  const storyText = toPlainText(buildWelcomeMessageArray(e, groupId, false)) || "欢迎来到这里。";

  try {
    const image = await renderWelcomeCard({
      userId,
      nickname: userInfo?.nickname || e.sender?.card || e.sender?.nick || `QQ${userId}`,
      groupName: userInfo?.groupName || e.contact?.name || "未知群聊",
      memberCount,
      storyText,
      groupTitle: userInfo?.groupTitle ?? normalizeGroupTitle(e.sender?.title),
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  return match[1];
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

async function handleAdminDraw(e, msg) {
  if (!isAdminDrawCommand(msg)) {
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
    userInfo = await resolveGroupUser(e, e.groupId, targetUserId, { requireMember: true });
  } catch (error) {
    logger.error(`[random-welcome] #发迎新卡 获取成员信息失败: ${String(error?.message || error)}`);
    await e.reply("获取目标成员信息失败，请确认对方在本群且@格式正确。");
    return true;
  }

  if (config.setting.render_mode === RENDER_MODE_IMAGE) {
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

async function handlePrivateDraw(e, msg) {
  if (!isPrivateDrawCommand(msg)) {
    return false;
  }
  if (!e.isPrivate) {
    await e.reply(PRIVATE_DRAW_GROUP_ONLY_TEXT);
    return true;
  }

  const groupId = parsePrivateDrawGroupId(msg);
  if (!groupId) {
    await e.reply(PRIVATE_DRAW_USAGE_TEXT);
    return true;
  }

  const userId = String(e.userId);
  if (!/^\d+$/.test(userId) || userId === "0") {
    await e.reply("无法识别你的账号信息，请稍后再试。");
    return true;
  }

  const cdKey = `${PRIVATE_DRAW_REDIS_PREFIX}:${userId}`;
  try {
    const cdValue = await redisGet(cdKey);
    if (cdValue) {
      await e.reply(PRIVATE_DRAW_CD_TEXT);
      return true;
    }
  } catch (error) {
    logger.error(`[random-welcome] 读取私聊抽卡冷却失败: ${String(error?.message || error)}`);
    await e.reply("抽卡冷却服务暂不可用，请稍后再试。");
    return true;
  }

  let userInfo = null;
  try {
    userInfo = await resolveGroupUser(e, groupId, userId, { requireMember: true, fallbackGroupName: "未知群聊" });
  } catch (error) {
    logger.error(`[random-welcome] #抽专属卡 成员校验失败: ${String(error?.message || error)}`);
    await e.reply("无法获取你的群成员信息，请检查群号并确认你在该群内。");
    return true;
  }

  let replyPayload = null;
  if (config.setting.render_mode === RENDER_MODE_IMAGE) {
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
    await e.reply("抽卡冷却服务暂不可用，请稍后再试。");
    return true;
  }

  await e.reply(replyPayload);
  return true;
}

async function sendPreview(e, msg, groupId, allowAt) {
  const match = msg.match(/^#(?:随机欢迎词|欢迎词)(?:测试)?(?:\s*(\d+))?$/);
  const count = match && match[1] ? Math.max(1, Math.min(100, parseInt(match[1], 10))) : 1;

  if (count === 1) {
    if (config.setting.render_mode === RENDER_MODE_IMAGE) {
      const image = await buildWelcomeImage(e, groupId);
      if (image) {
        if (allowAt && e.isGroup && e.userId) {
          await e.reply([segment.at(String(e.userId)), image]);
        } else {
          await e.reply(image);
        }
        return;
      }
      logger.error("[random-welcome] 预览图渲染失败，回退纯文本发送");
    }
    await e.reply(buildWelcomeMessageArray(e, groupId, allowAt, e.userId));
    return;
  }

  const title = `随机欢迎词预览 (${count}条)`;
  const messages = [title];
  for (let i = 0; i < count; i++) {
    messages.push(buildWelcomeMessageArray(e, groupId, allowAt, e.userId));
  }

  await sendForward(e, messages, title);
}

async function sendForward(e, messages, title) {
  const senderName = e.sender?.card || e.sender?.nick || "匿名消息";
  const nodes = common.makeForward(
    messages.map((message) => common.makeMessage(message)),
    String(e.selfId),
    senderName,
  );

  try {
    await e.bot.sendForwardMsg(e.contact, nodes);
    return true;
  } catch (error) {
    logger.error(`[random-welcome] 合并转发失败，回退逐条文本: ${String(error?.message || error)}`);
    const texts = messages
      .map((message) => (typeof message === "string" ? message : toPlainText(message)))
      .filter(Boolean);
    await e.reply([title, ...texts].filter(Boolean).join("\n\n"));
    return false;
  }
}

async function sendHelp(e, isGroup, groupId) {
  const nodes = [`随机欢迎词帮助（${isGroup ? "群聊" : "私聊"}）`, ...getHelpNodes(isGroup, groupId)];
  await sendForward(e, nodes, nodes[0]);
}

async function handleCommand(e) {
  const msg = e.msg.trim();
  const isMaster = e.isMaster;

  if (msg === CMD_HELP || msg === CMD_HELP_ALIAS) {
    await sendHelp(e, Boolean(e.isGroup), e.groupId);
    return true;
  }

  if (await handleAdminDraw(e, msg)) {
    return true;
  }

  if (await handlePrivateDraw(e, msg)) {
    return true;
  }

  if (msg === CMD_GROUP_LIST) {
    if (!isMaster) {
      await e.reply("只有主人才能查看全局欢迎词列表哦~");
      return true;
    }
    const groups = config.getEnabledGroups();
    if (groups.length === 0) {
      await e.reply("目前没有任何群开启随机欢迎词。");
    } else {
      await e.reply(`当前开启随机欢迎词的群聊 (${groups.length}个)：\n${groups.join("\n")}`);
    }
    return true;
  }

  if (msg === CMD_PROFILE_LIST) {
    const profiles = config.listProfiles();
    if (!e.isGroup || !e.groupId) {
      await e.reply(`可用欢迎词风格：\n${profiles.join("\n")}`);
      return true;
    }
    const current = config.getGroupProfile(e.groupId);
    await e.reply(`可用欢迎词风格：\n${profiles.join("\n")}\n\n本群当前风格：${current}`);
    return true;
  }

  if (!e.isGroup || !e.groupId) {
    if (
      isEnableCommand(msg) ||
      isDisableCommand(msg) ||
      msg === CMD_GROUP_SETTING ||
      msg === CMD_MENTION_ENABLE ||
      msg === CMD_MENTION_DISABLE ||
      msg.startsWith(CMD_PROFILE_SET) ||
      msg.startsWith(CMD_TEMPLATE_ADD) ||
      msg.startsWith(CMD_LEXICON_ADD)
    ) {
      await e.reply("该指令需要在群聊中使用~");
      return true;
    }
    if (isPreviewCommand(msg)) {
      await sendPreview(e, msg, undefined, false);
      return true;
    }
    return false;
  }

  if (msg === CMD_GROUP_SETTING) {
    const groupRule = config.getGroupRule(e.groupId);
    const delayMin = Number(config.setting.delay_min) || 0;
    const delayMax = Number(config.setting.delay_max) || 0;
    const dedupeSec = getConfiguredDedupeWindowSec();
    const mentionText = groupRule.mention_new_member ? "开启" : "关闭";
    const enabledText = groupRule.enabled ? "开启" : "关闭";
    await e.reply(`本群欢迎词设置：\n开关：${enabledText}\n风格：${groupRule.profile}\n@新人：${mentionText}\n延迟：${delayMin}-${delayMax} 秒\n去重窗口：${dedupeSec} 秒`);
    return true;
  }

  if (isEnableCommand(msg) || isDisableCommand(msg)) {
    if (!isAdminOrMaster(e)) {
      await e.reply(ADMIN_ONLY_TEXT);
      return true;
    }

    const isEnable = isEnableCommand(msg);
    const changed = config.setGroupEnable(e.groupId, isEnable);

    if (isEnable) {
      await e.reply(changed ? "本群已成功开启随机欢迎词~" : "本群已经开启过随机欢迎词了~");
    } else {
      await e.reply(changed ? "本群已关闭随机欢迎词播报。" : "本群原本就没有开启随机欢迎词哦。");
    }
    return true;
  }

  if (msg.startsWith(CMD_PROFILE_SET)) {
    if (!isAdminOrMaster(e)) {
      await e.reply(ADMIN_ONLY_TEXT);
      return true;
    }
    const profile = msg.slice(CMD_PROFILE_SET.length).trim();
    if (!profile) {
      await e.reply("格式错误，请使用：#设置欢迎词风格 风格名");
      return true;
    }
    if (!config.profileExists(profile)) {
      await e.reply(`风格不存在：${profile}\n可用风格：\n${config.listProfiles().join("\n")}`);
      return true;
    }
    const changed = config.setGroupProfile(e.groupId, profile);
    await e.reply(changed ? `本群欢迎词风格已设置为：${profile}` : `本群欢迎词风格已是：${profile}`);
    return true;
  }

  if (msg === CMD_MENTION_ENABLE || msg === CMD_MENTION_DISABLE) {
    if (!isAdminOrMaster(e)) {
      await e.reply(ADMIN_ONLY_TEXT);
      return true;
    }
    const enableMention = msg === CMD_MENTION_ENABLE;
    const changed = config.setGroupMention(e.groupId, enableMention);
    const stateText = enableMention ? "开启" : "关闭";
    await e.reply(changed ? `本群欢迎词 @新人 已${stateText}。` : `本群欢迎词 @新人 已经是${stateText}状态。`);
    return true;
  }

  if (msg.startsWith(CMD_LEXICON_ADD)) {
    if (!isAdminOrMaster(e)) {
      await e.reply(ADMIN_ONLY_TEXT);
      return true;
    }
    const payload = msg.slice(CMD_LEXICON_ADD.length).trim();
    const item = parseLexiconInput(payload);
    if (!item) {
      await e.reply(`格式错误，请使用：#添加欢迎词条 地点|角色1,角色2|食物1,食物2\n限制：地点最多 ${MAX_LEXICON_LOCATION_LENGTH} 字，角色/食物每项最多 ${MAX_LEXICON_ITEM_LENGTH} 字`);
      return true;
    }
    const profile = config.getGroupProfile(e.groupId);
    const ok = config.addLexiconItem(profile, item);
    await e.reply(ok ? `已添加词条到风格：${profile}` : "添加失败，请检查词条格式");
    return true;
  }

  if (msg.startsWith(CMD_TEMPLATE_ADD)) {
    if (!isAdminOrMaster(e)) {
      await e.reply(ADMIN_ONLY_TEXT);
      return true;
    }
    const payload = msg.slice(CMD_TEMPLATE_ADD.length).trim();
    if (!payload) {
      await e.reply("格式错误，请使用：#添加欢迎词 模板内容");
      return true;
    }
    if (payload.length > MAX_TEMPLATE_LENGTH) {
      await e.reply(`模板过长，请控制在 ${MAX_TEMPLATE_LENGTH} 字以内。`);
      return true;
    }
    const profile = config.getGroupProfile(e.groupId);
    const ok = config.addTemplate(profile, payload);
    await e.reply(ok ? `已添加模板到风格：${profile}` : "添加失败，请检查模板内容");
    return true;
  }

  if (isPreviewCommand(msg)) {
    const groupRule = config.getGroupRule(e.groupId);
    await sendPreview(e, msg, e.groupId, groupRule.mention_new_member);
    return true;
  }

  return false;
}

export const randomWelcome = karin.accept(
  EVENT_GROUP_MEMBER_ADD,
  async (e) => {
    const groupId = e.contact?.peer;
    const userId = e.content?.targetId;

    if (!groupId || !userId) {
      return false;
    }
    if (String(userId) === String(e.selfId)) {
      return false;
    }
    if (!config.isGroupEnabled(groupId)) {
      return false;
    }
    if (shouldSkipDuplicateWelcome(groupId, userId)) {
      return false;
    }

    const { setting } = config;
    const minDelay = Number(setting.delay_min) || 0;
    const maxDelay = Number(setting.delay_max) || 0;
    if (maxDelay >= minDelay && maxDelay > 0) {
      const waitTime = minDelay + Math.random() * (maxDelay - minDelay);
      await sleep(waitTime * 1000);
    }

    const groupRule = config.getGroupRule(groupId);
    const mention = Boolean(groupRule.mention_new_member);

    let userInfo = null;
    try {
      userInfo = await resolveGroupUser(e, groupId, userId);
    } catch (error) {
      logger.warn(`[random-welcome] 获取入群成员信息失败: ${String(error?.message || error)}`);
    }

    if (config.setting.render_mode === RENDER_MODE_IMAGE) {
      const image = await buildWelcomeImage(e, groupId, userInfo);
      if (image) {
        await e.reply(mention ? [segment.at(String(userId)), image] : image);
        return true;
      }
      logger.error("[random-welcome] 图片渲染失败，回退纯文本发送");
    }

    await e.reply(buildWelcomeMessageArray(e, groupId, mention, userId));
    return true;
  },
  {
    name: PLUGIN_NAME,
    priority: PLUGIN_PRIORITY,
  },
);

export const randomWelcomeCommand = karin.command(
  COMMAND_RULE_REG,
  handleCommand,
  {
    name: PREVIEW_PLUGIN_NAME,
    priority: PLUGIN_PRIORITY,
    permission: "all",
    log: false,
  },
);
