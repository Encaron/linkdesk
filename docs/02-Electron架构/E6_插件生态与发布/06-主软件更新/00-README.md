# 06-主软件更新（壳更新机制）——总览索引

> 2026-08-30 建立。**E6 专题：LinkDesk 软件本身（壳）的版本更新机制。**
> 插件侧更新走 E6#33（市场内更新通知 + 版本管理）；**本文档专研壳侧**——软件自身如何发布新版本、用户如何收到、如何查看更新内容、如何延后。两条轨道互不干扰。
> 对应清单任务：**E6#57**。

---

## 一、定案（2026-08-30 用户拍板）

1. **自研更新机制，不用 electron-updater**——理由：掌握主权 + 有大量时间 + 手握 VS Code 源码直接抄。
2. **E6 内新增本子文件夹**，专门研究主软件更新（本文档 = 专研总览）。
3. 更新源沿用 **GitHub Releases**（与 E6#29 插件市场同一套基建，不造第二套存储）。
4. **流程纪律**：先完成任务档案（本文档 + 01-07 分维度 + mockups），最后才改 E6 执行清单（先档案后清单，用户指示）。
5. **更新交互全走 toast**——不新造 UI 表面（复用壳 `pushToast`/`updateToast`/actions/isCloseAffordance，先例 03-插件市场「事件型提示一律 toast」）。
6. **检查更新入口恒显**——对比手机 App：检查更新选项永在，最新版本就显示「当前已是最新版本」；`update.mode` 只保留 `auto`/`manual` 两档（砍 none/start）。
7. **TitleBar 更新按钮 = 声明制 + 有更新才现 + 全文字 + 主题按钮色**（2026-08-30 三次表态完整反转史：中途拍板有颜色图标 → 当日「不要那个颜色提示」被误读去色 → **晚澄清**=不要的是菜单「检查更新」文字的颜色、按钮要主题按钮色，见 03 §4.1）——按钮走 `registerTitleBarContribution` 右槽 + `when: updateActionable` 门控 + 新增 `label` 字段（context key `updateButtonLabel` 动态三态文字），复用壳共享 Button 组件（`.button` = 主题普通按钮，跟随主题切换），**样式零新增、`label` 为一次通用扩展**（03 §四）。**按钮三态文字（用户 2026-08-30 拍板）：available「下载更新」→ downloading「更新中」（文字，宽度自适应）→ downloaded/ready「重新启动」（文字）。**
8. **两条路完整流程（用户 2026-08-30 亲述）**——路 A（被动）与路 B（主动）触发方式不同，之后完全汇合；无更新时入口恒显、toast 即查即答。总览见 §一·五 + mockup 02 Frame 0。

## 一·五、两条路完整流程（2026-08-30 用户亲述）

```
路 A · 被动（有新更新自动出现）                路 B · 主动（帮助菜单）
有新版本，即便不点检查更新              帮助菜单「检查更新…」（恒显）
   ↓ auto 后台检查到 available               ↓ 点击
TitleBar「下载更新」按钮自动出现（主题按钮色）              无更新 → toast「当前已是最新版本」
   ↓ 点击（openUpdateFlow）                   ↓ 有更新
从按钮启动下载 ═══════════════►         [发现更新 toast] → 点「立即更新」
                                             │ 从 toast 启动下载
                                             ▼
               ┌── 两条路汇合（同一流程）──────────────────┐
               │ 下载中 → toast 进度「xx%」+ 按钮变「更新中」   │
               │ 下载完成 → toast「重启后生效」[稍后][重启并更新] │
               │            + 按钮变「重新启动」                 │
               │ 点「重启并更新」→ quitAndInstall → 软件重启      │
               │ 重启后首启自动弹发行说明（标签页）               │
               └──────────────────────────────────────────────┘
```

- **触发方式两条路，流程一条**：路 A 用户不做任何事（auto 后台检查到 → 按钮 + toast 一起来）；路 B 用户主动查（恒显入口，最新就答「已是最新」，有更新就进同一流程）。
- **无更新**：toast「当前已是最新版本」即查即答（手机 App 同款）——「检查更新」入口恒显的底气。
- 对应帧：mockup 02 Frame 0（总览图）/ Frame 1（发现）/ Frame 2（下载中）/ Frame 3（完成）/ Frame 4（手动无更新）。

