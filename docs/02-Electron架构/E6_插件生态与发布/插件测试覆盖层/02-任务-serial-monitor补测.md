# 02 · 会话二（AI-B）：serial-monitor 起点仓——纯逻辑 16 单元 ＋ 替身层 8 单元 —— `E6#147`–`E6#148`

> **本会话动谁**：`E:\linkdesk-plugins\official\serial-monitor`——**只加测试文件**（`src/__tests__/**`）；生产代码、`plugin.json`、`package.json` 默认**一律不动**。
> **发版**：**不 bump**（测试文件不进 `.linkdesk-plugin` 包——已解包实测）。⚠️ **唯一例外**：补测**发现真 bug** ⇒ 那是一次 `fix:` ⇒ 该仓 PATCH ＋ 发版 ＋ 官方目录收录（🔴 **发版要用户点头**）。真 bug 的**修复**要单独一笔提交，⛔ 不与测试同笔。🟢 **2026-09-25 用户明示授权：发现就先汇报、再改；因修复产生的版本变化（该仓 PATCH ＋ 发版 ＋ 目录收录）是被允许的**——⛔ 别因为「本层默认不 bump」而压着不改，也别只报不改。流程 = 汇报（哪仓 · 症状 · 判据 · 修法 · 涉及哪个版本号）→ 用户拍板 → 改 → 那条链路走全。
> **上位纪律**：⛔ 不改共享 mock（插件专属桩住**本仓测试文件**）· ⛔ 不改 mock 语义（`path` 的 posix 风格等一律照现状）· ⛔ 不为凑数写无断言测试 · ⛔ 不推送（推送等用户点头）· ⛔ 不碰 `CHANGELOG.md`（未发版不写发布账）。
> **为什么它是起点仓**（立案依据，[总纲 §〇b](00-整理档案.md)）：6,098 行生产代码只有 149 行测试（1 个文件）——19 仓里最薄；47 个纯逻辑单元里 16 个零测试（约 509 行）；31 个带 `window.linkdesk`/React 的单元与 23 个 `.tsx` 全裸。它的第二格正好把「**替身层怎么写**」做成样板，供会话三/四照抄。

---

## §一 `E6#147` 无替身纯逻辑 16 单元（本仓测试主干）

### 前因（为什么会被提出来）

- 这 16 个单元**不需要任何替身**（不含 `window.linkdesk`、不含 React）：它们是纯函数 / 纯类 / CodeMirror 扩展工厂 ⇒ **投入最低、风险最高**（帧缓冲、HEX 解析、状态合并都是会悄悄错的算法）。
- 立案读数：本仓 47 个纯逻辑单元中 16 个零测试；视图层 23 个 `.tsx` 全裸（本层**不**覆盖，见 [总纲 §〇f](00-整理档案.md)）。
- 六格里的 `RingBuffer` / `autoFormatHex` / `portFilter` / `cm6` 扩展，就是 2026-09-15 评审点名的那几个。

### 修哪里

**新增**（全部住 `src/__tests__/`，沿用本仓既有的扁平命名 `<单元名>.test.ts`——既有唯一那份是 `src/__tests__/useSerialSessions.test.tsx`）：

