/**
 * 插件自带的 Web 配置页后端：只暴露 JSON 接口，页面静态资源由 apps/web.js 挂载。
 * 所有写操作都落到 config/ 下的 YAML（复用 utils/config.js 的原子写），
 * 与群里的命令共用同一份配置，两边改都不冲突。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "node-karin/express";
import { authMiddleware, getAllBotList, logger } from "node-karin";

import config from "./config.js";
import { renderWelcomeCard } from "./renderer.js";
import { parseTemplate, pickRandom, wrapQuoted } from "./welcome.js";

const currentFilePath = fileURLToPath(import.meta.url);
const pluginRoot = path.resolve(path.dirname(currentFilePath), "..");
const PLUGIN_NAME = "random-welcome";
const PREVIEW_AT_TEXT = "@新成员";
const PREVIEW_FALLBACK_USER_ID = "10000";
const PREVIEW_FALLBACK_GROUP_NAME = "测试群";

function readPluginMeta() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pluginRoot, "package.json"), "utf8"));
    return {
      name: pkg.name || PLUGIN_NAME,
      version: pkg.version || "0.0.0",
      description: pkg.description || "",
    };
  } catch (error) {
    logger.warn(`[${PLUGIN_NAME}] 读取 package.json 失败: ${String(error?.message || error)}`);
    return { name: PLUGIN_NAME, version: "0.0.0", description: "" };
  }
}

function ok(res, data, message = "ok") {
  res.json({ success: true, message, data });
}

function fail(res, message, status = 400) {
  res.status(status).json({ success: false, message, data: null });
}

/** 组装页面需要的全部状态：一次请求拿全，页面本地维护草稿 */
function buildState() {
  const contents = config.listProfileContents();
  const groupRules = config.listGroupRules();
  const groupUsage = new Map();
  for (const rule of groupRules) {
    groupUsage.set(rule.profile, (groupUsage.get(rule.profile) || 0) + 1);
  }
  return {
    plugin: readPluginMeta(),
    setting: config.getWebSetting(),
    groups: groupRules,
    profiles: contents.map((item) => ({
      name: item.name,
      builtin: item.builtin,
      groupCount: groupUsage.get(item.name) || 0,
      lexiconCount: item.lexiconBuiltin.length + item.lexiconCustom.length,
      templateCount: item.templatesBuiltin.length + item.templatesCustom.length,
    })),
    contents,
    limits: {
      templateLength: 300,
      lexiconLocationLength: 30,
      lexiconItemLength: 30,
      delayMax: 600,
      dedupeMax: 86400,
    },
  };
}

/** 按风格拼一条预览文案；{at_user} 在网页里换成文本占位，不真的 @ 谁 */
function buildPreviewText(profile) {
  const { profile: usedProfile, lexicon, templates } = config.getWelcomeDataByProfile(profile);
  if (lexicon.length === 0) {
    return { profile: usedProfile, text: "", error: `风格「${usedProfile}」的词库是空的` };
  }
  if (templates.length === 0) {
    return { profile: usedProfile, text: "", error: `风格「${usedProfile}」的模板是空的` };
  }

  const place = pickRandom(lexicon);
  const params = {
    location: wrapQuoted(place?.location || ""),
    role: wrapQuoted(pickRandom(place?.roles) || ""),
    food: wrapQuoted(pickRandom(place?.foods) || ""),
    botName: "机器人",
    allowAt: false,
    atUserId: null,
  };
  const template = String(pickRandom(templates) || "").replaceAll("{at_user}", PREVIEW_AT_TEXT);
  const text = parseTemplate(template, params)
    .filter((part) => typeof part === "string")
    .join("")
    .trim();
  return { profile: usedProfile, text, error: "" };
}