---

## 二、本地现状实锤（侦察结论）

| 事实 | 实证 |
|:--|:--|
| 版本号 | ~~`package.json:4` `"version": "0.1.0"`，无 product.json、无 `app.getVersion()` 消费~~ **⚠️ 2026-09-10 校正（上句为侦察当日快照，已过期）：** `package.json:4` = `"version": "0.1.27"`；`electron/product.json` **已存在**（开发期 `version` 留占位 `"0.1.0"`，发布期由壳发布脚本写，§2.3 禁手写第二份）；`app.getVersion()` **已通车**（E6#57.2a/2b/3b：`electron/ipc/handlers/product-handlers.ts:26` 主进程直答 + 壳/池双 preload 同暴露 `linkdesk.app.getVersion`） |
| 打包 | `electron-builder.yml` 只有 NSIS 安装器，无 update 配置、未接 electron-updater |
| 原生菜单 | `main.ts:60` `Menu.setApplicationMenu(null)` + `:71` `frame:false`——无 Electron 原生菜单栏，壳自己画 TitleBar |
| 主菜单 | `src/core/commands/input-bindings/shellMenus.ts:11-117` 只注册「文件」「查看」两组——**无帮助/关于组** |
| 齿轮菜单 | `src/core/commands/shell/settingsCommands.ts:92-97` ExtensionGear slot——设置/主题/语言/快捷键，无「检查更新/关于」 |
| TitleBar 插槽 | `src/core/registry/commands/MenuRegistry.ts:188` `registerTitleBarContribution(pluginId, slot, {command, icon, when, order})` 现成——左右槽 + when 门控，插件侧 `contributes.titleBar` 已接线 |
| 更新痕迹 | 全 `src/`+`electron/` grep 零命中 `checkForUpdates`/`autoUpdater`（仅 node_modules）——**此半句 2026-09-10 复核仍成立**；~~`getVersion`~~ **已通车**（同上「版本号」行校正，不再是零命中） |

**结论：壳侧更新 = 全新领域，但声明插槽/toast/context key 等承载机制全现成。**

---

## 三、设计前置（8 维度清单，对标 `docs/开发管理/新能力设计流程.md` §六）

### ① 能力边界
- **壳能力**——软件更新是每个版本的通用需求，任何插件卸载不得剥夺。核心准入三条件：多提供方（任意发布渠道）+ 多消费方（设置/菜单/徽标/关于都读）+ 桌子不知道内容（壳只提供更新引擎，不知更新了什么内容）→ **放壳**。
- **保底设计**：无任何插件时更新机制必须完整可用（菜单「检查更新/关于」+ toast + TitleBar 按钮 + 重启安装全在壳）。

### ② API 设计
- **不暴露给第三方插件**（更新是壳私事，第三方作者不该碰安装包）。但「当前版本号」可读——对标 VS Code `app.getVersion`，只读不写。
- 契约位置：`contracts/linkdesk.d.ts` 若加 `linkdesk.app.getVersion` 只读面 → 三件套齐全（d.ts + preload + IpcBridgeHandler）+ 03-插件制造 文档说明。
- 通用优先：`app.getVersion` = **已拍板暴露（2026-08-30）**——市场插件详情页「minAppVersion 对比」会用到（E6#29 marketplace.json 字段），只读不写，走契约四件套。

### ③ 通信方式设计
- **主进程 UpdateService**（`electron/services/update-service.ts`）持有状态机——对标 VS Code `updateService.main.ts`。
- **壳渲染进程**（设置页/菜单/按钮/toast）通过 IPC `update.*` 命名空间订阅状态（对标 `config:changed` broadcast 模式）。
- **数据流**：主进程检查/下载 → `ipcMain.handle` 命令（checkForUpdates/downloadUpdate/quitAndInstall）+ `broadcast(IPC.update.stateChanged, state)` 推送状态 → 壳渲染订阅；另有动态 context key `updateActionable` 门控声明式 TitleBar 按钮。
- 详情见 **07-数据流通格式.md**。

