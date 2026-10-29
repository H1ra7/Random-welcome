# random-welcome

Karin 插件：新成员入群时，按“地点 -> 专属职业/种族 -> 专属美食”随机生成欢迎词。

> `karin` 分支为 Karin 版本；`main` 分支保留原 TRSS-Yunzai 版本。

## 目录结构

```text
random-welcome/
├─ apps/
│  └─ randomWelcome.js
├─ utils/
│  ├─ config.js
│  └─ renderer.js
├─ defSet/
│  ├─ setting.yaml
│  ├─ lexicon.yaml
│  └─ templates.yaml
├─ config/
│  ├─ setting.yaml (运行中自动生成)
│  ├─ lexicon.yaml (运行中自动生成)
│  └─ templates.yaml (运行中自动生成)
├─ resources/
│  └─ welcome/
├─ index.js
└─ package.json
```

## 安装

1. 将本目录放到 Karin 的 `plugins/random-welcome`。
2. 在 Karin 根目录安装渲染器（图片模式需要）：

```bash
pnpm add @karinjs/plugin-puppeteer -w
```

3. 启动 Karin，确认日志出现 `[random-welcome] Karin 插件加载成功`。
4. 如需图片卡片，把 `config/setting.yaml` 中的 `render_mode` 改为 `image`：

```yaml
render_mode: image
```

没有安装渲染器时，图片模式会自动回退为纯文本。

## 功能

- 事件：`notice.groupMemberAdd`
- 场景：群内有新成员入群时自动发送欢迎词
- 支持按群独立开启/关闭
- 支持按群设置不同欢迎词风格（profile）
- 支持群内动态添加模板与词条，写入 YAML 后立即生效（无需重启）
- 支持按群设置欢迎词是否 `@新人`
- 支持入群事件去重（同群同用户在窗口期内只欢迎一次）
- 支持查看本群欢迎词设置摘要（开关、风格、@状态、延迟、去重窗口）
- 支持管理员在群内为指定成员手动发迎新卡（不显示“第 xx 位”）
- 支持普通用户私聊抽取专属卡（按用户每天一次）

## 群内命令

- `#欢迎词帮助` / `#随机欢迎词帮助`
- `#开启欢迎词` / `#开启随机欢迎词`
- `#关闭欢迎词` / `#关闭随机欢迎词`
- `#随机欢迎词` / `#欢迎词` / `#随机欢迎词测试` / `#欢迎词测试`
- `#欢迎词风格列表`
- `#欢迎词设置`
- `#发迎新卡 @某人`（仅群管理员/群主/机器人主人）
- `#抽专属卡 群号`（仅私聊，每人每天 1 次）
- `#欢迎词@开启` / `#欢迎词@关闭`
- `#设置欢迎词风格 风格名`
- `#添加欢迎词 模板内容`
- `#添加欢迎词条 地点|角色1,角色2|食物1,食物2`
- `#随机欢迎词列表`（仅机器人主人可用，查看全局已开启群）

## 配置模型

`setting.yaml`：

- `default_profile`：默认风格
- `group_rules.<group_id>.enabled`：本群开关
- `group_rules.<group_id>.profile`：本群风格
- `group_rules.<group_id>.mention_new_member`：本群欢迎词是否 `@新人`
- `delay_min` / `delay_max`：欢迎词随机延迟秒数区间
- `dedupe_window_sec`：欢迎去重窗口秒数
- `render_mode`：`text` 或 `image`

`lexicon.yaml`：

- `profiles.<profile>.lexicon[]`

`templates.yaml`：

- `profiles.<profile>.templates[]`

## Karin 适配说明

- 入群者 ID 取 `e.content.targetId`，不是 `e.userId`。
- 群名称、成员数、成员名片、群头衔通过 `e.bot.getGroupInfo()` / `e.bot.getGroupMemberInfo()` 获取。
- 合并转发使用 `common.makeForward()` + `e.bot.sendForwardMsg()`。
- Redis 冷却使用 `node-karin` 导出的 `redis`。
- 图片渲染使用 `render.render()`；HTML 模板沿用 art-template 语法。
- `notice.groupMemberAdd`、群头衔、成员数依赖适配器能力；QQ 官方 Bot 适配器可能不提供入群通知。
