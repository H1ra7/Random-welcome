# random-welcome

TRSS Yunzai 插件：新成员入群时，按“地点 -> 专属职业/种族 -> 专属美食”随机生成欢迎词。

## 目录结构

```text
random-welcome/
├─ apps/
│  └─ randomWelcome.js
├─ constants/
│  └─ worldLexicon.js
├─ index.js
└─ package.json
```

## 安装

将本目录放到 Yunzai 的 `plugins/random-welcome`。

## 触发方式

- 事件：`notice.group.increase`
- 场景：群内有新成员入群时自动发送欢迎词
- 测试命令（群聊内）：`#随机欢迎词`

## 自定义词库

编辑 `constants/worldLexicon.js` 的 `WORLD_LEXICON`：

- `location`：地点名
- `roles`：该地点专属职业/种族数组
- `foods`：该地点专属美食数组
