/**
 * 注册插件自带的 Web 配置页：
 *   GET  /random-welcome/*        → resources/web 下的前端产物（SPA，未命中回 index.html）
 *   /api/random-welcome/v1/*      → utils/webApi.js 提供的 JSON 接口（走 Karin 登录态）
 * 入口在 Karin Web UI 的插件列表里（package.json 的 karin.web 指向 web.config.js）。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { app as karinApp, logger } from "node-karin";
import express from "node-karin/express";

import { createWebRouter } from "../utils/webApi.js";

const PLUGIN_NAME = "random-welcome";
const WEB_BASE = "/random-welcome";
const API_BASE = "/api/random-welcome";

const currentFilePath = fileURLToPath(import.meta.url);
const pluginRoot = path.resolve(path.dirname(currentFilePath), "..");
const webDistPath = path.join(pluginRoot, "resources", "web");
const webIndexPath = path.join(webDistPath, "index.html");

const sendWebIndex = (res) => {
  try {
    const html = fs.readFileSync(webIndexPath, "utf8");
    res.setHeader("Cache-Control", "no-cache");
    res.type("html").send(html);
  } catch (error) {
    logger.error(`[${PLUGIN_NAME}] 读取 Web 配置页入口失败: ${webIndexPath} / ${String(error?.message || error)}`);
    res
      .status(500)
      .type("html")
      .send(
        "<!doctype html><meta charset=\"utf-8\"><h3>随机欢迎词 Web 配置页还没构建</h3>" +
          "<p>在插件目录执行 <code>pnpm build:web</code> 生成 resources/web 后刷新本页。</p>",
      );
  }
};

const staticRouter = express.Router();
staticRouter.use(
  express.static(webDistPath, {
    redirect: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }),
);
staticRouter.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  return sendWebIndex(res);
});

karinApp.use(WEB_BASE, staticRouter);
karinApp.use(API_BASE, createWebRouter());

logger.mark(`[${PLUGIN_NAME}] Web 配置页已挂载: ${WEB_BASE}/config`);