### ④ 壳侧代码设计
- 主进程：`electron/services/update-service.ts`（状态机 + 下载 + 校验 + 重启编排）——对标 `serial-service.ts`（主进程服务先例）。
- 主进程 handler：`electron/ipc/handlers/update-handlers.ts`——对标其他 `register*Handlers()`。
- IPC 通道：`electron/ipc/channels.ts` 新增 `update.*` 命名空间（唯一真相源）。
- 壳配置：`src/App/config/update.ts` 新增 `registerConfiguration("update", ...)`——对标 `appearance.ts` 组（`app.update.mode` 保底默认值）。
- 菜单：`shellMenus.ts` 加「帮助」组 + `coreCommands.ts`/`settingsCommands.ts` 加命令。
- TitleBar 按钮：`registerTitleBarContribution(APP_PLUGIN_ID, "right", {command, label, when})` 声明制——`label` = 新通用字段（context key `updateButtonLabel` 动态三态文字），复用壳共享 Button 组件（主题按钮色，样式零新增，03 §4.2/§4.4）。
- 壳渲染订阅：`src/App/` 加 `useUpdateState` hook（对标 `usePoolSync` 只监听关心 key 铁律）。

### ⑤ 插件侧代码设计
- **无插件侧**（更新是壳私事）。唯一例外：`app.getVersion` 若暴露 → 第三方可读。
- 欢迎页「帮助」区块静态文案可升级为真实入口（`WelcomePoolView.tsx:194-200`）——但这是插件侧消费，非能力。

### ⑥ 显示设计
| 显示面 | 位置 | 控件形态 | 数据来源 |
|:--|:--|:--|:--|
| 帮助菜单 | TitleBar 菜单栏「帮助」组（`MENU_SLOTS.MenuBar`） | 文本按钮 → ContextMenu | 命令注册 |
| 检查更新/关于 | 齿轮菜单（`MENU_SLOTS.ExtensionGear`） | ContextMenu 项（**恒显**） | 命令注册 |
| TitleBar 更新按钮 | TitleBar 右槽（`contributes.titleBar.right` 声明制） | **全文字按钮**（有更新才现，`when: updateActionable` + `label: updateButtonLabel` 三态文字；**主题按钮色**——复用壳共享 Button 组件，跟随主题） | 状态机 → context key |
| 更新通知/进度 | ~~`#toast-root`（右下角）~~ **⚠️ 2026-09-10 校正：** `#toast-root` 容器已由 **E6#72a 整删**（仓库仅剩 `FloatingLayerHost.tsx:36` 一行删除注记）；显示面 = **状态栏铃铛宽面板**（E6#72 通知面归一，`StatusBarZone.css:111` 对标 VS Code `.notifications-center`）。服务层 API 名 `pushToast`/`updateToast` **未变**（`NotificationService` 喂同一 store）——故右两列仍成立 | **通知**（发现/进度/完成/失败/手动结果全走，铃铛宽面板显示） | 状态机 → `pushToast`/`updateToast` |
| 发行说明 | **标签页**（复刻欢迎页模式） | 壳直渲染 view + tabBehavior 声明 | GitHub Releases body |
| 关于页 | **标签页**（已拍板，对标发行说明）——DialogService 现实能力承载不了复制按钮 | 字段表 + 复制 + 检查更新 | product.json + process.versions |
| 设置项 | 设置页「更新」组 | update.mode 下拉（auto/manual） | `app.update.mode` |

- 所有更新 UI 用壳共享组件（ContextMenu / toast / 声明插槽 / 标签页）——**不新建宿主**。

### ⑦ 配置设计
- `app.update.mode`：`string` enum，`auto/manual`，默认 `auto`（对标 VS Code `update.mode` 简化为两档——砍 none/start，检查更新恒显）。壳 `registerConfiguration("update", ...)` 保底。
- 设置页「更新」组（组内二级标题，对标 E5.8#78 `group` 机制）。
- 更新通道（stable/preview）：`app.update.quality`，默认 `stable`——**第一版只 stable，留位不实现**（2026-08-30 拍板，见 §五①）。
- 检查频率：内置常量（无用户配置项）——**启动后延迟 30s 首次检查 + 每 4 小时后台检查**（对标 VS Code 定期后台；2026-08-30 拍板）。

