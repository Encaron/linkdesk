# AI 友好化-全自动操作 · 执行清单

> 2026-09-28 立单（ZCode 会话）。**🔥 进度唯一真相源：做完一个勾一个；当前进度与完成度只看文末「总结」表（别处不复写数字）。**
> **状态：🚧 已开工——第 1 轮 M1（读取面进契约 `AI#1`–`AI#9`）2026-09-28 整轮收口（9/9）**：会话 1 六格（读面四件，真机 15/15）＋ 会话 2 三格（命令元数据，`npm run check` 全绿 208 文件 / 2813 tests）· 五笔提交全带类别前缀 · **零发版** · ✅ 前置门已过（用户 2026-09-28 拍板 A 组 8 条 ＋ P 组 5 条）——[02-目录与切片规划.md §四](02-目录与切片规划.md) A 组已销（剩 B 组 B-1 待用户改 README 一行 ＋ C 组随收口轮）。
> 🔴 **A-1 拍板改了执行序**（**M4 先于 M2**）⇒ 轮次 = M1 → M3 → M5 → **M4** → **M2** → 收口；**格号一字未动**（`AI#20`–`AI#30` 仍是 M2、`AI#31`–`AI#44` 仍是 M4）。
> **🎯 系列目标**：把「**一个能够完全自动化的软件**」（「AI 友好四层」定稿之层 1「运行时操作」）落成工程件——判据三条 = **可读 · 可操作 · 可查**（[01-设计.md §三](01-设计.md)），验收面两条 = **与物理指针无关** ＋ **dev 验收前置**（[01-设计.md §三 验收面](01-设计.md) / [01-设计.md §七 第 7 条](01-设计.md)）。
> **🔵 结构定案（2026-09-28）**：照 [E6-执行清单.md](../../../02-Electron架构/E6_插件生态与发布/E6-执行清单.md) 头部「结构定案」——**层 ≈ Phase 容器 · 轮 ≈ 一个执行批次 · 格 = 一个可回勾任务**。本系列 = 一个层（5 模块 + 收口），每模块 = 一轮，**编号 `AI#1`–`AI#49`，编号 ≠ 执行序**（编号是稳定 ID，插入序，不重编号不补位；执行序见文末「执行顺序与依赖」）。
> **🔢 子格（2026-09-28 追加）**：`AI#38` 按用户要求**展开为 `AI#38.1`–`AI#38.14`**（设置页逐项）⇒ **可勾格数 = 62**（父格号仍到 `AI#49`）。子格号是屋内既有风格（照 E6 的 `E6#13.5c` / `E6#41.14`）；⛔ **父格号不改**（重编号会毁掉全部既有引用）。父格 `AI#38` 本身**不单独回勾**。
> **🌱 生长格**：M2「唯一鼠标路径」与 M4「白名单」随审计生长 ⇒ 新缺口从 **`AI#50`** 起续号追加，**不回改既有格号**（[01-设计.md](01-设计.md) §六 已诚实预告清单会变长）。
> **📄 逐格详案** = [03-任务档案/](03-任务档案/)（六份：M1–M5 各一份 ＋ **M4-设置页.md** 承载 `AI#38.1`–`AI#38.14`）——本单每格只写**状态 + 一句话 + 判据 + 落点 + 指针**，⛔ 不复制详案正文。
> **🧰 系列外前置**（dev 验收前置）= `D0#1`–`D0#3`，**独立小件、不占 `AI#` 格**（[../dev验收前置.md](../dev验收前置.md)）。

**状态图例**：⬜ 未开工 ｜ 🚧 进行中 ｜ 🟡 已落地待验收 ｜ ✅ 已落地（已验收） ｜ ⛔ 取消 / 不做（须写理由）

**红线（每棒都在场）**：🔴 **不推**（`git push` 等用户点头，推必带代理）· 🟢 **插件与 npm 包（作者轴四包）随时可发**（🔴 **用户 2026-09-28 预授权**——任务执行阶段**不必逐次问**：插件 `plugin.json` PATCH ＋ publish ＋ **官方目录收录** ＋ `sync:bundled`，作者轴四包 `npm publish` ＋ `release:mark`；⚠️ 发就**一次走到端**）· 🔴 **软件本体（壳 / 安装版）不发版**（要发时走 `version-bump` 技能 ＋ 用户点头）· 🔴 **提交前 `npm run check` 全绿**＋类别前缀 · 🔴 **跨仓批次**（插件内改动写 `<插件 id>:<仓内相对路径>`）· 🔴 **视觉类改动先画 HTML 交用户拍板**（硬约束 16 → `ui-ux-pro-max`）· 🔴 **新增能力面先走 `design-flow` 8 维清单**。

---

## 第 0 轮（系列外）· dev 验收前置 —— 不占本系列格

> 归属 = 开发期脚手架（不进软件产物、零用户可见面、不占版本号），**与本系列互不依赖**。**本件是任务、是第一棒（会话「外」）**——投入半小时到一晚量级，换掉之后每次验收都可能踩的假阴性。全文 = [../dev验收前置.md](../dev验收前置.md)。判据三条在该文件 §四。
> 🔴 **本件也是任务、也要 AI 去做**（用户 2026-09-28 点名：「注意前置任务也是任务，也需要 ai 去做」）——**独立一棒（会话「外」）**：有格号 `D0#1`–`D0#3`、有判据（该文件 §四 三条）、**做完逐格回勾 ＋ 改文末「总结」表那一行 ＋ 在 [交接.md](交接.md) 写一条**，与第 1 轮同规格；⛔ 别当「顺手做掉的小事」。开场词 = [05-启动词.md](05-启动词.md) 第一段。

#### D0#1 ✅ 硬 reload 前置 ＋ 构建握手

- [x] **D0#1** 验收 driver 第一步对**全部调试 target** `location.reload()` 并等就绪；同笔打印/校验**构建哈希或时间戳**与现象读数并排记录。｜**病根**=04 侧栏折叠子实测：`plugin-states.json` 已更新而池快照没动（运行中 dev 实例的 HMR 吃不到**壳侧非组件模块**改动）⇒ 据此误判「修了没用」白查一轮。｜落点 = CDP driver 脚本（`scripts/dev/` 或 `scratch/`，**是否入库待定**）｜判据 = §四 第 1 条「代码未生效时**当场**可辨」
- ✅ 2026-09-28 收口（`f54e59209`）· 落点 = **`scripts/dev/`（裁决：入库）**，理由三条见 [scripts/dev/README.md](../../../../scripts/dev/README.md) §入库裁决｜实现 = `npm run dev:driver -- reload`（第一步硬 reload 全部 page target 并等就绪）＋ `-- handshake`：**按文档分开判**「`performance.timeOrigin`（该文档加载时刻）vs 磁盘 mtime」、聚合取最坏、零可比对判 `no-evidence` ⛔ 不算过｜真机：正控 `in-sync` → `touch src/App.tsx` → 壳报 `/src/App.tsx` `newer-than-page` **而池不受影响**（两份文档、两个 HMR 图 = 04 病形）→ `reload` → 双文档就绪 → `in-sync`｜⚠️ **原判据（看 `?t=` 版本章）被真机推翻**：Vite 只在模块被 HMR 失效后才挂章，刚加载页面 **326 资源 / 0 章** ⇒ 一律假红；`?t=` 已降级为附加证人（`stale-stamp`）

#### D0#2 ✅ CDP driver 库固化

- [x] **D0#2** 把一次性脚本收敛成一组语义助手（`openSection` / `collapseSection` / `readSections` / `readLayout` / `readPoolSnapshot`），放固定位置。｜**病根**=04 侧栏折叠实修写了 **17 个**一次性驱动，每个都带「找 page target + 走 React fiber 读 props」的前戏，换一件又从零写。｜判据 = §四 第 2 条「同类验收第二次做**不新写脚本**」
- ✅ 2026-09-28 收口（`f54e59209`）· 落点 = `scripts/dev/`（三层：`lib/cdp.mjs` 传输 · `lib/linkdesk-driver.mjs` 语义 · `driver.mjs` CLI，`npm run dev:driver`）｜五个助手全在，另从 17 个脚本里提炼 `readViewMenu` / `openView` / `hoverFace` / `buildHandshake` / `decouple`｜真机读数 = `sections` 6 行 · `layout` `containerId=explorer` / `collapsedViews=["explore","disabled","builtin"]` · `collapse`（点了 `true→false`）→ 再 `collapse`（**已是目标态，未点**）→ `open`（`false→true`）幂等三段全对｜零第三方依赖（只 `node:*` ＋ 相对路径，有自测守）＋ `selftest` **14/14**（纯函数，不需实例）｜⛔ **故意不接 `npm run check` 链**（要活实例、零产品面）；门禁射程已逐条核对（README §门禁射程）

#### D0#3 ✅ 与主系列解耦自检

- [x] **D0#3** 判据 = §四 第 3 条「与《AI 友好化》**互不依赖**：本件做完，软件侧一行未改」。｜顺手：driver 里的 hover 面用 **`CSS.forcePseudoState` 强制伪状态**，为 `AI#47` 的验收面自检先立样板
- ✅ 2026-09-28 收口（`f54e59209`）· 读数 = `npm run dev:driver -- decouple`：产品路径 `src / electron / packages / plugins` 未提交改动 **✔ 空**（`docs/04-软件更新/00-README.md` ✔ 干净，只报不拦）｜旁证 = 提交时 `commit-msg` 门禁自动判「**无软件侧代码 staged**——放行」｜顺手件：hover 样板已立，**默认真鼠标**——`.ldk-sidebar-section-header` `color` `rgb(138,138,138)` → `rgb(212,212,212)` 真变；而 `CSS.forcePseudoState` 对**深层既有节点只改 `matches()`、不改计算值**（同节点并排实测；强制探针却灵 ⇒ 机制没坏）⇒ `--mode force` **降级保留**并带警告。**留一条给 `AI#47`**：`mouse` 是可信路径

---

## 第 1 轮 · M1 读取面进契约（`AI#1`–`AI#9`）——本系列地基

> ↔ 调查待拍板 **P2**。[01-设计.md §四 M1](01-设计.md)；详案 = **[03-任务档案/M1-读取面.md](03-任务档案/M1-读取面.md)**。
> 判据 = AI 全部经契约 API 即可回答 toast 六问 + 读出布局树与标签页列表——**零 DOM 读取**。
> 顺序：`AI#1`–`AI#6` 相互独立可并行；**`AI#7` → `AI#8` → `AI#9` 是串行链**；`AI#8` 是第 2 轮（M3 手册）的硬前置。

#### AI#1 ✅ 通知读取面：list + subscribe

- [x] **AI#1** 给 `notifications` 契约补**只读列举**与**变更订阅**（或把 `pool.onLayout` 的 `statusBar.notif` 正式定格为读取通道并写进契约）。｜**现状实测**=契约面只有 `show`，全仓 grep `notifications.list` / `notifications.subscribe` / `onDidChangeNotification` **零命中**。｜落点 = `src/core/api/linkdesk-api/ui.ts:17`（契约）· `electron/preload-pool/namespaces-workspace.ts:32-36`（实现）· `src/hooks/usePoolSync/notif.ts:238-313`（壳侧数据源）· `src/core/types/pool/poolLayout.ts:665`（DTO 类型）｜判据 = 「铃铛里有几条、各是什么」**零 DOM 读取**可答｜详案 [M1-读取面.md](03-任务档案/M1-读取面.md)
- ✅ 2026-09-28 收口 （本棒三笔：`bfb71f81c` 契约 · `eda592829` 壳侧 · `2906268f1` 池侧）｜落点 = 契约 `ui.ts` 的 `notifications.list/subscribe` ＋ 池宿主 `electron/preload-pool/namespaces-workspace.ts` ＋ 壳侧 provider（`usePoolSync/notif.ts` 的 `buildNotif` 原样复用，单一尺子 ⇒ 读取面 ≡ 屏幕）｜读数 = 真机 15 断言全过：`list()` 报全 DTO（`unread/panelTitle/clearLabel/minimizeLabel/emptyLabel/autoOpen/groups[label,unread,items[message,timeLabel,sourceLabel,actions]]`）；`subscribe` 回调在 `show` 后**真触发**（pings=2，信号无载荷，与 `notif:changed` 一一对应）｜⚠️ **一条真机发现**：被唤醒的未读会「自动展开面板 ＋ 认账」（E6#72d/73a）⇒ `unread` 会自己掉到 0，⛔ 别拿 unread 当「订阅是否生效」的判据（要拿「新条目出现在 list 里 ＋ pings 计数」）

#### AI#2 ✅ 通知按钮带 command/args（不再剥）

- [x] **AI#2** 面板 DTO 的 `actions` 带上 **`command` + `args`**，AI 才能回答「**该执行哪个按钮 / 按下去会发生什么**」。｜**现状实测**=`src/hooks/usePoolSync/notif.ts:280` 只输出 `{ label, isPrimary }`（`command`/`args` 被剥）；壳侧在 `src/core/services/plugins/IpcBridgeHandler/ui.ts:259-292` 把插件序列化的 `{command,args}` 收进了**闭包**（闭包跨进程不可序列化 ⇒ 必须让闭包同时携带 command/args 才透得出去）。｜落点 = 上述两个文件 + 壳 toast action 类型（开工时定位）｜⚠️ **碰撞**：与 **E6#57.x** 通知面同区，开工前按新 HEAD 对齐（[01-设计.md §四 M1 碰撞栏](01-设计.md)）｜判据 = toast 六问之「按钮里有什么 / 该执行哪个」——**零 DOM 读取**可答且**可执行**
- ✅ 2026-09-28 收口（同上三笔）｜读数 = DTO `actions[0]` = `{label:"重试",isPrimary:true,command:"core.duplicateTab",args:[{tabId}]}`，与推入时**逐字一致**；照 DTO 调 `executeCommand(command, …, args)` 行为与**手点按钮**完全一致（两边各 +1 标签页，点击路径另收掉通知）｜🔴 **本棒最贵的一条踩坑留证（M3 手册必须写死）**：池侧契约调命令要带 **token 占位**——`executeCommand(id, undefined, ...args)`；池 preload 原样透传、壳 handler 把 `args[0]` 当 token 剥掉 ⇒ 少写 `undefined` 时真参数被吃、命令**静默空转**（不报错，最难查）

