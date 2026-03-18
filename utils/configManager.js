import fs from "fs";
import path from "path";

const CONFIG_DIR = path.join(process.cwd(), "plugins", "random-welcome", "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "groupConfig.json");

// Default configuration: whitelist mode by default, meaning no groups are enabled until explicitly added
const DEFAULT_CONFIG = {
  enable_groups: []
};

let configCache = null;

function ensureConfigExists() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
  }
}

function loadConfig() {
  ensureConfigExists();
  
  try {
    const rawData = fs.readFileSync(CONFIG_FILE, "utf-8");
    configCache = JSON.parse(rawData);
  } catch (error) {
    console.error("[random-welcome] 解析配置文件报错，使用默认配置", error);
    configCache = { ...DEFAULT_CONFIG };
  }
  
  if (!Array.isArray(configCache.enable_groups)) {
    configCache.enable_groups = [];
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configCache, null, 2), "utf-8");
  } catch (error) {
    console.error("[random-welcome] 保存配置文件失败", error);
  }
}

/**
 * Check if the random welcome is enabled for a specific group
 * @param {number|string} groupId 
 * @returns {boolean}
 */
export function isGroupEnabled(groupId) {
  if (!configCache) {
    loadConfig();
  }
  return configCache.enable_groups.includes(Number(groupId));
}

/**
 * Toggle the random welcome feature for a specific group
 * @param {number|string} groupId 
 * @param {boolean} enable 
 * @returns {boolean} true if state changed, false if state was already desired
 */
export function setGroupEnable(groupId, enable) {
  if (!configCache) {
    loadConfig();
  }
  
  const id = Number(groupId);
  const index = configCache.enable_groups.indexOf(id);
  
  if (enable) {
    if (index === -1) {
      configCache.enable_groups.push(id);
      saveConfig();
      return true;
    }
  } else {
    if (index !== -1) {
      configCache.enable_groups.splice(index, 1);
      saveConfig();
      return true;
    }
  }
  
  return false; // State didn't change (already enabled when trying to enable, etc)
}