/** 把 bot 群列表整理成 [{ id, name, memberCount }]，失败就返回空数组（页面允许手输群号） */
async function listBotGroups() {
  const result = [];
  try {
    // getAllBotList() 返回的是 [{ index, bot }]，不是 Bot 数组
    const list = await getAllBotList();
    for (const item of list || []) {
      const bot = item?.bot;
      if (!bot || typeof bot.getGroupList !== "function") continue;
      let groups = [];
      try {
        groups = await bot.getGroupList();
      } catch (error) {
        logger.warn(`[${PLUGIN_NAME}] 获取群列表失败: ${String(error?.message || error)}`);
        continue;
      }
      for (const group of groups || []) {
        const id = Number(group?.groupId ?? group?.group_id ?? group?.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        result.push({
          id,
          name: String(group?.groupName ?? group?.group_name ?? group?.name ?? ""),
          memberCount: Number(group?.memberCount ?? group?.member_count ?? 0) || 0,
          botId: String(bot?.selfId ?? bot?.account?.selfId ?? ""),
        });
      }
    }
  } catch (error) {
    logger.warn(`[${PLUGIN_NAME}] 获取 bot 列表失败: ${String(error?.message || error)}`);
  }
  const seen = new Set();
  return result
    .filter((group) => (seen.has(group.id) ? false : seen.add(group.id)))
    .sort((a, b) => a.id - b.id);
}

export function createWebRouter() {
  const router = express.Router();
  router.use(express.json({ limit: "1mb" }));
  router.use(authMiddleware);

  router.get("/v1/state", (_req, res) => {
    ok(res, buildState());
  });

  router.get("/v1/bot-groups", async (_req, res) => {
    ok(res, await listBotGroups());
  });

  router.post("/v1/setting", (req, res) => {
    const result = config.saveWebSetting(req.body?.setting ?? req.body ?? {});
    if (result.errors.length > 0) return fail(res, result.errors.join("；"));
    return ok(res, buildState(), result.changed ? "全局设置已保存" : "没有需要保存的改动");
  });

  router.post("/v1/groups", (req, res) => {
    const result = config.saveWebGroupRules(req.body?.groups ?? req.body);
    if (result.errors.length > 0) return fail(res, result.errors.join("；"));
    return ok(res, buildState(), result.changed ? "群规则已保存" : "没有需要保存的改动");
  });

  router.post("/v1/content", (req, res) => {
    const profile = req.body?.profile;
    const result = config.saveWebProfileContent(profile, {
      lexicon: req.body?.lexicon,
      templates: req.body?.templates,
    });
    if (result.errors.length > 0) return fail(res, result.errors.join("；"));
    return ok(res, buildState(), result.changed ? `风格「${profile}」的内容已保存` : "没有需要保存的改动");
  });

  router.post("/v1/profiles", (req, res) => {
    const action = req.body?.action;
    const name = req.body?.name;
    let result;
    if (action === "create") result = config.createWebProfile(name);
    else if (action === "rename") result = config.renameWebProfile(name, req.body?.nextName);
    else if (action === "delete") result = config.deleteWebProfile(name);
    else return fail(res, `不支持的操作：${action}`);

    if (result.errors.length > 0) return fail(res, result.errors.join("；"));
    const messages = {
      create: `风格「${name}」已创建`,
      rename: `风格「${name}」已改名为「${req.body?.nextName}」`,
      delete: `风格「${name}」已删除`,
    };
    return ok(res, buildState(), result.changed ? messages[action] : "没有需要保存的改动");
  });

  router.post("/v1/preview", async (req, res) => {
    const mode = req.body?.mode === "image" ? "image" : "text";
    const groupId = req.body?.groupId;
    const preview = buildPreviewText(req.body?.profile);
    if (preview.error) return fail(res, preview.error);

    if (mode === "text") {
      return ok(res, { profile: preview.profile, mode, text: preview.text, image: null });
    }

    let groupName = PREVIEW_FALLBACK_GROUP_NAME;
    if (groupId) {
      const matched = (await listBotGroups()).find((group) => String(group.id) === String(groupId));
      if (matched?.name) groupName = matched.name;
    }

    try {
      const image = await renderWelcomeCard({
        userId: PREVIEW_FALLBACK_USER_ID,
        nickname: "新成员",
        groupName,
        memberCount: 42,
        storyText: preview.text,
        groupTitle: "",
      });
      if (!image) {
        return ok(res, { profile: preview.profile, mode, text: preview.text, image: null, warning: "渲染器没有返回图片" });
      }
      const base64 = String(image).replace(/^base64:\/\//, "");
      return ok(res, { profile: preview.profile, mode, text: preview.text, image: `data:image/png;base64,${base64}` });
    } catch (error) {
      logger.error(`[${PLUGIN_NAME}] Web 预览渲染失败: ${String(error?.message || error)}`);
      return ok(res, {
        profile: preview.profile,
        mode,
        text: preview.text,
        image: null,
        warning: `图片渲染失败：${String(error?.message || error)}`,
      });
    }
  });

  // 兜底：未命中的接口返回 JSON 而不是 HTML
  router.use((_req, res) => fail(res, "接口不存在", 404));

  return router;
}
