# {{displayName}} —— LinkDesk 插件

> **本文件写给"在这个工程里干活的 AI"**（Claude Code / Codex / Cursor…）。人类读者看 `README.md` 更顺。
> 本工程由 `create-linkdesk-plugin` 生成；插件身份 = `plugin.json` 顶层的 `pluginId`（当前：`{{pluginName}}`）。

## 1. 这是什么

一个 **LinkDesk 插件**工程。LinkDesk 是"万物皆插件"的桌面容器——**核心只是标签页 + 分屏 + 数据管道 + 注册表，核心不知道你的插件是干什么的**。

你的代码跑在渲染进程里：能用任何 JS 库和 Web API（Canvas / WebGL / wasm / WebRTC / Web Audio / fetch 全开放，**没有 API 白名单**）；只有**系统级能力**（串口、文件、配置、对话框、通知）必须走 `window.linkdesk.*` 中转，不能直接调 Node.js 原始能力。

## 2. 铁律（违反会坏，甚至带崩壳）

1. **颜色一律 `var(--xxx)`**，禁硬编码 hex —— 否则用户换主题后你的界面不跟随。
2. **界面文字一律 `t()`**（key = 中文原文；英文译文放 `i18n/en.json`，**不建 `zh.json`**）—— 禁硬编码显示字符串。
3. **系统能力只走 `window.linkdesk.*`** —— 禁止 `import` 壳内部源码（`@src/core/...`；SDK lint 会 error 级拦下）。
4. **插件身份只来自 `plugin.json` 声明** —— 别让任何人靠目录名或文件位置推断你的插件是什么。
5. **右键菜单走声明式**（`contributes.menus` ＋ `<ContextMenu>`）；**弹窗 portal 到 `document.body`**；**持久化走 `window.linkdesk.configuration`**（禁 `localStorage`）。
6. **keep-alive 架构**：所有标签页始终挂载 —— 不要用 `isActive` 把内容整块条件渲染掉，它只配用来 gate "聚焦才该跑的副作用"。

## 3. 规则去哪找

- **在线（完整作者文档，按"我要做什么"分流）**：<https://github.com/Encaron/linkdesk/tree/electron/docs/03-插件制造> —— 入口是那里的 `00-README.md`。
- **离线（必然到达，不用联网）**：`node_modules/@linkdesk/plugin-sdk/schemas/plugin.schema.json` —— **字段级权威定义**；做主题时同目录的 `theme.schema.json` 同理。
- **编辑器补全**：`plugin.json` 的 `$schema` 已指向它，写完就有补全与报错。
- **改完先自检**：`npm run validate`（清单/语法合法性）＋ `npm run lint`（SDK 规则腿）。

## 4. 下一步干什么（本工程的命令，逐字可用）

```bash
npm install        # 装依赖（首次）
npm run dev        # ① 浏览器 dev 宿主里看见它——改码即时热更新
npm run dev:real   # ② 在已安装的 LinkDesk 里真机调试（要真 IPC / 真串口 / 真文件时）
npm run validate   # ③ 校验 plugin.json / 主题配方
npm run lint       # ④ SDK 规则腿（硬约束的机械兜底）
npm run test       # ⑤ 单元测试（vitest）
npm run verify     # ⑥ 交付前全腿——CI 跑的就是这一条
npm run build      # ⑦ 产出 <pluginId>.linkdesk-plugin（单文件 zip，装进 LinkDesk / 发出去）
npm run publish    # ⑧ 发布到你自己的 GitHub 仓（上架第一步）
```

**🔴 上架是两步**：`publish` 只完成**第一步**（只有手动把你的仓库加进"市场源"的人看得见）。**第二步是提交到官方目录**，那一步做完才是"所有默认配置的用户都能搜到"。

## 5. 两条工具链硬边界

- **本工程是一个独立 git 仓**（脚手架已 `git init -b main` ＋ 一次初始提交）。`publish` 拿 `origin` 去建 Release ⇒ 推到 GitHub 只需两条：`git remote add origin <你的仓>` ＋ `git push -u origin main`。
- **版本号要成对**：`plugin.json.version` 与 `package.json.version` **必须一致**；且每次 bump 都要同笔在 `CHANGELOG.md` 补一段 `## v<新版本>（YYYY-MM-DD）`——否则插件详情页显示"此版本未提供变更说明"。

---

> 作者：{{author}} ｜ 生成于 {{date}}