#### AI#3 ✅ tabs.list()（含活跃位）

- [x] **AI#3** `tabs` 命名空间补**只读列举**（含哪个是活跃标签）。｜**现状实测**=`src/core/api/linkdesk-api/tabs.ts:7` 只有 8 个操作面方法（create/openOrFocus/focus/close/focusBySourceId/updateLabelBySourceId/closeBySourceId/onDidChangeActiveTab），**无 `list`**；布局真相源在壳 `useTabManager`，壳侧无 getter。｜落点 = `tabs.ts` 契约 + 壳侧 getter + 池 preload 实现｜判据 = 「开了哪几个标签、哪个是活跃的」零 DOM 可答｜详案 [M1-读取面.md](03-任务档案/M1-读取面.md)
- ✅ 2026-09-28 收口（同上三笔）｜读数 = `tabs.list()` 读出 `windows[0]`：`mode/ready/groups[id,activeTabId,tabs[…]]`（含每组活跃位）＋ 关掉活跃标签后活跃位跟着变（welcome-5 → 副本，真机）；`focus(...)` 仍走 `IPC.tabs.focus`——`list` **没夺写路径**（专门有一条断言守）

#### AI#4 ✅ 布局读取面（树 + 分组）

- [x] **AI#4** 提供 `layout.get`，或把 `pool.onLayout` 的 **root / groups** 正式定格并文档化。｜**现状**=池侧唯 `pool.onLayout`（快照里有全量树 + 每组标签清单）**但未文档化**。｜落点 = `electron/preload-pool/layout.ts:46` · 契约类型 `src/core/types/pool/poolLayout.ts`｜判据 = §十 第 12 例「空间定位问答」三问全可答（开着吗 / 在哪 / 拉宽它）｜详案 [M1-读取面.md](03-任务档案/M1-读取面.md)
- ✅ 2026-09-28 收口（同上三笔）｜裁决 = **定格 `pool.getLayout()`（不新开 `layout.get`）**：它已是每帧推的全量快照，再开一个 getter 就是第二把尺子｜读数 = `getLayout()` 与 `tabs.list()` **同源**（组/活跃位/标签逐条相等）；分屏后树如实变形 = `branch{direction,sizes}` ＋ 叶子数 ≡ 组数 ≡ tabs.list 组数；**每片都有树内路径**（空间定位三问可答：`{main:"root/0", group-4:"root/1/0", …}`）｜嵌套实测轨迹 = 2 组/depth 2 → 3 组/depth 3 → 4 组/depth 4 → 再分**被拒且不留鬼组**（`MAX_TREE_DEPTH=4`）｜⚠️ 另一道守卫：源组只剩 1 个标签时分屏被拒（V3 无空组占位 UI）⇒ 想连分得先复制一份；反向也通：**关掉某组全部标签 ⇒ 组随树收缩**（归零断言）

#### AI#5 ✅ 对话框进行中状态可读

- [x] **AI#5** 让 AI 能读到「有个 confirm/alert 正弹着」。｜**现状实测**=`src/core/services/ui/DialogService.ts:138` 的 `showConfirm` 是 Promise 式，**进行中状态完全不可见**。｜落点 = `DialogService.ts` + 契约面｜判据 = 弹着对话框时 AI 能报出它在等什么｜⚠️ 边界：这是**读取**，不是「让 AI 替用户点」——按钮归属仍按设计边界②（AI 是操作员）
- ✅ 2026-09-28 收口（同上三笔）｜读数 = 真弹一条 confirm（`workbench.action.resetSetting`）时 `dialogHost.pending()` 报 `{kind:"confirm",title:"",message:"确定要将「app.uiFontScale」重置为默认值吗？",buttons:["确定","取消"]}`——与屏幕**逐字对齐**（截图存证）；`el.click()` 收尾后 `pending()` 回 `[]`（**不留悬空登记**，兜底路径不登记由单测守）｜⚠️ 给 M2 的一条：`buttons` 序 = **声明序**（恒 `[确认, 取消]`），**不是屏幕左右位**（屏幕上取消在左、确定在右）——已写进契约注释｜边界不变：本格**只做读**，⛔ 不给 AI 代点按钮（设计边界②：AI 是操作员）

#### AI#6 ✅ wake / ttl / persistent 透传

- [x] **AI#6** 通知 DTO 补齐 `wake` / `ttl` / `persistent`（现在只有 `autoOpen` 边沿）。｜**现状实测**=`src/hooks/usePoolSync/notif.ts:103-121` 的 `shouldWake` 已在读 `n.wake`，**但没透传到面板 DTO**。｜落点 = `notif.ts` DTO 构造 + 契约类型｜判据 = toast 六问之「因为什么弹出」——从 ◐ 补成 ✅
- ✅ 2026-09-28 收口（同上三笔）｜读数 = 三条真机事实：①插件自发的**非进度**通知 `wake=true`（E6#73b 白名单：`wake = !options.progress`）· `ttl=6000` · **无** `persistent` 字段；②**进度**通知 `wake=false`（进度增量永不唤醒）· `ttl=0`；③`persistent:true` 的错误通知 `wake=true` · `ttl=0` · `persistent=true`｜⚠️ 判据修正（写进契约与单测）：**⛔ 别按「severity 决定唤醒」猜**——info 也唤醒，只有 progress 不唤醒

#### AI#7 ✅ 命令可读描述①：契约与注册面加 description + params

- [x] **AI#7** 让命令**自带说明与参数结构**——AI 才能「知道怎么调」而不是凭名字猜。｜🔴 **现状实测（本会话新证）**=`src/core/api/linkdesk-api/types.ts:14` 的 `LinkDeskCommand = { id, title, category? }`——**零 description、零参数**；`registerCommand` 的 `meta = {title, category, when, pluginId}`（`src/core/api/linkdesk-api/commands.ts:47`）同样没有。｜落点 = `types.ts:14` · `commands.ts:47` · `CommandRegistry.ts:23`（`interface Command`）· `plugin.schema.json` 的 `contributes.commands` · `linkdesk.d.ts` 派生｜🔴 **全加法**（新字段可选，存量插件零破坏）｜判据 = `getCommands()` 返回值里**每条命令都有可读说明 + 参数结构**｜详案 [M1-读取面.md](03-任务档案/M1-读取面.md)
- ✅ 2026-09-28 收口（会话 2，commit `4b71863e2` ＋ 文档同笔）｜落点全中：契约 `LinkDeskCommand.description?` / `LinkDeskCommand.params?`（新接口 `LinkDeskCommandParam`：`name` / 四值收敛 `type` / `required` 缺省 false / `description`）· 壳注册表 `interface Command` · `registerCommand` meta（壳 preload ＋ 池 preload ＋ `IpcBridgeHandler/commands.ts` 两处 verbatim 透传）· 声明面 `contributions.ts`（`contributes.commands` 可写同字段）· `plugin.schema.json` 源 ＋ 三份同步副本 · `linkdesk.d.ts` / `host-api-surface.json` 派生物｜读数 = `contracts:check` ＋ schema 门禁 ＋ `typecheck` 全绿（派生物同步一致）
- 🔥 **取值口径（会话 1 交下、本棒定死，M3 照抄别改名）**：`params` 与 handler 实参**逐位对应**、**照 handler 实参名**（`tabId` / `settingKey` / `groupId`，⛔ 别另起名）。**context 型命令发一个 `ctx` 对象参数**（字段明细写在它的 `description` 里，如 `{ settingKey: string }——目标设置项 id`）——⛔ **不把对象字段摊成顶层位置参数**：那样写出来的调用会缺 token 占位而**静默空转**（会话 1 遗留第 1 条）。**面向 AI 的说明里不暴露 token 占位**（对 AI 就是 `executeCommand(id, ...params)`）

#### AI#8 ✅ 命令可读描述②：宿主命令元数据逐条清扫

- [x] **AI#8** 给**壳侧全部宿主命令**（`core.*` / `workbench.action.*` / `editor.*` / `app.*` …）逐条补 `description` 与参数结构。｜**量在条数**（[01-设计.md](01-设计.md) §六 量级评估：「M1⑦ 命令说明逐条清扫——量在条数」）。｜落点 = `src/core/commands/`（`shell/coreCommands.ts` / `shell/tabCommands.ts` 等）｜依赖 = **`AI#7` 先行**（没有字段就没处填）｜判据 = 命令索引里**零「只有名字没有说明」**的宿主命令
- ✅ 2026-09-28 收口（会话 2，commit `75969d4b9`）｜读数 = **63 条宿主命令零遗漏**（`shell/coreCommands.ts` ／ `panelCommands` ／ `settingsCommands` ／ `tabCommands` ／ `about` ／ `update` ／ `releaseNotes` ／ `developer` ／ `palette/quickPickCommand` ／ `input-bindings/shellMenus` ／ `App/startup.ts` 的 `color-picker.pick`）＋**机械证据** = 新单测 `src/core/commands/shell/commandMetadata.test.ts`（5 例，走真注册表：**62 条**有 `description`、`params` 的 `name/type` 非空且逐位对应 handler 形参名）｜✅ **本格做完，M3 手册（第 2 轮）的硬前置解除**
- ⚠️ **覆盖缺口（如实报，不粉饰）**：`color-picker.pick` 在 `src/App/startup.ts` 里直接 `registerCommand`（不经 `ensureCoreCommands`）⇒ 单测只覆盖 **62 / 63**。补法留给后续（把该命令挪进 `ensureCoreCommands`，或单测另起一个用例）——⛔ 本棒不顺手改注册结构
- 🔧 **jscpd 连带（首轮红，已修）**：四条设置项齿轮命令的 `params` ＋ handler 前置三行是 7 行重复（`duplication` 门禁 `exitCode:1`）⇒ 抽 `SETTING_KEY_PARAM` 常量 ＋ `settingKeyOf(args)` 助手（一处定义，四处引用）
- 🔧 **i18n 连带（设计裁决，见 `scripts/audit-i18n.mjs` §0）**：87 条中文 `description` 一度被判「缺翻译」。**命令/参数说明是声明数据、不是 UI 文字**（消费方 = 契约 → AI，今天零渲染消费方），且壳侧译名住在已外移的 lang-defaults 插件仓（E6#99）⇒ 仓内**没有可加译名的落点**。处置 = 审计加**属性名级排除**（`description:` 的值）＋面板八条命令的查找表按行排除。⚠️ **撤销条件**：命令说明一旦进 UI，两条排除**同笔撤销并补译**

#### AI#9 ✅ 契约文档同笔 ＋ 数量订正

- [x] **AI#9** `docs/03-插件制造/01-插件API契约.md` **补「读取面」章** ＋ **订正命名空间数量**。｜🔴 **实测漂移（本会话新证，三份数字两份过期）**=作者文档 `:34` 写「契约 **40** · 池注入 **39** · 壳注入 **22**」（❌ 最旧）；`src/core/api/linkdesk-api/surfaces.ts:24` 写「池 **44** = 43 唯一 + config 别名 · 壳 **24**」（⚠️ **也过期**）；**活门禁 `check-namespace-matrix.mjs` 实测 = 契约 46 · pool 45 · shell 25 · mock 13**（✅ 逐名对源，真相源）。｜落点 = `docs/03-插件制造/01-插件API契约.md` ＋ **`surfaces.ts:24` 过期注释同笔改对** ＋ `linkdesk.d.ts` 派生复核｜依赖 = `AI#1`–`AI#7` 全部落地后才写（否则写完就漂）｜判据 = 文档数字与**门禁活读数**一致（⛔ **不是**与 `surfaces.ts` 注释一致——照它改等于把错的抄一遍）＋ 尽量让这条数字**机械对账**（⛔ 别 fork 第二把尺）
- ✅ 2026-09-28 收口（会话 2，commits `2eb1ad311` 门禁 ＋ `e0b7f3df4` 文档）｜读数 = 门禁活读数 **契约 46 命名空间 / 15 域接口 · 池 45（唯一缺 `bridge`）· 壳 25 · mock 13**——中英作者文档两处数字已订正，`surfaces.ts` 两行过期注释（池 44→45、壳 24→25）同笔改对
- ✅ **数字化（判据全条落地）**：门禁新增**第 ⑥ 项** `judgeAuthorDoc`——机械对账**双语**作者文档 §二 表的契约数量与 `N 域接口` 锚点；**尺子不新造**（复用 `judgeStats` ＋ `domainInterfaceCount()`，与 §1 A/C 行同源，记忆《两把尺子必须同一份实现》）；自测 **37 例**（正控 20 / 负控 17）｜**接线已验证会红**：把文档 46 改成 47，门禁立刻报「中文作者面…与实际不符」，改回即绿
- ✅ 同笔补 **`§3.3 读取面`章**（中英双子）：五个读取面（`notifications.list/subscribe` · `tabs.list` · `pool.getLayout` · `dialogHost.pending` ＋ 命令元数据 `commands.getCommands()`）＋ 三条规矩（读取面 ≡ 屏幕同一把尺 · 信号不带载荷、答案问 `list()` · 文案已由壳 `t()` 解析、原样显示）＋ 边界（分离窗口策略子集 / 从未推过的布局为 `null` / 全窗口标签列表无「当前窗口」真相源 / `buttons` 序 = 声明序 `[确认, 取消]` 非屏幕左右 / 仅池侧）
- ⚠️ **未做（有意，防 fork 第二把尺）**：同一节里「94 声明」那个数字**没动**——`parseContract()` 只暴露命名空间/接口，**没有权威尺子可量它**，硬改就是人肉抄一遍（正是本系列要治的病）。留待将来给「声明数」也立一把机械尺

