import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "node-karin/yaml";
import { logger } from "node-karin";

const pluginName = "random-welcome";
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const pluginPath = path.resolve(currentDirPath, "..");
const configPath = path.join(pluginPath, "config");
const defSetPath = path.join(pluginPath, "defSet");
const SETTING_APP = "setting";
const LEXICON_APP = "lexicon";
const TEMPLATES_APP = "templates";
const DEFAULT_PROFILE = "default";
const DEFAULT_MENTION_NEW_MEMBER = true;
const DEFAULT_DEDUPE_WINDOW_SEC = 30;
const DEFAULT_RENDER_MODE = "text";
const VALID_RENDER_MODES = new Set(["text", "image"]);
const YAML_EVENT_CHANGE = "change";
const YAML_EVENT_RENAME = "rename";
// Web 配置页的限制：与命令层的限制保持一致（见 apps/randomWelcome.js）
const MAX_TEMPLATE_LENGTH = 300;
const MAX_LEXICON_LOCATION_LENGTH = 30;
const MAX_LEXICON_ITEM_LENGTH = 30;
const MAX_DELAY_SEC = 600;
const MAX_DEDUPE_WINDOW_SEC = 86400;
const DEFAULT_DELAY_MIN = 1;
const DEFAULT_DELAY_MAX = 3;
const PROFILE_NAME_REG = /^[\w\u4e00-\u9fa5-]{1,24}$/;

function normalizeSeconds(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : fallback;
}

function isValidProfileName(name) {
  return typeof name === "string" && PROFILE_NAME_REG.test(name.trim());
}

function toGroupKey(groupId) {
  return String(Number(groupId));
}

function toGroupId(groupId) {
  return Number(groupId);
}

