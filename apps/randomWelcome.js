import { common, karin, logger, segment } from "node-karin";
import config from "../utils/config.js";
import { handleAdminDraw, handlePrivateDraw } from "../utils/draw.js";
import { CMD_UPDATE_PLUGIN, handleUpdateCommand } from "../utils/update.js";
import {
  ADMIN_ONLY_TEXT,
  buildWelcomeImage,
  buildWelcomeMessageArray,
  isAdminOrMaster,
  normalizeGroupTitle,
  renderMode,
  resolveGroupUser,
  toPlainText,
} from "../utils/welcome.js";

const PLUGIN_NAME = "专属入群欢迎词";
const PREVIEW_PLUGIN_NAME = "小说群欢迎词配置与预览";
const EVENT_GROUP_MEMBER_ADD = "notice.groupMemberAdd";
const PLUGIN_PRIORITY = 100;
const COMMAND_RULE_REG = /^(?:#(?:随机)?欢迎词帮助|#随机欢迎词列表|#欢迎词风格列表|#欢迎词设置|#欢迎词@(?:开启|关闭)|#欢迎词预览(?:开启|关闭)|#设置欢迎词风格(?:\s+.+)?|#添加欢迎词条(?:\s+.+)?|#添加欢迎词(?:\s+.+)?|#(?:开启|关闭)(?:随机)?欢迎词|#(?:随机欢迎词|欢迎词)(?:测试)?(?:\s*\d+)?|#发迎新卡(?:\s+.+)?|#抽专属卡(?:\s+\d+)?|#更新欢迎词插件)$/;
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
const CMD_PREVIEW_ENABLE = "#欢迎词预览开启";
const CMD_PREVIEW_DISABLE = "#欢迎词预览关闭";
const CMD_GROUP_SETTING = "#欢迎词设置";
const MAX_TEMPLATE_LENGTH = 300;
const MAX_LEXICON_LOCATION_LENGTH = 30;
const MAX_LEXICON_ITEM_LENGTH = 30;
const DEFAULT_DEDUPE_WINDOW_SEC = 30;
const welcomeDedupMap = new Map();

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

function isEnableCommand(msg) {
  return msg === CMD_ENABLE || msg === CMD_ENABLE_RANDOM;
}

function isDisableCommand(msg) {
  return msg === CMD_DISABLE || msg === CMD_DISABLE_RANDOM;
}

function isPreviewCommand(msg) {
  return /^#(?:随机欢迎词|欢迎词)(?:测试)?(?:\s*\d+)?$/.test(msg);
}

function getConfiguredDedupeWindowSec() {
  const sec = Number(config.setting.dedupe_window_sec);
  return Number.isFinite(sec) && sec >= 0 ? sec : DEFAULT_DEDUPE_WINDOW_SEC;
}

/** 去重登记：返回 true 表示窗口期内已欢迎过。开关关闭时不应调用，避免污染状态。 */
function shouldSkipDuplicateWelcome(groupId, userId) {
  const dedupeWindowMs = Math.floor(getConfiguredDedupeWindowSec() * 1000);
  if (dedupeWindowMs <= 0) {
    return false;
  }
  const now = Date.now();
  for (const [key, ts] of welcomeDedupMap) {
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

/** 延迟区间：空值或反向区间时不做延迟，避免负数/NaN 传给 setTimeout */
function getDelayMs() {
  const min = Number(config.setting.delay_min);
  const max = Number(config.setting.delay_max);
  const safeMin = Number.isFinite(min) && min >= 0 ? min : 0;
  const safeMax = Number.isFinite(max) && max >= 0 ? max : 0;
  if (safeMax <= 0 || safeMax < safeMin) {
    return 0;
  }
  return Math.floor((safeMin + Math.random() * (safeMax - safeMin)) * 1000);
}

function getHelpNodes(isGroup, groupId, isMaster) {
  const profile = isGroup && groupId ? config.getGroupProfile(groupId) : config.setting.default_profile;
  const groupRule = isGroup && groupId ? config.getGroupRule(groupId) : null;
  const nodes = [
    `【功能】\n- 新人入群时自动发送随机欢迎词（地点+身份+美食）\n- 支持按群设置开关、风格、@新人\n- 支持入群事件去重，避免重复欢迎`,
    `【预览】\n- #随机欢迎词 / #欢迎词\n- #随机欢迎词测试 / #欢迎词测试\n- #随机欢迎词 5（数字=条数，合并转发，上限 100）\n- 群内预览默认关闭，关闭时群内会提示去私聊；私聊和群临时会话不受影响`,
    `【群管理】\n- #欢迎词设置：查看本群配置\n- #开启欢迎词 / #开启随机欢迎词\n- #关闭欢迎词 / #关闭随机欢迎词\n- #欢迎词@开启 / #欢迎词@关闭\n- #欢迎词预览开启 / #欢迎词预览关闭（全局，默认关闭）\n- #设置欢迎词风格 风格名\n- #欢迎词风格列表`,
    `【词库维护】\n- #添加欢迎词 模板内容\n  占位符：{location} {role} {food} {bot_name} {at_user}\n- #添加欢迎词条 地点|角色1,角色2|食物1,食物2\n  写入 config/ 下 YAML，立即生效`,
    `【其它】\n- #发迎新卡 @某人：管理员手动发卡（仅群聊）\n- #抽专属卡 群号：每人每天 1 次（私聊/群临时会话）\n- #随机欢迎词列表：查看已开启的群（仅主人）\n\n权限：管理指令需 群管理员 / 群主 / 机器人主人`,
  ];
  if (isMaster) {
    nodes.push("【主人】\n- #更新欢迎词插件：拉取 karin 分支并自动重启 Karin");
  }
  if (groupRule) {
    nodes.push(
      `【本群状态】\n- 开关：${groupRule.enabled ? "开启" : "关闭"}\n- 风格：${profile}\n- @新人：${groupRule.mention_new_member ? "开启" : "关闭"}`,
    );
  }
  return nodes;
}

async function sendPreview(e, msg, groupId, allowAt) {
  const match = msg.match(/^#(?:随机欢迎词|欢迎词)(?:测试)?(?:\s*(\d+))?$/);
  const count = match && match[1] ? Math.max(1, Math.min(100, parseInt(match[1], 10))) : 1;

  if (count === 1) {
    if (renderMode()) {
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
  const nodes = [`随机欢迎词帮助（${isGroup ? "群聊" : "私聊"}）`, ...getHelpNodes(isGroup, groupId, Boolean(e.isMaster))];
  await sendForward(e, nodes, nodes[0]);
}

async function handleCommand(e) {
  const msg = e.msg.trim();
  const isMaster = e.isMaster;

  if (msg === CMD_HELP || msg === CMD_HELP_ALIAS) {
    await sendHelp(e, Boolean(e.isGroup), e.groupId);
    return true;
  }

  if (await handleUpdateCommand(e, msg)) {
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
      msg === CMD_PREVIEW_ENABLE ||
      msg === CMD_PREVIEW_DISABLE ||
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
    const delayMin = Math.max(0, Number(config.setting.delay_min) || 0);
    const delayMax = Math.max(0, Number(config.setting.delay_max) || 0);
    const dedupeSec = getConfiguredDedupeWindowSec();
    const mentionText = groupRule.mention_new_member ? "开启" : "关闭";
    const enabledText = groupRule.enabled ? "开启" : "关闭";
    const delayText = delayMax < delayMin
    ? `已忽略（delay_min=${config.setting.delay_min} / delay_max=${config.setting.delay_max}，区间无效）`
    : `${delayMin}-${delayMax} 秒`;
    const renderText = renderMode() ? "image" : "text";
    const groupPreviewText = config.setting.allow_group_preview ? "开启" : "关闭";
    await e.reply(`本群欢迎词设置：\n开关：${enabledText}\n风格：${groupRule.profile}\n@新人：${mentionText}\n群内预览：${groupPreviewText}（全局）\n延迟：${delayText}\n去重窗口：${dedupeSec} 秒\n渲染：${renderText}`);
    return true;
  }

  if (msg === CMD_PREVIEW_ENABLE || msg === CMD_PREVIEW_DISABLE) {
    if (!isAdminOrMaster(e)) {
      await e.reply(ADMIN_ONLY_TEXT);
      return true;
    }
    const enable = msg === CMD_PREVIEW_ENABLE;
    const changed = config.setAllowGroupPreview(enable);
    const stateText = enable ? "开启" : "关闭";
    await e.reply(changed ? `群内预览已${stateText}（全局生效）。` : `群内预览已经是${stateText}状态。`);
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
    if (!config.setting.allow_group_preview) {
      // 群内预览关闭：回一条短提示，引导到私聊/群临时会话
      await e.reply("群内预览已关闭；请私聊机器人发送 #随机欢迎词 获取。");
      return true;
    }
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

    // 返回 true 会中断后续插件；这里所有「不处理」分支都必须返回 false 并放行
    if (!groupId || !userId || String(userId) === String(e.selfId) || !config.isGroupEnabled(groupId)) {
      return false;
    }
    // 去重命中说明本窗口内已欢迎过，让事件继续传给其它插件
    if (shouldSkipDuplicateWelcome(groupId, userId)) {
      return false;
    }

    // 延迟期间事件已被接受，不再把事件交给后续插件，避免重复欢迎
    const delayMs = getDelayMs();
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const groupRule = config.getGroupRule(groupId);
    const mention = Boolean(groupRule.mention_new_member);

    let userInfo = null;
    try {
      userInfo = await resolveGroupUser(e, groupId, userId);
    } catch (error) {
      logger.warn(`[random-welcome] 获取入群成员信息失败: ${String(error?.message || error)}`);
    }

    if (renderMode()) {
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
