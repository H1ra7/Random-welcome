import fs from "node:fs";
import path from "node:path";
import template from "art-template";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const pluginRoot = path.resolve(path.dirname(scriptPath), "..");
const yunzaiRoot = path.resolve(pluginRoot, "..", "..");
const tplFile = path.join(pluginRoot, "resources", "welcome", "index.html");
const defaultOutFile = path.join(yunzaiRoot, "temp", "html", "random-welcome-welcome-card", "random-welcome-welcome-card.html");
const outFile = process.env.RW_PREVIEW_OUT || defaultOutFile;
const cssFileUrl = pathToFileURL(path.join(pluginRoot, "resources", "welcome", "index.css")).href;

const html = template.render(fs.readFileSync(tplFile, "utf8"), {
  cssFileUrl,
  avatarUrl: "https://q1.qlogo.cn/g?b=qq&s=640&nk=2279260508",
  nickname: "Hira",
  userId: "2279260508",
  groupName: "本地预览群",
  memberCount: 123,
  storyText: "本地预览文案",
  location: "东部城",
  role: "调查记者",
  food: "酸辣海贝",
});

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html, "utf8");
console.log(`preview updated: ${outFile}`);