| # | 单元 | 行 | 该测什么（判据导向） | 怎么测 |
|:--|:--|--:|:--|:--|
| 1 | `src/utils/RingBuffer.ts` | 44 | 环形缓冲：容量上界、写满一圈后的覆盖顺序、清空、越界读——**帧缓冲的根件** | 直接 `new`；边界先测：容量 0 / 容量 1 / 写 2 圈 |
| 2 | `src/utils/portFilter.ts` | 13 | 端口过滤与排序（大小写、已占用标记） | 纯函数表驱动 |
| 3 | `src/utils/text.ts` | 23 | 文本归一（换行 / 截断 / 可见性判定） | 纯函数 |
| 4 | `src/utils/pluginId.ts` | 9 | 插件 id 稳定取值（fail-closed 形态：读不到就不编） | 纯函数 |
| 5 | `src/utils/saveFile.ts` | 20 | 保存文件名 / 扩展名推导（时间戳格式接入点） | 纯函数（格式串直传，⛔ 不走 i18n） |
| 6 | `src/views/SerialMonitorView/autoFormatHex.ts` | 27 | HEX 自动格式化：非法字符剔除、每两字符插空格、非法字符摘要文案 | 工厂 `makeAutoFormatHex(t)`——`t` 注入**假函数**（`(k) => k`，⛔ 不引真字典） |
| 7 | `src/views/SerialMonitorView/settings.ts` | 57 | 会话 → 视图设置：**null-safe 默认值逐字段**（语义与原文逐字一致） | 表驱动三态：字段缺失 / 空串 / 有值 |
| 8 | `src/hooks/useSerialSessions/getters.ts` | 13 | 模块级 getter：`getActiveSessionId` / `getSessionById` 的命中与未命中 | 与既有测试同风格（无需替身）；注意**模块级状态要在 `beforeEach` 重置**（照既有文件的做法） |
| 9 | `src/services/SerialContext/status.ts` | 17 | `mergeStatus` 的 null-safe 合并（`portName`/`baudRate`/`isOpen`/`lastError` 逐字段回落） | 纯函数三态：wire 缺字段 / 全字段 / 全缺 |
| 10 | `src/services/receiveSnapshots.ts` | 45 | 接收快照的构造与推进（序号 / 上限 / 清空） | 纯函数；涉定时则 `vi.useFakeTimers()` |
| 11 | `src/services/commandBridge.ts` | 37 | 命令桥：`_cmdMap` 单一属主、按**活跃 session** 派发、注销后再派发不炸 | 造假 `ActiveCmd`（setter 用 `vi.fn()` 填） |
| 12 | `src/cm6/appendLine.ts` | 38 | 追加行事务：行数上界、滚动意图、不变式 | `EditorState.create({ extensions: [...] })` ＋ `state.update({ changes })` **反射断言**（⛔ 不建真视口、⛔ 不碰 DOM） |
| 13 | `src/cm6/decorations.ts` | 52 | 装饰计算：范围不越界、类名集合稳定 | 同上（`StateField` 反射） |
| 14 | `src/cm6/scroll.ts` | 31 | 滚动策略：`paused` × `autoScroll` 组合 | 同上 |
| 15 | `src/cm6/search.ts` | 36 | 搜索：命中集、当前项推进、空结果 | 同上 |
| 16 | `src/cm6/theme.ts` | 47 | 主题扩展：类名与 token 名**逐条**（⛔ 不许出现裸色值） | 同上 ＋ 一条「无硬编码 hex」断言（照 SDK lint 的口径） |

> 🔵 **cm6 五件（12-16）的测法**：本仓 `dependencies` 已含 `@codemirror/{state,view,search}` ⇒ 直接用 `EditorState` 反射状态，**不需要 jsdom 视口**。这套写法是给 `#148` 与会话三/四的样板（纯逻辑优先、替身其次）。
> 🔵 **既有测试文件不动**（`useSerialSessions.test.tsx` 只属于 hook 面）；本格若发现某某 case 与既有文件同主题 ⇒ 就放**本格新文件**里，别去改它的结构（改它是 `#148` 的事）。

### 怎么修（工序）

1. **先读再写**：每个单元先读实现（含它的注释里写着的既有约定），断言按**现状语义**写（⚠️ 现状即契约；发现现状可疑 ⇒ 记进交接段，⛔ 不顺手改生产代码）。
2. **一个单元一个测试文件**，命名 `<单元名>.test.ts`（`getters.test.ts` / `RingBuffer.test.ts` / `appendLine.test.ts` …）——**同名**是为了让 `#153` 的尺子能认（尺子的判据之一就是同名/引用命中）。
3. **断言要有牙**：每条 `it` 写完自查一句——「**把生产代码改坏了，这条会红吗？**」不会红 ⇒ 重写。
4. **不引新依赖**：本格所需（`vitest` / `jsdom` / `@codemirror/*`）**全部已在**（见下「版本与连带」）。

