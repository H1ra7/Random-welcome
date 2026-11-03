import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "node-karin";

const pluginRoot = path.dirname(fileURLToPath(import.meta.url));

const readVersion = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(pluginRoot, "package.json"), "utf8")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
};

const version = readVersion();

export const webConfig = defineConfig({
  info: {
    id: "random-welcome",
    name: "随机欢迎词",
    description: `新人入群随机欢迎词：地点/身份/美食模板、按群开关与风格、私聊批量管理。v${version}`,
    icon: {
      name: "celebration",
      color: "#F59E0B",
    },
    version,
    author: {
      name: "Hira",
    },
  },
  page: {
    url: process.env.NODE_ENV === "development" ? "http://127.0.0.1:5178/random-welcome/config" : "/random-welcome/config",
    title: "随机欢迎词配置",
    description: "使用插件自带的配置管理页面",
  },
});

export default webConfig;