---

## 第 2 轮 · M3 文档与手册（`AI#10`–`AI#16`）——最省事、消费者立刻受益

> ↔ 调查待拍板 **P3**。[01-设计.md §四 M3](01-设计.md)；详案 = **[03-任务档案/M3-手册.md](03-任务档案/M3-手册.md)**。
> **🔴 载体硬要求（用户 2026-09-16 点名）**：**随安装包发货 ＋ 软件内可打开**——用户环境零源码，这是 AI 唯一的读物。
> **硬前置**：`AI#10`–`AI#12` 吃 `AI#7`/`AI#8` 的命令元数据 ⇒ **本轮必须排在 M1 之后**（[02 §三](02-目录与切片规划.md) 硬次序）。`AI#13`–`AI#15` 不依赖 M1，**可与第 1 轮并行起草**。
> **落点建议（拍板前＝待定）**：真源 = 新顶层 `docs/07-AI操作手册/`（**分章多文件**——分章是为了让 M2/M4/M5 各会话能各补自己那章、**不抢同一个文件**）。⚠️ 设计原文提的 `docs/03-插件制造/07-AI操作手册.md` **路径已被占用**（07 = 插件间通信），见 [02 §四 B-4](02-目录与切片规划.md)。
> **✅ 进度（2026-09-28）**：**整轮收口 7 / 7**。**第一交付 = `AI#10`–`AI#14` 五格**（落点 = `docs/07-AI操作手册/`：00 导航 · 01 路径总览 · **02 命令与API全索引（生成式 ＋ 漂移门禁）** · 03 按任务操作 · 04 手势隐藏规则 · 05 够不着清单与安装版路径 · 06 CDP 坑表）；**第二交付（同日）= `AI#15` 接入章（形态先写：`07-如何接入.md`，M4 落地后照 §七回填清单换实测）· `AI#16` 手册随包 ＋ 软件内入口**（`extraResources` ＋ 帮助菜单 ＋ 命令 `app.openAiManual` ＋ 池壳视图 `ai-manual`；`npm run check` 全绿 213 文件 / 2854 tests、`electron-builder --dir` 验 8 章落位）⇒ **M3 整轮完成**（真机 nsis 安装验收归发版批／M5）。

#### AI#10 ✅ 手册骨架与落点落仓

- [x] **AI#10** 建 `docs/07-AI操作手册/`（`00-README.md` 索引 + 分章），定「按任务组织」的目录结构（「分屏」「开标签」「读通知」「点通知按钮」…）。｜判据 = 目录结构被用户过目点头（这是「可按任务查」的载体）｜依赖 = 拍板 A-3
- ✅ 2026-09-28 收口（commit `e3d66d70d`）｜落点 = **新顶层 `docs/07-AI操作手册/`**（照 A-3 拍板；分章为的是 M2/M4/M5 各会话各补自己那章、不抢同一文件）＋ 根 `README.md` 文档地图加一行索引腿（**新顶层目录的索引腿，`check-doc-links` 自动扫 `docs/**` 无需登记**）｜本棒先落三章 = `00-README.md`（导航 ＋ 三条判据 ＋ **12 例任务导航表**（逐例给入口与状态：✅现成／⛔＋M2）＋ 日常动作速查 ＋ 软件自述三件 ＋ 维护规则）· `01-操作路径总览.md`（**三层门**：命令面／契约 API／CLI+MCP(M4) ＋ 池壳分工 ＋ **token 占位铁律** ＋ 读→调→读三步 ＋ 结构化 vs 视觉兜底 ＋ 读取面清单 ＋ 验收纪律三条）· `03-按任务操作.md`（十一组配方：标签页／分屏与嵌套／空间问答／通知／面板侧栏／设置主题／文件与对比／串口／插件／人机协作 ＋ 整轮模板）
- ⚠️ **判据里的「用户过目点头」如实报**：A-3 已定**落点形态**（新顶层＋分章），本棒按它落地；**结构的用户过目**随本棒交付一并进行（2026-09-28 用户「你直接做会话3」＝整棒交办，⛔ 未逐章点头）

#### AI#11 ✅ 命令 / API 全索引（建议从实现生成，防漂移）

- [x] **AI#11** 手册的**命令与 API 全索引**。｜🔴 **生成式，不手抄**（[01-设计.md §四 M3](01-设计.md)：命令部分建议从实现生成，防漂移）——数据源 = `AI#7`/`AI#8` 的元数据 ⇒ **建议加一条门禁**：生成物与实现逐字节比对（照 `docs:build` / `docs:check` 既有同款机制）。｜判据 = 新 AI 只读本索引即可列出「能操作什么、怎么操作」｜**依赖 = `AI#7`＋`AI#8`**
- ✅ 2026-09-28 收口（产物 `0ce966c79` ＋ 门禁 `bc38e65e7`）｜落点 = 章 `docs/07-AI操作手册/02-命令与API索引.md`（两段生成区 = `COMMAND-INDEX` / `API-INDEX`）＋ 门禁与生成器 `src/core/commands/aiManualIndex.test.ts` ＋ 刷新腿 `scripts/build-ai-manual.mjs`（`npm run manual:build`）＋ `scripts/lib/contract-parse.d.mts`（让该 TS 规格能复用 `scripts/lib/contract-parse.mjs` 这把既有尺子）
- 📊 **读数**（生成区实测）＝**宿主命令 62 条 / 7 分类**（帮助 5 · 开发者 1 · 文件 2 · 标签页 16 · 视图 22 · 首选项 7 · （未分类）9）＋ **15 域接口 → 46 命名空间 / 249 方法**（⚠️ 可选命名空间 `bridge`/`hotExit` 与 `°` 成员都带脚注）｜列形 = 命令 `| 命令 id | 标题 | 说明 | 参数（调用实参） | when 门控 |`、API `| 命名空间 | 域接口 | 方法数 | 方法 | 一句话 |`
- 🔴 **裁决（三条）**：① **数据源用活注册表、不用源码正则**——`params: [SETTING_KEY_PARAM]`（常量引用）/ 多行 `params:` 数组 / `params: cmd.params`（转发）三处都要求迷你求值器，正则抄会**静默抄错内容**；走 `ensureCoreCommands()` ＋ `getCommands()` 是**构造上精确**。② **门禁腿落在 vitest，不落 `check-*.mjs`**——`import.meta.glob` 让注册表在纯 node/tsx 下不可达（`(intermediate value).glob is not a function`）；故刷新腿写成 spawn vitest ＋ `AI_MANUAL_WRITE=1` 的薄壳，⛔ 别在 package.json 里拼跨壳差异的环境变量语法。③ **逐字节比对前先归一化 EOL**——生成物是 LF、Windows 检出是 CRLF，不归一则干净检出**永久判红**（自测含三条负控：改一字／删标记／空命令表**都必须红**）
- ⚠️ **本门禁不在 `check-gate-health.mjs` 域内**（它只管 `check-*.mjs`；`generate-*`/`audit-*` 用 `--check` 属域外）——该规格**自己写明了这一点**并由负控自证，⛔ 别再去给它补 `--self-test` 接线（会撞域外规则）

#### AI#12 ✅ 手势隐藏规则表（本系列缘起的那两个坑）

- [x] **AI#12** 把「任何文档都没写的隐藏规则」写清。｜**实测已核**=① **拖拽相位门控**：`src/pool/hooks/useDragReorder.ts:196` 的 `Math.abs(dy) > splitThreshold && inEditor`（`splitThreshold` 默认 15，`:98`）＋ `src/pool/hooks/tabDragTypes.ts:29` 的 `SPLIT_THRESHOLD = 0.25` ⇒ **横向拖永远进不了 split 相位**，而「没有玻璃预览」恰是「从未进入 split 相位」的铁证（`src/pool/zones/main/MainZone/DragOverlays.tsx`）；② **CDP 坐标缺陷**：Chromium 给合成鼠标事件的 `screenX` 不加窗口偏移（`src/App/windows/windowRelocation.ts`）⇒ 跨窗判定失效。｜**正解**也写进去：分屏根本不用拖——`window.linkdesk.pool.tabAction({action:"splitTab", direction:"horizontal", zone:"right"})`（`src/core/types/ipc/tabActions.ts:37`，处理端 `src/App/tabCallbacks.ts`）／命令 `core.splitDown` / `core.splitRight`（`src/core/commands/shell/coreCommands.ts:148,159`）。｜判据 = 测试 AI 不会再在场景 6 一类手势上卡壳
- ✅ 2026-09-28 收口（commit `64b961d10`）｜落点 = `docs/07-AI操作手册/04-手势隐藏规则.md`（**口径 = 不是教 AI 拖，是「别走手势，走命令」**）｜**总表 11 行** = 手势 → 隐藏门控（少一个就静默失效）→ 正解命令/API：拖标签分组／拖分屏（`|dy|>15` **且**在编辑器纯区）／**往左拖出左分屏（纯水平拖动永远进不去 split 相位 ⇒ 直觉动作退化成排序）**／跨窗并窗与新窗（`winScreenX = screenX − clientX`，合成事件缺 `screenX` ⇒ 归零 ⇒ 判定全错）／拖分割条／悬停才出现的 `[×]`／双击固定与中键关闭／右键菜单／悬停提示／虚拟列表滚动／拖文件进出
- 🔬 **门控出处表（给维护者）**：拎起阈值 5px（`useDragReorder.ts` `threshold`）· **分屏相位阈值 15px 只看 dy** · 回落 `!inEditor` · 落区四边各 25%（`detectDropZone`，**左右优先于上下**、中心 = 合并）· 窗口屏幕原点推导 · `hitTestTabBar`（命中 TabBar ⇒ 并窗；空白 ⇒ 新窗 `{x: screenX−100, y: screenY−40, w:900, h:600}`）· `MAX_TREE_DEPTH=4`
- ⚠️ 另两节：**`when` 门控 ≠ 权限**（when 只决定菜单里出不出现，**不拦 API 调用**；反之⛔ 别拿 when 猜「现在能不能做」——先读状态）＋ **视觉兜底三条纪律**（先穷尽结构化路径 · 兜底要明确标注 · 即便用 CDP 也**优先调命令**、别派发鼠标事件重演拖拽）

#### AI#13 ✅ 够不着清单 ＋ 安装版操作路径

- [x] **AI#13** A 类「OS 层真够不着」如实列册（移动窗口本身 / OS 拖文件进出 / 系统文件对话框）＋ **安装版操作路径**（带参 CDP 启动 / 静默 `/S` 安装 / `userData` 文件面 / 更新后重连）。｜依据 = [01-设计.md §2.4](01-设计.md)｜判据 = 「什么够不着」有一份**可查的、不吹牛的**清单（边界①防预期落空）
- ✅ 2026-09-28 收口（commit `a7f57503c`）｜落点 = `docs/07-AI操作手册/05-够不着清单与安装版路径.md`｜§一 **A 类五条**（① OS 层窗口几何：`window` 命名空间 11 方法里**没有 `moveTo`/`setBounds`** ⇒ 移窗口到某坐标 = 用户的事 ② OS 拖放跨程序（`getFilePath(File)` 是**接收口**不是发射口）③ 系统文件对话框（唯一门 = `dialog.openFile()`**替你弹**，无人值守改成**路径参数化**）④ 指针依赖手势（指回 AI#12）⑤ 软件之外）＋ **纪律 = 如实说够不着 ＋ 给替代路径，⛔ 不用模拟点击硬凑**
- 📊 §二 **安装版四条读数**：① 启动 = `LinkDesk.exe --remote-debugging-port=9222`（**安装版同样有效**；不传就没调试口）② 静默装 = `linkdesk-setup-{version}.exe /S`（产物名口径 = `electron-builder.yml` 的 `artifactName "${name}-setup-${version}.${ext}"`，⚠️ 是 `${name}` 不是 productName；`/S` = 无 GUI / per-user / 不弹 UAC；装完**不带**调试参数）③ userData 文件面 = 改 `settings.json` 约 **80ms** 生效（不用重启）＋ 插件 zip 丢进 `{userData}/plugins/` 下次启动即装；🔴 **Windows 上 `APPDATA` 无效**（`SHGetKnownFolderPath`）⇒ `--user-data-dir` 是**唯一真隔离** ④ 🔴 **自动更新重启丢 CDP 参数**（`electron/services/update-install.ts` 的 `app.relaunch({args: ['/S','--force-run']})` **显式给全、不继承命令行**）⇒ 那不是软件崩了；无自动恢复通道 = M5 `AI#17`（✅ **第 3 轮已修**：待安装记录携带调试开关、启动最前段复位。本行是当时的调查读数，保留不改——⚠️ 但口径请以第 3 轮为准：「那不是软件崩了」仍成立，**「无自动恢复通道」这句已作废**）
- 📌 §三 给了「遇到新场景怎么判」的三行判据（有命令/API ⇒ 能做 · 只有手势 ⇒ 走替身 · A 类 ⇒ 够不着）——**边界①的防预期落空就靠这一页**

