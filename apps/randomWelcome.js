import plugin from "../../../lib/plugins/plugin.js";
import config from "../utils/config.js";

const PLUGIN_NAME = "专属入群欢迎词";
const PLUGIN_DESCRIPTION = "入群随机欢迎文案";
const PREVIEW_PLUGIN_NAME = "小说群欢迎词配置与预览";
const PREVIEW_PLUGIN_DESCRIPTION = "配置本群欢迎词开关及预览";
const EVENT_GROUP_INCREASE = "notice.group.increase";
const EVENT_MESSAGE = "message";
const PLUGIN_PRIORITY = 100;
const COMMAND_RULE_REG = "^(?:#(?:随机)?欢迎词帮助|#随机欢迎词列表|#欢迎词风格列表|#欢迎词设置|#欢迎词@(?:开启|关闭)|#设置欢迎词风格\\s+.+|#添加欢迎词条\\s+.+|#添加欢迎词\\s+.+|#(?:开启|关闭)(?:随机)?欢迎词|#(?:随机欢迎词|欢迎词)(?:测试)?)$";
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
const ADMIN_ONLY_TEXT = "仅群管理员/群主/机器人主人可执行该命令。";
const MAX_TEMPLATE_LENGTH = 300;
const MAX_LEXICON_LOCATION_LENGTH = 30;
const MAX_LEXICON_ITEM_LENGTH = 30;
const DEFAULT_DEDUPE_WINDOW_SEC = 30;
const welcomeDedupMap = new Map();

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

function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  return items[Math.floor(Math.random() * items.length)];
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

function buildWelcomeMessageArray(e, groupId, allowAt = true) {
  const { profile, lexicon, templates } = config.getWelcomeData(groupId);
  if (!lexicon || lexicon.length === 0) return ["（欢迎词词库加载失败，请检查配置）"];

  const place = pickRandom(lexicon);
  if (!place) return ["（获取地点异常）"];

  const params = {
    location: wrapQuoted(place.location || ""),
    role: wrapQuoted(pickRandom(place.roles) || ""),
    food: wrapQuoted(pickRandom(place.foods) || ""),
    botName: global.Bot?.nickname || "机器人",
    allowAt,
  };

  if (!templates || templates.length === 0) return [`（风格 ${profile} 的模板加载失败，请检查配置）`];

  const templateStr = pickRandom(templates);
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
  return msg === CMD_PREVIEW_1 || msg === CMD_PREVIEW_2 || msg === CMD_PREVIEW_TEST_1 || msg === CMD_PREVIEW_TEST_2;
}

function getDedupeWindowMs() {
  const sec = Number(config.setting.dedupe_window_sec);
  const safeSec = Number.isFinite(sec) && sec >= 0 ? sec : DEFAULT_DEDUPE_WINDOW_SEC;
  return Math.floor(safeSec * 1000);
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
    const welcomeMsgArr = buildWelcomeMessageArray(this.e, this.e.group_id, groupRule.mention_new_member);
    await this.reply(welcomeMsgArr);
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

  async handleCommand() {
    const msg = this.e.msg.trim();
    const isMaster = this.e.isMaster;

    if (msg === CMD_HELP || msg === CMD_HELP_ALIAS) {
      await this.reply(getHelpText(Boolean(this.e.isGroup), this.e.group_id));
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
        await this.reply(buildWelcomeMessageArray(this.e, undefined, false));
        return true;
      }
      return false;
    }

    if (msg === CMD_GROUP_SETTING) {
      const groupRule = config.getGroupRule(this.e.group_id);
      const delayMin = Number(config.setting.delay_min) || 0;
      const delayMax = Number(config.setting.delay_max) || 0;
      const dedupeSec = Number(config.setting.dedupe_window_sec) || DEFAULT_DEDUPE_WINDOW_SEC;
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
      await this.reply(buildWelcomeMessageArray(this.e, this.e.group_id, groupRule.mention_new_member));
      return true;
    }

    return false;
  }
}