### 验收

| 项 | 判据 |
|:--|:--|
| 绿 | `npm test` 全绿（既有 1 个文件 ＋ 新增约 16 个） |
| 判据 | 本仓**纯逻辑零测试单元：16 → 0**（逐单元可在 `#153` 的尺子上复核）；若有单元裁决为「不测」⇒ 登记「单元 ＋ 理由 ＋ 归属轮次」 |
| 门禁 | `npm run verify` 绿（跨插件 import / 字典完整性 / 声明自洽——本格不碰声明，应无变化） |
| 零生产改动 | `git status` 里**只有** `src/__tests__/**`（＋ 若有真 bug，那笔单独） |
| 三件不碰 | `plugin.json` / `package.json` / `CHANGELOG.md` 一字未动 |

### 版本与连带

- **不 bump**（理由：[总纲 §〇c](00-整理档案.md) 第三条——测试不进产物）。⇒ `sync:plugin-agents --check` 不受影响（版本句未变）；⇒ **不需要** `sync:bundled`（本仓不是出厂种子）。
- 本仓补丁档案（若仓内有自己的进度清单）把「本轮补测试」登记一条——**工程账，不是发布账**（不发版就不写 `CHANGELOG.md`）。
- 提交：**本仓单独一笔**（`test:` 或仓内既有前缀习惯），⛔ 不推送。

---

## §二 `E6#148` 替身层 8 单元——**把「插件怎么用替身」做成样板**

### 前因

- `serial-monitor` 的 31 个带 `window.linkdesk`/React 的单元**一个都没测**，其中**数据流三链**（接收流 / 发送 / 会话持久化）是这只插件的命脉；`#147` 只覆盖了其中无替身的那部分。
- 本格真正的价值**不在覆盖率**——在于给会话三/四与**未来所有插件仓**一套可抄的替身写法：**共享 mock 是最小面**，插件专属的桩住本仓测试文件。
- ⚠️ **本格有上界**：8 个单元挑完为止，**不追求** 31 个全测、**不追求** 23 个 `.tsx`（口径上界 = [总纲 §〇f](00-整理档案.md)）。

### 修哪里

**按风险排序的 8 个单元**（前 6 个是本格目标，后 2 个**可裁决延后**并登记理由）：

| # | 单元 | 该测什么 | 是否必做 |
|:--|:--|:--|:--|
| 1 | `src/hooks/useSerialSessions/persist.ts` | 会话持久化：写 / 读 / 缺失回落 / 脏数据不炸 | 必做 |
| 2 | `src/hooks/useSerialSessions/store.ts` | 会话 store 的模块级状态机（与既有测试同源，扩面） | 必做 |
| 3 | `src/hooks/useSerialSessions/useSerialSessions.ts` | hook 面补例：重复 id / 未知 id / 连续创建-删除 | 必做 |
| 4 | `src/views/SerialMonitorView/useReceiveStream.ts` | 接收流：IPC 事件 → 追加 / 上界 / 暂停态 | 必做 |
| 5 | `src/views/SerialMonitorView/useReceiveLines.ts` | 行聚合：换行切分、尾行保留、清空 | 必做 |
| 6 | `src/utils/useSendData.ts` | 发送链：目标端口选择（缺省口语义）、编码、回声开关 | 必做 |
| 7 | `src/views/SerialMonitorView/useReceiveSnapshots.ts` | 快照联动：定时 / 上限 / 卸载清理 | 可裁决延后 |
| 8 | `src/views/SessionListView/useSerialConnection.ts` | 连接生命周期：打开 / 关闭 / 错误态 | 可裁决延后 |

**既有测试扩面**：`src/__tests__/useSerialSessions.test.tsx`（149 行，覆盖 `createSession` / `removeSession` / `updateSession` / `resetAll` / 两个 getter）——本格可在它里面**补 hook 面缺口例**（第 3 行的那些），其余新单元**各建新文件**。

