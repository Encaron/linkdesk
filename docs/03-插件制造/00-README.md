# 插件开发——契约文档

> 2026-07-24。**写给第三方插件开发者。** LinkDesk 核心是空壳，万物皆插件。这份文档回答"我能写什么插件、怎么开始"。

---

## 定位

| | |
|---|---|
| 目标读者 | 插件开发者（不是核心开发者） |
| 内容 | 插件 API 契约 / 生命周期 / contributes 规范 / 分发格式 |
| 性质 | **接口契约——不写实现代码，只定义函数签名和约定** |
| 状态 | E5.7/E5.8 同步（2026-08-21）。**API 真相源 = `contracts/linkdesk.d.ts`（window.linkdesk.* 全量面，自动生成）**；插件通信铁律：只走 `window.linkdesk.*`，禁止 `import @src/core/...`（ESLint `noCoreImportInPlugin` error 级拦截） |

## 插件能做什么

**没有 API 白名单。** 插件在 Pool 渲染进程中运行（E5.7 极简 Pool——1 BrowserWindow + 1 WebContentsView，所有插件共享同一个渲染进程），能 `import` 任何 JS 库、调用任何 Web API——Canvas、WebGL、WebAssembly、WebRTC、Web Audio……Web 平台的一切，不加限制。

系统级能力（串口、文件系统、配置、对话框）通过 `window.linkdesk.*` API 暴露——插件走壳中转，不能直接调 Node.js 原始能力，也不能 `import @src/core/...`（那是壳内部实现）。

**插件能做的：**

| 你想做的 | 怎么做 | 例子 |
|------|------|------|
| GPS 地图 | `import` Leaflet / 高德 SDK → React 组件 | 高德地图插件 |
| 串口数据解析 | `window.linkdesk.protocol.*`（主进程协议注册表，E5.7#49）+ `window.linkdesk.serial.onData` 数据管道 | SBQ 协议插件 |
| 卡片可视化 | 卡片工作台是插件——`contributes.views` 往卡片容器注册视图 | 温度计/波形图卡片 |
| 代码编辑器 | `import monaco-editor` → React 组件 | Monaco 编辑器插件 |
| CAD 查看器 | `import` Three.js → Canvas/WebGL | CAD 插件 |
| 文档阅读器 | `import` markdown-it / `<iframe>` | Markdown/HTML 阅读器 |
| 逻辑分析仪 | Canvas 2D + `window.linkdesk.serial` | 时序波形分析仪 |
| 3D 模型查看 | `import` Three.js / Babylon.js | STL/STEP 查看器 |
| 代码智能补全 | 接 LSP 协议 或 AI API | clangd / Copilot 插件 |
| 图标/按钮 | codicon 图标集 + CSS 变量 | 任何插件 |

---

## 插件贡献类型

> `plugin.json` 的 `type` 字段**已废弃**（E5.7 起不再必需）——loader 从 `entry`/`mode`/`themes`/`languages`/`resources`/`contributes` 等声明字段自动检测贡献类型。**一个插件可同时贡献多种能力**（终端 = 视图 + 协议；CAD = 视图 + 主题）。

| 能力 | 声明方式 | 壳如何加载 | 例子 |
|------|------|------|------|
| **视图**（标签页/侧栏/面板） | `contributes.viewsContainers` + `contributes.views`（`render` 指向组件）；有标签页需求另加 `entry` | 池内 React 渲染 | 终端/地图/CAD/编辑器 |
| **设置 UI**（整套设置界面替代品） | `factoryRole: "settings"` + `contributes.views`（+ 可选 `floatingPanel`） | 池内 React 渲染；多套并存，激活套由用户切换、持久化 | 内置设置 / settings-demo（→ `10-如何造一个设置插件.md`） |
| **主题** | `contributes.themes`（`{id,label,uiTheme,path}`） | 壳注册主题 → CSS 变量 | Dracula/Solarized |
| **语言包**（UI 翻译） | `contributes.languages`（`{id,label,path}`） | 注册到 i18next → UI 文字切换 | 日本語/English |
| **协议解析** | `mode` 字段 + `window.linkdesk.protocol.*` | 主进程协议注册表（E5.7#49） | SBQ 心率协议 |
| **静态资源** | 插件目录 `resources/`（`getAssetPath()` 读取） | 随插件分发 | STM32 参考手册 HTML |

