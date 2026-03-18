import plugin from "../../../lib/plugins/plugin.js";
import WORLD_LEXICON from "../constants/worldLexicon.js";

import * as configManager from "../utils/configManager.js";

const PLUGIN_NAME = "小说群随机欢迎词";
const PLUGIN_DESCRIPTION = "入群随机欢迎文案";
const PREVIEW_PLUGIN_NAME = "小说群欢迎词配置与预览";
const PREVIEW_PLUGIN_DESCRIPTION = "配置本群欢迎词开关及预览";
const EVENT_GROUP_INCREASE = "notice.group.increase";
const EVENT_MESSAGE = "message";
const PLUGIN_PRIORITY = 5000;
const COMMAND_RULE_REG = "^#(开启|关闭)?(随机)?欢迎词(测试)?$";
const COMMAND_RULE_FNC = "handleCommand";

const TEMPLATES = [
  {
    head: "在暗红色的落日余晖中，一位来自",
    middle: "的",
    arrive: "走进了庇护地。",
    tail: "曾经的繁荣已被荒芜掩盖，四周只留下一片平和的寂静。坐下来尝尝这",
    ending: "，然后在这里安心歇息吧。"
  },
  {
    head: "穿过原野与薄雾，一位来自",
    middle: "的",
    arrive: "结束了漫长的跋涉，抵达这处枢纽。",
    tail: "外界的世界变幻无常，但这里暂且安全。这里有一份",
    ending: "，吃完再做接下来的打算。"
  },
  {
    head: "夜幕降临，微光播撒在大地上。一位来自",
    middle: "的",
    arrive: "寻着安静的灯火，踏入了庇护地。",
    tail: "跨越时空的旅途消耗极大。门外留有风霜，但这里为你准备了",
    ending: "，用来补充体力正好。"
  },
  {
    head: "沉重的大门被推开，一位来自",
    middle: "的",
    arrive: "掸去身上的落叶与灰尘，走进了庇护地。",
    tail: "乱世中的旅者总需要一个落脚点。来一份",
    ending: "，趁热吃下，能有效地驱散疲劳。"
  }
];

function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "（数据获取异常）";
  }

  const randomIndex = Math.floor(Math.random() * items.length);
  return items[randomIndex];
}

function buildWelcomeMessage() {
  const place = pickRandom(WORLD_LEXICON);
  const role = pickRandom(place.roles);
  const food = pickRandom(place.foods);
  const template = pickRandom(TEMPLATES);
  return `${template.head}${place.location}${template.middle}${role}${template.arrive}${template.tail}${food}${template.ending}`;
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
    // Basic guards
    if (!this.e.group_id || this.e.user_id === this.e.self_id) {
      return false;
    }

    // Check if configuration allows welcome message in this group
    if (!configManager.isGroupEnabled(this.e.group_id)) {
      return false;
    }

    const atMessage = typeof segment !== "undefined" ? segment.at(this.e.user_id) : `[CQ:at,qq=${this.e.user_id}]`;
    const welcomeMessage = buildWelcomeMessage();
    await this.reply([atMessage, "\n", welcomeMessage]);
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
    if (!this.e.isGroup || !this.e.group_id) {
      return false;
    }

    const msg = this.e.msg.trim();

    // Toggle logic (requires admin permissions)
    if (msg.startsWith("#开启") || msg.startsWith("#关闭")) {
      const isMaster = this.e.isMaster;
      const isAdmin = this.e.sender?.role === "admin" || this.e.sender?.role === "owner";
      
      if (!isMaster && !isAdmin) {
        await this.reply("只有管理员才能更改庇护地的规则哦~");
        return true;
      }

      const isEnable = msg.startsWith("#开启");
      const changed = configManager.setGroupEnable(this.e.group_id, isEnable);

      if (isEnable) {
        await this.reply(changed ? "本群已成功开启随机欢迎词~" : "本群已经开启过随机欢迎词了~");
      } else {
        await this.reply(changed ? "本群已关闭随机欢迎词播报。" : "本群原本就没有开启随机欢迎词哦。");
      }
      return true;
    }

    // Preview logic
    if (msg.includes("测试") || msg === "#随机欢迎词" || msg === "#欢迎词") {
      await this.reply(buildWelcomeMessage());
      return true;
    }

    return false;
  }
}
