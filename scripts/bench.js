import fs from "fs";
import path from "path";
import yaml from "yaml";

const DEFAULT_PROFILE = "default";
const ITERATIONS = Number(process.argv[2] || 10000);
const GROUPS = Number(process.argv[3] || 200);

function readYaml(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return yaml.parse(fs.readFileSync(filePath, "utf8")) || {};
}

function normalizeLexicon(raw) {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  if (raw?.profiles && typeof raw.profiles === "object") {
    return raw.profiles;
  }
  if (!Array.isArray(raw?.lexicon)) {
    return {};
  }
  return { [DEFAULT_PROFILE]: { lexicon: Array.isArray(raw?.lexicon) ? raw.lexicon : [] } };
}

function normalizeTemplates(raw) {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  if (raw?.profiles && typeof raw.profiles === "object") {
    return raw.profiles;
  }
  if (!Array.isArray(raw?.templates)) {
    return {};
  }
  return { [DEFAULT_PROFILE]: { templates: Array.isArray(raw?.templates) ? raw.templates : [] } };
}

function mergeProfiles(defProfiles, confProfiles, key) {
  const merged = {};
  const names = new Set([...Object.keys(defProfiles), ...Object.keys(confProfiles)]);
  for (const name of names) {
    const defItems = Array.isArray(defProfiles[name]?.[key]) ? defProfiles[name][key] : [];
    const confItems = Array.isArray(confProfiles[name]?.[key]) ? confProfiles[name][key] : [];
    merged[name] = { [key]: [...defItems, ...confItems] };
  }
  return merged;
}

function normalizeSetting(raw) {
  const defaultProfile = typeof raw?.default_profile === "string" && raw.default_profile.trim() ? raw.default_profile.trim() : DEFAULT_PROFILE;
  const groupRules = raw?.group_rules && typeof raw.group_rules === "object" ? raw.group_rules : {};
  const groups = Array.isArray(raw?.groups) ? raw.groups.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0) : [];
  for (const id of groups) {
    const key = String(id);
    if (!groupRules[key]) {
      groupRules[key] = { enabled: true, profile: defaultProfile };
    }
  }
  return { default_profile: defaultProfile, group_rules: groupRules };
}

function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  return items[Math.floor(Math.random() * items.length)];
}

function getWelcomeData(groupId, setting, lexiconProfiles, templateProfiles) {
  const key = String(groupId);
  const rule = setting.group_rules[key] || { enabled: false, profile: setting.default_profile };
  if (!rule.enabled) {
    return null;
  }
  const profile = rule.profile || setting.default_profile;
  const lexicon = lexiconProfiles[profile]?.lexicon || lexiconProfiles[setting.default_profile]?.lexicon || [];
  const templates = templateProfiles[profile]?.templates || templateProfiles[setting.default_profile]?.templates || [];
  return { lexicon, templates };
}

function buildMessage(groupId, setting, lexiconProfiles, templateProfiles) {
  const welcomeData = getWelcomeData(groupId, setting, lexiconProfiles, templateProfiles);
  if (!welcomeData) {
    return null;
  }
  const place = pickRandom(welcomeData.lexicon);
  const template = pickRandom(welcomeData.templates);
  const role = pickRandom(place?.roles);
  const food = pickRandom(place?.foods);
  if (!place?.location || !template || !role || !food) {
    return null;
  }
  return template
    .replaceAll("{at_user}", "@Hira")
    .replaceAll("{location}", place.location)
    .replaceAll("{role}", role)
    .replaceAll("{food}", food)
    .replaceAll("{bot_name}", "压测机器人");
}

const root = process.cwd();
const defSet = path.join(root, "defSet");
const conf = path.join(root, "config");
const setting = normalizeSetting({
  ...readYaml(path.join(defSet, "setting.yaml")),
  ...readYaml(path.join(conf, "setting.yaml")),
});
const lexiconProfiles = mergeProfiles(
  normalizeLexicon(readYaml(path.join(defSet, "lexicon.yaml"))),
  normalizeLexicon(readYaml(path.join(conf, "lexicon.yaml"))),
  "lexicon",
);
const templateProfiles = mergeProfiles(
  normalizeTemplates(readYaml(path.join(defSet, "templates.yaml"))),
  normalizeTemplates(readYaml(path.join(conf, "templates.yaml"))),
  "templates",
);

for (let i = 1; i <= GROUPS; i += 1) {
  const key = String(i);
  if (!setting.group_rules[key]) {
    setting.group_rules[key] = { enabled: true, profile: setting.default_profile };
  }
}

const start = process.hrtime.bigint();
let ok = 0;
let failed = 0;
for (let i = 0; i < ITERATIONS; i += 1) {
  const groupId = (i % GROUPS) + 1;
  const msg = buildMessage(groupId, setting, lexiconProfiles, templateProfiles);
  if (!msg) {
    failed += 1;
    continue;
  }
  ok += 1;
}
const end = process.hrtime.bigint();
const ms = Number(end - start) / 1e6;
const qps = ms > 0 ? (ITERATIONS / ms) * 1000 : 0;

console.log(`iterations=${ITERATIONS}`);
console.log(`groups=${GROUPS}`);
console.log(`ok=${ok}`);
console.log(`failed=${failed}`);
console.log(`cost_ms=${ms.toFixed(2)}`);
console.log(`qps=${qps.toFixed(2)}`);