---

## 从零到上线——最短路径

```
1. 创建文件夹 plugins/user/my-plugin/
     ├── plugin.json
     └── src/index.tsx

2. plugin.json（最小版）
     {
       "name": "我的插件",
       "version": "1.0.0",
       "icon": "window",
       "entry": "src/index.tsx",
       "appearsIn": { "tabBar": true }
     }

3. src/index.tsx
     export default function MyView({ isActive }: { isActive: boolean }) {
       return <div style={{color:"var(--text-primary)"}}>Hello LinkDesk</div>
     }

4. 重启 LinkDesk（dev 模式 `npm run electron:dev`）→ 图标栏出现 → 点击 → 标签页渲染
```

---

## 文档索引

| # | 文档 | 什么时候读 |
|:--:|------|------|
| 1 | `01-插件API契约.md` | 写第一行代码前——知道能调什么 API |
| 2 | `02-插件生命周期.md` | 理解注册→激活→运行→卸载全过程 |
| 3 | `03-插件contributes规范.md` | 注册命令/菜单/快捷键/配置项/视图/主题/i18n/顶栏按钮 |
| 4 | `04-插件分发格式.md` | 安装分发——让别人能装你的插件 |
| 5 | `05-插件UI写法规约.md` | 右键菜单/浮层/持久化/**快捷键两轨道**（非文本键声明式 + 文本键容器 onKeyDown）/剪贴板三通道——必须走共享设施 |
| 6 | `06-plugin.json规范.md` | plugin.json 全部字段参考 |
| 7 | `07-插件间通信.md` | 插件之间怎么传数据——**三通信机制**：事件广播 / 命令调用 / 数据管道（高频推流） |
| 8 | `08-ViewContainer-视图容器API.md` | 如何注册侧栏/面板视图、往别人的容器里加内容、titleActions 声明制 |
| 9 | `09-插件目录规范.md` | 插件目录结构——文件放哪、命名约定 |
| 10 | `10-如何造一个设置插件.md` | 整套设置 UI 替代品——factoryRole:settings 声明 + 数据 API 形状 + 白名单控件 + 切换激活套 |

**JSON Schema：** `plugin.schema.json`——IDE 自动补全

---

## 硬约束——写任何一行插件代码前

1. **所有颜色走 CSS 变量 `var(--xxx)`**，禁止硬编码 hex
2. **所有 UI 文字走 `t()`**，禁止绕过 `t()` 硬编码显示字符串（i18n key = 插件 UI 原文，建议作者母语——中文插件用中文 key，英文/法文插件用自己的语言 key）
3. **右键菜单走声明式**——plugin.json `contributes.menus` 声明 + `<ContextMenu>` 消费（或 `window.linkdesk.menu.registerItems`），禁止手写右键菜单
4. **弹窗用 `createPortal` render 到 `document.body`**
5. **持久化走 `window.linkdesk.configuration.get/set/onChange`**，禁止 `localStorage.setItem()`
6. **插件只走 `window.linkdesk.*` API，禁止 `import @src/core/...`**（插件通信铁律 + ESLint `noCoreImportInPlugin` error 级拦截——`.tsx`/`.ts` 都拦）
7. **不要条件渲染隐藏内容**——keep-alive 架构下所有标签页始终挂载
8. **壳不知道你的插件是干什么的**——不要依赖壳的特殊判断

---

## 相关

- 🔥 `../02-Electron架构/00-元文档/00-迁移执行守则.md`——核心开发者的检查项
- `plugin.schema.json`——同目录下，IDE 自动补全用
- Tauri 时代旧版：`../01-Tauri_P1至P5.5/视图插件开发-Tauri时代.md` + `协议插件开发-Tauri时代.md`（仅历史参考）
