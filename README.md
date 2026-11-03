# random-welcome

Karin 插件：新成员入群时，按“地点 -> 专属职业/种族 -> 专属美食”随机生成欢迎词。

> `karin` 分支为 Karin 版本；`main` 分支保留原 TRSS-Yunzai 版本。

## 目录结构

```text
random-welcome/
├─ apps/
│  ├─ randomWelcome.js
│  └─ web.js                 (注册 Web 配置页路由)
├─ utils/
│  ├─ config.js
│  ├─ renderer.js
│  └─ webApi.js              (Web 配置页 JSON 接口)
├─ defSet/
│  ├─ setting.yaml
│  ├─ lexicon.yaml
│  └─ templates.yaml
├─ config/
│  ├─ setting.yaml (运行中自动生成)
│  ├─ lexicon.yaml (运行中自动生成)
│  └─ templates.yaml (运行中自动生成)
├─ resources/
│  ├─ welcome/
│  └─ web/                   (Web 配置页构建产物，随仓库提交)
├─ web/                      (Web 配置页源码：Vite + React + TypeScript)
├─ web.config.js             (Web 配置页入口声明)
├─ index.js
└─ package.json
```

## 安装

1. 将本仓库克隆为 `plugins/karin-plugin-random-welcome`。

目录名必须以 `karin-plugin-` 开头，否则 Karin 会把它当作非插件目录静默跳过（不报错、无日志）。

```bash
cd <KARIN_ROOT>/plugins
git clone -b karin https://github.com/H1ra7/Random-welcome.git karin-plugin-random-welcome
```

2. 在 Karin 根目录安装渲染器（图片模式需要）：

```bash
pnpm add @karinjs/plugin-puppeteer -w
```

已在根依赖里时不要重复安装。

3. 重启 Karin，确认日志出现 `[random-welcome] Karin 插件加载成功`。
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

- `#欢迎词帮助` / `#随机欢迎词帮助`（合并转发出多条说明，避免长文本刷屏）
- `#开启欢迎词` / `#开启随机欢迎词`
- `#关闭欢迎词` / `#关闭随机欢迎词`
- `#随机欢迎词` / `#欢迎词` / `#随机欢迎词测试` / `#欢迎词测试`
- `#欢迎词风格列表`
- `#欢迎词设置`
- `#发迎新卡 @某人`（仅群管理员/群主/机器人主人）
- `#抽专属卡 群号`（私聊/群临时会话，每人每天 1 次）
- `#欢迎词@开启` / `#欢迎词@关闭`
- `#欢迎词预览开启` / `#欢迎词预览关闭`（本群；群管理员/群主/机器人主人；私聊里由主人发送则进入批量管理模式，见下）
- `#设置欢迎词风格 风格名`
- `#添加欢迎词 模板内容`
- `#添加欢迎词条 地点|角色1,角色2|食物1,食物2`
- `#随机欢迎词列表`（仅机器人主人可用，查看全局已开启群）
- `#更新欢迎词插件`（仅机器人主人，`git fetch` + `pull --ff-only` 拉取 `karin` 分支，成功后调用 Karin `restart()` 自动重启）

## 私聊批量管理群内预览（仅机器人主人）

群内预览按群开关，群一多，在群里逐个切换很麻烦。机器人主人可以在**私聊**里批量管理：

1. 私聊发送 `#欢迎词预览关闭`：列出「当前群内预览为开启」的群，带编号。

   ```text
   当前群内预览为「开启」的群（3 个）：
   1. 853065300
   2. 887223378
   3. 477640404
   回复编号关闭（可多个，用空格/逗号分隔；0 = 全部）；120 秒内有效
   ```

2. 私聊发送 `#欢迎词预览开启`：反向列出「当前群内预览为关闭」的群（含尚未设置过的群），回复编号开启（文案对称）。
3. 回复编号即可批量执行：
   - 单个 `2`；多个 `1 3`、`1,3`、`1，3`、`1、3`（空格 / 半角逗号 / 全角逗号 / 顿号分隔均可）。
   - `0` = 列表里全部。
   - 编号会去重排序；越界或非数字的编号会被忽略，并在回执里提示（如「忽略无效编号：9」）。
4. 执行后回执列出每个群的结果（群号）；列表里还有剩余的群会重新列出（只列剩余）并刷新会话，全部处理完则提示「列表已空。」。

```text
已关闭：
- 887223378
```

会话有效期 **120 秒**（内存保存，不落盘）。超时后回复编号会提示「列表已过期，重新发送 #欢迎词预览关闭 获取。」；**不在会话中、非主人、或群聊里的纯数字消息不会被执行**（直接放行给其它插件），因此不会抢占其它插件的数字消息。

## Web 配置页

