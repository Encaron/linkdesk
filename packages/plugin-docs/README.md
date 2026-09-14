# @linkdesk/plugin-docs

> **LinkDesk 插件作者文档**——从零开始学会做一个插件。**离线包**：装到本地就能读，不用联网翻仓库。

写给谁：**插件作者，以及作者的 AI**。开头那份 `00-README.md` 是导览，按"我要做什么"或"我是哪一档（10 分钟 / 30 分钟 / 1 天）"分流。

## 装

```bash
npm i @linkdesk/plugin-docs
# 然后读 node_modules/@linkdesk/plugin-docs/docs/00-README.md
```

> 它不是构建依赖，**不用放进插件的 `package.json`**——想看的时候装一下即可。

## 里面有什么

| 你想干什么 | 看哪篇 |
|:--|:--|
| 先认领档位（10 分钟 / 30 分钟 / 1 天） | `docs/13-插件开发指南.md` |
| 知道我的插件住哪一块（图标栏/侧栏/主区/底部面板/状态栏） | `docs/17-区域地图.md` |
| 让几个区域联动（选中 → 切视图 → 状态栏更新） | `docs/18-区域间互动.md` |
| 用壳提供的现成 UI 零件 | `docs/19-组件速查.md` |
| 给插件加一条配置项 | `docs/20-我的插件加一条配置项.md` |
| 做一个主题（零代码） | `docs/主题/01-做一个主题插件.md` · `docs/主题/02-主题字段速查.md` |
| 查 API（能调什么） | `docs/01-插件API契约.md` |
| 查某个字段 | `docs/06-plugin.json规范.md` · `docs/plugin.schema.json` |

全部篇目 → `docs/00-README.md` 的文档索引。

## 🔴 真源在哪（改文档请改那边）

```
真源   <仓库> docs/03-插件制造/**          ← 手工只改这一份
  ↓    npm run docs:build（scripts/generate-plugin-docs.mjs）
产物   本包 docs/**                        ← 生成物，别手改
  ↓    npm run docs:check（挂 npm run check）
判据   与真源逐字节比对（链接重写处除外）
```

- **链接**：指到 `docs/03-插件制造/` **外面**的那些（API 契约、工具链、主题变量契约…）在生成时被**绝对化**成 GitHub 链接——在 npm 包里也点得通。界内链接保持相对。
- 所以**发现文档有问题**：去仓库改 `docs/03-插件制造/`，别改这个包；改了真源不重生成，`npm run check` 会红。

## 版本与发布

本包是**第五根作者轴**（另四根：`@linkdesk/contracts` / `@linkdesk/plugin-sdk` / `create-linkdesk-plugin` / `@linkdesk/ui`）——**内容变即 PATCH**，与软件版本无关。

```bash
npm publish --registry=https://registry.npmjs.org   # 显式带 registry（workspace 里本包 .npmrc 会被忽略）
npm run release:mark                                 # 记基线（过货架核对）
```

## 许可

MIT
