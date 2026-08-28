# 01 — 插件 API 契约

> 2026-08-04。**`window.linkdesk.*`——插件开发者能调用的全部系统级能力。** Web 平台能力（Canvas/WebGL/WebRTC/fetch 等）不限——只有系统级能力走此 API。
>
> **E5#85 更新：** 单 WebView 回退后，`linkdesk.*` API 是插件访问壳的唯一正路。ESLint `error` 级拦截直接 import `ConfigurationService/FileService/pathUtils`。
>
> **E5.8#22 更新：** 本文档从「手写命名空间表（第二份真相源）」改为**指针**——方法明细不再手写，唯一真相源 = **生成的契约文件** `contracts/linkdesk.d.ts`（见 §三）。原则/导航保留。
>
> **对标 VS Code：** `vscode` 命名空间。

---

## 一、设计原则

| 原则 | 如何体现 |
|------|------|
| **核心无知** | 壳不认识任何插件的 pluginId |
| **合同优先** | 插件走 `window.linkdesk.*`，不走 `import @src/core` |
| **同步优先** | 能同步的 API 不同步封装（`path` 纯函数不走 IPC） |
| **安全** | 插件 preload 比壳窄——**唯一缺 `bridge` 命名空间**（壳主控专用：插件 IPC 请求经主进程转发到壳侧服务的信封，E5.7#97）；且 preload 沙箱零 Node 能力（不暴露 require/fs/child_process） |

---

## 二、壳 vs 插件——API 差异

