import fs from "fs";
import path from "path";
import yaml from "yaml";

const DEFAULT_PROFILE = "default";
const DEFAULT_SAMPLES_PER_PROFILE = Number(process.argv[2] || 300);
const PREVIEW_COUNT = Number(process.argv[3] || 10);
const PLACEHOLDER_REG = /\{[^}]+\}/;
const BAD_TOKEN_REG = /(undefined|null|NaN)/;
const MIN_TEXT_LENGTH = 30;

function readYaml(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    return yaml.parse(fs.readFileSync(filePath, "utf8")) || {};
  } catch {
    return {};
  }
}

function normalizeSetting(raw) {
  const defaultProfile = typeof raw?.default_profile === "string" && raw.default_profile.trim() ? raw.default_profile.trim() : DEFAULT_PROFILE;
  const groupRules = raw?.group_rules && typeof raw.group_rules === "object" ? raw.group_rules : {};
  return { default_profile: defaultProfile, group_rules: groupRules };
}

function normalizeLexicon(raw) {
  if (raw?.profiles && typeof raw.profiles === "object") {
    return raw.profiles;
  }
  if (Array.isArray(raw?.lexicon)) {
    return { [DEFAULT_PROFILE]: { lexicon: raw.lexicon } };
  }
  return {};
}

function normalizeTemplates(raw) {
  if (raw?.profiles && typeof raw.profiles === "object") {
    return raw.profiles;
  }
  if (Array.isArray(raw?.templates)) {
    return { [DEFAULT_PROFILE]: { templates: raw.templates } };
  }
  return {};
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

function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  return items[Math.floor(Math.random() * items.length)];
}

function wrapQuoted(text) {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) {
    return "";
  }
  return `「${value}」`;
}

function buildOneMessage(templates, lexicon) {
  const template = pickRandom(templates);
  const place = pickRandom(lexicon);
  if (!template || !place) {
    return null;
  }
  const role = pickRandom(place.roles);
  const food = pickRandom(place.foods);
  if (!role || !food || !place.location) {
    return null;
  }

  const text = String(template)
    .replaceAll("{at_user}", "@Hira")
    .replaceAll("{location}", wrapQuoted(String(place.location)))
    .replaceAll("{role}", wrapQuoted(String(role)))
    .replaceAll("{food}", wrapQuoted(String(food)))
    .replaceAll("{bot_name}", "机器人");

  return { text, location: String(place.location), role: String(role), food: String(food) };
}

function checkText(text) {
  if (!text || text.length < MIN_TEXT_LENGTH) {
    return "too_short";
  }
  if (PLACEHOLDER_REG.test(text)) {
    return "placeholder_left";
  }
  if (BAD_TOKEN_REG.test(text)) {
    return "bad_token";
  }
  return null;
}

function sumArrayLen(list, key) {
  return list.reduce((sum, item) => sum + (Array.isArray(item?.[key]) ? item[key].length : 0), 0);
}

const root = process.cwd();
const defSetPath = path.join(root, "defSet");
const configPath = path.join(root, "config");

const setting = normalizeSetting({
  ...readYaml(path.join(defSetPath, "setting.yaml")),
  ...readYaml(path.join(configPath, "setting.yaml")),
});
const lexiconProfiles = mergeProfiles(
  normalizeLexicon(readYaml(path.join(defSetPath, "lexicon.yaml"))),
  normalizeLexicon(readYaml(path.join(configPath, "lexicon.yaml"))),
  "lexicon",
);
const templateProfiles = mergeProfiles(
  normalizeTemplates(readYaml(path.join(defSetPath, "templates.yaml"))),
  normalizeTemplates(readYaml(path.join(configPath, "templates.yaml"))),
  "templates",
);

const profileNames = [...new Set([...Object.keys(lexiconProfiles), ...Object.keys(templateProfiles)])];
if (profileNames.length === 0) {
  console.log("没有可检查的 profile");
  process.exit(1);
}

let globalFailed = 0;
console.log(`samples_per_profile=${DEFAULT_SAMPLES_PER_PROFILE}`);
console.log(`profiles=${profileNames.join(", ")}`);
console.log("");

for (const profile of profileNames) {
  const templates = templateProfiles[profile]?.templates || templateProfiles[setting.default_profile]?.templates || [];
  const lexicon = lexiconProfiles[profile]?.lexicon || lexiconProfiles[setting.default_profile]?.lexicon || [];
  const reasonCounter = {};
  const previews = [];
  const seenLocations = new Set();
  const seenRoles = new Set();
  const seenFoods = new Set();
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < DEFAULT_SAMPLES_PER_PROFILE; i += 1) {
    const data = buildOneMessage(templates, lexicon);
    if (!data) {
      failed += 1;
      reasonCounter.build_failed = (reasonCounter.build_failed || 0) + 1;
      continue;
    }
    const reason = checkText(data.text);
    if (reason) {
      failed += 1;
      reasonCounter[reason] = (reasonCounter[reason] || 0) + 1;
      continue;
    }
    ok += 1;
    seenLocations.add(data.location);
    seenRoles.add(data.role);
    seenFoods.add(data.food);
    if (previews.length < PREVIEW_COUNT) {
      previews.push(data.text);
    }
  }

  const totalLocations = lexicon.length;
  const totalRoles = sumArrayLen(lexicon, "roles");
  const totalFoods = sumArrayLen(lexicon, "foods");
  const locationCoverage = totalLocations > 0 ? ((seenLocations.size / totalLocations) * 100).toFixed(2) : "0.00";
  const roleCoverage = totalRoles > 0 ? ((seenRoles.size / totalRoles) * 100).toFixed(2) : "0.00";
  const foodCoverage = totalFoods > 0 ? ((seenFoods.size / totalFoods) * 100).toFixed(2) : "0.00";

  console.log(`profile=${profile}`);
  console.log(`ok=${ok} failed=${failed}`);
  console.log(`coverage location=${locationCoverage}% role=${roleCoverage}% food=${foodCoverage}%`);
  console.log(`fail_reasons=${JSON.stringify(reasonCounter)}`);
  console.log("preview:");
  previews.forEach((text, index) => {
    console.log(`${index + 1}. ${text.replaceAll("\n", " ")}`);
  });
  console.log("");

  globalFailed += failed;
}

if (globalFailed > 0) {
  process.exitCode = 1;
}