#### AI#14 ✅ CDP 坑表入仓

- [x] **AI#14** 把 CDP 坑表（合成事件 / `el.click()` / SelectBox 三坑等 11+ 条）**从记忆搬进仓内文档**。｜依据 = [01-设计.md §四 M3](01-设计.md)（原只活在记忆 `cdp-ui-automation`）；⚠️ 照 [AGENTS.md](../../../../AGENTS.md) 规矩：**文档里不许引 gitignore 的文件**（换机器＝死链）⇒ 只搬**内容**，不搬指针。｜判据 = 开发期 AI 进场能读到这张表
- ✅ 2026-09-28 收口（commit `0f970da66`）｜落点 = `docs/07-AI操作手册/06-CDP坑表.md`（**§六 指回仓内 [`scripts/dev/README.md`](../../../../scripts/dev/README.md)** —— 入库件、进 git ⇒ 合规；⛔ 全文零处引记忆目录）｜**五组共 24 行**（症状／原因／正解三列）：**§一 连接与实例**（完整 targetId · 壳池两 target 只连一个 · `taskkill`/`unset ELECTRON_RUN_AS_NODE` · **`APPDATA` 假隔离与「隔离目录是空的」判据** · 真 profile 被覆写的**顺序纪律**与 `v3_layout` 定损法）· **§二 触发交互**（🔴 **左键 `Input.dispatchMouseEvent` 不触发 React onClick/onMouseDown**（右键 contextmenu 正常）⇒ `el.click()`／原型 setter + `input` 事件／**SelectBox 三坑**（mousedown→click 顺序 · portal 用全局选择器 · toggle 要 `ensureOpen`）＋ **开菜单与选必须在同一段 evaluate 里** · **`:hover` 用真鼠标**（`forcePseudoState` 对深层既有节点只改 `matches()` 不改计算值）· 零差异先怀疑选择器）· **§三 读界面**（**`?t=` 不是新鲜度判据** ⇒ `performance.timeOrigin` vs 磁盘 mtime、壳池分开判、零可比对判 `no-evidence` · 🔴 **ASI 陷阱** ⇒ 一律 `(function () { return (BODY); })()` · **裸路径 import ≠ 应用实例** ⇒ 从 `performance.getEntriesByType("resource")` 取真实 URL）· **§四 打桩与环境**（contextBridge 冻结 ⇒ 走真实配置 + 事后还原 · **先注入 IO 再改配置** · 后台节流三件解除法 · `_lazyCache` 与 reload 判据 · reload 丢已挂载视图）· **§五 副作用纪律**（真实执行会留痕、测完还原或问用户、别在你正在用的实例上做）
- ⚠️ **口径**：本章是**开发期**（CDP）的坑；面向「用户机器上的 AI」的正门在手册 `00-README.md` 与 01/03 章（结构化优先），CDP 只是**视觉/手势唯一允许的兜底通道**（且优先调命令，别重演手势）

#### AI#15 ✅ 「如何接入」章（对用户 + 对 AI）

- [x] **AI#15** 写接入章：开开关 / 复制 MCP 配置 / CLI 用法；含「软件自述」三件（`linkdeskctl --help` / MCP `tools/list` / 命令说明）。｜依据 = [01-设计.md §四 M4 落点](01-设计.md) 的三路手把手（终端型 AI / 桌面型 AI / 任何 AI）｜依赖 = 软依赖 `AI#34`/`AI#36`（**可先写形态、后回填实测命令**）｜判据 = 零源码环境 AI 照着能接上
- ✅ 2026-09-28 收口（会话 3 第二交付）｜落点 = **新章 [`docs/07-AI操作手册/07-如何接入.md`](../../../../docs/07-AI操作手册/07-如何接入.md)**（八节：① 门锁与钥匙（开关＝门锁默认关／token＝钥匙；与裸 CDP 的本质差别 ＝ **钥匙·名单·账本**）② 完整安全图景（锁门 × 管成员——**插件不受接入开关管**）③ **三路手把手**（终端型／桌面型／任何 AI＝手册随包）④ 软件自述三件 ⑤ **今天就能接（CDP 绕行路）** ⑥ 自检三步 ＋ 不通时对照表 ⑦ **回填清单（4 处）** ⑧ 边界四条）｜**本棒口径 ＝ 形态先写**：章头 🔴 明写「形态已定、功能未发货」＋ 依据指针；M4 未发货处**逐处标 ⛔**（`linkdeskctl --help`／MCP `tools/list` 归 M4，桌面型片段留 `// ⚠️ 形状示意（M4 回填真实片段）` 标记）；**今天真能用**的两件（`app.getProductInfo`／`linkdesk.commands.getCommands()`）与 CDP 绕行路**按实测写**｜同笔：`00-README` 目录表第 07 行**纯文本占位 → 链接**（**销上一棒遗留 ⚠️ 一条**）＋ §四/§五/维护段三处回链 ＋ 手册命令数 62→63（新命令 `app.openAiManual`）｜判据「零源码环境 AI 照着能接上」按**「形态可照做 ＋ 未发货处如实标注」**兑现，M4 落地后照 §七 回填清单换实测（⛔ 本棒不假装已实测）。

#### AI#16 ✅ 手册随包 ＋ 软件内入口接线

- [x] **AI#16** 手册**随安装包发货 ＋ 软件内可打开**（用户点名的硬要求）。｜落点 = `electron-builder.yml:62` 的 `extraResources`（**实测已存在，只需加一条**）＋ Help 菜单入口（⚠️ 与 [../发行后-帮助菜单待补项.md](../发行后-帮助菜单待补项.md)、[../菜单补全.md](../菜单补全.md) **同一张菜单面 ⇒ 可搭车，别拉第二份**）｜判据 = **安装版**里点得到手册、内容是当前版本（不是旧包里的旧版）
- ✅ 2026-09-28 收口（会话 3 第二交付）｜**两半落点**：① **随包** = `electron-builder.yml` `extraResources` 增一条（`docs/07-AI操作手册` → `<resources>/ai-manual`），读取端 = 新 `electron/services/ai-manual.ts`（`app.isPackaged` 二择：**dev 读源码树／打包读 `resources/ai-manual`**；**永不抛**——手册缺席 = `chapters: []` 一态，不是 error 态）；② **软件内入口** = 帮助菜单「AI 操作手册」（`helpLearn` 组、紧挨「快捷键列表」，⛔ **不新拉第二张菜单面**）＋ 命令 `app.openAiManual`（恒显、**离线恒可读**）＋ 池侧壳视图 `ai-manual`（**壳视图模具第三实例**：`useAiManual` 壳取数 ＋ `windowLayout` 逐 tab 推载荷 ＋ `AiManualPoolView` 只画；进 `SHELL_RENDERED_TYPES` 闭集）｜新 IPC **仅一条** `app:getAiManual`（**main 直答、不进 `PROXY_CHANNELS`**；壳内私有面经 `getShellExposed()`，同 `app.getProductInfo`／`update.getReleaseNotes*` 两个前例）｜**契约侧零新语义**：池载荷走 `PoolTab.aiManual`，闸门重生成四件（`contracts/` 两件 · `host-api-surface.json` ＋ `host-css` 两件 · 命名空间矩阵 **171→172 通道**、app 组 4→5）｜i18n：新 UI 串 6 条英文随 **lang-defaults 1.0.28** 发版（跨仓 `Encaron/linkdesk-plugin-lang-defaults`）＋ 官方目录收录（`Encaron/linkdesk-marketplace`）＋ `sync:bundled --latest` 追种子（`bundled-plugins/` 两文件）｜**判据读数**：`npm run check` 全绿 **213 文件 / 2854 tests**；`electron-builder --dir` 后 `E:\linkdesk-build\win-unpacked\resources\ai-manual\` **8 个 `.md` 落位**（含新 `07-如何接入.md`）——⚠️ **真机安装版（nsis）点开验收归发版批**（本棒只走到 unpacked 目录，见交接遗留）。
- 🧪 **第 3 轮补验（2026-09-28 · 会话 4 · 打包态运行时可开）**：本格的真机判据三条在 **`--dir` 产物上跑通**——① 手册版本 == 运行时版本（`0.2.21`）② **8 章俱在且都有内容**（最短 `3686` 字符）③ 手册目录在盘上（`resources/ai-manual`，**纯读盘 ⇒ 离线可开**）；**「软件内点得到」也实测过**：在**池 target** 执行 `linkdesk.commands.executeCommand("app.openAiManual")` ⇒ 池 DOM `1316 → 4710` 字符、页头「随本版本发货 · 内容是当前版本 v0.2.21」。⚠️ **仍欠 nsis 装机那一次**（同版本装不上，见 `AI#19`）＋ ⚠️ **一条口径纠正**：`_executeShellLocal` **不是**这条命令的执行入口（它是**插件壳侧半程** handler 的桥；壳核心命令注册在**壳页** CommandRegistry，壳 preload 无 `executeCommand`）⇒ AI 的正路是**池侧** `executeCommand`（`manualCommands.ts:27` 写的就是这条）。

---

## 第 3 轮 · M5 安装版一致性（`AI#17`–`AI#19`）——小件，可随时插队

> ↔ 调查待拍板 **P1**。[01-设计.md §四 M5](01-设计.md)；详案 = **[03-任务档案/M5-安装版.md](03-任务档案/M5-安装版.md)**。
> **可与第 2 轮并行**（不同文件：本轮动 `electron/`，手册章由第 2 轮写）。**硬前置 = 无。**

#### AI#17 ✅ 更新重启保留调试参数

- [x] **AI#17** 修「**应用内自动更新重启后 CDP 参数丢失**」。｜🔴 **根因实测确认（本会话新证）**=`electron/services/update-install.ts:171-173` 的 `defaultLaunch` 调 `app.relaunch({ execPath: installerPath, args: [SILENT_SWITCH, FORCE_RUN_SWITCH] })`——注释原文「`args` 显式给全，**不继承我们自己的命令行**」⇒ `--remote-debugging-port` **必丢**。修法候选（拍板 A/设计 §四 M5）＝① 保参数（重启后带上原调试参数）② 或提供**设置内的调试端口开关**（更安全、可发现）。｜判据 = 安装版「装 → 更新 → **更新后 AI 仍能操作**」不中断（[01-设计.md §七 第 3 条](01-设计.md) 验收）｜⛔ 这是**唯一必须改行为**的 M5 项，其余两项是文档/设计澄清
- ✅ 2026-09-28 收口（会话 4 · 第 3 轮 M5）｜**四处落点** = ① 新 [`electron/services/debug-switches.ts`](../../../../electron/services/debug-switches.ts)——白名单**只两条**（`remote-debugging-port` · `remote-allow-origins`；⛔ **故意不收 `remote-debugging-address`**：对外监听跨重启复活 = 让一个「用户早忘了的对外调试口」常开，丢了回落回环更保守）＋ 四个出口（`extractDebugSwitches` 读命令行 · `sanitizeDebugSwitches` 落盘形状 · `applyDebugSwitches` 生效 · `planDebugAdoption` 并集裁决）；② **记录携带** = [`update-install.ts`](../../../../electron/services/update-install.ts) 记录增 `debugSwitches?: string[]`（写侧 sanitize、**空则不写**；读侧 `isPendingRecord` 复验是 `string[]`）＋ 新**同步**读 `readPendingInstallSync`；③ **启动复位** = [`main.ts`](../../../../electron/main.ts) 在抢到单实例锁之后、**app ready 之前**读记录并 `applyDebugSwitches`（`appendSwitch` 的时限就在这一线之前）；④ 🔴 **一份真相** = `applyDebugSwitches` 把生效的开关**推回 `process.argv`**——`appendSwitch` **不改** argv，不推的话「当前有哪些调试开关」会有四个消费方各看一份可能过期的盘面（启动复位自身 · 安装腿写记录 · 并集裁决 · 两处既有的 `app.relaunch()`），最典型的后果是**第二次更新时记录又空了、端口二次丢失**
- 📊 **判据读数（打包态 P2 · 全绿）**：造记录 `debugSwitches: ["--remote-debugging-port=9413"]` ＋ 只给 `--updated` 启动（= NSIS `StartApp` 把 App 拉回来的那一跳，`app-builder-lib` 模板里**只给这一个参数**）⇒ **端口 9413 回来了**（记录里的开关在窗口出现之前重新生效）＋ **命令行里查不到 9413**（⇒ 走的是 `appendSwitch`，与「带参启动」不是同一条路）＋ 负控：无记录时 9413 **不通**（默认不监听没被破坏）
- ⚠️ **真机 nsis 的「装 → 更新」整跳仍欠一次**（本机安装版 = 仓内同版本，`build/installer.nsh` 拒绝静默同版安装）⇒ 归发版批，见 `AI#19`

#### AI#18 ✅ 调试端口设置开关 ＋ 单实例锁交互

