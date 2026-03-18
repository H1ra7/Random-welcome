import plugin from "../../../lib/plugins/plugin.js";
import config from "../utils/config.js";

const PLUGIN_NAME = "随机欢迎词";
const PLUGIN_DESCRIPTION = "入群随机欢迎文案";
const PREVIEW_PLUGIN_NAME = "小说群欢迎词配置与预览";
const PREVIEW_PLUGIN_DESCRIPTION = "配置本群欢迎词开关及预览";
const EVENT_GROUP_INCREASE = "notice.group.increase";
const EVENT_MESSAGE = "message";
const PLUGIN_PRIORITY = 100;
const COMMAND_RULE_REG = "^(?:#随机欢迎词列表|#欢迎词风格列表|#设置欢迎词风格\\s+.+|#添加欢迎词条\\s+.+|#添加欢迎词\\s+.+|#(?:开启|关闭)?(?:随机)?欢迎词(?:测试)?)$";
const COMMAND_RULE_FNC = "handleCommand";
const CMD_PREFIX_ENABLE = "#开启";
const CMD_PREFIX_DISABLE = "#关闭";
const CMD_PROFILE_SET = "#设置欢迎词风格";
const CMD_TEMPLATE_ADD = "#添加欢迎词";
const CMD_LEXICON_ADD = "#添加欢迎词条";
const CMD_PROFILE_LIST = "#欢迎词风格列表";
const CMD_GROUP_LIST = "#随机欢迎词列表";
const CMD_PREVIEW_1 = "#随机欢迎词";
const CMD_PREVIEW_2 = "#欢迎词";
const BOT_JOIN_WELCOME_MSG = "大家好！我是{bot_name}，欢迎使用「随机欢迎词」插件！\n(群管可发 #开启随机欢迎词 来激活本群的入群欢迎。)";

function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  return items[Math.floor(Math.random() * items.length)];
}

function parseTemplate(templateStr, params, e) {
  if (!templateStr) return [""];
  
  const parts = templateStr.split(/(\{.*?\})/);
  const msgArr = [];
  
  for (let part of parts) {
    if (!part) continue;
    switch (part) {
      case "{at_user}":
        if (e && e.user_id) {
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

function buildWelcomeMessageArray(e, groupId) {
  const { profile, lexicon, templates } = config.getWelcomeData(groupId);
  if (!lexicon || lexicon.length === 0) return ["（欢迎词词库加载失败，请检查配置）"];

  const place = pickRandom(lexicon);
  if (!place) return ["（获取地点异常）"];

  const params = {
    location: place.location || "",
    role: pickRandom(place.roles) || "",
    food: pickRandom(place.foods) || "",
    botName: global.Bot?.nickname || "机器人"
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
  const roles = roleText.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
  const foods = foodText.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
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

    // 机器人自身进群
    if (this.e.user_id === this.e.self_id) {
      if (setting.bot_join_welcome) {
        let msgStr = BOT_JOIN_WELCOME_MSG;
        let msgArr = parseTemplate(msgStr, { botName: global.Bot?.nickname || "机器人" }, this.e);
        await sleep(1000); // 稍微延迟，等群内加载完成
        await this.reply(msgArr);
      }
      return false;
    }

    // 检查本群是否开启
    if (!config.isGroupEnabled(this.e.group_id)) {
      return false;
    }

    // 随机延迟防刷屏风控
    const minDelay = Number(setting.delay_min) || 0;
    const maxDelay = Number(setting.delay_max) || 0;
    if (maxDelay >= minDelay && maxDelay > 0) {
      const waitTime = minDelay + Math.random() * (maxDelay - minDelay);
      await sleep(waitTime * 1000);
    }

    const welcomeMsgArr = buildWelcomeMessageArray(this.e, this.e.group_id);
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
      if (
        msg.startsWith(CMD_PREFIX_ENABLE) ||
        msg.startsWith(CMD_PREFIX_DISABLE) ||
        msg.startsWith(CMD_PROFILE_SET) ||
        msg.startsWith(CMD_TEMPLATE_ADD) ||
        msg.startsWith(CMD_LEXICON_ADD)
      ) {
        await this.reply("该指令需要在群聊中使用~");
        return true;
      }
      // 非群聊可以测试
      if (msg.includes("测试") || msg === CMD_PREVIEW_1 || msg === CMD_PREVIEW_2) {
        await this.reply(buildWelcomeMessageArray(this.e));
        return true;
      }
      return false;
    }

    // 开关逻辑
    if (msg.startsWith(CMD_PREFIX_ENABLE) || msg.startsWith(CMD_PREFIX_DISABLE)) {
      if (!isAdminOrMaster(this.e)) {
        await this.reply("只有管理员才能更改庇护地的规则哦~");
        return true;
      }

      const isEnable = msg.startsWith(CMD_PREFIX_ENABLE);
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
        await this.reply("只有管理员才能设置本群欢迎词风格哦~");
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

    if (msg.startsWith(CMD_LEXICON_ADD)) {
      if (!isAdminOrMaster(this.e)) {
        await this.reply("只有管理员才能添加欢迎词词条哦~");
        return true;
      }
      const payload = msg.slice(CMD_LEXICON_ADD.length).trim();
      const item = parseLexiconInput(payload);
      if (!item) {
        await this.reply("格式错误，请使用：#添加欢迎词条 地点|角色1,角色2|食物1,食物2");
        return true;
      }
      const profile = config.getGroupProfile(this.e.group_id);
      const ok = config.addLexiconItem(profile, item);
      await this.reply(ok ? `已添加词条到风格：${profile}` : "添加失败，请检查词条格式");
      return true;
    }

    if (msg.startsWith(CMD_TEMPLATE_ADD)) {
      if (!isAdminOrMaster(this.e)) {
        await this.reply("只有管理员才能添加欢迎词模板哦~");
        return true;
      }
      const payload = msg.slice(CMD_TEMPLATE_ADD.length).trim();
      if (!payload) {
        await this.reply("格式错误，请使用：#添加欢迎词 模板内容");
        return true;
      }
      const profile = config.getGroupProfile(this.e.group_id);
      const ok = config.addTemplate(profile, payload);
      await this.reply(ok ? `已添加模板到风格：${profile}` : "添加失败，请检查模板内容");
      return true;
    }

    // 群内测试预览逻辑
    if (msg.includes("测试") || msg === CMD_PREVIEW_1 || msg === CMD_PREVIEW_2) {
      await this.reply(buildWelcomeMessageArray(this.e, this.e.group_id));
      return true;
    }

    return false;
  }
}