function normalizeList(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter((item) => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
}

class Config {
  constructor() {
    this.watcher = { config: {}, defSet: {} };
    this.cache = { config: {}, defSet: {} };
    this.initDefSet();
    this.initConfig();
  }

  initDefSet() {
    if (!fs.existsSync(defSetPath)) {
      fs.mkdirSync(defSetPath, { recursive: true });
    }
  }

  initConfig() {
    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(configPath, { recursive: true });
    }
  }

  get defSet() {
    return this.getDefSet(SETTING_APP);
  }

  get configData() {
    return this.getConfig(SETTING_APP);
  }

  get setting() {
    return this.normalizeSetting({ ...this.defSet, ...this.configData });
  }

  get lexicon() {
    const data = this.getWelcomeData();
    return data.lexicon;
  }

  get templates() {
    const data = this.getWelcomeData();
    return data.templates;
  }

  getEnabledGroups() {
    const setting = this.setting;
    return Object.entries(setting.group_rules)
      .filter(([, rule]) => rule.enabled)
      .map(([key]) => Number(key))
      .sort((a, b) => a - b);
  }

  getGroupRule(groupId) {
    const id = toGroupId(groupId);
    if (!Number.isFinite(id) || id <= 0) {
      return { enabled: false, profile: this.setting.default_profile, mention_new_member: this.setting.mention_new_member };
    }

    const setting = this.setting;
    const key = toGroupKey(id);
    const rule = setting.group_rules[key];
    if (rule) {
      const normalized = {
        enabled: rule.enabled,
        profile: rule.profile || setting.default_profile,
        mention_new_member: typeof rule.mention_new_member === "boolean" ? rule.mention_new_member : setting.mention_new_member
      };
      // 仅透传群内的显式布尔覆盖；缺省不写字段，表示该群未开启预览
      if (typeof rule.allow_preview === "boolean") {
        normalized.allow_preview = rule.allow_preview;
      }
      return normalized;
    }
    return { enabled: false, profile: setting.default_profile, mention_new_member: setting.mention_new_member };
  }

  getGroupProfile(groupId) {
    const rule = this.getGroupRule(groupId);
    if (!this.profileExists(rule.profile)) {
      return this.setting.default_profile;
    }
    return rule.profile;
  }

  isGroupEnabled(groupId) {
    return this.getGroupRule(groupId).enabled;
  }

  /**
   * 群内预览是否开启：严格看本群覆盖 group_rules.<群号>.allow_preview === true。
   * 字段缺省、群条目不存在、群号非法，一律视为关闭。
   */
  isGroupPreviewEnabled(groupId) {
    const id = toGroupId(groupId);
    if (!Number.isFinite(id) || id <= 0) {
      return false;
    }
    const rule = this.setting.group_rules[toGroupKey(id)];
    return rule?.allow_preview === true;
  }

  /**
   * 列出所有已配置群的群内预览状态（只读），按群号升序：[{ id, effective }]。
   */
  listGroupPreviewStates() {
    const setting = this.setting;
    return Object.keys(setting.group_rules)
      .map((key) => Number(key))
      .filter((id) => Number.isFinite(id) && id > 0)
      .sort((a, b) => a - b)
      .map((id) => ({ id, effective: this.isGroupPreviewEnabled(id) }));
  }

  listProfiles() {
    const lexiconProfiles = this.getMergedLexiconProfiles();
    const templateProfiles = this.getMergedTemplateProfiles();
    const all = new Set([...Object.keys(lexiconProfiles), ...Object.keys(templateProfiles)]);
    if (all.size === 0) {
      return [DEFAULT_PROFILE];
    }
    return [...all];
  }

  profileExists(profile) {
    return this.listProfiles().includes(profile);
  }

  getWelcomeData(groupId) {
    const setting = this.setting;
    const defaultProfile = this.profileExists(setting.default_profile) ? setting.default_profile : DEFAULT_PROFILE;
    const groupProfile = groupId ? this.getGroupProfile(groupId) : defaultProfile;
    const profile = this.profileExists(groupProfile) ? groupProfile : defaultProfile;
    const lexiconProfiles = this.getMergedLexiconProfiles();
    const templateProfiles = this.getMergedTemplateProfiles();
    const lexicon = lexiconProfiles[profile]?.lexicon || [];
    const templates = templateProfiles[profile]?.templates || [];
    return { profile, lexicon, templates };
  }

  setGroupEnable(groupId, enable) {
    const id = toGroupId(groupId);
    if (!Number.isFinite(id) || id <= 0) {
      return false;
    }

    const setting = this.getWritableSetting();
    const key = toGroupKey(id);
    const oldRule = setting.group_rules[key] || {};
    const nextRule = {
      enabled: Boolean(enable),
      profile: oldRule.profile || setting.default_profile,
      mention_new_member: typeof oldRule.mention_new_member === "boolean" ? oldRule.mention_new_member : setting.mention_new_member,
    };

    if (
      oldRule.enabled === nextRule.enabled &&
      oldRule.profile === nextRule.profile &&
      oldRule.mention_new_member === nextRule.mention_new_member
    ) {
      return false;
    }

    setting.group_rules[key] = nextRule;
    setting.groups = this.toLegacyGroups(setting.group_rules);
    this.saveConfig(SETTING_APP, setting);
    return true;
  }

  setGroupProfile(groupId, profile) {
    const id = toGroupId(groupId);
    if (!Number.isFinite(id) || id <= 0) {
      return false;
    }
    if (!this.profileExists(profile)) {
      return false;
    }

    const setting = this.getWritableSetting();
    const key = toGroupKey(id);
    const oldRule = setting.group_rules[key] || {};
    const nextRule = {
      enabled: oldRule.enabled === undefined ? true : oldRule.enabled,
      profile,
      mention_new_member: typeof oldRule.mention_new_member === "boolean" ? oldRule.mention_new_member : setting.mention_new_member,
    };

    if (
      oldRule.enabled === nextRule.enabled &&
      oldRule.profile === nextRule.profile &&
      oldRule.mention_new_member === nextRule.mention_new_member
    ) {
      return false;
    }

    setting.group_rules[key] = nextRule;
    setting.groups = this.toLegacyGroups(setting.group_rules);
    this.saveConfig(SETTING_APP, setting);
    return true;
  }

  setGroupMention(groupId, enableMention) {
    const id = toGroupId(groupId);
    if (!Number.isFinite(id) || id <= 0) {
      return false;
    }

    const setting = this.getWritableSetting();
    const key = toGroupKey(id);
    const oldRule = setting.group_rules[key] || {};
    const nextRule = {
      enabled: oldRule.enabled === undefined ? true : oldRule.enabled,
      profile: oldRule.profile || setting.default_profile,
      mention_new_member: Boolean(enableMention),
    };

    if (
      oldRule.enabled === nextRule.enabled &&
      oldRule.profile === nextRule.profile &&
      oldRule.mention_new_member === nextRule.mention_new_member
    ) {
      return false;
    }

    setting.group_rules[key] = nextRule;
    setting.groups = this.toLegacyGroups(setting.group_rules);
    this.saveConfig(SETTING_APP, setting);
    return true;
  }

  /** 写入本群预览开关：只影响该群。群条目不存在时补一条（默认关闭）。 */
  setGroupAllowPreview(groupId, enable) {
    const id = toGroupId(groupId);
    if (!Number.isFinite(id) || id <= 0) {
      return false;
    }

    const setting = this.getWritableSetting();
    const key = toGroupKey(id);
    if (!setting.group_rules[key]) {
      setting.group_rules[key] = {
        enabled: false,
        profile: setting.default_profile,
        mention_new_member: setting.mention_new_member,
      };
    }

    const next = Boolean(enable);
    if (setting.group_rules[key].allow_preview === next) {
      return false;
    }

    setting.group_rules[key].allow_preview = next;
    this.saveConfig(SETTING_APP, setting);
    return true;
  }

  addTemplate(profile, template) {
    if (typeof template !== "string" || template.trim() === "") {
      return false;
    }
    const text = template.trim();
    const conf = this.normalizeTemplateSource(this.getConfig(TEMPLATES_APP));
    if (!conf.profiles[profile]) {
      conf.profiles[profile] = { templates: [] };
    }
    if (!Array.isArray(conf.profiles[profile].templates)) {
      conf.profiles[profile].templates = [];
    }
    conf.profiles[profile].templates.push(text);
    this.saveConfig(TEMPLATES_APP, conf);
    return true;
  }

  addLexiconItem(profile, item) {
    const location = typeof item?.location === "string" ? item.location.trim() : "";
    const roles = normalizeList(item?.roles);
    const foods = normalizeList(item?.foods);
    if (!location || roles.length === 0 || foods.length === 0) {
      return false;
    }

    const conf = this.normalizeLexiconSource(this.getConfig(LEXICON_APP));
    if (!conf.profiles[profile]) {
      conf.profiles[profile] = { lexicon: [] };
    }
    if (!Array.isArray(conf.profiles[profile].lexicon)) {
      conf.profiles[profile].lexicon = [];
    }
    conf.profiles[profile].lexicon.push({ location, roles, foods });
    this.saveConfig(LEXICON_APP, conf);
    return true;
  }

  getConfig(app) {
    return this.getYaml(app, "config");
  }

  getDefSet(app) {
    return this.getYaml(app, "defSet");
  }

  getYaml(app, type) {
    let file = path.join(pluginPath, type, `${app}.yaml`);
    this.watch(file, app, type);
    const cached = this.cache[type][app];
    if (cached !== undefined) {
      return cached;
    }
    if (!fs.existsSync(file)) {
      this.cache[type][app] = {};
      return {};
    }
    try {
      const data = yaml.parse(fs.readFileSync(file, "utf8")) || {};
      this.cache[type][app] = data;
      return data;
    } catch (e) {
      logger.error(`[${pluginName}] ${type}/${app}.yaml 解析错误: ${String(e?.message || e)}`);
      this.cache[type][app] = {};
      return {};
    }
  }

  watch(file, app, type) {
    if (this.watcher[type][app] || !fs.existsSync(file)) return;
    this.watcher[type][app] = true;
    const watcher = fs.watch(file, (event) => {
      if (event !== YAML_EVENT_CHANGE && event !== YAML_EVENT_RENAME) return;
      delete this.cache[type][app];
      if (event !== YAML_EVENT_CHANGE) return;
      logger.debug(`[${pluginName}] ${type}/${app}.yaml 发生修改`);
    });
    watcher.on("error", (error) => {
      logger.warn(`[${pluginName}] 监听 ${type}/${app}.yaml 失败: ${String(error?.message || error)}`);
    });
  }

  // 用「同目录临时文件 + fsync + rename」做原子替换：直接 writeFileSync 覆盖目标文件时，
  // 进程中断/断电可能只落下半份 YAML；下次启动读到损坏文件会静默回落默认值（群列表变空、
  // 所有群都不发欢迎词），而 git status 依旧干净，极难排查。rename 在同一文件系统内是原子操作，
  // 读到的要么是旧内容、要么是新内容，不会出现半份文件，因此临时文件必须与目标同目录。
  saveConfig(app, data) {
    let file = path.join(configPath, `${app}.yaml`);
    const tmpFile = path.join(configPath, `.${app}.yaml.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
    let fd;
    try {
      fd = fs.openSync(tmpFile, "w");
      fs.writeFileSync(fd, yaml.stringify(data), "utf8");
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(tmpFile, file);
    } catch (error) {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch { /* 关闭失败忽略，主因是上面的写入错误 */ }
      }
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* 清理临时文件失败忽略，不掩盖原始错误 */ }
      throw error;
    }
    delete this.cache.config[app];
  }

  getWritableSetting() {
    const setting = this.normalizeSetting(this.getConfig(SETTING_APP));
    if (!setting.default_profile) {
      setting.default_profile = this.setting.default_profile || DEFAULT_PROFILE;
    }
    if (typeof setting.mention_new_member !== "boolean") {
      setting.mention_new_member = DEFAULT_MENTION_NEW_MEMBER;
    }
    if (!Number.isFinite(Number(setting.dedupe_window_sec)) || Number(setting.dedupe_window_sec) < 0) {
      setting.dedupe_window_sec = DEFAULT_DEDUPE_WINDOW_SEC;
    }
    if (!VALID_RENDER_MODES.has(setting.render_mode)) {
      setting.render_mode = DEFAULT_RENDER_MODE;
    }
    return setting;
  }

  normalizeSetting(data) {
    const source = data && typeof data === "object" ? data : {};
    const defaultProfile = typeof source.default_profile === "string" && source.default_profile.trim() !== ""
      ? source.default_profile.trim()
      : DEFAULT_PROFILE;
    const mentionNewMember = typeof source.mention_new_member === "boolean"
      ? source.mention_new_member
      : DEFAULT_MENTION_NEW_MEMBER;
    const dedupeWindowSec = Number.isFinite(Number(source.dedupe_window_sec)) && Number(source.dedupe_window_sec) >= 0
      ? Number(source.dedupe_window_sec)
      : DEFAULT_DEDUPE_WINDOW_SEC;
    const renderMode = VALID_RENDER_MODES.has(source.render_mode) ? source.render_mode : DEFAULT_RENDER_MODE;
    const legacyGroups = Array.isArray(source.groups) ? source.groups.map((item) => Number(item)).filter((id) => Number.isFinite(id) && id > 0) : [];
    const groupRules = {};
    const rawRules = source.group_rules && typeof source.group_rules === "object" ? source.group_rules : {};

    for (const [rawKey, rawRule] of Object.entries(rawRules)) {
      const id = toGroupId(rawKey);
      if (!Number.isFinite(id) || id <= 0) {
        continue;
      }
      const key = toGroupKey(id);
      const profile = typeof rawRule?.profile === "string" && rawRule.profile.trim() !== ""
        ? rawRule.profile.trim()
        : defaultProfile;
      const rule = {
        enabled: Boolean(rawRule?.enabled),
        profile,
        mention_new_member: typeof rawRule?.mention_new_member === "boolean" ? rawRule.mention_new_member : mentionNewMember,
      };
      // allow_preview 缺省表示该群未开启预览：不写入该字段，保持 undefined，避免误判成显式开启
      if (typeof rawRule?.allow_preview === "boolean") {
        rule.allow_preview = rawRule.allow_preview;
      }
      groupRules[key] = rule;
    }

    for (const id of legacyGroups) {
      const key = toGroupKey(id);
      if (!groupRules[key]) {
        groupRules[key] = { enabled: true, profile: defaultProfile, mention_new_member: mentionNewMember };
      }
    }

    const normalized = {
      ...source,
      default_profile: defaultProfile,
      mention_new_member: mentionNewMember,
      dedupe_window_sec: dedupeWindowSec,
      render_mode: renderMode,
      group_rules: groupRules,
      groups: this.toLegacyGroups(groupRules),
    };
    // 老 runtime yaml 可能残留 allow_group_preview：显式删除，避免保存时被写回
    delete normalized.allow_group_preview;
    return normalized;
  }

  toLegacyGroups(groupRules) {
    return Object.entries(groupRules)
      .filter(([, rule]) => rule.enabled)
      .map(([key]) => Number(key))
      .sort((a, b) => a - b);
  }

  /** ==================== Web 配置页支持 ==================== */
  /** 内置（defSet）里出现过的风格名 */
  getBuiltinProfileNames() {
    const lexicon = this.normalizeLexiconSource(this.getDefSet(LEXICON_APP)).profiles;
    const templates = this.normalizeTemplateSource(this.getDefSet(TEMPLATES_APP)).profiles;
    return new Set([...Object.keys(lexicon), ...Object.keys(templates)]);
  }

  /** 原样读取 config/ 下某个文件的 profiles（不补默认条目，避免写盘时凭空多出 default） */
  readRawProfiles(app) {
    const raw = this.getConfig(app);
    const source = raw && typeof raw === "object" ? raw : {};
    const profiles = source.profiles && typeof source.profiles === "object" ? source.profiles : {};
    return { ...profiles };
  }

  /** Web 页面用的全局设置（已补默认值，delay_min/delay_max 来自 defSet） */
  getWebSetting() {
    const setting = this.setting;
    return {
      default_profile: setting.default_profile,
      render_mode: setting.render_mode,
      mention_new_member: Boolean(setting.mention_new_member),
      dedupe_window_sec: normalizeSeconds(setting.dedupe_window_sec, DEFAULT_DEDUPE_WINDOW_SEC),
      delay_min: normalizeSeconds(setting.delay_min, DEFAULT_DELAY_MIN),
      delay_max: normalizeSeconds(setting.delay_max, DEFAULT_DELAY_MAX),
    };
  }

  /** Web 页面用的群规则列表（含缺省条目），按群号升序 */
  listGroupRules() {
    const setting = this.setting;
    return Object.keys(setting.group_rules)
      .map((key) => toGroupId(key))
      .filter((id) => Number.isFinite(id) && id > 0)
      .sort((a, b) => a - b)
      .map((id) => {
        const rule = setting.group_rules[toGroupKey(id)] || {};
        return {
          id,
          enabled: Boolean(rule.enabled),
          profile: rule.profile || setting.default_profile,
          mention_new_member: Boolean(rule.mention_new_member),
          allow_preview: rule.allow_preview === true,
        };
      });
  }

  /** 每个风格的内置 / 自定义条目；内置只读，自定义可增删 */
  listProfileContents() {
    const lexiconDef = this.normalizeLexiconSource(this.getDefSet(LEXICON_APP)).profiles;
    const lexiconConf = this.normalizeLexiconSource(this.getConfig(LEXICON_APP)).profiles;
    const templateDef = this.normalizeTemplateSource(this.getDefSet(TEMPLATES_APP)).profiles;
    const templateConf = this.normalizeTemplateSource(this.getConfig(TEMPLATES_APP)).profiles;
    const builtin = this.getBuiltinProfileNames();
    const names = new Set([
      ...Object.keys(lexiconDef),
      ...Object.keys(lexiconConf),
      ...Object.keys(templateDef),
      ...Object.keys(templateConf),
    ]);
    return [...names]
      .map((name) => ({
        name,
        builtin: builtin.has(name),
        lexiconBuiltin: Array.isArray(lexiconDef[name]?.lexicon) ? lexiconDef[name].lexicon : [],
        lexiconCustom: Array.isArray(lexiconConf[name]?.lexicon) ? lexiconConf[name].lexicon : [],
        templatesBuiltin: Array.isArray(templateDef[name]?.templates) ? templateDef[name].templates : [],
        templatesCustom: Array.isArray(templateConf[name]?.templates) ? templateConf[name].templates : [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** 按风格取词库/模板（内置 + 自定义合并），供 Web 预览使用 */
  getWelcomeDataByProfile(profileName) {
    const fallbackName = this.setting.default_profile || DEFAULT_PROFILE;
    const name = this.profileExists(profileName)
      ? profileName
      : (this.profileExists(fallbackName) ? fallbackName : DEFAULT_PROFILE);
    return {
      profile: name,
      lexicon: this.getMergedLexiconProfiles()[name]?.lexicon || [],
      templates: this.getMergedTemplateProfiles()[name]?.templates || [],
    };
  }

  /** 保存全局设置；返回 { changed, errors } */
  saveWebSetting(patch) {
    const errors = [];
    const current = this.getWritableSetting();
    const profiles = this.listProfiles();
    const before = {
      ...current,
      delay_min: normalizeSeconds(current.delay_min, DEFAULT_DELAY_MIN),
      delay_max: normalizeSeconds(current.delay_max, DEFAULT_DELAY_MAX),
    };
    const next = { ...before };

    if (patch?.default_profile !== undefined) {
      const name = typeof patch.default_profile === "string" ? patch.default_profile.trim() : "";
      if (!profiles.includes(name)) errors.push(`风格不存在：${name}`);
      else next.default_profile = name;
    }

    if (patch?.render_mode !== undefined) {
      if (!VALID_RENDER_MODES.has(patch.render_mode)) errors.push("渲染模式只能是 text 或 image");
      else next.render_mode = patch.render_mode;
    }

    if (patch?.mention_new_member !== undefined) {
      if (typeof patch.mention_new_member !== "boolean") errors.push("「@新人」需要是布尔值");
      else next.mention_new_member = patch.mention_new_member;
    }

    if (patch?.dedupe_window_sec !== undefined) {
      const dedupe = Number(patch.dedupe_window_sec);
      if (!Number.isFinite(dedupe) || dedupe < 0 || dedupe > MAX_DEDUPE_WINDOW_SEC) {
        errors.push(`去重窗口需在 0-${MAX_DEDUPE_WINDOW_SEC} 秒之间`);
      } else {
        next.dedupe_window_sec = Math.floor(dedupe);
      }
    }

    if (patch?.delay_min !== undefined || patch?.delay_max !== undefined) {
      const min = Number.isFinite(Number(patch?.delay_min)) ? Number(patch.delay_min) : before.delay_min;
      const max = Number.isFinite(Number(patch?.delay_max)) ? Number(patch.delay_max) : before.delay_max;
      if (min < 0 || min > MAX_DELAY_SEC) errors.push(`延迟下限需在 0-${MAX_DELAY_SEC} 秒之间`);
      if (max < 0 || max > MAX_DELAY_SEC) errors.push(`延迟上限需在 0-${MAX_DELAY_SEC} 秒之间`);
      if (max < min) errors.push("延迟上限不能小于下限（区间无效时插件会跳过延迟）");
      if (errors.length === 0) {
        next.delay_min = Math.floor(min);
        next.delay_max = Math.floor(max);
      }
    }

    if (errors.length > 0) return { changed: false, errors };
    if (JSON.stringify(before) === JSON.stringify(next)) return { changed: false, errors: [] };
    next.groups = this.toLegacyGroups(next.group_rules || {});
    this.saveConfig(SETTING_APP, next);
    return { changed: true, errors: [] };
  }

  /** 整体保存群规则；返回 { changed, errors } */
  saveWebGroupRules(rules) {
    if (!Array.isArray(rules)) return { changed: false, errors: ["群规则需要是数组"] };
    const errors = [];
    const current = this.getWritableSetting();
    const profiles = this.listProfiles();
    const groupRules = {};
    const seen = new Set();

    for (const raw of rules) {
      const id = toGroupId(raw?.id);
      if (!Number.isFinite(id) || id <= 0) {
        errors.push(`群号无效：${raw?.id}`);
        continue;
      }
      const key = toGroupKey(id);
      if (seen.has(key)) {
        errors.push(`群号重复：${key}`);
        continue;
      }
      seen.add(key);
      const profile = typeof raw?.profile === "string" && raw.profile.trim() !== ""
        ? raw.profile.trim()
        : (current.default_profile || DEFAULT_PROFILE);
      if (!profiles.includes(profile)) {
        errors.push(`群 ${key} 引用的风格不存在：${profile}`);
        continue;
      }
      const rule = {
        enabled: Boolean(raw?.enabled),
        profile,
        mention_new_member: typeof raw?.mention_new_member === "boolean"
          ? raw.mention_new_member
          : Boolean(current.mention_new_member),
      };
      // 只写显式开启；关闭保持缺省，和命令层语义一致
      if (raw?.allow_preview === true) rule.allow_preview = true;
      groupRules[key] = rule;
    }

    if (errors.length > 0) return { changed: false, errors };
    if (JSON.stringify(current.group_rules || {}) === JSON.stringify(groupRules)) {
      return { changed: false, errors: [] };
    }
    const next = { ...current, group_rules: groupRules, groups: this.toLegacyGroups(groupRules) };
    this.saveConfig(SETTING_APP, next);
    return { changed: true, errors: [] };
  }

  /** 保存某个风格的自定义词库 / 模板（内置层不动）；返回 { changed, errors } */
  saveWebProfileContent(profile, payload) {
    const name = typeof profile === "string" ? profile.trim() : "";
    if (!name) return { changed: false, errors: ["风格名不能为空"] };
    const errors = [];
    let changed = false;

    if (payload?.lexicon !== undefined) {
      if (!Array.isArray(payload.lexicon)) {
        errors.push("词库需要是数组");
      } else {
        const items = [];
        payload.lexicon.forEach((item, index) => {
          const location = typeof item?.location === "string" ? item.location.trim() : "";
          const roles = normalizeList(item?.roles);
          const foods = normalizeList(item?.foods);
          if (!location) {
            errors.push(`第 ${index + 1} 条词条缺少地点`);
            return;
          }
          if (location.length > MAX_LEXICON_LOCATION_LENGTH) {
            errors.push(`第 ${index + 1} 条词条的地点超过 ${MAX_LEXICON_LOCATION_LENGTH} 字`);
            return;
          }
          if (roles.length === 0 || foods.length === 0) {
            errors.push(`词条「${location}」的角色和食物都不能为空`);
            return;
          }
          if (roles.some((role) => role.length > MAX_LEXICON_ITEM_LENGTH) || foods.some((food) => food.length > MAX_LEXICON_ITEM_LENGTH)) {
            errors.push(`词条「${location}」的角色/食物单项超过 ${MAX_LEXICON_ITEM_LENGTH} 字`);
            return;
          }
          items.push({ location, roles, foods });
        });
        if (errors.length === 0) {
          const profiles = this.readRawProfiles(LEXICON_APP);
          const before = JSON.stringify(Array.isArray(profiles[name]?.lexicon) ? profiles[name].lexicon : []);
          if (before !== JSON.stringify(items)) {
            profiles[name] = { lexicon: items };
            this.saveConfig(LEXICON_APP, { profiles });
            changed = true;
          }
        }
      }
    }

    if (payload?.templates !== undefined) {
      if (!Array.isArray(payload.templates)) {
        errors.push("模板需要是数组");
      } else {
        const items = [];
        payload.templates.forEach((item, index) => {
          const text = typeof item === "string" ? item.trim() : "";
          if (!text) {
            errors.push(`第 ${index + 1} 条模板是空的`);
            return;
          }
          if (text.length > MAX_TEMPLATE_LENGTH) {
            errors.push(`第 ${index + 1} 条模板超过 ${MAX_TEMPLATE_LENGTH} 字`);
            return;
          }
          items.push(text);
        });
        if (errors.length === 0) {
          const profiles = this.readRawProfiles(TEMPLATES_APP);
          const before = JSON.stringify(Array.isArray(profiles[name]?.templates) ? profiles[name].templates : []);
          if (before !== JSON.stringify(items)) {
            profiles[name] = { templates: items };
            this.saveConfig(TEMPLATES_APP, { profiles });
            changed = true;
          }
        }
      }
    }

    if (errors.length > 0) return { changed: false, errors };
    return { changed, errors: [] };
  }

  /** 新建风格（两个层都建空条目）；返回 { changed, errors } */
  createWebProfile(rawName) {
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!isValidProfileName(name)) {
      return { changed: false, errors: ["风格名只能是 1-24 位中英文、数字、下划线或短横线"] };
    }
    if (this.profileExists(name)) return { changed: false, errors: [`风格已存在：${name}`] };
    const lexiconProfiles = this.readRawProfiles(LEXICON_APP);
    lexiconProfiles[name] = { lexicon: [] };
    this.saveConfig(LEXICON_APP, { profiles: lexiconProfiles });
    const templateProfiles = this.readRawProfiles(TEMPLATES_APP);
    templateProfiles[name] = { templates: [] };
    this.saveConfig(TEMPLATES_APP, { profiles: templateProfiles });
    return { changed: true, errors: [] };
  }

  /** 重命名风格：只允许重命名自定义风格，并同步群规则里的引用 */
  renameWebProfile(rawFrom, rawTo) {
    const from = typeof rawFrom === "string" ? rawFrom.trim() : "";
    const to = typeof rawTo === "string" ? rawTo.trim() : "";
    if (!isValidProfileName(to)) {
      return { changed: false, errors: ["新风格名只能是 1-24 位中英文、数字、下划线或短横线"] };
    }
    if (this.getBuiltinProfileNames().has(from)) {
      return { changed: false, errors: [`「${from}」是插件内置风格，改不了名字（可以新建一个风格再改内容）`] };
    }
    if (!this.profileExists(from)) return { changed: false, errors: [`风格不存在：${from}`] };
    if (from === to) return { changed: false, errors: [] };
    if (this.profileExists(to)) return { changed: false, errors: [`风格已存在：${to}`] };

    for (const app of [LEXICON_APP, TEMPLATES_APP]) {
      const profiles = this.readRawProfiles(app);
      if (profiles[from]) {
        profiles[to] = profiles[from];
        delete profiles[from];
        this.saveConfig(app, { profiles });
      }
    }

    const setting = this.getWritableSetting();
    if (setting.default_profile === from) setting.default_profile = to;
    for (const rule of Object.values(setting.group_rules || {})) {
      if (rule.profile === from) rule.profile = to;
    }
    setting.groups = this.toLegacyGroups(setting.group_rules || {});
    this.saveConfig(SETTING_APP, setting);
    return { changed: true, errors: [] };
  }

  /** 删除风格：内置风格不能删，正在作为默认风格的也不能删 */
  deleteWebProfile(rawName) {
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name) return { changed: false, errors: ["风格名不能为空"] };
    if (this.getBuiltinProfileNames().has(name)) {
      return { changed: false, errors: [`「${name}」是插件内置风格，删不了（可以清空它的自定义内容）`] };
    }
    if (!this.profileExists(name)) return { changed: false, errors: [`风格不存在：${name}`] };
    if ((this.setting.default_profile || DEFAULT_PROFILE) === name) {
      return { changed: false, errors: [`「${name}」正在被当作默认风格，先换一个默认风格再删`] };
    }
    const used = this.listGroupRules().filter((rule) => rule.profile === name).map((rule) => rule.id);
    if (used.length > 0) {
      return { changed: false, errors: [`还有群在用这个风格：${used.join("、")}`] };
    }

    for (const app of [LEXICON_APP, TEMPLATES_APP]) {
      const profiles = this.readRawProfiles(app);
      if (profiles[name]) {
        delete profiles[name];
        this.saveConfig(app, { profiles });
      }
    }
    return { changed: true, errors: [] };
  }

  normalizeLexiconSource(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    if (source.profiles && typeof source.profiles === "object") {
      const profiles = {};
      for (const [name, profileData] of Object.entries(source.profiles)) {
        if (!name) {
          continue;
        }
        profiles[name] = {
          lexicon: Array.isArray(profileData?.lexicon) ? profileData.lexicon : [],
        };
      }
      return { profiles };
    }
    const legacyLexicon = Array.isArray(source.lexicon) ? source.lexicon : [];
    return {
      profiles: {
        [DEFAULT_PROFILE]: { lexicon: legacyLexicon },
      },
    };
  }

  normalizeTemplateSource(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    if (source.profiles && typeof source.profiles === "object") {
      const profiles = {};
      for (const [name, profileData] of Object.entries(source.profiles)) {
        if (!name) {
          continue;
        }
        profiles[name] = {
          templates: Array.isArray(profileData?.templates) ? profileData.templates : [],
        };
      }
      return { profiles };
    }
    const legacyTemplates = Array.isArray(source.templates) ? source.templates : [];
    return {
      profiles: {
        [DEFAULT_PROFILE]: { templates: legacyTemplates },
      },
    };
  }

  mergeProfileMap(defProfiles, confProfiles, key) {
    const merged = {};
    const allProfiles = new Set([...Object.keys(defProfiles), ...Object.keys(confProfiles)]);
    for (const name of allProfiles) {
      const defItems = Array.isArray(defProfiles[name]?.[key]) ? defProfiles[name][key] : [];
      const confItems = Array.isArray(confProfiles[name]?.[key]) ? confProfiles[name][key] : [];
      merged[name] = { [key]: [...defItems, ...confItems] };
    }
    return merged;
  }

  getMergedLexiconProfiles() {
    const def = this.normalizeLexiconSource(this.getDefSet(LEXICON_APP));
    const conf = this.normalizeLexiconSource(this.getConfig(LEXICON_APP));
    return this.mergeProfileMap(def.profiles, conf.profiles, "lexicon");
  }

  getMergedTemplateProfiles() {
    const def = this.normalizeTemplateSource(this.getDefSet(TEMPLATES_APP));
    const conf = this.normalizeTemplateSource(this.getConfig(TEMPLATES_APP));
    return this.mergeProfileMap(def.profiles, conf.profiles, "templates");
  }
}

export default new Config();
