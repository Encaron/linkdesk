# 08-共享 hook 归位——@src hook 例外清除立案

> **非新能力声明（设计流程 §8.4 ③）**：零新增 API / 配置 / 贡献点 / 控件——纯**归位重构**（4 个既有 hook 换分发通道：插件侧 @src → @linkdesk/ui 零件 / 插件本地）。文中 `window.linkdesk.*` 提及均为既有契约描述引用，无新契约。
> **2026-09-05 立案（E6#15 P-段B 断焊前置）**。相关：E6#54 / #54c（零件包）、E6#15a/#15b（React 插件独立 build）。
> 一句话：`useClickPreview`/`useClipboardKeys`/`useDebouncedInput` 进 `@linkdesk/ui` 零件包（源码收 `src/components/shared/hooks/`），`useIpcEvent` 迁回 serial-monitor 插件本地。壳 `src/pool/hooks` + `src/hooks` 的 4 份副本删除——零死代码，`plugin-import-exceptions` 例外表对应条目清除。
> 落地前奏：#15a 盘点已实锤——**全 5 目标插件的真实 @src 运行时焊点只有这 4 个 hook import**（settings/editor/marketplace 早已全走 `window.linkdesk.*` + `@linkdesk/ui`；此前审计把注释里的 "@src" 提及算进计数，虚高）。这 4 条例外断了，React 插件独立 build 的 @src 面即清零。

---

## 一、为什么这 4 个 hook 当初放在壳里

落位史（git 实挖）：

| hook | 壳原家 | 设计意图（头注原文精神） | 来源 commit |
|:--|:--|:--|:--|
| `useClickPreview` | `src/pool/hooks` | E4V#28e 从 file-tree 抽出——"未来 sidebar 任何树/列表组件复用同一交互"（单击预览/双击锁定，对标 VS Code explorer） | E4 era |
| `useClipboardKeys` | `src/pool/hooks` | **E5.8#24.8.3 用户拍板路径 2**——"共享 hook 消除每插件重复剪贴板键处理，机制归一一处实现一处修"；机制（ctrl/meta 检测+preventDefault+键映射）与语义（onCopy/onCut/onPaste 回调）分离 | `6065f0ff1` |
| `useDebouncedInput` | `src/pool/hooks` | E3.6 E36#7.3c 提取——防抖输入模式归一（本地 state 即时响应 + 外部 state 防抖同步） | E3.6 era |
| `useIpcEvent` | `src/hooks` | 安全订阅 serial 后门推送（gen-counter 防 StrictMode 双注册 + callbackRef 防闭包过期），对标 useTauriEvent | E1 era |

**共同根因：** 那时内置插件是**焊接的**——直接 `@src` import 壳代码，壳 src（pool/hooks = "池内 UI 交互 hooks" 家，E5.8#0d.7-5 归位）就是插件够得着的共享仓库。E5.8 时代 knip 特意记过"插件直引 @src/pool 在排除域外"——**这是白名单例外**，不是设计常态。

## 二、现状硬事实（2026-09-05 grep 实证）

1. **4 hook 全是纯插件消费，壳 chrome 零消费**——唯一命中是 `src/core/react/usePluginIpcEvent.ts:12` 注释里提一嘴作对比（非 import）。
2. 每个 hook 依赖 = 纯 React 或只碰 `window.linkdesk`，**零壳 src import**——与 #54c 那 16 个共享组件同性质（零模块级副作用），安全暴露给插件。
3. 消费者唯一：
   - `useClickPreview` → `plugins/builtin/file-tree/src/components/FileTreeNode.tsx`
   - `useClipboardKeys` → `plugins/builtin/file-tree/src/services/FileTreeKeyboard.ts`
   - `useDebouncedInput` → `plugins/builtin/marketplace/src/views/SearchView.tsx`
   - `useIpcEvent` → `plugins/user/serial-monitor/src/index.tsx`
4. 例外表（memory `plugin-import-exceptions`）记录着这批 @src/pool/hooks、@src/hooks 条目。
5. #15 独立构建下插件不能再 `@src`——**这 4 条例外必须死**。

## 三、方案定案（对照十条 + 归一化 + 插件生态）

**否决"随插件各带一份"：** 这 3 个 hook（点击预览/剪贴板/防抖）头注写明"共享、消除重复"，是**泛用交互零件**——第三方作者写树/搜索插件就需要。不放零件包 = 插件生态断供 + 一个 bug 将来在 N 份拷贝里修（v2.6 反模式）。**归一化 = 一份实现、一个家、一个消费入口**。