- [x] **AI#18** 单实例锁与调试端口的交互写清并落地（**二次带参启动路由给旧实例**）。｜依据 = [01-设计.md §四 M5](01-设计.md) ③ 与 §9.3 难点 3（「多窗口 / 单实例锁交互——与 M5 合并处理」）。｜落点 = `electron/services/update-install.ts` 同族 + 单实例锁实现（开工时定位）｜判据 = 二次带参启动不启第二个实例、且参数被旧实例正确处理
- ✅ 2026-09-28 收口（会话 4 · 第 3 轮 M5）｜**两跳**：① **并集裁决** = `second-instance` 拿到二次启动的 argv 后走 `planDebugAdoption`（只增不减／幂等／同名只留一个值／请求里的非开关参数随 `args` 带走）——**不带调试开关的二次启动（双击图标）⛔ 不许掐掉正在服务的端口**（否则一次误双击断 AI 的连接），请求里带**文件路径**也不丢；② 🔴 **换端口这一跳不能立刻重启** = 新 `freePorts` ＋ `waitRestartWindow` ＋ `main.ts` 的 `restartWithDebugSwitches`
- 🔴 **本棒抓到的真缺陷（原实现过不了自己的判据 —— 这是本棒最重要的一条）**：旧实例一收到请求就 `app.relaunch({args: 并集})`，可**第二次启动那个进程自己就绑着请求的新端口**（开关就在它 argv 里，Chromium 在它 init 时就绑上，它随后才因单实例锁 `app.quit()` 退场）⇒ 立刻 relaunch 出来的并集进程 **bind 失败**，而 **CDP 端口绑不上不会重试** ⇒ 得到一个「App 跑着、但没有任何调试口」的实例。**打包态 5/5 复现**（`--dir` 产物连跑五遍：新端口 **0/5** 通；第二次启动进程寿命 777/784/789/794/801ms；活下来的是 relaunch 出来的并集进程）｜**怎么照出来的**：原探针只查「有个进程在服务新端口」⇒ 旧行为**看着是绿的**（假绿的来源 = 探针太弱，只查存在性不查身份与并集）；加固成「**并集标记 + 幸存者身份 + 端口真通**」三条一起查才现形（并集标记 = 只有首启实例带的 `--remote-allow-origins=*`，第二次启动的进程命令行里没有 ⇒ 一眼看出幸存的到底是谁）
- 🔧 **修法**：relaunch 之前先 `waitRestartWindow(plan.freePorts)`——**请求里的那个端口**空闲 **且**过 `settleMs`（**0.9s** = 第二次启动进程实测寿命的上界，避开「它还没退场就重启」引出一次多余的重启接力）才重启；超时 **8s** 照旧重启并出声（⛔ 不把用户晾在这儿）。⚠️ 等的是**请求里的**端口、**不是合并结果里的**——合并结果的端口若来自现状（= 本进程自己绑着的那个）会**死等**（本进程退出前不会释放）
- 📊 **判据读数（打包态 P0/P1/P1b，`accept.mjs` 全绿 25/25）**：第二个进程自己退出（没起第二个实例）· 新端口 **9412 生效**、旧端口 **9411 关闭** · 主进程 = 1 且**换了人**（46044 → 62044）· **幸存者不是二次启动那个进程**（17344 已退场）· **并集标记保住** · 命令行 = 新端口且**无旧端口**（同名只留一个值）· `--user-data-dir` 跟着走（单实例锁的键）· **误双击不重启、不掐端口** · 主进程自述日志：`等待 2167ms（端口 9412，空闲=true）后重启以生效`
- 🧪 **单测**：[`debug-switches.test.ts`](../../../../electron/services/debug-switches.test.ts) **23 格**（新补 `freePorts` 2 格 ＋ `waitRestartWindow` 5 格（假时钟 · 端口先占后空 · **到超时仍被占** · 多端口「都得空」 · 没端口也要走满 settle）＋ `probePortFree` 1 格**真回环连接**）
- 📖 **手册同笔回改**：[`05 章 §2.5`](../../../../docs/07-AI操作手册/05-够不着清单与安装版路径.md)（新端口「大概 1–2 秒才可用」＋ 连不上先探别重敲）· [`07 章 §五`](../../../../docs/07-AI操作手册/07-如何接入.md)
- ⚠️ **「调试端口设置开关」这半格没做、也不该在本轮做**：拍板 ① 选了「保参数」这条修法（不是设置开关）⇒ 设置内的端口开关归 M4 的接入开关面（`AI#39` 一带），本轮 ⛔ 不新拉设置项

#### AI#19 ⏳ 安装版端到端验收（部分验毕 · 两条挂账）

- [ ] **AI#19** 在**真安装版**跑一遍「装 → 更新 → 更新后 AI 仍能操作」。｜🔴 **打包态才见效 ⇒ 必须凑在发版批次里验收**（[04 README §一](../../00-README.md) 攒批例外条款）。｜判据 = [01-设计.md §七 第 3 条](01-设计.md) 全绿｜依赖 = `AI#17`
- ⏳ **2026-09-28 会话 4 读数——本格**不勾**（两条挂账）**：② 「**自动更新重启后 AI 连接不丢**」**已在打包态验毕**（P2：`--updated` 那一跳端口从记录复活、命令行未被动；P1：换端口那一跳并集保住、新端口真通、幸存者身份正确）——但那是 **`--dir` 产物**，**不是真安装版**；①「**CLI/MCP 装一个插件 → 打开它 → 操作它**」**挂 M4（`AI#31`–`AI#44`）之后复验**（本轮无 CLI/MCP 通道，⛔ 别拿 CDP 冒充 M4 的判据）。
- 🔴 **真机 nsis 链路为什么今天走不了**：本机安装版 = 仓内版本 `0.2.21`，[`build/installer.nsh`](../../../../build/installer.nsh) 的 `customInit` **拒绝静默同版/旧版安装**（exit 1602）⇒「装 → 更新」整跳**必须凑在发版批里**（本棒红线：🔴 软件本体不发版）。
- 📋 **留给发版批的验收配方**（照抄即可）：装 `0.2.x` → 应用内更新到 `0.2.y` → 验三条：① 更新后 `--remote-debugging-port` **连得上** ② `app.getVersion()` == **新版本号** ③ 帮助菜单点得到手册、**页头版本 == 新版本号**（⛔ 不是正文里写的旧号）且**断网也能开**。工具 = `%TEMP%\ldk-accept\accept.mjs`（**P2 段就是这条链路的最小复现**：改 `EXE` 指向安装目录、`PORT_*` 避开用户实例即可；⛔ 全程用 `--user-data-dir` 隔离，别碰用户正在跑的那份）。
- 📋 **汇总入口**：本件与 `AI#16` 真机、`AI#19` ①（M4 后）**同属「发版批待验」**⇒ 一处看全 = 本档文末 **「发版批待验清单」** 节（发版前逐件销账，⛔ 别漏）。

---

## 第 4 轮 · M4 接入双通道 MCP + CLI（`AI#31`–`AI#44`）——唯一新机制，spike 先行（✅ A-1 拍板提前）

> ↔ 调查待拍板 **P5**（= 2026-08-25 暂缓的「方向 B · AI 操作桥」重开）。[01-设计.md §四 M4](01-设计.md) ＋ §9.3 三个已知难点；详案 = **[03-任务档案/M4-通道.md](03-任务档案/M4-通道.md)**。
> **一个内核 + 两个皮**：内核 = 白名单语义操作面网关（主进程）；皮 = MCP Server ＋ CLI（`linkdeskctl`）。
> 🔴 **`AI#31` spike 必须最先做**（建议与第 1 轮**并行**，见 [02 §三](02-目录与切片规划.md) 补序建议）——[01-设计.md §9.4](01-设计.md)「最小切片先行：**判据不成立立刻暴露，不等到全做完**」。**⛔ 未过 spike，`AI#32`–`AI#44` 不铺开。**
> 🔴 **立项前必办**（[01-设计.md §四 M4](01-设计.md) ⚠️）：重开当年「**花费巨大、不如 CLI**」那笔账（原讨论未落盘、原话已不可考）。口径处理见 [01-设计.md §四 M4](01-设计.md)：「MCP 协议本身免费开源；『贵』的三个可能来源须逐项厘清——① 实现工程量 ② 工具清单占 AI 上下文 token ③ 常驻依赖」。**结论（已拍板口径）= 两条都做、共用内核、AI 习惯哪个用哪个。**
> ⏳ **本轮另要顺手销两笔 M5 挂账（勿漏）**：① `AI#19` ①（CLI/MCP 装插件→打开→操作）归 **`AI#44`**；② 设置页「调试端口开关」归 **`AI#38.3`**。两条已在各自格内标 ⏳；另有**真机 nsis 待验三件**（跨格汇总 = 本档文末「发版批待验清单」节）。

#### AI#31 ✅ **spike**：CLI 一条命令控制运行中的软件（最小垂直切片）——**2026-09-28 验毕：通**

- [x] **AI#31** 跑通**最小垂直切片**：本地通道选型（命名管道 / 回环 + token）＋ 一条命令真控制运行中实例 ＋ **含冷启动与失败路径**。｜目标 = 一次退掉[01-设计.md §9.3](01-设计.md) 的三个难点：① CLI ↔ 运行中实例的本地通道（Windows 细节）② MCP 冷启动悖论 ③ 多窗口/单实例锁。｜**产出 = 结项判据**：通 ⇒ 铺全；不通 ⇒ **停下改设计**（这正是 spike 的价值）。｜落点 = 临时原型 + 结论回写本格

> ✅ **2026-09-28 会话 5 验毕 ⇒ 裁决 = 「通」（`AI#32`–`AI#44` 按原设计铺开，⛔ 不必改判）**。原型 = [`scripts/dev/m4-spike/`](../../../../scripts/dev/m4-spike/README.md)（**注入式，产品码零改动**，`decouple` 阶段每次跑自证）；**读数原件 = 同夹 `READINGS.txt`（一次完整跑 71 条读，全绿）**。
> **四条判据怎么答的**：① 一条 CLI 命令 → 壳真执行 → **两个独立读面**（本通道读取面 ＋ **绕开本通道的 CDP 读面**）都看到新标签 `ai-manual`；**每次调用先 `ping` 并把应答 pid 与记录 pid 逐字对齐**（M5「谁在服务」教训直接复用）。② 冷启动三段：`tools/list` **立刻应答**（⛔ 不挂死）· `linkdesk_status` **读文件面 ⇒ 离线恒可用** · `WAIT_MS`（默认 **0**）>0 时才真等、等满如实报「等了多久」。③ **「连不上」分六种**（`NO_RECORD`/`SWITCH_OFF`/`LAST_FAILED`/`APP_EXITED`/`REFUSED`/`EAUTH`）＋ `EOP`（表外操作即拒），每种带人读一句 ＋ 下一步；监听失败写 `lastError`（⛔ 不静默）。④ 多实例：第二只自己退出、**记录 pid 未被改写**、第一只照常服务；**负控**（拆掉启动门）证明这条门有用 ⇒ 记录会被污染成 `APP_EXITED` 假红。
> **落地口径（逐格写全 = `README.md §六`）**：启动点 = `whenReady()` ＋ **`hasSingleInstanceLock()`** 双门；与壳的缝**复用既有 `bridge:*` 信封（0 条新 IPC 通道）**；白名单**运行期从命令面派生**（`describe`/`--help` 与真实现不可能漂移）；地址/端口/凭据**全是配置**（「留口子」四问已在 `README §七` 逐条落读数；⚠️ 跨机绑定与对端认证未做 ⇒ `AI#42`）。
> 🔴 **必办（带进 `AI#32`/`AI#33`）**：**缺口① = 未知命令静默成功**（`CommandRegistry.executeCommand` 未注册只 `warn` 后 `return undefined`；handler 抛错同样只返回 undefined）⇒ 网关要么**先查存在性**、要么要求壳侧**回传真结果**，二者至少一件；⚠️ 这是**产品面行为**（影响壳内命令路径与插件），改它要走设计门 ⇒ **`AI#43` 的账本在此之前不能当「成功」凭据**（本棒读数已记：账本把 `no.such.command.xyz` 记成 `ok=true`）。
> ⚠️ **本棒只跑 dev 轨道**（打包态注入不存在，正式件是把代码编译进主进程）；**打包态、真 MCP 客户端对接、多窗口路由、跨机绑定**四条**未验**，均已在 `README §八` 记账。

#### AI#32 ✅ 内核：白名单语义操作面网关——**2026-09-28 会话 6 验毕**

- [x] **AI#32** 建主进程网关（**依赖的 IPC / 命令 / 插件管理全在主进程存在** ⇒ 不新建进程/窗口、不碰渲染层、不搬组件——[01-设计.md §9.2](01-设计.md) 的关键对照）。｜落点 = `electron/services/aiBridge/index.ts`（新建）｜**安全半径 = 给白名单能力，不给任意 JS 权限**（与 `e5.7-extreme-simple-pool` 哲学同源）｜依赖 = `AI#31` 通过

