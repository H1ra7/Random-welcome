import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "yaml";

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
      return { enabled: false, profile: this.setting.default_profile };
    }

    const setting = this.setting;
    const key = toGroupKey(id);
    const rule = setting.group_rules[key];
    if (rule) {
      return { enabled: rule.enabled, profile: rule.profile || setting.default_profile };
    }
    return { enabled: false, profile: setting.default_profile };
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
    };

    if (oldRule.enabled === nextRule.enabled && oldRule.profile === nextRule.profile) {
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
    };

    if (oldRule.enabled === nextRule.enabled && oldRule.profile === nextRule.profile) {
      return false;
    }

    setting.group_rules[key] = nextRule;
    setting.groups = this.toLegacyGroups(setting.group_rules);
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
    if (!fs.existsSync(file)) {
      return {};
    }
    try {
      return yaml.parse(fs.readFileSync(file, "utf8")) || {};
    } catch (e) {
      console.error(`[${pluginName}] ${type}/${app}.yaml 解析错误:`, e);
      return {};
    }
  }

  watch(file, app, type) {
    if (this.watcher[type][app] || !fs.existsSync(file)) return;
    this.watcher[type][app] = true;
    fs.watch(file, (event) => {
      if (event === "change") {
        console.log(`[${pluginName}] ${type}/${app}.yaml 发生修改`);
      }
    });
  }

  saveConfig(app, data) {
    let file = path.join(configPath, `${app}.yaml`);
    fs.writeFileSync(file, yaml.stringify(data), "utf8");
  }

  getWritableSetting() {
    const setting = this.normalizeSetting(this.getConfig(SETTING_APP));
    if (!setting.default_profile) {
      setting.default_profile = this.setting.default_profile || DEFAULT_PROFILE;
    }
    return setting;
  }

  normalizeSetting(data) {
    const source = data && typeof data === "object" ? data : {};
    const defaultProfile = typeof source.default_profile === "string" && source.default_profile.trim() !== ""
      ? source.default_profile.trim()
      : DEFAULT_PROFILE;
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
      groupRules[key] = {
        enabled: Boolean(rawRule?.enabled),
        profile,
      };
    }

    for (const id of legacyGroups) {
      const key = toGroupKey(id);
      if (!groupRules[key]) {
        groupRules[key] = { enabled: true, profile: defaultProfile };
      }
    }

    return {
      ...source,
      default_profile: defaultProfile,
      group_rules: groupRules,
      groups: this.toLegacyGroups(groupRules),
    };
  }

  toLegacyGroups(groupRules) {
    return Object.entries(groupRules)
      .filter(([, rule]) => rule.enabled)
      .map(([key]) => Number(key))
      .sort((a, b) => a - b);
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