| hook | 归处 | 理由 |
|:--|:--|:--|
| `useClickPreview` | **`@linkdesk/ui` 零件包**——源码收 `src/components/shared/hooks/`，barrel 加导出，dist 编给插件 | 泛用 UI 交互零件；第三方作者 `npm i @linkdesk/ui` 即有，与 Button/Toggle 同一条路。单一源码仍留壳（沿 #54「壳留源码单一副本、包编 dist」不变式，07 §④），壳未来消费直接引源码 |
| `useClipboardKeys` | 同上 | 同上（本来就是用户拍板的"共享机制归一"） |
| `useDebouncedInput` | 同上 | 同上 |
| `useIpcEvent` | **不进零件包，迁回 serial-monitor 插件本地 `src/hooks/`** | **非泛用零件**——`EVENT_SUBSCRIBERS` 硬编码 serial 三条后门通道（onData/onStats/onSystem）。serial 后门是"知道对方是谁"的紧耦合专线，只有 serial-monitor 一个域会消费。挂公共零件包 = 用通用名字导出 serial 内部件 → 第三作者误当通用订阅 → 撞 serial 墙（ai 陷阱）。**域内代码归域（高内聚）**：插件本地一份，零重复（全仓唯一消费者），例外表照样清零 |

## 四、为什么源码收 `src/components/shared/hooks/` 而不留 pool/hooks

`@linkdesk/ui` 三段构建管线（vite `resolve.alias @shared` → `tsconfig.decl.json` tsc 声明 mirror `rootDir=shared` → `scripts/build.mjs` barrel 生成 dist/index.d.ts）**硬钉单一源码根 = `src/components/shared`**，子目录 1:1 镜像进 dist。hooks 收进该根下 = **零构建手术**（alias/rootDir/barrel 机械全不动），mirror 自然给 `dist/hooks/*.d.ts`，barrel 行 `@shared/hooks/useX` → `./hooks/useX` 自动成立。

pool/hooks 移走这 3 个后只剩 `gridLayout`/`tabDragTypes`/`useDragReorder`/`useResizeDrag`——全是壳布局 chrome，目录变高内聚；插件 hook 挪走无壳消费方，零断点。

> 语义注：`src/components/shared` 在 #54 下已从"归一化 UI 控件"演进为 **`@linkdesk/ui` 零件源码根**（本就含 inferSliderStep 值函数 + iconUtils 类型，非纯控件）。加 `hooks/` 子目录继续这一演进。落地时同步更新「壳目录规范」（memory + docs）与 ui README 的该根语义描述。

## 五、落地步骤 + 断焊验证

1. 3 hook 源码 `git mv` `src/pool/hooks/{useClickPreview,useClipboardKeys,useDebouncedInput}.ts` → `src/components/shared/hooks/`；头注更新（"经 @linkdesk/ui 分发，E6#15"）。
2. `useIpcEvent.ts` 迁 serial-monitor `src/hooks/`；`index.tsx` import 改相对路径；头注从"壳共享"改"serial 域内订阅"。
3. `packages/linkdesk-ui`：
   - `src/index.ts` barrel 加 3 条 `export { useX } from "@shared/hooks/useX"`
   - `tsconfig.decl.json` include += `shared/hooks/**/*.ts`
   - 重跑 `npm run build` 出 dist；插件消费方（file-tree/marketplace）import 改 `@linkdesk/ui`。
4. 删壳 4 副本；**例外表 memory 清除**；壳目录规范补 shared/hooks 语义。
5. **断焊验证（#15b 主轴）**：file-tree / marketplace / serial-monitor 逐插件 SDK build 产 `.linkdesk-plugin`——settings/editor 本已零 @src 一并验。
6. `npm run check` 全绿（双 tsc + ESLint 0 + vitest + 网格/pool-css）。

## 六、顺带发现（本案外，先立案不扩 scope）

- **file-tree 测试仍壳耦合**：`plugins/builtin/file-tree/src/__tests__/FileTreeClipboard.test.ts:8` import `@src/core/registry/commands/ContextKeyService`。运行时不影响独立 build（测试不进 bundle），#15 把插件测试独立化时处理。
- **`usePluginIpcEvent`（`src/core/react/`，走通用 `window.linkdesk.events.on`）当前零消费者**——与 useIpcEvent（serial 后门）是"同一模式两传输"的兄弟，疑似 E3 遗留死代码。本案不动，留观察（若未来零件包要泛用订阅 hook，应以它/通用 events 通道为基写泛型版，而非搬 serial 硬编码版）。

---

> **← 同夹其他：** [07-共享组件独立分发设计](07-共享组件独立分发设计.md)（#54 零件包）· [05-内置插件迁移指南](05-内置插件迁移指南.md)（#15 迁移总纲）
> **← 执行清单：** `../E6-执行清单.md` E6#15h