### ⑧ 代码规范 + 验收
- `npm run check` 全绿（含新 IPC 通道 audit-api-contracts / 新配置 app.update.* check-config-baseline 两件套 + 新贡献点字段 `label` 走 audit-contributes 三件套）。
- CDP 实机：菜单项恒显、TitleBar 按钮按状态门控显隐（全文字 + 主题按钮色）、toast 全流程、发行说明标签页、重启安装。
- 用户视觉验收（对标 VS Code 界面）。

---

## 四、文档地图

| 文档 | 内容 | 状态 |
|:--|:--|:--|
| [00-README.md](00-README.md) | 本索引 + 设计前置 + 待拍板点（已全拍板） | ✅ |
| [01-更新机制设计.md](01-更新机制设计.md) | 状态机 / 检查下载重启全流程 / 更新源 / 两档 mode | ✅ |
| [02-产品身份与版本.md](02-产品身份与版本.md) | product.json schema / semver 规范 / 历史版本表示 | ✅ |
| [03-菜单与入口设计.md](03-菜单与入口设计.md) | 帮助菜单每一项 / 齿轮菜单 / TitleBar 声明制更新按钮（全文字 + 主题按钮色） | ✅ |
| [04-更新通知与交互.md](04-更新通知与交互.md) | **全 toast 承载**（发现/进度/完成/失败/手动结果） | ✅ |
| [05-发行说明.md](05-发行说明.md) | 标签页 vs 浏览器 / 数据源 / 自动弹 / 可关 | ✅ |
| [06-关于对话框.md](06-关于对话框.md) | 字段 / 载体方案 A 标签页（已拍板）/ 数据来源 | ✅ |
| [07-数据流通格式.md](07-数据流通格式.md) | IPC 通道 / 消息类型 / TS 类型 / 事件 payload / context key | ✅ |
| [01-帮助菜单与更新按钮形态.html](mockups/01-帮助菜单与更新按钮形态.html) | 帮助/齿轮菜单 + TitleBar 更新按钮形态演进（下载更新/更新中/重新启动，**全文字 + 主题按钮色**，实机对齐） | ✅ |
| [02-更新通知toast与关于.html](mockups/02-更新通知toast与关于.html) | **Frame 0 两条路完整流程总览** + 更新全流程 toast 帧（发现/下载中/完成/手动无更新）+ 关于页（实机对齐 ToastHost） | ✅ |
| [03-发行说明标签页.html](mockups/03-发行说明标签页.html) | 发行说明壳内标签页（对齐插件详情页 01 竞标 A 骨架：头部版本区 + 主体 = **左窄栏版本历史 220px（配角）+ 右主区更新内容（主角）**；**内容不占声明式侧栏**，外层画出完整软件框架示意——图标栏/应用侧栏/状态栏；含断网空态帧） | ✅ |
| [04-发行说明-竞标.html](mockups/04-发行说明-竞标.html) | 发行说明标签页视觉竞标（单文件 3 版并排：VS Code基准 / 液态玻璃 / 精修极简）——**竞标拍板记录，HTML 保持竞标原貌不改结构**，布局定稿实现以 mockup 03 为准 | ✅ 2026-08-30 拍板 A（VS Code基准） |
| [05-关于-竞标.html](mockups/05-关于-竞标.html) | 关于页视觉竞标（单文件 3 版并排：VS Code对标 / 液态玻璃 / 精修极简） | ✅ 2026-08-30 拍板 A（VS Code对标） |

---

## 五、待拍板点（2026-08-30 全部拍板 ✅）

- [x] **更新通道**：只「稳定版」一条，`app.update.quality` 留位不实现（preview 留位，第二版再上）。→ 01 §2.6。
- [x] **关于页载体**：**标签页**（A 方案——DialogService 现实能力承载不了字段表+复制按钮；对标发行说明同款载体）。→ 06 §三/§四。
- [x] **检查频率**：**启动后延迟 30s 首次后台检查 + 每 4 小时后台检查**（内置常量，不暴露配置项）。→ 01 §2.2。
- [x] **`app.getVersion` 是否暴露**给第三方插件：**暴露**（只读不写，走契约四件套；市场 minAppVersion 对比用）。→ §三②。

---

> **← 上一层：** `../E6-执行清单.md`