> ✅ **会话 6 验毕**（编译进主进程，⛔ 不靠注入）：`initAiBridge()` 挂 `main.ts` `whenReady` 顶部，**双门**（whenReady ＋ 内核自查 `hasSingleInstanceLock()`，真机读数 ⑱：第二只自己退、记录 pid 未改写）；监听失败写 `lastError`（真机 ⑰：占口 54828 → `EADDRINUSE` 进记录）；与壳的缝 = 复用 `bridge:*` 信封（requestId 前缀 `aibridge-`，**0 条新 IPC 通道**）。**缺口① 两半都修**：壳侧 `CommandRegistry.executeCommandStrict`（严格出口——UI 面零改动，单测 4 条含负控）＋ 网关 `exec` 先查存在性；**真机判读**：spike 时 `exec no.such.command.xyz` exit=0 账本 `ok=true` ⇒ 本棒 **exit=1 `EUNKNOWN`**。**判据反证全过**：表外操作 `EOP`、错凭据 `EAUTH`（真机 ⑫⑬）。**「留口子」**：地址/端口/凭据全是配置（真机 ⑲：`LINKDESK_AIBRIDGE_HOST=127.0.0.2` 型配置即改），代码零「非本机即拒」判断；凭据与地址分家两文件。**开关读取口已留**：settings.json `ai.cli.enabled`/`ai.mcp.enabled` 任一 true ⇒ 开（缺省 = 默认关，AI#38.3/AI#39 照此键落 UI）；env `LINKDESK_AIBRIDGE/_HOST/_PORT` 显式覆盖（dev/测试）。**设计前置 8 维已走**（产品面行为·设计门）：壳能力／API 零新面（契约零改动）／通信复用既有缝／壳侧 feature 目录 `aiBridge/`／插件侧零改动／显示零新增／配置=设置键+env／验收=check+真机负控。单测 11 条（`index.test.ts`）。

#### AI#33 ✅ 白名单账：`linkdesk.*` 语义操作面清单——**2026-09-28 会话 6 验毕**

- [x] **AI#33** 定白名单（**与 M1 读取面 / M2 操作面共账**——同一份能力清单供三处消费：插件内 AI / MCP / CLI）。｜落点 = `electron/services/aiBridge/whitelist.ts`（新建）｜**生长格**（随 M2 审计续号）｜判据 = 任一新能力「挂牌即进名单」，桥不为每个新功能升级（[01-设计.md §八](01-设计.md)「路搭通后，货自己上来」）

> ✅ **会话 6 验毕**：操作表 **9 条**（describe/ping/tabs/openTab/exec/install/notifications/notifyAction/log），每条自带 `help`/`params`，`describe` 从同一张表派生（**清单与真实现不可能漂移**，照 spike §六口径）。**exec 的白名单 = 运行期从命令面派生**：壳 `plugins:call "getCommands"`（E3j #74 既有面，零新通道）每次现取不缓存——**真机读数：命令面 89 条，含 `file-tree.*` 等插件命令，而桥源码零命令 id 硬编码** ⇒ 「装了就在，桥不为新功能升级」成立（`AI#44` 全链再补「装一只新插件→自动出现」整链）。`--help` 在线对账**双向差集 = 空**（读数 ⑧）。错误分类法客户端一份（`cli/linkdeskctl/lib/bridge-client.mjs`，MCP 皮下棒接同一份 ⛔ fork）。

#### AI#34 ✅ CLI 皮：`linkdeskctl` 子命令——**2026-09-28 会话 6 验毕**

- [x] **AI#34** 子命令覆盖：状态查询 / 开标签 / 执行命令 / **装插件（含从 URL）** / 读通知 / 弹通知按钮。｜🔴 **顺序 = CLI 皮先行、MCP 皮随后**（[01-设计.md §四 M4](01-设计.md) 实施顺序：CLI 就是 §9.3 的最小切片）。｜落点 = `cli/linkdeskctl/`（新建）｜**PATH 已现成**（`build/installer.nsh:183`「添加到 PATH」默认勾，E6#45 已落）⇒ **不需要再补安装器 PATH 项**

> ✅ **会话 6 验毕**：落点 `cli/linkdeskctl/`（`linkdeskctl.mjs` ＋ `lib/bridge-client.mjs`，**零第三方依赖**——AI#40 随包的硬前提），10 条子命令真机逐条跑通：`status`（**离线可用**——读记录文件分诊，五态各验：NO_RECORD/SWITCH_OFF/LAST_FAILED/APP_EXITED/在服务，读数 ⑮⑯⑰⑨）· `ping`（认人：应答 pid==记录 pid）· `describe` · `tabs` · `open-tab`（accepted ＋ tabs 回读，读数 ⑳㉑）· `exec` · `install` · `notifications`（读面形状 ✓）· `notify-action`（负控 `ENOTFOUND` ✓；正按需一条**真带命令的通知**，归 `AI#44` 全链）· `log`（先记后判，被拒的也在账上）。**传输 tcp 与 pipe 双真机**（读数 ⑲：`\\.\pipe\linkdesk-ai-<userData 摘要>`）。**「装 = 问一声」未绕**：确认框在软件里弹出（真机 ㉓：CDP 见池页对话框）→ 点取消 ⇒ `installed:false`＋如实理由；点确定 ⇒ `job.success:false`＋**失败原因机读可读**（`找不到插件安装包`）——确认回路、job 回执两条都真。⚠️ 真装成功一整链（真包＋真点确定）归 `AI#44`。userData 候选两名字都试（dev `linkdesk`／打包 `LinkDesk`）。

#### AI#35 ✅ CLI 皮：`--help` 自省 ＋ 机读输出——**2026-09-28 会话 6 验毕**

- [x] **AI#35** `--help` 自省 ＋ `--json` 机读（**CLI 的天然优势 = 零常驻、按需读帮助**）。｜判据 = [01-设计.md §四 M4](01-设计.md)「`--help` / `tools/list` 能**自查操作清单**」——这是零源码环境 AI 的**自举点**（[01-设计.md §八](01-设计.md) 用户场景全流程）

> ✅ **会话 6 验毕**：`--help` 在线 = 静态骨架 ＋ **运行中实例自省**（describe 派生的 9 条操作 ＋ 命令面条数）＋ **双向对账**（静态表 vs 实例，真机读数 ⑧：差集双向空）；离线 = 降级静态骨架 ＋ **如实标注探测失败原因**（真机 ⑮：`NO_RECORD` 也照常可用——自省不依赖实例，冷启动悖论的 CLI 答案）。`--json` 全子命令机读：成功 `{ok, subcommand, op, servedBy, recordPid, result}`、失败 `{ok:false, code, message, hint}`——`code` 与错误分类法一份共用。手册接入章 §七 的回填项 ①（`linkdeskctl --help` 实测输出）已随本棒回填（销 M3 挂账 1/4）。

#### AI#36 ⬜ MCP 皮：stdio server ＋ tools/list ＋ tools/call

- [ ] **AI#36** MCP 皮建在**同一内核**上（形态按拍板 A-2，**建议 stdio**）。｜落点 = `electron/services/aiBridge/mcp.ts`（新建）｜判据 = MCP 客户端**开箱即用**、`tools/list` 列出与白名单一致的工具

#### AI#37 ⬜ MCP 冷启动悖论处理

- [ ] **AI#37** AI 客户端拉起 MCP server 时**软件可能没开** ⇒ 定「等多久 / 怎么唤醒 / 只暴露离线能力」。｜依据 = [01-设计.md §9.3 难点 2](01-设计.md)（**如实列，不假装不存在**）。｜判据 = 软件没开时 MCP 客户端有**明确而可用**的行为，不是静默挂死

#### AI#38 ⬜ 设置页「AI 接入」分区（**已展开为 14 子格**）

- [ ] **AI#38** 落 [mockups/01-设置页-AI接入分区.html](mockups/01-设置页-AI接入分区.html) 的四个分节（**通道 / 接入引导 / 开放范围与安全 / 记录**）。｜🔴 **用户 2026-09-28 要求**：「任务档案要详细，面面俱到，包括 HTML 里显示的设置页面的配置项，都要有任务——**别到时候做完了，打开设置页，发现没有『AI 接入』这个选项**」⇒ **本格拆成下面 14 个子格**，逐项详案 = [03-任务档案/M4-设置页.md](03-任务档案/M4-设置页.md)（含 **25 行「mockup 逐元素 ↔ 格子」覆盖表**）。｜🔴 **实测订正（本会话新证）**：原判定「只读状态 ✅ 能 / 复制类 ❌ 不能」**两行都错**——实为**动作按钮能**（`renderHint:"action"` ＋ `actionCommand`，E5.8#50.26 **已落地**的**通用**控件，先例 `src/App/config/appearance.ts:509-518`）、**只读状态不能**（渲染器无只读控件）⇒ 归 `AI#38.4`/`AI#38.12`；旧「复制类走 CLI 降级」建议**作废**｜⛔ **本格不单独回勾**，按子格逐条勾
- [ ] **AI#38.1** 壳声明骨架 ＋「**AI 接入**」导航项——新建 `src/App/config/aiBridge.ts`（`registerConfiguration("ai-bridge", { title: t("AI 接入"), … })`）。｜⛔ **必须独立 `pluginId`**（挂 `APP_PLUGIN_ID` 会并进「通用」，导航项**永不出现**；先例 `src/App/config/appearance.ts:55-56`）。｜落点 = 新建 `src/App/config/aiBridge.ts` ＋ `src/App/startup.ts:35-36`/`:184-190`｜判据 = 左导航出现「AI 接入」且计数 = 声明键数（mockup 的「4 项」是示意值，见 [M4-设置页.md §三](03-任务档案/M4-设置页.md) P-1）
- [ ] **AI#38.2** 四个分节 ＋ 分区副标题——每键 `group: t("通道")/t("接入引导")/t("开放范围与安全")/t("记录")`。｜⚠️ 副标题（「读」「做」「管外不管内」）今日**无落点** ⇒ 走 `AI#38.12`；不做则按 P-3 **降级在案**｜判据 = 四标题按 mockup 序出现、每键归桶（漏 `group` 的键会**平铺在最上面**）
- [ ] **AI#38.3** 通道三开关 `ai.mcp.enabled` / `ai.cli.enabled` / `ai.debug.remoteDebugging`（`boolean`，默认 **false** = 门锁语义）。｜判据 = 开关真写配置（活读数前后值）；调试端口与 M5 `AI#17`–`AI#19` 同口径｜待拍板 = 调试开关是否进首版
- ⏳ **M5 挂账（2026-09-28 会话 4 交办 · 别漏）**：M5 `AI#18` 本轮**只落了「二次启动并集裁决」那半**——**设置页的「调试端口开关」整格未做**（会话 4 只动 `electron/`，⛔ 不为 M5 加设置项）⇒ **`ai.debug.remoteDebugging` 的声明 / 落盘 / 读取全部归本格**。通道侧已备好（`AI#17`/`AI#18`：`electron/services/debug-switches.ts` 白名单 ＋ 待装记录携带 ＋ ready 前复位 ＋ 把生效开关推回 `process.argv`），**本格只需产出这个值、并把「用户改的端口怎么喂给重启那一跳」接上**
- [ ] **AI#38.4** 通道**状态行**（`运行中 · 127.0.0.1:9333` / `已就绪` / `已关闭` / `未开启`）——🔴 今日渲染器**无只读状态控件** ⇒ 两条路（**P-2 拍板**）：**A** 加通用只读控件（→ `AI#38.12`）/ **B** 降级进 ⚙ 详情对话框（**须在案**）。｜判据 = A 显示**实时**状态且与内核活读数一致（⛔ 不写死字符串）；B 降级在案
- [ ] **AI#38.5** 两个 ⚙ 动作行（`ai.mcp.openDetails` / `ai.cli.openInstall`）——`type:"string"` ＋ `renderHint:"action"` ＋ `actionCommand`，**按钮文案走 `description`**（先例 `src/App/config/appearance.ts:509-518`）。｜判据 = 点击弹出对应说明，内容与 `AI#37`/`AI#40` **同源**（⛔ 不手抄第二份）
- [ ] **AI#38.6** 接入引导三路（`ai.guide.copyCliLine` / `ai.guide.copyMcpConfig` / `ai.guide.openManual`）。｜判据 = ①② 剪贴板内容与 CLI 输出**逐字一致**（② 与 `AI#40` 的 `mcp config` **共用生成器**，⛔ 不 fork 第二把尺）；③ **依赖 M3 `AI#15`**——手册没落地**该按钮不挂**（⛔ 不留点了没反应的按钮）
- [ ] **AI#38.7** 开放范围（`ai.scope`）只读明细——**从白名单唯一真相源生成**（`AI#33`），⛔ 不手抄。｜判据 = 与 `linkdeskctl --help` 白名单**逐条一致**（脚本化对账，差集 = 空）｜形态同 `AI#38.4`（同一处拍板）
- [ ] **AI#38.8** 「查看完整操作清单 →」（`ai.scope.openList`）。｜判据 = 清单条数 = 白名单条数，且每条写清「怎么调」（与 `AI#35` 自省面同源）
- [ ] **AI#38.9** 凭据（`ai.token.regenerate` ＋「仅本机回环」说明）。｜🔴 **token 明文不进设置页**｜判据 = 旧凭据失效、新凭据可用（两步活读数）
- [ ] **AI#38.10** 敏感细分（`ai.sensitive.openManager`）——粒度按 `AI#42`（**拍板 A-8**）。｜判据 = 粒度在案 ＋ 改后行为随之变
- [ ] **AI#38.11** 记录（`ai.auditLog.enabled` 默认 false ＋ `ai.auditLog.open`「查看日志」）。｜判据 = 开关真控日志写入（关 ⇒ 不写）；日志内容 = **真实调用记录**（读取面 `AI#43`）
- [ ] **AI#38.12** 🔴（**跨仓 · 通用能力**）只读状态行控件 ＋ 分节副标题——`settings` 插件新增**通用**能力（`renderHint:"readonly"` / `type:"status"`）。｜⛔ **对一切插件可用，不为本系列开特权**（核心无知原则）｜先走 **`design-flow` 8 维** ＋ **HTML 先行拍板**（硬约束 16 → `ui-ux-pro-max`）｜`settings` 仓**单独 bump** ＋ 官方目录收录（🟢 **已获预授权、随时可发**）｜📌 **它的拍板决定 `AI#38.4` / `AI#38.7` / `AI#38.2` 的形态**（⛔ 不许把它悬空）
- [ ] **AI#38.13** 门禁同笔：`check-config-baseline.mjs` 射程 `app.*` → 含 `ai.*`（`:72` 键正则 ＋ `:92-94` 断言锚 ＋ `:136-220` 自测用例）＋ 把 `src/App/config/aiBridge.ts` 登记进 `TARGETS`（`:40-44`）＋ 每键带 `default:`。｜判据 = 门禁绿 ＋ `--self-test` 含新用例；**反证** = 故意删一条 `default:` ⇒ 必红并点名该文件
- [ ] **AI#38.14** **端到端验收（用户担心那条的逐字反写）**——打开设置页 → 左导航有「AI 接入」→ 四个分节标题齐 → 每一项在且可操作；[M4-设置页.md §一](03-任务档案/M4-设置页.md) 覆盖表**无空行**（机械计数：行数 − 已交代 = **0**）。｜验收 = CDP **非坐标**活读数（`getConfigurationContributions`/`configuration.get`/`commands.executeCommand`）＋ 一张设置页截图

