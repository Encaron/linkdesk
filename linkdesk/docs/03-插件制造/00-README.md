# 插件开发——契约文档

> 2026-07-24。**写给第三方插件开发者。** LinkDesk 核心是空壳，万物皆插件。这份文档回答"我能写什么插件、怎么开始"。

---

## 定位

| | |
|---|---|
| 目标读者 | 插件开发者（不是核心开发者） |
| 内容 | 插件 API 契约 / 生命周期 / contributes 规范 / 分发格式 |
| 性质 | **接口契约——不写实现代码，只定义函数签名和约定** |
| 状态 | E3 前契约先行——核心开发按此文档暴露 API，插件开发者按此文档写插件 |

## 插件能做什么

**没有 API 白名单。** 插件在壳的渲染进程中运行，能 `import` 任何 JS 库、调用任何 Web API——Canvas、WebGL、WebAssembly、WebRTC、Web Audio……Web 平台的一切，不加限制。

系统级能力（串口、文件系统、配置、对话框）通过 `window.linkdesk.*` API 暴露——插件走壳中转，不能直接调 Node.js 原始能力。

**插件能做的：**

| 你想做的 | 怎么做 | 例子 |
|------|------|------|
| GPS 地图 | `import` Leaflet / 高德 SDK → React 组件 | 高德地图插件 |
| 串口数据解析 | `ProtocolRegistry.registerProtocol()` → 声明解析函数 | SBQ 协议插件 |
| 卡片可视化 | `CardRegistry.registerCard()` → 渲染字段数据 | 温度计/波形图卡片 |
| 代码编辑器 | `import monaco-editor` → React 组件 | Monaco 编辑器插件 |
| CAD 查看器 | `import` Three.js → Canvas/WebGL | CAD 插件 |
| 文档阅读器 | `import` markdown-it / `<iframe>` | Markdown/HTML 阅读器 |
| 逻辑分析仪 | Canvas 2D + `window.linkdesk.serial` | 时序波形分析仪 |
| 3D 模型查看 | `import` Three.js / Babylon.js | STL/STEP 查看器 |
| 代码智能补全 | 接 LSP 协议 或 AI API | clangd / Copilot 插件 |
| 图标/按钮 | codicon 图标集 + CSS 变量 | 任何插件 |

---

## 插件类型——六类

| 类型 | 声明方式 | 壳如何加载 | 例子 |
|------|------|------|------|
| **view** | `plugin.json` 有 `entry` 字段 | 动态 import → 注册到 viewRegistry | 终端/地图/CAD/编辑器 |
| **card** | `contributes.cards` 或代码调 `registerCard()` | 注册到 CardRegistry → workspace 卡片网格渲染 | 温度计/波形/开关 |
| **protocol** | `plugin.json` 声明 `mode` | 注册到 ProtocolRegistry → 串口数据自动走此解析器 | SBQ 心率协议 |
| **theme** | `plugin.json` 声明 `themes` 或 `file` | 注册到 ThemeEngine → CSS 变量 | Dracula/Solarized |
| **language** | `plugin.json` 声明 `languages` 或 `file` | 注册到 i18next → UI 文字切换 | 日本語/English |
| **resource** | `plugin.json` 声明 `resources` | 复制到 `.linkdesk/plugins/<id>/resources/` | STM32 参考手册 HTML |

**一个插件可以同时是多种类型。** 例如：终端插件 = view（标签页渲染）+ protocol（串口解析）。CAD 插件 = view（3D 渲染）+ card（属性面板卡片）。

---

## 从零到上线——最短路径

```
1. 创建文件夹 plugins/my-plugin/
     ├── plugin.json
     └── index.tsx

2. plugin.json（最小版）
     {
       "name": "我的插件",
       "version": "1.0.0",
       "icon": "window",
       "entry": "index.tsx"
     }

3. index.tsx
     export default function MyView({ isActive }: { isActive: boolean }) {
       return <div style={{color:"var(--text-primary)"}}>Hello LinkDesk</div>
     }

4. 放入 plugins/ 目录 → 启动 LinkDesk → 图标栏出现 → 点击 → 标签页渲染
```

---

## 文档索引

| # | 文档 | 什么时候读 |
|:--:|------|------|
| 1 | `01-插件API契约.md` | 写第一行代码前——知道能调什么 API |
| 2 | `02-插件生命周期.md` | 理解注册→激活→运行→卸载全过程 |
| 3 | `03-插件contributes规范.md` | 注册命令/菜单/快捷键/配置项/文件关联 |
| 4 | `04-插件分发格式.md` | 打包发布——让别人能安装你的插件 |
| 5 | `05-插件UI写法规约.md` | 右键菜单/浮层/持久化/**快捷键两轨道**（非文本键声明式 + 文本键容器 onKeyDown）/剪贴板三通道——必须走核心设施 |
| 6 | `06-plugin.json规范.md` | plugin.json 全部字段参考 |
| 7 | `07-插件间通信.md` | 插件之间怎么传数据——大厅 vs 后门，events + p2p |
| 8 | `08-ViewContainer-视图容器API.md` | 🆕 E3.6——如何注册侧栏视图、往别人的容器里加内容 |

**JSON Schema：** `plugin.schema.json`——IDE 自动补全

---

## 硬约束——写任何一行插件代码前

1. **所有颜色走 CSS 变量 `var(--xxx)`**，禁止硬编码 hex
2. **所有 UI 文字走 `t()`**，禁止硬编码中文（i18n key = 中文原文）
3. **右键菜单用 `<ContextMenu>` + MenuRegistry**，禁止手写右键菜单
4. **弹窗用 `createPortal` render 到 `document.body`**
5. **持久化走 `window.linkdesk.config.*`**，禁止 `localStorage.setItem()`
6. **插件不碰壳代码**——`plugin.json` + React 组件是全部
7. **不要条件渲染隐藏内容**——keep-alive 架构下所有标签页始终挂载
8. **壳不知道你的插件是干什么的**——不要依赖壳的特殊判断

---

## 相关

- 🔥 `../02-Electron架构/00-元文档/00-迁移执行守则.md`——核心开发者的检查项
- `plugin.schema.json`——同目录下，IDE 自动补全用
- Tauri 时代旧版：`../01-Tauri_P1至P5.5/视图插件开发-Tauri时代.md` + `协议插件开发-Tauri时代.md`（仅历史参考）
