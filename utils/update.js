/**
 * 插件自更新：#更新欢迎词插件（仅主人）。
 * 只做 git fetch/checkout/pull，不自动重启；失败一律回显 stderr。
 */
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { logger } from "node-karin";

export const CMD_UPDATE_PLUGIN = "#更新欢迎词插件";
const UPDATE_ONLY_TEXT = "仅机器人主人可执行插件更新。";
const UPDATE_TIMEOUT_MS = 60_000;
const GIT_TIMEOUT_HINT = "git 命令超时（60s），请检查网络或代理";

/** 插件根目录（apps/ 与 utils/ 的上一级），不依赖 Karin 的 cwd */
export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runGit(args) {
  return new Promise((resolve) => {
    execFile("git", ["-C", PLUGIN_ROOT, ...args], { timeout: UPDATE_TIMEOUT_MS, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout ?? "").trim(),
        stderr: String(stderr ?? "").trim(),
        error: error ? (error.code ?? "unknown") : null,
        signal: error?.signal ?? null,
      });
    });
  });
}

function failText(result) {
  if (result.signal) return GIT_TIMEOUT_HINT;
  return (result.stderr || result.stdout || String(result.error)).slice(0, 900);
}

export async function handleUpdateCommand(e, msg) {
  if (msg !== CMD_UPDATE_PLUGIN) {
    return false;
  }
  if (!e.isMaster) {
    await e.reply(UPDATE_ONLY_TEXT);
    return true;
  }

  const before = await runGit(["rev-parse", "--short", "HEAD"]);
  if (!before.ok) {
    const reason = before.stderr || (before.error === "ENOENT" ? "未找到 git 命令" : before.error);
    await e.reply(`无法读取当前版本：${reason}\n插件路径：${PLUGIN_ROOT}`);
    return true;
  }

  await e.reply(`正在更新…当前版本 ${before.stdout}`);

  // 不要带 --depth：浅克隆会写入 .git/shallow，之后 ff-only 更新会被误判为分叉
  const fetch = await runGit(["fetch", "origin", "karin"]);
  if (!fetch.ok) {
    await e.reply(`拉取失败：\n${failText(fetch)}`);
    return true;
  }

  const checkout = await runGit(["checkout", "karin"]);
  if (!checkout.ok) {
    await e.reply(`切换 karin 分支失败：\n${failText(checkout)}\n\n如有本地改动，请先处理后再试。`);
    return true;
  }

  const pull = await runGit(["pull", "--ff-only", "origin", "karin"]);
  if (!pull.ok) {
    await e.reply(`更新失败（可能有本地改动或分叉）：\n${failText(pull)}\n\n当前版本仍为 ${before.stdout}`);
    return true;
  }

  const after = await runGit(["rev-parse", "--short", "HEAD"]);
  const afterVersion = after.ok ? after.stdout : "unknown";
  if (afterVersion === before.stdout) {
    await e.reply(`已是最新版本：${before.stdout}\n无需重启。`);
    return true;
  }

  let detail = "";
  const log = await runGit(["log", "--oneline", `${before.stdout}..${afterVersion}`]);
  if (log.ok && log.stdout) {
    detail = `\n\n本次拉取：\n${log.stdout.split("\n").slice(0, 5).join("\n")}`;
  }

  logger.mark(`[random-welcome] 插件已更新 ${before.stdout} -> ${afterVersion}`);
  await e.reply(`更新完成：${before.stdout} → ${afterVersion}${detail}\n\n代码类改动需重启才生效，请在服务器执行 docker restart karin（或其他 Karin 重启方式）。`);
  return true;
}
