# random-welcome

TRSS Yunzai 插件：新成员入群时，按“地点 -> 专属职业/种族 -> 专属美食”随机生成欢迎词。

## 目录结构

```text
random-welcome/
├─ apps/
│  └─ randomWelcome.js
├─ utils/
│  └─ config.js
├─ defSet/
│  ├─ setting.yaml
│  ├─ lexicon.yaml
│  └─ templates.yaml
├─ config/
│  ├─ setting.yaml (运行中自动生成)
│  ├─ lexicon.yaml (运行中自动生成)
│  └─ templates.yaml (运行中自动生成)
├─ index.js
└─ package.json
```

## 安装

将本目录放到 Yunzai 的 `plugins/random-welcome`。

## 功能

- 事件：`notice.group.increase`
- 场景：群内有新成员入群时自动发送欢迎词
- 支持按群独立开启/关闭
- 支持按群设置不同欢迎词风格（profile）
- 支持群内动态添加模板与词条，写入 YAML 后立即生效（无需重启）

## 群内命令

- `#开启欢迎词` / `#关闭欢迎词`
- `#随机欢迎词` / `#欢迎词` / `#欢迎词测试`
- `#欢迎词风格列表`
- `#设置欢迎词风格 风格名`
- `#添加欢迎词 模板内容`
- `#添加欢迎词条 地点|角色1,角色2|食物1,食物2`

## 配置模型

`setting.yaml`：

- `default_profile`：默认风格
- `group_rules.<group_id>.enabled`：本群开关
- `group_rules.<group_id>.profile`：本群风格

`lexicon.yaml`：

- `profiles.<profile>.lexicon[]`

`templates.yaml`：

- `profiles.<profile>.templates[]`