插件与壳在同一个渲染进程中运行，但注入的命名空间面不同。**每一面在哪个进程可用、池/壳/mock 四面覆盖如何——唯一真相源是[命名空间矩阵 §2 覆盖表](../02-Electron架构/E5.8_归一化基建/契约生成/命名空间矩阵.md#2-命名空间--四面覆盖矩阵)**，这里不再手写第二份清单。

几个要点（矩阵 §2 的摘要，细节以矩阵为准）：

| 事实 | 说明 |
|------|------|
| **契约 40 命名空间** | 池注入 39（唯一缺 `bridge`）；壳注入 22；mock 注入 12 |
| **池 = 插件运行时真相源** | 插件运行在池（pool）preload——池注入的命名空间为 **required**；`bridge` 真壳独有 |
| **「仅壳」≠ 插件不可调** | `window.*`/`shell.*`/`hotExit.*`/`getFilePath` 池**实有注入**（N1 超集注记）——旧版把这几面标 ❌ 仅壳是错的 |
| **契约必选面漂移已清零** | D1 `env.get(pluginId)` 转发、D2 `clipboard.readText` 壳补、D3 `dialog.openFile` 壳补——#20 全补实现，无 `?` 降级 |

---

## 三、完整 API 定义 → 指针

### 3.0 唯一真相源

**`window.linkdesk.*` 的全部方法签名、入参、返回、载荷类型 = [contracts/linkdesk.d.ts](../../contracts/linkdesk.d.ts)**（自动生成，勿手改）。

- **生成源：** `src/core/api/linkdesk-api.ts` + `linkdesk-api/`（11 域接口）+ `src/core/types/ipc/*` + `src/core/types/pool/*`（wire 载荷类型）
- **生成器：** `scripts/generate-contract.mjs`（Route C——契约类型文件为源，纯类型打包单文件）
- **机械门禁：** preload 双端 `satisfies` 契约面类型 → tsc 漂移门禁；`npm run check` 内 `contracts:check` hash 字节比对（#21）
- **覆盖矩阵：** 每个命名空间 × 池/壳/mock 四面覆盖 → [命名空间矩阵 §2](../02-Electron架构/E5.8_归一化基建/契约生成/命名空间矩阵.md#2-命名空间--四面覆盖矩阵)

### 3.1 插件侧怎么消费

**路径 A——仓库 tsconfig 别名（本仓库内插件）：** 根 `tsconfig.json` 已配 `"@linkdesk/contracts": ["./contracts/linkdesk.d.ts"]`，类型 import 直走契约文件：

```typescript
// 类型——契约文件里命名的面接口（`import type`，零运行时耦合）
import type { FileEntry, PluginStateChangedPayload } from "@linkdesk/contracts";

// 运行时——ambient 类型直出（文件内 `declare global Window.linkdesk`，无需 import）
async function list(): Promise<FileEntry[]> {
  return window.linkdesk.filesystem.listDir("/workspace");
}
```

**路径 B——独立 npm 包（第三方插件，#22.6）：** `npm i -D @linkdesk/contracts` 后同款 `import type { ... } from "@linkdesk/contracts"`。

> **包形态（E5.8#22.6 建）：** `contracts/` 即 npm 包根（`@linkdesk/contracts`，`types` 入口直指 `linkdesk.d.ts`，零构建，`files` 白名单只 d.ts）。**版本联动：** 包版本 = 壳版本——生成器自动同步写入 `contracts/package.json`，漂移即 `contracts:check` 红。**消费形态验收：** 仓库根 `contracts-example/`——独立 tsconfig + `file:../contracts` 本地引用，`npx tsc --noEmit` 零错误，全程零 `@src/core`（`npm pack` 出 tarball → 装真实 npm 包路径同样通过）。**发布态：** 当前仅 `npm pack` 本地验收闭环；真实 npm publish 已立案 [E6#2.5](../02-Electron架构/E6_插件生态与发布/E6-执行清单.md)。

**路径 C——拷贝文件：** 直接把 `contracts/linkdesk.d.ts` 拷进插件项目 + tsconfig 引用。契约文件单文件自包含（94 声明，零 import 依赖），拷贝即用。

> **三个路径任选其一，禁止 `import type { ... } from "@src/core"`**——那是偷壳源码类型（见 §五）。

### 3.2 运行时语义约定（d.ts 表达不了的，在这里）

> 方法签名以契约文件为准；以下是不进类型的**行为契约**——插件侧必须按此写。

| 命名空间 | 运行时约定 |
|------|------|
| **events** | 频道命名 `<插件id>:<数据名>`（如 `serial:rawData`、`sbq-protocol:parsed`）。壳广播事件表见下 |
| **quickPick** | Promise resolve **结构化副本**（contextBridge 跨世界结构化克隆，`===` 原对象不可行）；Escape/点遮罩/失焦/被新 `show()` 顶掉 → resolve `undefined`（last-wins）；`opts.items` 非数组 → reject。壳浮层优先级更高。**调用放组件 effect 内**——壳侧执行半程调 `show` 因无此 API 而 no-op |
| **viewContainer** | **元数据单向流**：视图注册以 plugin.json `contributes.views` 为准；`registerView` 更新既有视图只覆盖元数据、`render` 保留原组件；`descriptor` 传 `render`/`actions`/`pinnedContent` 池侧白名单剥掉（不可跨 IPC）；查询不存在的容器/视图 → `undefined`/`[]` |
| **decorations** | **同步契约**：`provideDecoration` 返回 `FileDecoration \| null \| undefined`，**不得返回 Promise**（异步提供方被跳过）；同 pluginId 重复 `registerProvider` 幂等覆盖；注销/注册自动全量刷新通知 `onDidChange([])`；provider 抛异常自愈剔除该条目 |
| **filesystem** | 插件权限：插件数据目录读写、workspace 目录读、**其他插件目录禁止** |
| **configuration** | 配置 key 命名规则 `<pluginId>.<property>`（如 `editor.fontSize`、`serial-monitor.baudRate`） |
| **serial** | **E5.8#28 多口路由：** 打开/关闭/动作定向接口的 `portName` **可选**——缺省 = 唯一打开口（0 口抛「串口未打开」；≥2 口抛「多串口已打开，请指定 portName」；**失败可见，不静默**）。三推流通道（`onData`/`onStats`/`onSystem`）载荷**对象化**带 `portName` 路由键（`SerialDataPayload`/`SerialStatsPayload`/`SerialSystemPayload`）——订阅方按**会话口**过滤（key=portName 是通用路由键模式：谁消费谁过滤，壳不代收）。每标签页仍单口（D3），会话-端口绑定在插件侧 |
| **panel** | **E5.8#34.5：** `panel.reveal(viewId)` 声明寻址聚焦底部面板视图——面板隐藏 → 展开并切到该视图（Ctrl+J 同机制）；已显示 → 切换聚焦；**viewId 不在 panel 容器 → no-op**（不报错）。**#36.10 已移除 `panel.moveToEditor`**（用户拍板弃内容迁移——zone 位置移动是 #37.6/#37.7 布局命令的事）。**E5.8#39.5：** `panel.revealFloating(viewId)` 壳内悬浮面板（类型 B）——按声明弹出某视图为悬浮面板。声明寻址 = ViewContainerService 全局视图索引（`contributes.views` 已注册**任意容器**视图，不限 panel——插件声明 `contributes.floatingPanel.viewId` 引用之）。**身份开关键（I8-2）**：无面板 → 开；同视图 → 关（toggle）；他面板 → 替换；**viewId 未声明/声明插件未装 → no-op**（不崩）。面板默认动作 =「在主窗口中打开」（仅声明插件可开成标签页时出现）+ 最大化 toggle + 关闭 |
| **hotExit** | 崩溃恢复专用——脏内容落盘 `%APPDATA%/linkdesk/hot-exit/`（主进程路径约定单源，插件零直写）；保存/关闭标签页后调 `clear` 删备份 |
| **appearance** | **E5.8#153：** `revealStorage()` 打开外观存储目录（`userData/appearance`）——主进程解析路径并 `shell.openPath` 开资源管理器**内容**（非 `showItemInFolder` 高亮单文件）；目录缺省也建（打开即见存储位置，空目录合法），`openPath` 失败抛错 fail-loud。返回 `Promise<void>` |
| **tabs** | **E5.8#46.2 跨窗资源事件联动：** `updateLabelBySourceId(sourceId, label)` / `closeBySourceId(sourceId)` = **全窗广播语义**——资源持有者在主窗与全部脱出窗的标签页同步更新/关闭；`sourceId` 为全局唯一资源身份（文件路径/会话 id），变更即全局事实（联动**不依赖调用方与标签页同窗**——脱出窗标签随侧栏改名/删除即时联动，对标 VS Code）。`focusBySourceId(sourceId)` = **按来源窗路由**（视图动作，聚焦到具体某窗，非全局事实）。**无新 API**——复用既有面，此行为契约由 E5.8#46.2 全窗广播保证 |

**壳广播事件（插件可订阅，走 `events.on`）：**

| 频道 | payload | 触发时机 |
|------|------|------|
| `theme:changed` | `{ themeId, themeType, variables }` | 用户切换主题（CSS 变量自动注入，无需手动订阅）。**E5.8 Phase 12：载荷 `variables` 现含字号变量 `--font-size-*` + `--ui-scale`**（全局字号缩放走既有主题通道，**无新事件**；插件字号消费 token 见 05-UI写法规约 §10） |
| `iconTheme:changed` | `{ iconThemeId, mappings, fontFaces?, glyphCss? }` | **E5.8#133：** 用户切换图标主题（设置 `app.iconTheme`）。`iconThemeId` = 选择的图标主题 id；`mappings` = 该主题的映射表（`IconThemeMappings` 形状，图像资产已解析为 `linkdesk://` 绝对 URL）或 `"default"` 时为 `undefined`（消费方回退 codicon 保底）。**E5.8#133.4：** `fontFaces`/`glyphCss` = 主题声明了自定义字体时（mappings JSON 顶层 `font` 段）的 @font-face 规格与 glyph 类 CSS 原文——池 preload 已自动注入池文档（自定义图标字体渲染，消费方无需处理）；无 font 段/`"default"` 时缺省。**E5.8#133.6：** `mappings` 顶层可声明 5 个默认图标 `file`/`folder`/`folderExpanded`/`rootFolder`/`rootFolderExpanded`（单条目，对齐 VS Code iconTheme 顶层键）——未命中匹配表（普通文件夹/新建文件/根文件夹）时消费方用主题默认图标而非 codicon；缺省 = codicon 保底。**不自动生效的仅是映射本身——需要自定义文件图标视觉的插件手动订阅**（如文件树按 `mappings` 换图标，对标 VS Code `onDidChangeProductIconTheme`） |
| `lang:changed` | `{ lang, resources }` | 用户切换语言 |
| `workspace:changed` | `{ rootPath }` | 用户打开/切换文件夹 |

### 3.3 与旧手写版的差异（读者注意）

旧版 §3.x 逐命名空间方法清单已删除（= 手写第二份真相源，必然漂移）。生成的契约解决了几处**旧文档与实现不符**的漂移：

| 点 | 旧手写版 | 契约/实现实况（#20 后） |
|------|------|------|
| `serial.listPorts()` | 写成 `getPorts()` | 契约 `listPorts()`——实现一直叫这个，旧文档笔误 |
| `serial.onData/onStats/onSystem` | `cb: (d: any)` / string | **E5.8#28 载荷对象化**：`onData(p: SerialDataPayload)` / `onStats(p: SerialStatsPayload)` / `onSystem(p: SerialSystemPayload)`——三通道均带 `portName` 路由键（`SerialStats` 已删除，无死类型尾巴） |
| `decorations.provideDecoration` | 写可返回 `Promise<FileDecoration>` | 契约**同步 only**（返回 Promise 的提供方被跳过） |
| `pluginState.onChange` | 注释「未来多 WebView 恢复后可用」 | E5.7 池已注入 onChange——订阅可用；通配键名订阅走 `events.on("plugin-state:changed")`（E5.8#20 补导出 `PluginStateChangedPayload`） |

---

## 四、IPC 可靠性约定

1. **每个 invoke 有 10s 超时。** 超时 throw `Error`
2. **返回值有 falsy 可能。** `""`/`0`/`false` 是合法值。用 `isNaN(n) ? default : n` 而非 `n || default`
3. **IPC 回调里用到 React state → 用 ref 桥接**
4. **`onChange` 回调模式**（configuration/language）——返回 unsubscribe 函数，组件 unmount 时调用清理

---

## 五、禁止事项

| ❌ | ✅ 替代 |
|---|---|
| `import { normalizePath } from "@src/core/pathUtils"` | `lk.path.normalize(p)` |
| `import { getConfigurationValue } from "@src/core/ConfigurationService"` | `lk.configuration.get(key)` |
| `import { listDir } from "@src/core/FileService"` | `lk.filesystem.listDir(p)` |
| `import { getWorkspaceFolders } from "@src/core/WorkspaceService"` | `lk.workspace.getFolders()` |
| `import type { FileEntry } from "@src/core/types/fileEntry"` | `import type { FileEntry } from "@linkdesk/contracts"` |

**ESLint `error`（`noCoreImportInPlugin`，#20-d 收紧）：** `import { ... } from "@src/core/..."` **和** `import type { ... } from "@src/core/..."` → 🚫 编译失败。测试文件不再豁免（vitest 单进程理由不成立）。

**允许的 import（白名单全表见 `eslint-local-rules.js` PLUGIN_IMPORT_WHITELIST）：**
- `@linkdesk/contracts` **类型**（`import type`，零运行时耦合）
- `@src/components/shared/*` **共享 UI 组件**（ContextMenu / PluginIcon / Toggle / SelectBox / Combobox / InlineInput / FormRow 等）
- **纯工具白名单**：`@src/core/pipeline/*`（DataConverter / DataDispatch / RingBuffer / ProtocolParser）+ `@src/core/utils/CancellationToken` + `@src/core/registry/commands/MenuRegistry`（仅 MenuId 类型/枚举）
- **例外记录表**：新例外必须写进 memory `plugin-import-exceptions.md` 再放行（插件独立铁律审计项）

> **`useConfiguration` / `useSendData` / `ViewContainerService` 等壳 hooks/服务禁止 import**（有模块级状态 → 调用方的修改壳进程看不到）——插件读配置走 `window.linkdesk.configuration`，状态同步走 `window.linkdesk.events`（订阅广播）/ `serial.onData` 等数据管道（见 `07-插件间通信.md`）。

---

## 六、设备通道边界（E5.8#30.6）

> 接「二、壳 vs 插件」——**设备插件作者能独立做到哪一步、平台承诺到哪里。** 依据 = 通道范式（E5.8 Phase 6.5 用户拍板），完整论证见 [通道范式·设备插件独立](../02-Electron架构/通道范式·设备插件独立.md)。

**一句话：解析归你、通道现成——不需要找壳作者、不需要等壳发版。** 通道类型收敛归壳（可枚举），设备无限归插件。

| 层 | 设备示例 | 通道 | 作者状态 |
|:--|:--|:--|:--|
| **串口系**（最大头） | USB-CAN 适配器（CH340/CP210x 虚拟串口）、GPS 模块（NMEA）、USB-TTL、便宜逻辑分析仪 | `linkdesk.serial.*`（Phase 6 通用化后） | ✅ **立即可写，零壳依赖**；多口/多插件并存成立 |
| **自定义 USB** | 专业逻辑分析仪（Saleae 类，自定义 USB 端点） | 未来 `usb` 通道 | ⏳ E6 后版本化演进加一条通用通道（一次性，同 serial 同构）；**加完前这类设备要等** |
| **厂商私有 DLL** | 高端设备（只有厂商 SDK/DLL） | 原生通道 | ⚠️ 独立架构课题（渲染沙箱无 Node 权限）；非 E5.8 范围 |

**平台责任边界（作者可放心依赖）：**
- **通道正确性 + API 稳定承诺**——平台作者负责通道（打开 → 流式读写 → 关闭/错误/多实例/资源回收）；E6 上架后改 API = 版本化演进（`engines` 声明），加了不违约、不加不影响存量插件。
- **设备协议正确性作者自持**——CAN 帧/NMEA/采样解析全归插件，壳不认识任何设备。
- **同一物理口仅单消费方**——OS 驱动排他（`serial-monitor` 打开的口，其他插件/标签页不能同时打开；多插件并存 = 各开各的口）。

> 确认 `linkdesk.serial.*` 现成能力 → [contracts/linkdesk.d.ts](../../contracts/linkdesk.d.ts) `Serial` 域。要自定义 USB/原生通道 → 提给平台作者——这是「加通道」范畴（收敛、可枚举、一次性），不是给某插件打工。

---

> **下一份：** `02-插件生命周期.md`
> **索引：** `00-README.md`