插件自带一个网页配置界面（Karin Web UI → 插件列表 → 随机欢迎词 → 「随机欢迎词配置」，也可以直接访问 `http://<你的 Karin 地址>/random-welcome/config`）。

- 鉴权：走 Karin 自己的登录态（和 Karin Web UI 同一套），首次打开需要输入 Karin 的 HTTP 鉴权密钥（`.env` 里的 `HTTP_AUTH_KEY`）。
- 能改什么：全局参数（默认风格 / 渲染模式 / @新人 / 延迟区间 / 去重窗口）、群规则（每个群的开关、@新人、群内预览、风格，可加群可删群）、按风格编辑词库与模板、以及直接预览文案和图片卡片。
- 与命令的关系：页面写的就是 `config/` 下那几份 YAML（原子写，和 `#添加欢迎词` 等命令共用一份数据），两边改都不冲突，页面改完群里立刻生效。
- 词库/模板分两层：`defSet/` 里的**内置**条目只读（升级插件不会丢），`config/` 里的**自定义**条目可以随便增删。运行时生效的是「内置 + 自定义」合并结果。
- 内置风格（`defSet/` 里定义过的名字）不能改名或删除；自定义风格可以，删除前要先把它从默认风格和群规则里摘掉。

改了前端源码后需要重新构建（产物在 `resources/web/`，已随仓库提交，不构建也能用）：

```bash
cd plugins/karin-plugin-random-welcome
pnpm install --ignore-workspace   # 首次
pnpm build:web
```

后端（`apps/web.js`、`utils/webApi.js`、`web.config.js`）改动需要重启 Karin；前端构建产物是静态文件，构建完刷新页面即可。

## 配置目录

`config/` 是运行期目录，不随仓库跟踪（已加入 `.gitignore`）。默认值在 `defSet/`，首次写入时自动创建 `config/setting.yaml`；升级插件不会覆盖你的群配置。

### 从旧版升级（仅第一次）

旧版本曾把 `config/setting.yaml` 纳入 git。第一次拉取新版本前，先在插件目录执行：

```bash
cp config/setting.yaml /tmp/random-welcome-setting.yaml
git checkout -- config/setting.yaml
git pull --ff-only
mkdir -p config
cp /tmp/random-welcome-setting.yaml config/setting.yaml
```

之后再升级就不需要这一步，`git pull` 也不会再因为 `config/setting.yaml` 的本地改动失败。

## 配置模型

`setting.yaml`：

- `default_profile`：默认风格
- `group_rules.<group_id>.enabled`：本群开关
- `group_rules.<group_id>.profile`：本群风格
- `group_rules.<group_id>.mention_new_member`：本群欢迎词是否 `@新人`
- `group_rules.<group_id>.allow_preview`：本群群内预览开关（可选布尔，严格 `true` 才算开启）。字段缺省 / 群条目不存在即视为关闭
- `delay_min` / `delay_max`：欢迎词随机延迟秒数区间
- `dedupe_window_sec`：欢迎去重窗口秒数
- `render_mode`：`text` 或 `image`
- 群内预览默认关闭：群里发预览命令会回一条“请私聊获取”的提示（包括管理员），私聊 / 群临时会话不受影响；每个群用 `#欢迎词预览开启/关闭` 单独开关（群管理员/群主/机器人主人），写入 `group_rules.<群号>.allow_preview`

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
- `#抽专属卡` 同时接受好友私聊和群临时会话。群临时会话在 OneBot 下改用 `send_private_msg` 并携带 `group_id`，因为 Karin 1.18.0 的 `e.reply` 对 groupTemp 只传 `user_id`，NapCat 会拒收；其它适配器回退标准 `e.reply`。
- 入群事件是「先到先得」：任一插件在该事件里 `return true` 就会中断后续插件。若同时装了其它入群通知插件（如 `karin-plugin-ling`），需让它们返回 `false` 放行，否则自动欢迎会时有时无。Karin 1.18.0 的 `accept` 不参与排序，插件顺序取决于注册时序。

## 命令与事件的执行顺序

Karin 1.18.0 里 `karin.command` / `karin.accept` 选项上的 `priority` 并不参与排序（框架的 `pkgSort()` 按 `rank` 字段排序，而写入的是 `priority`，排序成了空操作），实际执行顺序取决于插件加载顺序。本插件因此不再声明 `priority`，命令与事件处理器只保留 `name` / `permission` / `log` 等选项。

如果同时装了 `karin-plugin-ling`，它的 `notice.groupMemberAdd` 处理器末尾会无条件 `return true`，中断后续插件，本插件的入群欢迎词就会「时灵时不灵」（重启后加载顺序可能变化）。要彻底解决需要改 ling 让它放行，或按群用 Karin 的 enable/disable 控制插件启停。