#### AI#39 ⬜ 默认关 ＋ 一键开 ＋ 「关着时连不进来」判据

- [ ] **AI#39** 默认关、设置页一键开；**关着时「本机任何程序都连不进来」**——这是与裸 CDP 的**本质区别**（CDP 是无锁的门）。｜依据 = [01-设计.md §八 授权粒度表](01-设计.md)｜判据 = 「开关 = 门锁、token = 钥匙」可实测（关着时连接被拒；插件**不受此开关管**——它们的开关是「装/启用了它」，核心无知原则）

#### AI#40 ⬜ 安装版随包（CLI + MCP 配置片段）

- [ ] **AI#40** CLI 与手册随安装包发货；提供 MCP 配置片段生成（`linkdeskctl mcp config --for <client>`）。｜落点 = `electron-builder.yml:62` `extraResources`（实测已存在）｜判据 = 用户装完就能敲 `linkdeskctl`（PATH 已默认勾）＋ 一次粘贴配好 MCP（「连一次，永久顺手」，对标手机首次配蓝牙）

#### AI#41 ⬜ 多窗口 / 单实例锁交互（与 M5 合并处理）

- [ ] **AI#41** 与 `AI#18` 同口径处理多窗口与单实例锁下的通道行为。｜依据 = [01-设计.md §9.3 难点 3](01-设计.md)「与 M5 **合并处理**」
- ✅ **M5 已给出的结论（会话 4，2026-09-28——**直接用，⛔ 别重推**）**：① 二次带参启动**不启第二个实例**（单实例锁按 userData 路径生效；`second-instance` 拿到的 argv = **第二次启动的参数**）② 参数裁决是**并集**（新请求的调试开关并入当前生效集，缺谁补谁；⛔ 不是「新盖旧」）③ 🔴 **换端口这一跳必须等「请求的那个端口」空闲且过约 0.9s**——第二进程自己持有该端口，而 Chromium 的 CDP 端口**绑不上不重试** ⇒ 立刻 `relaunch` = 起来一个**没有调试口**的应用（打包态 5/5 复现）。⇒ M4 的通道（命名管道 / 回环）**遇到「第二实例被拒」时，同样是「把参数交给旧实例去处理」这条口径**；落点 = `electron/services/debug-switches.ts`（`planDebugAdoption` / `waitRestartWindow`）＋ `electron/main.ts` 的 `second-instance`

#### AI#42 ⬜ 安全评估同笔 ＋ 敏感能力粒度

- [ ] **AI#42** 立项时与安全信任评估**一并过一遍**（[01-设计.md §四 M4 碰撞栏](01-设计.md)／[00-README.md](00-README.md) §依赖与碰撞「安全评估」）；敏感能力粒度按拍板 A-8。｜判据 = 白名单分级与确认回路经评估在案

#### AI#43 ⬜ 操作日志（正门三件套之「账本」）

- [ ] **AI#43** 落操作日志（**谁在何时调了什么**）＋ 它的读取面。｜依据 = [01-设计.md §八](01-设计.md)：正门有三件 CDP 永远没有的东西——**钥匙（token）· 名单（白名单）· 账本（操作日志）**。｜落点 = `electron/services/aiBridge/log.ts`（新建）＋ `AI#1` 同族的**读取面**（AI 自己也能读账——否则日志只是给人看的）

#### AI#44 ⬜ 全链路判据 ＋ spike 结项报告

- ⏳ **本格顺带销一笔 M5 挂账（2026-09-28 会话 4 交办 · 别漏）**：第 3 轮 `AI#19` 的 **①**「**CLI/MCP 完成『装一个插件 → 打开它 → 操作它』**」**只能在 M4 通道落地后才验**（会话 4 无 CLI/MCP，⛔ 不拿 CDP 冒充 M4 的判据）⇒ **在本格复验**（可与本格全链路实测同一次跑，但**结论分别登记**，别互相顶账）；**复验过 ⇒ 第 3 轮 `AI#19` 才可回勾，M5 才算 3 / 3**
- [ ] **AI#44** 判据 = 「**任一通道可完整走通『开标签 → 执行命令 → 读通知 → 执行通知按钮』全链路**」（[01-设计.md §四 M4](01-设计.md)）。｜产出 = 结项报告（spike 的三个难点逐条给结论）

---

## 第 5 轮 · M2 操作面补齐（`AI#20`–`AI#30`）——开放清单，收口最难（✅ A-1 拍板后排最后）

> ↔ 调查待拍板 **P4**。[01-设计.md §四 M2](01-设计.md)；详案 = **[03-任务档案/M2-操作面.md](03-任务档案/M2-操作面.md)**。
> 判据 = 全软件「**唯一鼠标路径**」清单清零（或每条有命令替代并在手册登记）＋ 浮动面板位置可被 API 设定 ＋ **新插件默认带命令面**。
> ⚠️ **本轮的格数会生长**（`AI#50` 起续号）：审计发现一条「仅鼠标」路径就补一格，**量级是「加一条命令」，不是「推翻架构」**（[01-设计.md §9.4](01-设计.md) 诚实预告）。
> **跨仓提醒**：`AI#23`–`AI#25`、`AI#27` 落在**插件独立仓**（`serial-monitor` / `file-tree` / `settings` / 脚手架包）⇒ 跨仓批次、**发版与目录收录 🟢 已获用户预授权（2026-09-28）：随时可发、不必逐次问**（⚠️ 但仍须一次走到端：发布 → 官方目录收录 → `sync:bundled`）。

#### AI#20 ⬜ 浮动面板：补非鼠标路径（A 类唯一真缺口）

- [ ] **AI#20** 给浮动面板补 API/命令（`panel.setFloatingBounds` 型，或 `revealFloating` 带坐标形参）。｜**现状实测**=`src/pool/floating/floating-panel/FloatingPanelHost.tsx:155-198`——顶部 6px 手柄拖拽 + 底部 8px 手柄调高（`startGesture` 共用，`onPointerDown` 在 266/311 行），拖后几何转**显式 px** 而**零 API 可设**。｜**这是 [01-设计.md §2.3](01-设计.md) A 类里唯一「够不着且无替代」的自家功能。**｜落点 = `FloatingPanelHost.tsx` + 契约面 + 命令｜判据 = 浮动面板的位置/高度可被 API 精确设定（AI 不需要拖）

#### AI#21 ⬜ B 类「存在但未文档化」的通道进契约 ＋ 补用户命令

- [ ] **AI#21** 三条既有替代通道**进契约文档**并补用户命令：`setSidebarWidth`（实测 `src/core/types/ipc/sidebarActions.ts:9` 已在枚举 + 壳侧 `src/hooks/usePoolSync/useSubscriptions.ts:134`）· `panel:resize`（实测 `src/App/bridges.ts:110-127`，**未文档化**）· `updateSplitSizes`（实测契约 `src/core/types/ipc/tabActions.ts:41` + handler `src/App/tabCallbacks.ts:309,433` + 双击复位 `src/pool/zones/main/MainZone/useDividerDrag.ts`）。｜补的命令例「重置面板尺寸」。｜判据 = 这三条在契约文档里查得到 + 有非鼠标路径可调

#### AI#22 ⬜ C 类·壳侧：hover-only 面可发现性 ＋ aria

- [ ] **AI#22** 壳侧 hover 才出现的按钮补可发现性（`aria` + 命令侧引用）。｜依据 = [01-设计.md §2.3](01-设计.md) C 类尾行：**DOM 里在、`el.click()` 可点，属「可发现性」问题**（`SidebarSection.css:127` 等）。｜⚠️ **顺带**：提示面刚在 04「悬停提示系统 HintTip」收编过（`data-hint`，随 v0.2.20）⇒ **先看既有 HintTip 账，别拉第二份**（memory 提示面三套机制的教训：判据物必须覆盖**机制**）。｜判据 = 每个 hover-only 钮都能被**契约读取到它存在**且有命令/键盘替代

#### AI#23 ⬜ C 类·插件侧：serial-monitor（跨仓批次）

- [ ] **AI#23** `serial-monitor` 补命令：快捷发送**编辑/删除**（`serial-monitor:src/views/SerialMonitorView/QuickSendBar.tsx:38,72`，现仅右键）· **关闭串口会话**（`serial-monitor:src/components/SessionListItem.tsx:106-127`，现仅 hover 出现的按钮）· 🔴 **打开端口（选 COM ＋ 波特率 ＋ 帧格式）**（`serial-monitor:src/components/ControlPanel/useControlPanel.ts` 的 `toggleOpen` ＋ `ControlPanel/index.tsx` 的选择器，**现仅鼠标**；⚠️ **API 全在**——`src/core/api/linkdesk-api/data.ts:13,17` 的 `listPorts()` ＋ `openPort({portName, baudRate, dataBits, stopBits, parity, encoding})` ⇒ **只差挂牌**；命令本体要落在**插件自己**，⛔ 别让 AI 绕过插件直调 API，否则侧栏灯/会话列表不动｜**2026-09-28 用户点名后补登**）。｜另：`AI#10` 顺手面的「发送」命令化与编码切换入口（[01-设计.md §十 第 10 例](01-设计.md)：**API 已现成** `linkdesk.serial.sendText(text, enc, portName)`，**编码就是参数**，缺的是命令化）。｜⚠️ 插件源码已外移 ⇒ PATCH ＋ 发布 ＋ **官方目录收录**才是发版（[CLAUDE.md](../../../../CLAUDE.md) 硬约束 24）

#### AI#24 ⬜ C 类·插件侧：file-tree（跨仓批次）

- [ ] **AI#24** `file-tree` 补命令：**搜索结果打开**（`file-tree:src/views/SearchView/SearchResults.tsx:29`，现仅双击）。｜判据 = 该动作有命令路径且进命令索引（`AI#11`）

#### AI#25 ⬜ C 类·插件侧：settings（跨仓批次）

- [ ] **AI#25** `settings` 补命令：**修改快捷键**的入口（`settings:src/views/keybinding-settings/KeybindingSettingsView.tsx:64`，现仅双击行进入编辑）。｜⚠️ **同时是本系列「设置页 AI 接入分区」的宿主仓**（见 [02 §四 B-5](02-目录与切片规划.md)）——**若用户要富 UI，本格一并处理；否则零插件改动**

#### AI#26 ⬜ 插件命令化规范落 `docs/03-插件制造/`

- [ ] **AI#26** 把「**插件把主要业务动作注册为命令**」写进规范 ＋ **作者检查清单**。｜**意义**=这是「**插件自动被 AI 支持**」的最大化路径：按规范做的插件**生来可被 AI 操作**（[01-设计.md §八「为什么注册命令就够了」](01-设计.md)）。｜落点 = `docs/03-插件制造/00-README.md` 同族（新档或并入既有档）＋ 作者面双语树同步（`docs/03-plugin-authoring/`，**双语对齐门禁守**）｜判据 = 规范可查、检查清单可勾

#### AI#27 ⬜ 脚手架默认：新插件自带命令注册样板（作者轴包）

- [ ] **AI#27** 让「**注册**」成为新插件的**默认动作**——脚手架模板自带命令注册样板。｜依据 = [01-设计.md §八](01-设计.md)：「**「不漏」的方式不是「记得做」，而是「忘了会红」**」。｜落点 = `@linkdesk/create-plugin` 脚手架（**作者轴 npm 包**，跨仓/跨包；走 `check:npm-release` ＋ 作者轴五步发版）｜判据 = 新生成的插件模板**默认就有一个可被 AI 调的命令**

#### AI#28 ⬜ 只报不拦尺：有视图声明却零命令

- [ ] **AI#28** 新增只读审计 `scripts/audit-plugin-commands.mjs` ＋ `npm run audit:plugin-commands`：报出「**有视图声明却零命令**」的插件（**能机械查的静态信号**）。｜依据 = [01-设计.md §八 末](01-设计.md)「能机械查的 =『有视图声明却零命令』等静态信号」。｜🔴 **只报不拦**——⛔ **不进 `npm run check` / CI / `ci-verify.mjs`**（存量插件会被拦 ⇒ 会退化成假门禁，照 L11 覆盖尺同款纪律）｜判据 = 实跑出一份可读名单，`--self-test` 自测同批接线