### 怎么修（替身技法——本格的真正交付物）

1. **共享 mock 只给最小面，插件专属桩住本仓**：`@linkdesk/plugin-sdk/vitest-setup` 提供的是 `path` / `configuration` / `config` / `workspace` / `filesystem` / `tabs` / `events`（`events.on` 是 **no-op**）。本仓要用 `window.linkdesk.serial` 之类 ⇒ **在本仓测试文件里**补：`(window.linkdesk as any).serial = { … }`（`vi.fn()` 填）。⛔ **不许**往共享 mock 里加（它是 8 处共用的地基，会话一之后是真源 1 份）。
2. **抓 IPC 回调的标准写法**（`events.on` 是 no-op ⇒ 想喂事件必须先接管）：
   ```ts
   const handlers = new Map<string, (p: unknown) => void>();
   (window.linkdesk!.events as any).on = vi.fn((ch: string, cb: (p: unknown) => void) => {
     handlers.set(ch, cb);
     return () => handlers.delete(ch);
   });
   // …renderHook 之后：
   act(() => { handlers.get("serial:data")?.({ /* payload */ }); });
   ```
   ⚠️ 频道名/payload 形状**按本仓生产代码实际用的那个**（别照文档猜）；**测试替身要符合契约、不是照实现抄**（memory `test-double-must-match-contract-not-impl`）。
3. **hook 测法**：`renderHook` ＋ `act`（本仓 `devDependencies` 已有 `@testing-library/react`）；文件头照既有那份加 `/** @vitest-environment jsdom */`。
4. **定时类**（快照/自动重复）：`vi.useFakeTimers()` ＋ `vi.advanceTimersByTime()`；**每例后 `vi.useRealTimers()`**（防跨例污染——memory `flaky-full-suite-tests`）。
5. **断言要有牙**：同上自查句；⛔ 不写「只断言不抛」的凑数例。
6. **裁决延后怎么写**：第 7/8 个若判定成本 > 收益 ⇒ 在交接段写「单元 ＋ 具体理由（如：要整包 mock X）＋ 归属轮次」，**不是**留空。

### 验收

| 项 | 判据 |
|:--|:--|
| 绿 | `npm test` 全绿（新增 6–8 个文件 ＋ 既有文件若扩面） |
| 样板可抄 | 本格的替身写法（第 1/2 条）**提炼成三行**写进交接段——会话三/四直接抄（⛔ 别再各自发明） |
| 判据 | 本仓替身层**已测单元 +6 以上**；延后者登记在案 |
| 门禁 | `npm run verify` 绿；三件（`plugin.json` / `package.json` / `CHANGELOG.md`）一字未动 |
| 稳定性 | 全套**连跑两遍**都绿（防定时器/模块级状态导致的间歇红——memory `flaky-full-suite-tests`） |

### 版本与连带

同 §一（不 bump；单独一笔；不推送）。🔴 若本格发现真 bug：`fix:` 单独一笔 ＋ 该仓 PATCH ＋ 发版（🔴 用户点头）＋ 目录收录 ＋ 重跑 `sync:plugin-agents`（AGENTS.md 版本句）——**这条链路是「测试真值钱」的兑现，别省步骤**。

---

## §三 本会话收尾清单

1. `npm test` 全绿（连跑两遍）＋ `npm run verify` 绿。
2. 读数回写：`E6-执行清单.md` 的 `#147`/`#148` 行（✅ 读数：新增文件数 / 用例数 / 纯逻辑零测试 16→0 / 替身层 +N）；[交接.md](交接.md) 顶部补「会话二收口段」＋ 替身写法三行样板。
3. 提交：**本仓单独一笔**（或两笔——`#147` 与 `#148` 各一笔更清楚），⛔ 不推送。
4. 延迟项登记：若第 7/8 单元或某纯逻辑单元裁决延后 ⇒ 逐条写「单元 ＋ 理由 ＋ 归属」。