#### AI#29 ⬜ 敏感动作确认面（与既有「装 = 问一声」对齐）

- [ ] **AI#29** 把「AI 能发起、但敏感动作要用户点头」落成一致机制（**装/卸插件 = 问一声**为既有先例）。｜依据 = [01-设计.md §八 追问场景②](01-设计.md)「🔴 安全确认：保留『装 = 问一声』」＋「**AI 友好 ≠ AI 无限制**」。｜判据 = 敏感动作有统一确认回路，且该回路**不是唯一鼠标路径**

#### AI#30 ⬜ 「唯一鼠标路径清零」总验收

- [ ] **AI#30** 全软件扫描 + 手册登记收口：B 类 6 条 + C 类 5 条 + A 类（够不着者如实列册）**逐条对账**。｜判据 = [01-设计.md §七 第 5 条](01-设计.md)「拖动/右键/双击等手势**全部仍在**，只是每一条都**另有非鼠标路径**」｜产出 = 清零表进 [03-任务档案/M2-操作面.md](03-任务档案/M2-操作面.md) ＋ 手册（`AI#11`）同步

---

## 第 6 轮 · 验收与收口（`AI#45`–`AI#49`）

> 依据 = [01-设计.md §七 验收（用户视角）](01-设计.md) 七条 ＋ §十 用户实例对账 12 例 ＋ §八 三条追问场景。
> **硬前置**：`AI#45` 必须等 `AI#1`–`AI#44` 收口（验收对象就是它们）。

#### AI#45 ⬜ §七 验收 1–7 全量跑（非坐标）

- [ ] **AI#45** 逐条真跑：① 分屏一次性做成 ② 铃铛六问零 DOM ③ 安装版 CLI/MCP 装插件→打开→操作、更新重启不丢连接 ④ 新 AI 读手册 10 分钟内列出三问 ⑤ 手势全在且都有非鼠标替代 ⑥ 自然语言日程例逐条对账 ⑦ **验收面自检**。｜判据 = 七条全绿

#### AI#46 ⬜ 用户实例 12 例 ＋ 三条追问场景真跑

- [ ] **AI#46** 跑 §十 的 12 例（含嵌套分屏、空间定位问答、JSON 对比）+ §八 三条追问场景（AI 造主题插件 / 只凭 GitHub 网址装用插件 / **全新电脑从零装软件到多插件组合**）。｜依据 = 「未来验收时逐例真跑——M3 手册里每例都应能查到『怎么做』」（[01-设计.md §十](01-设计.md)）｜判据 = 逐例结论与对账表**一致**（不一致 = 要么设计漏、要么手册漏）

#### AI#47 ⬜ 验收面自检：与物理指针无关

- [ ] **AI#47** 全量验收**以非坐标方式**跑通（命令 / API / CLI；hover-only 面用 CDP **`CSS.forcePseudoState`** 强制伪状态），**期间用户随便动鼠标不构成干扰**。｜依据 = [01-设计.md §三 验收面第 1 条](01-设计.md) ＋ §七 第 7 条｜⚠️ **口径区分**：`el.click()`（DOM 合成点击）与 `forcePseudoState` **不属于**坐标输入——今天的纪律是「**别用真实指针**」，不是「避免一切输入」

#### AI#48 ⬜ 系列收口报告

- [ ] **AI#48** 出收口报告（照 E6 层收口报告定式：成绩表 / 读数前后并排 / 残余与例外 / 给下一棒三句话）。｜**同笔**：① 文档收口——[01-设计.md](01-设计.md) 的 `§九`/`§十` 位置倒置（排在 §四 之前）同笔调到正确次序（见 [02 §四 C](02-目录与切片规划.md)）② 销账——`AI#50+` 生长格结清 ③ CLAUDE.md 头部与 04 README 同笔订正

#### AI#49 ⬜ 持续纪律落地（防破洞重生）

- [ ] **AI#49** 把「**每个用户动作至少一条非鼠标路径**」＋「**业务动作注册为命令**」落成**常驻纪律**（进 [CLAUDE.md](../../../../CLAUDE.md) 硬约束或规范 ＋ 作者面）。｜依据 = [01-设计.md §三 操作质量判据](01-设计.md)：「**且『达标』是持续纪律，不是一次性交付**——此后每个新功能 / 新插件都必须遵守，否则破洞会随迭代重新出现（**本系列缘起正是如此**：一个老功能里的隐藏门控卡住了 AI）」

---

## 发版批待验清单（跨格汇总 · **谁发版谁吃**）

> **用法**：下面三件的判据**只有真 nsis 安装版才见效**，而本轮红线是 🔴「软件本体不发版」⇒ **攒到用户下一次发版时一并验收**（[04 README §一](../../00-README.md) 攒批例外条款）。**发版前**打开本节逐件销账，⛔ 别等到「以为早验过了」。

| # | 归谁 | 判据（照抄） | 为什么今天做不了 |
|:--:|:--|:--|:--|
| 1 | 第 2 轮 `AI#16`（M3 手册随包） | 装完 → **帮助菜单 → AI 操作手册** → ① 页内有内容 ② **页头版本 == `app.getVersion()`（= 新版本号）** ③ **断网也能开** | 会话 3 / 4 只走到 `--dir` 产物（`win-unpacked`）；**真机安装这一步没人做过** |
| 2 | 第 3 轮 `AI#17` ＋ `AI#18` ＋ `AI#19` ② | 装 `0.2.x` → 应用内更新到 `0.2.y` → ① **更新后 `--remote-debugging-port` 连得上** ② `app.getVersion()` == 新版本号 ③ 存活的是**新进程**且命令行带走调试参数 | 本机安装版 = 仓内同版本 `0.2.21`，[`build/installer.nsh`](../../../../build/installer.nsh) 的 `customInit` **拒绝静默同版安装**（exit 1602）⇒「装 → 更新」整跳走不了 |
| 3 | 第 4 轮 `AI#44` → 第 3 轮 `AI#19` ① | 同一次安装，用 **CLI / MCP** 走「**装一个插件 → 打开它 → 操作它**」（⛔ 不拿 CDP 冒充） | 依赖 M4 通道（`AI#31`–`AI#44`）尚未落地 |

**工具与配方**：`%TEMP%\ldk-accept\accept.mjs`（**仓外脚本，不进 git**）——**P2 段就是第 2 件的最小复现**：把 `EXE` 指向安装目录、`PORT_*` 避开用户实例即可；🔴 **全程 `--user-data-dir` 隔离**，⛔ 别碰用户正在跑的那份。逐步配方 = 第 3 轮 `AI#19` 段的 📋 条。

---

## 执行顺序与依赖

```
D0#1–D0#3（系列外 · ✅ **2026-09-28 已收口**，不占 AI 格）
      ↓
第 1 轮 M1 AI#1–AI#9 ────────────────┐（AI#1–#7 相互独立可并行；#7→#8→#9 串行）
      ↓                               │
第 2 轮 M3 AI#10–AI#16 ← 硬前置 AI#7/#8 │  AI#31 spike 可在此并行（退唯一的未知）
      ↕ 可并行（不同文件）              │
第 3 轮 M5 AI#17–AI#19                │
                                      ↓
第 4 轮 M4 AI#31 ✅（2026-09-28 通）→ AI#32–AI#44（可铺开）
                                      ↓
第 5 轮 M2 AI#20–AI#30（开放清单、收口最难 ⇒ 排最后；⚠️ 不依赖第 4 轮，可随时提前）
                                      ↓
第 6 轮 收口 AI#45–AI#49 ← 硬前置：前面全部收口
```

**硬次序（⛔ 不许跳棒）**：

1. `AI#7` → `AI#8` → `AI#9`（字段 → 数据 → 文档，反过来写就是白写）
2. **第 2 轮（M3）必须等 `AI#7`/`AI#8`**——手册命令索引的数据源就是命令元数据
3. **第 4 轮（M4）先于第 5 轮（M2）**——✅ A-1 拍板（M4 不必等 M2 补完：白名单运行期从命令面派生，`AI#33`）
4. `AI#31`（spike）→ `AI#32`–`AI#44`（未过 spike 不铺开）——✅ **2026-09-28 已过（裁决 = 通，71 条读全绿）** ⇒ `AI#32` 起可铺开
5. `AI#39` 默认关的判据要有 `AI#32`＋`AI#34` 才能实测
6. **第 6 轮必须等全部**

**可安全并行**：`AI#31` ∥ 第 1 轮 · 第 2 轮 ∥ 第 3 轮（手册**分章** ⇒ M5 会话自己写「安装版」章，不抢文件）· **第 5 轮（M2）不依赖第 4 轮（M4）** ⇒ 想让「AI 开串口 / AI 写便签」早点见效可把它的插件侧格提前（⛔ 但别与 M4 抢同文件）· 第 5 轮内部壳侧半（`AI#20`–`AI#22`）∥ 插件侧半（`AI#23`–`AI#25`，跨仓）· `AI#1`–`AI#6` 六格互不依赖。

---

## 总结

> **只在这里写数字**（别处不复写）。**当前 = 23 / 62 格已回勾**（另：系列外 `D0#1`–`D0#3` = **3 / 3 ✅ 已收口**）。

| 轮 | 模块 | 格 | 已回勾 | 状态 |
|:--:|:--|:--|:--:|:--|
| — | 系列外 dev 验收前置 | `D0#1`–`D0#3` | **3 / 3** | ✅ 2026-09-28 收口（`f54e59209`；不占系列格） |
| 1 | **M1** 读取面进契约 | `AI#1`–`AI#9` | **9 / 9** | ✅ 2026-09-28 收口（会话 1 六格真机 15/15 读面 ＋ 会话 2 三格元数据）——第 2 轮（M3）硬前置**已解除** |
| 2 | **M3** 文档与手册 | `AI#10`–`AI#16` | **7 / 7** | ✅ **2026-09-28 整轮收口**（会话 3 两交付：第一交付 `AI#10`–`AI#14` 手册七章落仓 `docs/07-AI操作手册/`，02 章生成式 ＋ 漂移门禁；**第二交付 `AI#15` 接入章（形态先写，M4 回填）＋ `AI#16` 手册随包与软件内入口**；`npm run check` 全绿 **213 文件 / 2854 tests**；`electron-builder --dir` 验 `resources/ai-manual/` **8 章落位**） |
| 3 | **M5** 安装版一致性 | `AI#17`–`AI#19` | **2 / 3**（`AI#19` 部分验毕） | ✅ 2026-09-28 会话 4 收口（`AI#17` **更新那一跳端口不丢** ＝ 记录携带 ＋ ready 前复位；`AI#18` **二次带参启动** ＝ 并集裁决 ＋ **重启前等请求端口释放**（抓出并修掉一个打包态 5/5 复现的竞态：立刻重启 ⇒ 并集进程绑不上端口 ⇒「App 跑着但没调试口」）；`AI#19` ⏳ ② 打包态验毕 / ① 挂 M4 / 真机 nsis 整跳挂发版批） |
| 4 | **M4** MCP + CLI 双通道 | `AI#31`–`AI#44`（**含 `AI#38.1`–`AI#38.14` 十四子格**） | **5 / 27** | 🟡 **会话 6 收口（2026-09-28）：内核＋CLI 四格 `AI#32`–`AI#35` ✅**（缺口① 已修＝壳侧严格出口＋网关先查存在性；tcp/pipe 双真机 25 条读；check 全绿 215 文件 / 2902 tests）；余 22 格 ⬜（下一棒 = **MCP 皮 `AI#36`–`AI#37`**，接同一内核） |
| 5 | **M2** 操作面补齐 | `AI#20`–`AI#30` | 0 / 11 | ⬜ 可开工（🌱 会生长；**A-1 改序后排最后**） |
| 6 | 验收与收口 | `AI#45`–`AI#49` | 0 / 5 | ⬜ 可开工 |
| | **合计** | **62 格**（＋3 系列外） | **23 / 62** | ✅ **前置门已过**（2026-09-28 拍板 13 条）· 第 1 轮 M1 整轮 9/9 · **第 2 轮 M3 整轮 7/7（2026-09-28 收口）** · **第 3 轮 M5 `AI#17`/`AI#18` 已收口 2/3（`AI#19` 部分验毕）** · **第 4 轮 M4 spike `AI#31` ＋ 内核/CLI `AI#32`–`AI#35` 已收口 5/27（2026-09-28 会话 5/6）** |

**量级口径**：[01-设计.md §六](01-设计.md) 粗估 **60–80 格**，本单首版 **49 格**——**差额不是漏登记**，是 M2「唯一鼠标路径」与 M4「白名单」两处 🌱 **生长格**（审计发现一条补一格，`AI#50` 起续号）。⚠️ **2026-09-28 用户要求后 49 → 62**：`AI#38`（设置页「AI 接入」分区）按用户原话「HTML 里显示的设置页面的配置项，都要有任务」**展开为 14 个子格**（+13，逐项详案 [03-任务档案/M4-设置页.md](03-任务档案/M4-设置页.md)）——**量级判定不变**：中等偏大 ≈ E6 两到三个轮次，**远小于 E5.7 式推翻重做**；**全加法、零架构赌注**、唯一新机制 = M4（spike 先行）。

**另三件指针**：目录与落点 = [02-目录与切片规划.md](02-目录与切片规划.md) ｜逐格详案 = [03-任务档案/](03-任务档案/) ｜分工与接力 = [04-AI分工与接力方案.md](04-AI分工与接力方案.md) ＋ [交接.md](交接.md)。
