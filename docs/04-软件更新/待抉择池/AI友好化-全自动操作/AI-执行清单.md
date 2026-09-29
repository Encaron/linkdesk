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

#### AI#19 ✅ 安装版端到端验收（**2026-09-28 会话 9 复验 ① ⇒ 3 / 3**）

- [x] **AI#19** 在**真安装版**跑一遍「装 → 更新 → 更新后 AI 仍能操作」。｜🔴 **打包态才见效 ⇒ 必须凑在发版批次里验收**（[04 README §一](../../00-README.md) 攒批例外条款）。｜判据 = [01-设计.md §七 第 3 条](01-设计.md) 全绿｜依赖 = `AI#17`
- ✅ **① 已复验（2026-09-28 会话 9 · 登记在 `AI#44` 格）**：「**CLI/MCP 完成『装一个插件 → 打开它 → 操作它』**」**两条通道各一整链**全绿——真包 `serial-monitor.linkdesk-plugin` ⇒ 真确认门 ⇒ `installed:true job={success:true,pluginId,version:"1.0.24"}` ⇒ `open-tab` ⇒ 命令面 **107 → 123**（16 条挂牌）⇒ `exec serial-monitor.toggleLineNumbers` ⇒ 收尾 `marketplace.uninstall` **卸干净**。⛔ 不是 CDP 冒充：全程走通道（CLI 子进程／`linkdeskctl mcp` stdio 会话），CDP 只当**第二个读面**做证人（池标签条真出现「串口监视器」）。🔴 **诚实口径**：这一遍跑在 **dev 隔离实例**（`--user-data-dir` ＋ Vite）上，不是 nsis 安装版——**安装版里再跑一遍**仍属发版批待验清单第 3 行（本格判据里唯一还挂在批里的那半）。
- ⏳ **2026-09-28 会话 4 读数（保留不改）——当时本格**不勾**（两条挂账）**：② 「**自动更新重启后 AI 连接不丢**」**已在打包态验毕**（P2：`--updated` 那一跳端口从记录复活、命令行未被动；P1：换端口那一跳并集保住、新端口真通、幸存者身份正确）——但那是 **`--dir` 产物**，**不是真安装版**；①「**CLI/MCP 装一个插件 → 打开它 → 操作它**」**挂 M4（`AI#31`–`AI#44`）之后复验**（本轮无 CLI/MCP 通道，⛔ 别拿 CDP 冒充 M4 的判据）。
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

#### AI#36 ✅ MCP 皮：stdio server ＋ tools/list ＋ tools/call——**2026-09-28 会话 7 验毕**

- [x] **AI#36** MCP 皮建在**同一内核**上（形态按拍板 A-2，**建议 stdio**）。｜落点 = `electron/services/aiBridge/mcp.ts`（新建）｜判据 = MCP 客户端**开箱即用**、`tools/list` 列出与白名单一致的工具

> ✅ **会话 7 验毕**。⚠️ **落点订正**：档案写 `electron/services/aiBridge/mcp.ts` ⇒ 实落 **`cli/linkdeskctl/lib/mcp-server.mjs`**、以 **`linkdeskctl mcp`** 子命令起 server——理由三条：① 打包态主进程代码进 `app.asar`，**外部客户端 spawn 不到**；② [07-手册 §3.2](../../../../docs/07-AI操作手册/07-如何接入.md) 已拍板形态就是 `linkdeskctl`＋`args:["mcp"]`；③ 错误分类法/通道发现 import 同一份 `lib/bridge-client.mjs`（⛔ fork 零发生）。零依赖手搓 JSON-RPC（一行一条报文，**stdout 只放协议报文**——冒烟全程零杂质）。**工具清单不手抄**：在线 `tools/list` 用实例 `describe` **运行期派生**（读数 ⑥：`catalogSource=实例自省（白名单 v1，命令面 89 条）`），离线退静态表；10 工具 = 9 内核操作（`linkdesk_` 前缀防跨 server 撞名）＋ `linkdesk_status` 离线件。**判据对账读数 ⑨：在线派生 vs 静态表 双向差集 = 空**；`inputSchema` 抽查（exec 必填 `commandId`/`args` type=array；notifyAction 双必填）与白名单 params 一致。**真调用读数**：`linkdesk_ping`/`linkdesk_exec app.openAiManual` ✅（证人：CLI tabs 见 `ai-manual`）。⚠️ **真 MCP 客户端对接（Claude/VS Code 里挂上）未验**——与 spike 同口径用 stdio 报文直连验了协议三件（`initialize`/`tools/list`/`tools/call`），归 `AI#44`。

#### AI#37 ✅ MCP 冷启动悖论处理——**2026-09-28 会话 7 验毕**

- [x] **AI#37** AI 客户端拉起 MCP server 时**软件可能没开** ⇒ 定「等多久 / 怎么唤醒 / 只暴露离线能力」。｜依据 = [01-设计.md §9.3 难点 2](01-设计.md)（**如实列，不假装不存在**）。｜判据 = 软件没开时 MCP 客户端有**明确而可用**的行为，不是静默挂死

> ✅ **会话 7 验毕（三段答案真机读数）**：① **不挂死**——`initialize` 57ms、`tools/list` 1ms 立刻应答（软件没开也照常）；② **离线能力**——`linkdesk_status` 读**文件面**永远可用（`NO_RECORD` 状态可读，isError=false——它成功回答了「什么状态」）；③ **要等就等得明白**——`LINKDESK_MCP_WAIT_MS`（默认 **0** 有意：MCP 客户端启动常批量试调工具，默认傻等会整段卡住）＝800 实测 **877ms 总耗时、错误文本如实带「已等 818ms——软件没回来」**。④ **软件后开不用重启客户端**（判据「软件后开→无需重启」）——同一 server 进程横跨「没开→后开」：先 isError（等满报），15s 后软件起来，**同一进程** `ping`/`exec` 直接可用（新 pid 读到，读数 ⑪）。🔴 **本棒抓出并修掉一个缺陷**：等门原包在**快照**上——残留记录（pid 已死）在记录面看着「在线」⇒ 没等就报；修法 = 等门包在**调用**上（可等类 `NO_RECORD`/`APP_EXITED`/`REFUSED` 轮询重试，等满如实报）。

#### AI#38 ⬜ 设置页「AI 接入」分区（**已展开为 14 子格**）

- [ ] **AI#38** 落 [mockups/01-设置页-AI接入分区.html](mockups/01-设置页-AI接入分区.html) 的四个分节（**通道 / 接入引导 / 开放范围与安全 / 记录**）。｜🔴 **用户 2026-09-28 要求**：「任务档案要详细，面面俱到，包括 HTML 里显示的设置页面的配置项，都要有任务——**别到时候做完了，打开设置页，发现没有『AI 接入』这个选项**」⇒ **本格拆成下面 14 个子格**，逐项详案 = [03-任务档案/M4-设置页.md](03-任务档案/M4-设置页.md)（含 **25 行「mockup 逐元素 ↔ 格子」覆盖表**）。｜🔴 **落地版 mockup（2026-09-28 重规划，用户拍板「控件尽量基础简单易用」后重画）= [mockups/02-设置页-AI接入分区-落地版.html](mockups/02-设置页-AI接入分区-落地版.html)，实现以它为准**（配置项一项不少 18 键；新造两形 vs 旧组件映射 = 详案 §0.7）｜🔴 **实测订正（本会话新证）**：原判定「只读状态 ✅ 能 / 复制类 ❌ 不能」**两行都错**——实为**动作按钮能**（`renderHint:"action"` ＋ `actionCommand`，E5.8#50.26 **已落地**的**通用**控件，先例 `src/App/config/appearance.ts:509-518`）、**只读状态不能**（渲染器无只读控件）⇒ 归 `AI#38.4`/`AI#38.12`；旧「复制类走 CLI 降级」建议**作废**｜⛔ **本格不单独回勾**，按子格逐条勾
- [x] **AI#38.1** 壳声明骨架 ＋「**AI 接入**」导航项——新建 `src/App/config/aiBridge.ts`（`registerConfiguration("ai-bridge", { title: t("AI 接入"), … })`）。｜⛔ **必须独立 `pluginId`**（挂 `APP_PLUGIN_ID` 会并进「通用」，导航项**永不出现**；先例 `src/App/config/appearance.ts:55-56`）。｜落点 = 新建 `src/App/config/aiBridge.ts` ＋ `src/App/startup.ts:35-36`/`:184-190`｜判据 = 左导航出现「AI 接入」且计数 = 声明键数（mockup 的「4 项」是示意值，见 [M4-设置页.md §三](03-任务档案/M4-设置页.md) P-1）
- [x] **AI#38.2** 四个分节 ＋ 分区副标题——每键 `group: t("通道")/t("接入引导")/t("开放范围与安全")/t("记录")`。｜⚠️ 副标题（「读」「做」「管外不管内」）今日**无落点** ⇒ 走 `AI#38.12`；不做则按 P-3 **降级在案**｜判据 = 四标题按 mockup 序出现、每键归桶（漏 `group` 的键会**平铺在最上面**）
- [x] **AI#38.3** 通道三开关 `ai.mcp.enabled` / `ai.cli.enabled` / `ai.debug.remoteDebugging`（`boolean`，默认 **false** = 门锁语义）。｜判据 = 开关真写配置（活读数前后值）；调试端口与 M5 `AI#17`–`AI#19` 同口径｜待拍板 = 调试开关是否进首版
- ⏳ **M5 挂账（2026-09-28 会话 4 交办 · 别漏）**：M5 `AI#18` 本轮**只落了「二次启动并集裁决」那半**——**设置页的「调试端口开关」整格未做**（会话 4 只动 `electron/`，⛔ 不为 M5 加设置项）⇒ **`ai.debug.remoteDebugging` 的声明 / 落盘 / 读取全部归本格**。通道侧已备好（`AI#17`/`AI#18`：`electron/services/debug-switches.ts` 白名单 ＋ 待装记录携带 ＋ ready 前复位 ＋ 把生效开关推回 `process.argv`），**本格只需产出这个值、并把「用户改的端口怎么喂给重启那一跳」接上**
- [x] **AI#38.4** 通道**状态行**（`运行中 · 127.0.0.1:9333` / `已就绪` / `已关闭` / `未开启`）——🔴 今日渲染器**无只读状态控件** ⇒ 两条路（**P-2 拍板**）：**A** 加通用只读控件（→ `AI#38.12`）/ **B** 降级进 ⚙ 详情对话框（**须在案**）。｜判据 = A 显示**实时**状态且与内核活读数一致（⛔ 不写死字符串）；B 降级在案
- [x] **AI#38.5** 两个 ⚙ 动作行（`ai.mcp.openDetails` / `ai.cli.openInstall`）——`type:"string"` ＋ `renderHint:"action"` ＋ `actionCommand`，**按钮文案走 `description`**（先例 `src/App/config/appearance.ts:509-518`）。｜判据 = 点击弹出对应说明，内容与 `AI#37`/`AI#40` **同源**（⛔ 不手抄第二份）
- [x] **AI#38.6** 接入引导三路（`ai.guide.copyCliLine` / `ai.guide.copyMcpConfig` / `ai.guide.openManual`）。｜判据 = ①② 剪贴板内容与 CLI 输出**逐字一致**（② 与 `AI#40` 的 `mcp config` **共用生成器**，⛔ 不 fork 第二把尺）；③ **依赖 M3 `AI#15`**——手册没落地**该按钮不挂**（⛔ 不留点了没反应的按钮）
- [x] **AI#38.7** 开放范围（`ai.scope`）只读明细——**从白名单唯一真相源生成**（`AI#33`），⛔ 不手抄。｜判据 = 与 `linkdeskctl --help` 白名单**逐条一致**（脚本化对账，差集 = 空）｜形态同 `AI#38.4`（同一处拍板）
- [x] **AI#38.8** 「查看完整操作清单 →」（`ai.scope.openList`）。｜判据 = 清单条数 = 白名单条数，且每条写清「怎么调」（与 `AI#35` 自省面同源）
- [x] **AI#38.9** 凭据（`ai.token.regenerate` ＋「仅本机回环」说明）。｜🔴 **token 明文不进设置页**｜判据 = 旧凭据失效、新凭据可用（两步活读数）
- [x] **AI#38.10** 敏感细分（`ai.sensitive.openManager`）——粒度按 `AI#42`（**拍板 A-8**）。｜判据 = 粒度在案 ＋ 改后行为随之变
- [x] **AI#38.11** 记录（`ai.auditLog.enabled` 默认 false ＋ `ai.auditLog.open`「查看日志」）。｜判据 = 开关真控日志写入（关 ⇒ 不写）；日志内容 = **真实调用记录**（读取面 `AI#43`）
- [x] **AI#38.12** 🔴（**跨仓 · 通用能力**）只读状态行控件 ＋ 分节副标题——🔴 **渲染原语住 `@linkdesk/ui`**（壳统一发包，与 Toggle/SelectBox 同层级，用户 2026-09-28 拍板），`settings` 消费（renderControl 加 case ＋ 引新版 ui 包）；「换设置插件仍能渲染」靠**开放契约**（hint 语义 ＋ `statusCommand` 进作者面 schema/文档）。｜⛔ **对一切插件可用，不为本系列开特权**（核心无知原则）｜先走 **`design-flow` 8 维** ＋ **HTML 先行拍板**（硬约束 16 → `ui-ux-pro-max`）｜📌 **拍板物已定形（2026-09-28）= [落地版 mockup](mockups/02-设置页-AI接入分区-落地版.html)**（用户验证中；两形消费方 = 详案 §0.7：状态行 5 键 ＋ 分节副标题）｜**发版次序**：ui 发 npm（🟢 预授权）先行，settings publish/收录随发版批与壳同班（§0.7）｜📌 **它的拍板决定 `AI#38.4` / `AI#38.7` / `AI#38.2` 的形态**（⛔ 不许把它悬空）
- [x] **AI#38.13** 门禁同笔：`check-config-baseline.mjs` 射程 `app.*` → 含 `ai.*`（`:72` 键正则 ＋ `:92-94` 断言锚 ＋ `:136-220` 自测用例）＋ 把 `src/App/config/aiBridge.ts` 登记进 `TARGETS`（`:40-44`）＋ 每键带 `default:`。｜判据 = 门禁绿 ＋ `--self-test` 含新用例；**反证** = 故意删一条 `default:` ⇒ 必红并点名该文件
- [x] **AI#38.14** **端到端验收（用户担心那条的逐字反写）**——打开设置页 → 左导航有「AI 接入」→ 四个分节标题齐 → 每一项在且可操作；[M4-设置页.md §一](03-任务档案/M4-设置页.md) 覆盖表**无空行**（机械计数：行数 − 已交代 = **0**）。｜验收 = CDP **非坐标**活读数（`getConfigurationContributions`/`configuration.get`/`commands.executeCommand`）＋ 一张设置页截图

> ✅ **会话 8（2026-09-28）收口 `AI#38.1`–`AI#38.14` 十四子格（逐条回勾，父格不单独勾）**——读数：左导航「**AI 接入 18**」（= 声明键数）· 四分节 ＋ 分区 `subtitle`/`groupDescriptions` 齐 · 三开关**真写配置**（`inspectConfiguration` 前后值可对）· 状态行**活读数**（`ai.debug.status` 读作「已开启 · 9333」而配置值是 `false`）· 九条动作**可点且有后果**（复制 → 剪贴板真拿到）· 范围两栏从白名单 `kind` 派生（读 5 / 做 4）· 敏感细分 = A-8 **说明入口** · 日志开关真控盘上写入 · **第三方夹具**（`scripts/dev/fixtures/status-demo/`，非本系列）声明 readonly 行 ＋ 副标题照渲染 ⇒ `AI#38.12` 的通用性有实证 · 门禁反证做过（删一条 `default:` ⇒ 必红点名）。🔴 **实机暴露并修掉一个跨仓缺陷**：`settings` 的 `actionDisabledAll` 未声明时按钮**全被置灰**（空数组 `every` 恒真），已抽纯谓词 ＋ 单测 4 条 ＋ 作者面 schema/文档同笔写清。截图四张存 [03 上](mockups/03-设置页-AI接入分区-实机验收-上.png)/[04 中](mockups/04-设置页-AI接入分区-实机验收-中.png)/[05 下](mockups/05-设置页-AI接入分区-实机验收-下.png)/[06 夹具](mockups/06-状态行夹具-第三方只读行.png)。⏳ **遗留**：`settings` 仓 publish ＋ 官方目录收录 ＋ `sync:bundled` 随发版批一次走到端（代码面已落地）

#### AI#39 ✅ 默认关 ＋ 一键开 ＋ 「关着时连不进来」判据

- [x] **AI#39** 默认关、设置页一键开；**关着时「本机任何程序都连不进来」**——这是与裸 CDP 的**本质区别**（CDP 是无锁的门）。｜依据 = [01-设计.md §八 授权粒度表](01-设计.md)｜判据 = 「开关 = 门锁、token = 钥匙」可实测（关着时连接被拒；插件**不受此开关管**——它们的开关是「装/启用了它」，核心无知原则）

> ✅ **三发实测（隔离实例）**：关着 ⇒ `SWITCH_OFF`（记录仍在，客户端分得清「没装过」与「关着」）／错 token ⇒ `EAUTH`／对 token ⇒ `ping` 通（`servedBy` = 记录 pid）。一键开 = 设置页 `ai.mcp.enabled`｜`ai.cli.enabled`，改完**重启生效**（状态行会说话）。

#### AI#40 ✅ 安装版随包（CLI + MCP 配置片段）

- [x] **AI#40** CLI 与手册随安装包发货；提供 MCP 配置片段生成（`linkdeskctl mcp config --for <client>`）。｜落点 = `electron-builder.yml:62` `extraResources`（实测已存在）｜判据 = 用户装完就能敲 `linkdeskctl`（PATH 已默认勾）＋ 一次粘贴配好 MCP（「连一次，永久顺手」，对标手机首次配蓝牙）

> ✅ **会话 8 收口（代码面齐）**：随包三笔已加——`extraResources` 的 `cli/linkdeskctl` → `<resources>/linkdeskctl`、`docs/07-AI操作手册` → `ai-manual`（M3 `AI#16` 同笔）、`extraFiles` 的 `build/linkdeskctl.cmd` → 安装根（PATH 加的就是 `$INSTDIR`）；`mcp config` 与设置页「复制 MCP 配置」**共用生成器**（`cli/linkdeskctl/lib/mcp-config.mjs`，⛔ 不 fork）。⏳ **真安装版那一次（装完能敲 / 断网可开）打包态才见效 ⇒ 挂发版批**（如实记，⛔ 不在 dev 报绿）。

#### AI#41 ✅ 多窗口 / 单实例锁交互（与 M5 合并处理）

- [x] **AI#41** 与 `AI#18` 同口径处理多窗口与单实例锁下的通道行为。｜依据 = [01-设计.md §9.3 难点 3](01-设计.md)「与 M5 **合并处理**」
- ✅ **M5 已给出的结论（会话 4，2026-09-28——**直接用，⛔ 别重推**）**：① 二次带参启动**不启第二个实例**（单实例锁按 userData 路径生效；`second-instance` 拿到的 argv = **第二次启动的参数**）② 参数裁决是**并集**（新请求的调试开关并入当前生效集，缺谁补谁；⛔ 不是「新盖旧」）③ 🔴 **换端口这一跳必须等「请求的那个端口」空闲且过约 0.9s**——第二进程自己持有该端口，而 Chromium 的 CDP 端口**绑不上不重试** ⇒ 立刻 `relaunch` = 起来一个**没有调试口**的应用（打包态 5/5 复现）。⇒ M4 的通道（命名管道 / 回环）**遇到「第二实例被拒」时，同样是「把参数交给旧实例去处理」这条口径**；落点 = `electron/services/debug-switches.ts`（`planDebugAdoption` / `waitRestartWindow`）＋ `electron/main.ts` 的 `second-instance`
- ✅ **会话 8 实测（两条都留读数）**：**单实例** = 同 userData 再启一次 ⇒ 新进程 `[ai-bridge] pid=73264 未持有单实例锁（抢锁失败的进程）⇒ 不监听、不写记录` 后退出，**参数交给旧实例**（带一个文件夹再启 ⇒ 运行中那只有效多开一只 workspace 窗，`shellWindows` 2→3；记录/端点/pid 全程未变）。**多窗口** = 本轮补齐「目标窗 = 当前聚焦壳窗」（`pickShellWindow`：聚焦优先，死了/无焦点回退注册表首个）——实测两窗双向：聚焦主壳 ⇒ 读主壳池（3 标签）＋ `servedShellWindow="main"`；聚焦 `ws-2` ⇒ 读 `ws-2` 池（1 标签）＋ `"ws-2"`；**写也跟着走**（`ws-2` 聚焦时 `exec core.closeTab` 只动它，主壳三只原样在）。`ping` 新增 `servedShellWindow` ＋ `shellWindows`/`allWindows` 分列；CLI 印出服务窗口；单测 4 条钉规则。⛔ **首版边界**：不支持按名字指名窗口（无 `--window` 形参）。

#### AI#42 ✅ 安全评估同笔 ＋ 敏感能力粒度

- [x] **AI#42** 立项时与安全信任评估**一并过一遍**（[01-设计.md §四 M4 碰撞栏](01-设计.md)／[00-README.md](00-README.md) §依赖与碰撞「安全评估」）；敏感能力粒度按拍板 A-8。｜判据 = 白名单分级与确认回路经评估在案

> ✅ **会话 8 评估在案**：**分级** = 白名单运行期派生（读 5：describe/ping/tabs/notifications/log ｜ 做 4：openTab/exec/install/notifyAction，`kind` 即设置页「开放范围」两栏来源）；**确认回路逐条核过**——装插件有通道路径但**每次弹确认框**（`AI#29` 先例）｜卸插件**通道上没有这个操作**（只有插件侧 API）｜发串口数据**也够不着**（`serial-monitor` 命令面没有「发数据」那条）⇒ 两者属 M2「唯一鼠标路径」审计范围；**粒度 = A-8**（总开关 ＋ 白名单整组），`ai.sensitive.openManager` 是**说明入口**不是逐项设闸；**「留口子」** = 代码零处「非本机即拒」，host/port 全配置。⚠️ 记一条瑕疵在案：`install` 被用户拒绝时账面仍是 `ok:true`（应答里 `installed:false`）——留给账本细化。

#### AI#43 ✅ 操作日志（正门三件套之「账本」）

- [x] **AI#43** 落操作日志（**谁在何时调了什么**）＋ 它的读取面。｜依据 = [01-设计.md §八](01-设计.md)：正门有三件 CDP 永远没有的东西——**钥匙（token）· 名单（白名单）· 账本（操作日志）**。｜落点 = `electron/services/aiBridge/log.ts`（新建）＋ `AI#1` 同族的**读取面**（AI 自己也能读账——否则日志只是给人看的）

> ✅ **会话 8 收口（含落点订正）**：🔴 **没有单独新建 `log.ts`**——账本按内核精简落在 `electron/services/aiBridge/index.ts` 的 `ledgerEntry()`（条目类型在 `whitelist.ts`）。条目 = `{ts, op, arg, ok, code, ms}`（何时 / 调了什么 / 对谁 / 结果；「谁」= 通道调用本身）。实测：错 token 那条**也在账上**（`ok:false, code:"EAUTH"`），成功调用顺序 / 结果 / `ms` 逐条对得上，`linkdeskctl log` 从读取面读回同一批。两档语义 = 内存账恒记（`log` 操作可读）＋ 盘上那份由 `ai.auditLog.enabled` 控制（默认关）。⚠️ 遗留：无「客户端身份」字段（本机单用户模型）；「用户拒绝安装」账面不够刺眼——两条留账本细化。

#### AI#44 ✅ 全链路判据 ＋ spike 结项报告

- [x] **AI#44** 判据 = 「**任一通道可完整走通『开标签 → 执行命令 → 读通知 → 执行通知按钮』全链路**」（[01-设计.md §四 M4](01-设计.md)）。｜产出 = 结项报告（spike 的三个难点逐条给结论）
- ✅ **2026-09-28 收口（会话 9）｜判据「任一通道」⇒ 两条皮各跑一遍，⛔ 没拿 CLI 的绿冒充 MCP**：**CLI 腿 39 / 39 · MCP 腿 41 / 41（各含负控，跳过 0；CLI 腿同配方连跑两遍都全绿）**；**真 MCP 客户端**（Claude Code CLI `2.1.233`，`--strict-mcp-config` 不碰用户配置）挂上真调通（`linkdesk_status` ＋ `ping` ⇒ pid == 记录 pid、appVersion `0.2.21`）；**离线态**（软件没开）`NO_RECORD` ＋ `initialize` +66ms ／ `tools/list` +812ms ／ `status` +1608ms。**结项报告 = [03-任务档案/M4-通道.md](03-任务档案/M4-通道.md) 的「AI#44」段**（成绩表 ／ 读数前后并排 ／ spike 三难点逐条「通了什么·没通什么·怎么绕的」 ／ 残余与例外 ／ 给下一棒三句话）。**工具与读数** = [`scripts/dev/m4-fullchain/`](../../../../scripts/dev/m4-fullchain/README.md)（`accept.mjs` 走产品：真 `linkdeskctl` 子进程 ＋ 真 `linkdeskctl mcp` 常驻 stdio 会话 ＋ CDP 第二读面；`READINGS.txt` = 原件）。**关键读数**：命令面 102 → 107（开市场标签「挂牌即进名单」）→ 123（装串口插件）；**真带 `command` 的活通知**（市场安装失败 `toast-1`「重试」＝`marketplace.retryInstall`）⇒ `notify-action` 正按 ⇒ **又一条新通知 `toast-2`**（双证人）；负控三条 = `EUNKNOWN`（净态）／`ENOTFOUND`×2／`ENOACTION`（真产品 `onClick` 型按钮）。⚠️ **残余四条**（见报告 §四）：**冷启动窗口**（记录已 `listening` 而壳未就绪 ⇒ 首条读/写吃 8s `ESHELLTIMEOUT`；验收器已加就绪门，**产品侧要不要加「首次超时自动重试」= 待用户拍板**）· `notifyAction` 账目 `arg=null`（看不出按的哪条）· 只在 dev 轨道（安装版那一次归发版批）· VS Code／Codex 未验
- ✅ **本格的 M5 挂账已销**（2026-09-28 会话 4 交办）：第 3 轮 **`AI#19` ①**（CLI/MCP 完成「装一个插件 → 打开它 → 操作它」）**本棒复验通过**——**两条腿各一整链**（真包 `serial-monitor.linkdesk-plugin` → 真确认门 → `installed:true` → `open-tab` → 命令面 107→123 → `exec` 操作 → **卸干净**给下一腿留净态）⇒ **`AI#19` 可回勾、M5 3 / 3**；结论登记在第 3 轮那格，⛔ 与本格不互相顶账

---

## 第 5 轮 · M2 操作面补齐（`AI#20`–`AI#30`）——开放清单，收口最难（✅ A-1 拍板后排最后）

> ✅ **本轮 11 格全部验毕**：插件侧 4 格（跨仓三格 ＋ 脚手架包）= `AI#23` / `AI#24` / `AI#25` / `AI#27`（2026-09-28 会话 11）；首轮 6 格（壳侧半 + 规范 + 尺子 + 敏感确认面）= `AI#20` / `AI#21` / `AI#22` / `AI#26` / `AI#28` / `AI#29`（2026-09-28 会话 10）；**总验收 `AI#30`（2026-09-29 会话 12，机械尺 ＋ 人工语义对照两条都用）⇒ M2 11 / 11（累计 56 / 62）**。**生长格 `AI#50` 已登记、⬜ 未做**（B 类④ 侧栏视图排序/拖到图标栏，两处文档登记，归会话 13 开工时先销）。

> ↔ 调查待拍板 **P4**。[01-设计.md §四 M2](01-设计.md)；详案 = **[03-任务档案/M2-操作面.md](03-任务档案/M2-操作面.md)**。
> 判据 = 全软件「**唯一鼠标路径**」清单清零（或每条有命令替代并在手册登记）＋ 浮动面板位置可被 API 设定 ＋ **新插件默认带命令面**。
> ⚠️ **本轮的格数会生长**（`AI#50` 起续号）：审计发现一条「仅鼠标」路径就补一格，**量级是「加一条命令」，不是「推翻架构」**（[01-设计.md §9.4](01-设计.md) 诚实预告）。
> **跨仓提醒**：`AI#23`–`AI#25`、`AI#27` 落在**插件独立仓**（`serial-monitor` / `file-tree` / `settings` / 脚手架包）⇒ 跨仓批次、**发版与目录收录 🟢 已获用户预授权（2026-09-28）：随时可发、不必逐次问**（⚠️ 但仍须一次走到端：发布 → 官方目录收录 → `sync:bundled`）。

#### AI#20 ✅ 浮动面板：补非鼠标路径（A 类唯一真缺口）——**2026-09-28 会话 10 验毕**

- [x] **AI#20** 给浮动面板补 API/命令（`panel.setFloatingBounds` 型，或 `revealFloating` 带坐标形参）。｜**现状实测**=`src/pool/floating/floating-panel/FloatingPanelHost.tsx:155-198`——顶部 6px 手柄拖拽 + 底部 8px 手柄调高（`startGesture` 共用，`onPointerDown` 在 266/311 行），拖后几何转**显式 px** 而**零 API 可设**。｜**这是 [01-设计.md §2.3](01-设计.md) A 类里唯一「够不着且无替代」的自家功能。**｜落点 = `FloatingPanelHost.tsx` + 契约面 + 命令｜判据 = 浮动面板的位置/高度可被 API 精确设定（AI 不需要拖）
- ✅ **2026-09-28 收口（会话 10）｜判据「位置/高度可被 API 精确设定」= 通（读 → 设 → 读回三拍）**：**`design-flow` 8 维先走**（新能力面）；三条壳命令 `workbench.action.setFloatingPanelBounds` / `resetFloatingPanelBounds` / **`getFloatingPanelBounds`**（**读面不虚报**：无面板返 `null`）＋ 插件 API `linkdesk.panel.setFloatingBounds`（**与既有拖拽同一出口** `panel:set-floating-bounds`，⛔ 不开第二条路）。🔴 **限位一份、两处共用**：新抽 `src/pool/floating/floating-panel/floatingBounds.ts`（`clampDragTo` / `clampResizeTo` / **`clampApi`** ＋ `CLAMP_INSET 6` / `MIN_HEIGHT 300` / `RESIZE_MAX_OFFSET 80`）——拖拽与 API 走**同一套钳制**，⛔ 不为「AI 设的」留后门（否则 API 能拖出壳窗边界：给 AI 的路径比给人的更宽 = 反向破口）。单测 = `floatingBounds.test.ts` ＋ `FloatingPanelHost.test.tsx` ＋ `panelCommands.test.ts`（含「无面板不虚报」那条）。

#### AI#21 ✅ B 类「存在但未文档化」的通道进契约 ＋ 补用户命令——**2026-09-28 会话 10 验毕**

- [x] **AI#21** 三条既有替代通道**进契约文档**并补用户命令：`setSidebarWidth`（实测 `src/core/types/ipc/sidebarActions.ts:9` 已在枚举 + 壳侧 `src/hooks/usePoolSync/useSubscriptions.ts:134`）· `panel:resize`（实测 `src/App/bridges.ts:110-127`，**未文档化**）· `updateSplitSizes`（实测契约 `src/core/types/ipc/tabActions.ts:41` + handler `src/App/tabCallbacks.ts:309,433` + 双击复位 `src/pool/zones/main/MainZone/useDividerDrag.ts`）。｜补的命令例「重置面板尺寸」。｜判据 = 这三条在契约文档里查得到 + 有非鼠标路径可调
- ✅ **2026-09-28 收口（会话 10）｜判据两条都落（**只挂牌、零行为改动**）**：① **契约面**——三条通道进 `contracts/linkdesk.d.ts` ＋ 命名空间矩阵 ＋ API 速查表，作者面双语树（`docs/03-plugin-authoring/` ＋ `packages/plugin-docs/`）同笔；② **非鼠标路径**——补四条壳命令 `workbench.action.setSidebarWidth` / `resetSidebarWidth` / `setPanelSize` / `resetPanelSize` ＋ `resetSplitSizes`（池侧双击只治**被点的那条**分栏 ⇒ 命令给的是「一次复位」。⚠️ **轴感知路由逐字同款**：`setPanelSize` 镜像 `src/App/bridges.ts` 的 `offResize`、`setSidebarWidth` 走**同一个** `useSubscriptions` 出口——⛔ 不新写一份轴判断）。单测 = `tabCommands.test.ts` ＋ `panelCommands.test.ts`。

#### AI#22 ✅ C 类·壳侧：hover-only 面可发现性 ＋ aria——**2026-09-28 会话 10 验毕**

- [x] **AI#22** 壳侧 hover 才出现的按钮补可发现性（`aria` + 命令侧引用）。｜依据 = [01-设计.md §2.3](01-设计.md) C 类尾行：**DOM 里在、`el.click()` 可点，属「可发现性」问题**（`SidebarSection.css:127` 等）。｜⚠️ **顺带**：提示面刚在 04「悬停提示系统 HintTip」收编过（`data-hint`，随 v0.2.20）⇒ **先看既有 HintTip 账，别拉第二份**（memory 提示面三套机制的教训：判据物必须覆盖**机制**）。｜判据 = 每个 hover-only 钮都能被**契约读取到它存在**且有命令/键盘替代
- ✅ **2026-09-28 收口（会话 10）｜判据「能被契约读到 + 有键盘替代」= 通**：`SidebarSection.css` 补 **`:focus-within`** 键盘腿（原先只有 `:hover` ⇒ 键盘用户**看不见**那颗钮）＋ `SidebarSection.tsx` 补 `aria-*` 与**共用的 `toggleMore`**（鼠标与键盘走同一条逻辑，⛔ 不写两份开关）；新增 `SidebarSection.test.tsx` **8 条**（含键盘腿正控 ＋ 负控）。⚠️ **提示面照既有 HintTip 账办**（`data-hint`，⛔ 没拉第二份）＋ 手册 [04 章](../../../../docs/07-AI操作手册/04-手势隐藏规则.md) 两处同步；动了 `src/components/shared/**` ⇒ 同笔 `npm run ui:build`。

#### AI#26 ✅ 插件命令化规范落 `docs/03-插件制造/`——**2026-09-28 会话 10 验毕**

- [x] **AI#26** 把「**插件把主要业务动作注册为命令**」写进规范 ＋ **作者检查清单**。｜**意义**=这是「**插件自动被 AI 支持**」的最大化路径：按规范做的插件**生来可被 AI 操作**（[01-设计.md §八「为什么注册命令就够了」](01-设计.md)）。｜落点 = `docs/03-插件制造/00-README.md` 同族（新档或并入既有档）＋ 作者面双语树同步（`docs/03-plugin-authoring/`，**双语对齐门禁守**）｜判据 = 规范可查、检查清单可勾
- ✅ **2026-09-28 收口（会话 10）｜判据「规范可查 + 检查清单可勾」= 通**：新档 `docs/03-插件制造/21-插件命令化规范.md` ＋ 英文镜 `docs/03-plugin-authoring/21-command-ification-spec.md`（**双语对齐门禁守**：`check-author-docs-bilingual.mjs` ＋ `FILENAME_MAP` ＋ 两处 README 索引同笔补行；`packages/plugin-docs/` 产物同笔重生成）；规范含**「什么算业务动作」判据** ＋ 可勾清单（挂钩 `AI#28` 的尺子 = 机械信号）。


#### AI#23 ✅ C 类·插件侧：serial-monitor（跨仓批次）——**2026-09-28 会话 11 验毕**

- [x] **AI#23** `serial-monitor` 补命令：快捷发送**编辑/删除**（`serial-monitor:src/views/SerialMonitorView/QuickSendBar.tsx:38,72`，现仅右键）· **关闭串口会话**（`serial-monitor:src/components/SessionListItem.tsx:106-127`，现仅 hover 出现的按钮）· 🔴 **打开端口（选 COM ＋ 波特率 ＋ 帧格式）**（`serial-monitor:src/components/ControlPanel/useControlPanel.ts` 的 `toggleOpen` ＋ `ControlPanel/index.tsx` 的选择器，**现仅鼠标**；⚠️ **API 全在**——`src/core/api/linkdesk-api/data.ts:13,17` 的 `listPorts()` ＋ `openPort({portName, baudRate, dataBits, stopBits, parity, encoding})` ⇒ **只差挂牌**；命令本体要落在**插件自己**，⛔ 别让 AI 绕过插件直调 API，否则侧栏灯/会话列表不动｜**2026-09-28 用户点名后补登**）。｜另：`AI#10` 顺手面的「发送」命令化与编码切换入口（[01-设计.md §十 第 10 例](01-设计.md)：**API 已现成** `linkdesk.serial.sendText(text, enc, portName)`，**编码就是参数**，缺的是命令化）。｜⚠️ 插件源码已外移 ⇒ PATCH ＋ 发布 ＋ **官方目录收录**才是发版（[CLAUDE.md](../../../../CLAUDE.md) 硬约束 24）
- ✅ **2026-09-28 收口（会话 11）｜判据「有命令路径且进命令索引 · 三处一致非假绿」= 通**：声明 12 → **17 条**（新增 openPort / closePort / closeSession / setSendCoding / send），既有 12 条同笔补 `description`；命令本体走插件自己的写入咽喉（`openPortFromModule` / `closePortFromModule` / 会话写入）⇒ **侧栏灯 ＋ 会话表 ＋ `serial.system` 三处与手点一致**；🔴 **负控钉死「直调 `linkdesk.serial.openPort` 不绿」**（口开了但灯/会话/上下文旗不动 = 绕过插件的假绿，vitest 断言三处全不动）；`send` 挂 `when:"false"` 不进面板、补编码实参；**敏感名单零自挂**（askFirst 仍只 `install` ＋ `update.openUpdateFlow`——AI#29 裁决守住）。真机：装 v1.0.25 → 索引见 17 条（描述全带）→ 无 COM 口 `openPort` 如实回「没有可用串口」（记 ○，语义由 vitest 负控背书）。遗留一条给 `AI#30`：`closeSession` 无参在「装好即打、视图从未开」形态下约 5.8s 才回（账本 `ok:true`，CLI 5s 超时先响 ⇒ 读数 [TIMEOUT]，疑 dialog.confirm 的无人值守结算慢——安全无副作用， latency 与 CLI 超时口径留 AI#30 复核）。

#### AI#24 ✅ C 类·插件侧：file-tree（跨仓批次）——**2026-09-28 会话 11 验毕**

- [x] **AI#24** `file-tree` 补命令：**搜索结果打开**（`file-tree:src/views/SearchView/SearchResults.tsx:29`，现仅双击）。｜判据 = 该动作有命令路径且进命令索引（`AI#11`）
- ✅ **2026-09-28 收口（会话 11）｜判据「有命令路径且进命令索引」= 通**：新增 `file-tree.openSearchResult`——缺省开**当前高亮**那条，可按 `filePath`(+`lineNumber`) 点名；开标签页走与双击**同一个** `openMatch`（⛔ 不另写第二份 `tabs.create`）。目标解析 = 纯逻辑 `searchSession.ts`：视图态的**投影**（`useSearch` effect 记、视图卸载即清空——不给界面上早已不存在的陈旧目标）；注册在**入口顶层**（E6#62e on-command 激活，右键菜单那批仍由 FoldersView 注册——只加不减）。既有 21 条声明同笔补 `description`（含两条「占位未接实现」如实写）。真机：`exec` 空结果态如实回「没有搜索结果——先在搜索面板搜一次…」（负控不碰 `tabs.create` 由 vitest 钉住）。

#### AI#25 ✅ C 类·插件侧：settings（跨仓批次）——**2026-09-28 会话 11 验毕**

- [x] **AI#25** `settings` 补命令：**修改快捷键**的入口（`settings:src/views/keybinding-settings/KeybindingSettingsView.tsx:64`，现仅双击行进入编辑）。｜⚠️ **同时是本系列「设置页 AI 接入分区」的宿主仓**（见 [02 §四 B-5](02-目录与切片规划.md)）——**若用户要富 UI，本格一并处理；否则零插件改动**
- ✅ **2026-09-28 收口（会话 11）｜判据「改键入口有命令路径且进索引 ＋ 宿主仓结论在案」= 通**：新增 `settings.editKeybinding`——带 `command` 直接把那行切进编辑态（双击同一条 `startEdit`+`splitChord`）；不带则弹**命令选择器**（键盘可操作，`detail` 带当前绑定）⇒ 无鼠标也走完全程。两形都先经壳命令 `workbench.action.openKeybindingsSettings` 开页切 tab 预填搜索框。意图送达 = `keybindingEditRequest.ts` **双通道**（照壳 openKeybindings 的 pending+Emitter 先例：视图在场订阅投递 / 不在场存待办挂载领取），**消费即清 ＋ 30s 时效**（过期不生效——用户事后自己开设置页不该有行跳编辑态）。🔴 **边界：只把那行切进编辑态，按键/落地仍是人**（Enter 落地、Esc 取消）——⛔ 无「代按代存」通道（AI#29 口径），读数如实写「编辑态已就绪」非「已改完」。**宿主仓结论（在案）：零插件改动**——AI#38 首版只放壳声明即自动长出的通用项，用户未要富 UI（⛔ 未扩）。真机：`exec settings.editKeybinding {command:"nope.nothing"}` 如实回「没有这条命令…」且不开页面不写意图。

#### AI#27 ✅ 脚手架默认：新插件自带命令注册样板（作者轴包）——**2026-09-28 会话 11 验毕**

- [x] **AI#27** 让「**注册**」成为新插件的**默认动作**——脚手架模板自带命令注册样板。｜依据 = [01-设计.md §八](01-设计.md)：「**「不漏」的方式不是「记得做」，而是「忘了会红」**」。｜落点 = `@linkdesk/create-plugin` 脚手架（**作者轴 npm 包**，跨仓/跨包；走 `check:npm-release` ＋ 作者轴五步发版）｜判据 = 新生成的插件模板**默认就有一个可被 AI 调的命令**
- ✅ **2026-09-28 收口（会话 11）｜判据「默认就有一个可被 AI 调的命令」= 通（端到端）**：模板新增 `src/commands.ts`（`<pluginId>.hello`——带参数、返回结构化读数；入口**顶层**调用注册 = E6#62e 的作者面写法）＋ 主视图一枚按钮走 `executeCommand` 调同一条（教「入口可多处，命令源唯一」）＋ `plugin.json` 声明（title/description/params 单一真相源在声明面，运行时不带 meta——与 AI#23/24/25 四仓同一惯例）；`check-scaffold` 断言 11 负控期望值 4→6（模板新增 2 个前缀类名，期望是显式契约同笔更新）。**发布**：npm `create-linkdesk-plugin@0.1.16`（`--registry` 必带；约 2.5 分钟翻面）；**现场证** = `npm create linkdesk-plugin@latest` 真生成的工程含 `commands.ts` ＋ hello 声明（npx 缓存暗礁的 `@latest` 口径）。⚠️ **`release:mark` 未记基线（整批原子被拒）**：同批 `@linkdesk/contracts`（0.1.23·漂 1 文件）/ `plugin-sdk`（0.1.52·漂 3）/ `plugin-docs`（0.1.37·漂 11——会话 10 AI#26 的文档在案未发）内容漂移 ⇒ 整批拒收；按记忆纪律**⛔ 不 `--allow-drift`**（被拒清单含非 ui 包 = 「该发没发」），**留到那三个包发版的一轮一次记齐**——本包黄灯为 B「bump 了、基线没记」＝设计内排队，不是漏项。

#### AI#28 ✅ 只报不拦尺：有视图声明却零命令——**2026-09-28 会话 10 验毕**

- [x] **AI#28** 新增只读审计 `scripts/audit-plugin-commands.mjs` ＋ `npm run audit:plugin-commands`：报出「**有视图声明却零命令**」的插件（**能机械查的静态信号**）。｜依据 = [01-设计.md §八 末](01-设计.md)「能机械查的 =『有视图声明却零命令』等静态信号」。｜🔴 **只报不拦**——⛔ **不进 `npm run check` / CI / `ci-verify.mjs`**（存量插件会被拦 ⇒ 会退化成假门禁，照 L11 覆盖尺同款纪律）｜判据 = 实跑出一份可读名单，`--self-test` 自测同批接线
- ✅ **2026-09-28 收口（会话 10）｜判据两条都落（**只报不拦**纪律守住：⛔ 没进 `npm run check`）**：① **名单真的跑出来了**——先做**输入盘点**再判（17 只仓：16 只官方 ＋ 1 只住在 `official/` 下的第三方 `geme-tihu-bicycle`），「**空名单也要举证**」照记忆《空转判据 ≠ 零存量》办；② **`--self-test` 13 条**（正控 ①②③④⑤ ＋ 负控 ①②③③b④④b⑤，含「空容器算 0」与「objects/array 两形态都认」）同一批接线。读数（**只报不拦**的样本）：「**有视图零命令**」= `marketplace`（7 视图）/ `settings`（1 视图）；**整批缺 `description`** 三只 = `editor` 2/2 · `file-tree` 21/21 · `serial-monitor` 12/12 ⇒ 前者归 `AI#26` 规范的存量账（⛔ 不追溯第三方），后者是**命令已在但元数据缺**（`AI#11` 索引的输入）。npm script 三条 = `audit:plugin-commands` / `:json` / `:selftest`；仓发现复用 `scripts/lib/plugin-repos.mjs`（**单一真相源**，与 `audit:plugin-tests` 同一份，⛔ 不拉第二份）。

#### AI#29 ✅ 敏感动作确认面（与既有「装 = 问一声」对齐）——**2026-09-28 会话 10 验毕**

- [x] **AI#29** 把「AI 能发起、但敏感动作要用户点头」落成一致机制（**装/卸插件 = 问一声**为既有先例）。｜依据 = [01-设计.md §八 追问场景②](01-设计.md)「🔴 安全确认：保留『装 = 问一声』」＋「**AI 友好 ≠ AI 无限制**」。｜判据 = 敏感动作有统一确认回路，且该回路**不是唯一鼠标路径**
- ✅ **2026-09-28 收口（会话 10）｜判据「统一确认回路 ＋ 不是唯一鼠标路径」= 通（真机 24 / 24 ×2 + 全链路回归 39 / 39）**。🔴 **本格的活眼是「问一声」原先挂在入口而不是动作上**：`install` 有门，而 `exec` / `notifyAction` 能拿到**同一条** `update.openUpdateFlow`（状态 `downloaded`/`ready` 时＝**重启并安装新版本，不可回退**）却**不问**——`exec` 是**零提问的静默出口**。修法 = **一处出口**：`runShellCommand`（`exec` 与 `notifyAction` 共用）＋ `askUser`（`install` 同用），名单 = `ASK_FIRST_COMMANDS` / `ASK_FIRST_OPS`（**新文件 `electron/services/aiBridge/sensitive.ts`**；`coded` 抽到 `errors.ts` 解环）。**三面自述**：`describe.askFirst`（`note` ＋ 名单：`install` / `update.openUpdateFlow`）+ CLI `--help` 活读一节 + MCP 两工具描述 ⇒ **AI 读得到「哪些要问」**。**机器可判的非成功态**：`EUSERDENIED`（+ 客户端 hint「Enter = 同意 / Esc = 取消」「不点就不执行」「授权不缓存」）——**顺手修掉会话 8 那条瑕疵**（拒绝却账面 `ok:true`；`install` 被拒现在上抛 `EUSERDENIED`）。🔴 **客户端预算**：确认等人以**分钟**计而默认超时是**秒**级 ⇒ CLI `asksForUser`/`budgetOf`（名单**从实例自省派生**，⛔ 不手抄）与 MCP `ASKABLE_OPS` 都给 **600s**——否则「客户端报失败、用户随后一点头**动作又真跑了**」（比不问更坏）。**边界三条**：确认面**归用户**（`describe.ops` 9 条里**没有任何应答面**——机械反证；⛔ 这正是「别把安全网拆了」）· 没点头 = **不做且报出来** · 不答 = fail-closed。单测 `sensitive.test.ts` 19 条（含「被拒 ⇒ `commands.execute` **从未被调**」负控）。**真机读数** = [`scripts/dev/m4-fullchain/gate-accept.mjs`](../../../../scripts/dev/m4-fullchain/gate-accept.mjs)（新验收器，读数原件在 READINGS.txt 附段）：门文案统一 · **Esc ⇒ `EUSERDENIED`** / **Enter ⇒ ok**（**CDP 真按键**；窗未聚焦时降级 DOM 合成并如实标 `dom`）· 账本两读面一致（`ok=false code=EUSERDENIED arg=update.openUpdateFlow`）· 名单外不问 · 不存在的命令不问；**同实例 `accept.mjs --channel cli` = 39/39**（「装」那条门与通知按钮腿都没被我这一改碰坏）。⚠️ **名单现只两条**（`install` ＋ `update.openUpdateFlow`；「门要稀，才有人抬头看」）——`uninstall` / 串口发数**仍不在通道上**，归 `AI#30` 的「唯一鼠标路径」审计范围。

#### AI#30 ✅ 「唯一鼠标路径清零」总验收——**2026-09-29 会话 12 验毕**

- [x] **AI#30** 全软件扫描 + 手册登记收口：B 类 6 条 + C 类 5 条 + A 类（够不着者如实列册）**逐条对账**。｜判据 = [01-设计.md §七 第 5 条](01-设计.md)「拖动/右键/双击等手势**全部仍在**，只是每一条都**另有非鼠标路径**」｜产出 = 清零表进 [03-任务档案/M2-操作面.md](03-任务档案/M2-操作面.md) ＋ 手册（`AI#11`）同步
      —— ✅ **2026-09-29 收口（会话 12）｜判据「手势全在 ＋ 每条另有非鼠标路径」= 通（两手都用，零产品码改动）**。**① 机械面实跑**（`npm run audit:plugin-commands`，17 仓全量）：「有视图零命令」= marketplace（7 视图·容器 2）1 只，按 [§三 边界③](01-设计.md)「取决于作者」口径裁决不追溯；「整批缺 description」= **0**（file-tree 22/22 · serial-monitor 17/17 · settings 1/1 全带——会话 11 成果尺子背书）。**② 手册同步**：`npm run manual:build` 实跑绿（3/3，生成区与命令注册表逐字节一致、零改写）——会话 10 新宿主命令已在 02 章；02 章按设计只收宿主命令（插件命令运行时 `getCommands()` 查），插件新命令不经此表**不是缺口**。**③ 语义对账清零表**（证据落 [M2-操作面.md AI#30 段](03-任务档案/M2-操作面.md)）：A 类 5 条 = 4 条列册在案（手册 05 章）＋ **浮动面板 1 条已由 `AI#20` 消**（升出 A 类）；B 类 6 条 = 5 条 ✅ ＋ **1 条 ⚠️ 未消 ⇒ 生长格 `AI#50`**（侧栏视图拖排序/拖到图标栏：池 API `reorder` 变体在但契约未列、无命令、手册无行）；C 类 5 条 = 全 ✅（`AI#22`–`AI#25` 的命令化/可发现性逐条对上）。**④ 三条挂账裁决（全部「维持现状」有据）**：`closeSession` 5.8s **记 ○ 不修**（延迟 = 插件自己的确认门在等人，设计内；`confirm:true` 参数化出口在；无真害）；串口发数**不进敏感名单**（人机同口径＋插件核心常规操作＋硬件侧归作者轴边界③）；`uninstall` **非缺口**（外部 AI 今天够不着卸载 ⇒ 无静默出口可漏；非鼠标路径 = 池 API `pluginManager.uninstall` 手册在载＋人手路径有二次确认）——🔴 **设计约束登记：未来若把卸载开放为 AI op/命令，必须同笔进 `ASK_FIRST_OPS`（谁开通道谁带门）**；`getPendingDialogs` **三面各归其位**（池侧面 = `AI#5` 契约交付物保留；`aiBridge.pendingDialogs` 裁决**不建**——外部 AI 门同步阻塞无需轮询、应答面必须不存在）。**⑤ 残留**：`AI#50`（登记未做，两处文档登记量级，不阻断）。

#### AI#50 ✅ （生长格）侧栏视图拖排序 / 拖到图标栏：契约登记收尾

- [x] **AI#50** 契约把 `sidebarAction` 的 `reorder` 变体（`containerId`/`viewId`/`newIndex`）写进 §pool 伞形行（与 `AI#21` 三条同款收账）＋ 手册 04 章总表加「拖侧栏视图排序 / 拖到图标栏」一行（图标栏 = `view:droppedOnIcon` 事件终点；壳命令化与否执行时判）。｜判据 = 契约查得到变体 ＋ 手册查得到该行（B 类「写进手册＋契约即消」同款）｜详案 = [03-任务档案/M2-操作面.md](03-任务档案/M2-操作面.md) `AI#50` 段｜**归属 = 会话 13 开工时先销（半小时级），再做 `AI#45`–`AI#49`**
      —— ✅ **2026-09-29 销账（`eb894ebc0`，会话 13 开工先销）｜判据「契约查得到变体 ＋ 手册查得到该行」两条都落**：① [01-插件API契约.md §pool 伞形行](../../../03-插件制造/01-插件API契约.md) 第 ④ 条已登记 `sidebarAction({action:"reorder", containerId, viewId, newIndex})`（含「**只有池 API 出口、无宿主命令**：池侧代码可用，外部 AI（CLI/MCP）暂不可达」的**如实边界**）；② 手册 [04-手势隐藏规则](../../../07-AI操作手册/04-手势隐藏规则.md) 总表已加行（排序 = 池 API `reorder`；「收进图标栏」= 事件终点 `view:droppedOnIcon` 暂无语义出口，**近似效果** = 命令 `workbench.action.toggleContainerCollapse {containerId}`）。⇒ M2 B 类 6 条**全消**。

#### AI#51 ✅ （生长格 · 发版基建，三轴通用非 M2 专属）SDK publish 内建「资产版本 == Release 版本」源头断言

- [x] **AI#51** `@linkdesk/plugin-sdk` 的 `publish` 在上传前断言：① 分发件内 `plugin.json.version` == Release 版本；② 资产新鲜（mtime 晚于最近一次源码/manifest 变更，或提供 `--force-build`）。｜**依据（2026-09-29 会话 11 实测立案）**：SDK `publish` **不 build、复用 dist 现成分发件** ⇒ 四仓首发资产全部 stale（settings 包里缺整个 1.0.22 功能），tag 对、包内容错，靠 `sync:bundled` 下游闸才拦下 ⇒ 整批删 release 重发 ≈ 35 分钟；错误活到消费侧才被看见 = 检查点缺位＋错位。｜**判据**：真变异实测——塞 stale dist ＋ 新 manifest ⇒ publish 当场红（秒级，EXIT≠0，报「资产内 plugin.json 版本 X ≠ Release 版本 Y——先 npm run build」）；fresh build ⇒ 绿；单测/`--self-test` 同批接线（照「门禁自测必须接线」纪律）。｜落点 = `packages/plugin-sdk/src/publish.js`（断言本体）｜**发版注意**：本格改 plugin-sdk ⇒ 作者轴五步发版，**顺带清 release:mark 排队**（contracts / plugin-sdk / plugin-docs 三包漂移一次记齐——见记忆《author-axis-npm-release-and-npx-cache》坑④）。｜配套纪律已沉淀 = 全局 skill `release-discipline` ＋ 记忆《release-discipline-three-axes》（2026-09-29 用户拍板「发版是长久的事，纪律只要发版就遵守」）；在该断言落地前，skill 第一.2 条「先 build 再 publish」是唯一防线。｜**归属 = 会话 13**（与 `AI#50` 同批先销，半小时级；发版批联动：plugin-sdk 升版时一并走）
      —— ✅ **2026-09-29 收口（`f74b0c25d`，会话 13）｜判据三条全真**：① **真变异**——塞 stale dist ＋ 新 manifest ⇒ `publish` **当场红**（秒级、`EXIT≠0`，文案「资产内 plugin.json 版本 X ≠ Release 版本 Y——先 npm run build」）② fresh build ⇒ 绿 ③ **6 条单测**同批接线（真变异 stale⇒红 · fresh⇒绿 · JSONC 容忍 · 无候选 null）。落点 = `packages/plugin-sdk/src/publish.js`（`collectPreview` 内、网络触碰之前）＋ `--force-build` 逃逸口；**发布 `SDK publish 资产版本源头断言`** ⇒ 三包同批走作者轴五步（`contracts` 0.1.24 · `plugin-sdk` 0.1.53 · `plugin-docs` 0.1.39——0.1.38 的产物漏了 21 章 §七（`publish` 不重建的实证第 2 例：真源改了必须 `npm run docs:build` 再发），重生成后补发 0.1.39；清 `release:mark` 排队，照记忆《author-axis-npm-release-and-npx-cache》坑④）。配套纪律 = 全局 skill `release-discipline` ＋ 记忆 `release-discipline-three-axes`。

#### AI#52 ✅ （生长格）命令参数形状两面不一致：`params` 具名声明 vs 执行面位置实参

- [x] **AI#52** 执行面（`exec` 透传数组 → handler）按**位置**取参，而命令元数据 `params[].name` 是**具名**的 ⇒ 外部 AI 照具名对象调用会**静默无效**（`ok=true` 但没做事）。｜**证据（2026-09-29 `AI#46` E5b 实跑）**：`executeCommand("workbench.action.togglePanelViewVisibility", undefined, {containerId, viewId})` ⇒ `visible` 恒 `true`（handler 只读 `args[0]/args[1]`、`typeof ≠ string` 直接跳过）；手册 00-README 行 5 原写法即此形态（**已同笔改成平铺两个实参**）。｜**候选修法**：壳侧 `runShellCommand` 兼容「单个对象 → 按 `params[].name` 展开」（一处 ＋ 单测，**牵动所有命令**，故单列一格）｜**判据** = 对象形状与位置形状等价（负控：坏形状仍响亮失败，⛔ 不静默）｜量级 = 中

      —— ✅ **2026-09-29 用户拍板（选择题 · 用户追问「哪个更有利于软件未来发展」后定）＝ 壳侧宽进**：`exec` 收到**单个对象**、且该命令声明了 **≥2 个 `params`** 时，按 `params[].name` **展开成位置实参**；**arity = 1 的命令保持位置语义不动**（单个对象本身可能就是它的合法实参，展开会歧义）。**为什么它最有利于未来**：① 它是唯一**让「声明面」成为唯一真相源**的修法——`params` 的名字从此在执行面**真的可用**，两个面不再各说各话；② ⛔ **不动已发布契约的形状**（不加新字段、无需契约升版），⛔ **不需要外部插件作者配合**（他们早就声明了 `params`）；③ 顺着 AI 的调用直觉（LLM 写参数就是写 JSON 对象）；④ 将来要加 `optional`/`default` 只是 `params` 的自然生长，不必再开一次岔。**配套** = 单测（具名调用 ≡ 位置调用）＋ 三条负控（arity=1 不展开 · 未声明 `params` 不展开 · 键名不匹配不展开）；21 章规范与手册同笔写「`params` 的名字在 `exec` 上可用」。｜量级维持 **中**。
      —— ✅ **2026-09-29 收口（`26d127d9f`，会话 16）｜判据三条全真 ＋ 五条负控**：① **等价**——`executeCommandStrict(id, undefined, {containerId, viewId})` ≡ 位置平铺（端到端跑真注册表）；② **窄口四边界**逐条有测：`args` 恰好 1 个 · 是**普通对象**（数组/字符串/`null` 都不展开）· 该命令**声明了 ≥2 个 `params`**（arity=1 保持位置语义，`toggleViewVisibility({viewId})` 即此形）· 键名**至少命中一个**（全不匹配 = 调用方自己的载荷对象，原样放行）；③ **UI 面零改动**（`executeCommand` 非严格路径不展开——面板/菜单/快捷键行为一字不动）。**变异实测有牙**：撤掉 arity≥2 守卫 / 撤掉键名命中守卫 / 在 UI 面上展开——三处各红**恰好一条**对应测试（还原后全绿）。**落点** = [`CommandRegistry.ts`](../../../../src/core/registry/commands/CommandRegistry.ts) 的 `expandNamedArgs()`（纯函数，头注写全四边界）＋ `runCommand()` 的 `strict` 分支一处；**单测** = [`namedArgs.test.ts`](../../../../src/core/registry/commands/namedArgs.test.ts) 11 条。**五处读者面同笔对齐**（`params` 的名字从此真的可用）：21 章 §3 与 §七 坑 2（改「已修」＋ 窄口）· 手册 [02 §一 · 2](../../../07-AI操作手册/02-命令与API索引.md)（两种写法等价 ＋ 单参数不展开）· 手册 00 章例 5 与 03 章例 5（原「⛔ 不是一个对象」不再与新行为矛盾）· 壳侧 `exec` 帮助 ＋ CLI/MCP 皮的同一句话。`npm run check` 全绿（221 文件 / 3035 tests）。

#### AI#53 ⬜ （生长格）分屏比例精确设只有池 API（无宿主命令）

- [ ] **AI#53** `pool.tabAction({action:"updateSplitSizes", anchorGroupId, sizes})` 是**池侧**通道；宿主/命令面只有 `workbench.action.resetSplitSizes`（**所有**分支回 50/50）⇒ 外部 AI（CLI/MCP）够不着「把某块拉宽到 70%」。｜**证据**：`AI#46` E11 ○ / E12 ③ ○ 实跑（树可读、位置可问答，**精确比例不可设**）｜**候选修法** = 补宿主命令 `workbench.action.setSplitSizes`（薄命令转发池通道，照 `togglePanelViewVisibility` 同款）｜**判据** = CLI/MCP 能把某分支设成 [70,30] 并回读一致｜量级 = 小

#### AI#54 ✅ （生长格）命令注册时机 = 视图挂载时 ⇒ 未挂载则命令面缺席

- [x] **AI#54** 部分插件（如 `file-tree` 的 `selectForCompare`/`compareWithSelected`）在**视图组件挂载时**才注册命令 ⇒ 未挂载时外部 AI 在 `getCommands()` 里**看不到**、调了报 `EUNKNOWN`。｜**证据**：`AI#46` E8 实跑（先 `open-tab file-tree` 才挂牌）＋ 手册 [03 · 例 8](../../../07-AI操作手册/03-按任务操作.md) 前置注｜**候选修法** = 插件把命令注册提前到 activate（插件侧为主）；或壳在 `open-tab` 后重扫命令面并推给通道｜**判据** = 未开视图时 `getCommands()` 也能读到该插件命令清单（可发现性）｜量级 = 小–中
      —— 🔁 **2026-09-29 重估（外部 AI 黑盒实测回收 · 量级 小–中 → 中）**：**独立证据**——一台在 STM32 工作区、零源码、只拿「随包手册 ＋ 一行 MCP 配置」的外部 AI 自己撞上了：`open-tab serial-monitor` **之前**命令面 **142** 条，**之后** **145** 条（新挂牌的三条正是 `toggleSystemLog`/`toggleAutoRepeat`/`toggleAutoClear`）。**根因（我核到的，把它从「某插件手滑」提到「系统性」）**：serial-monitor 的命令就注册在两个 **React 视图 hook** 里（外部仓 `serial-monitor:src/views/SerialMonitorView/useViewCommands.ts` 与 `useToggleCommands.ts`）⇒ 凡「视图态命令」都是这个形状，**每个插件都要让 AI 重踩一次**（先开视图 → 再 `describe` → 才 `exec`），未挂载时 `getCommands()` 里根本看不到 ⇒ 可发现性与可操作性同时受损。**⛔ 不是「插件写错了」**——`unregisterCommands(pluginId)` 的粗粒度摘除是**有意为之**（视图没了，视图态命令就该没；`serial-monitor:src/services/serialCommands.ts` 有注）。⇒ **这条的修法自带一个裁决**：改插件把注册提前到 activate 会与「视图态命令只该在视图在时存在」的既有主张冲突；改壳在 `open-tab` 后重扫并推送则不动插件语义——**别当成「加一行注册」的小改**。

      —— ✅ **2026-09-29 用户拍板（选择题）＝ 壳侧兜底**：**`open-tab` / `openTab` 打开视图后，壳重扫命令面并更新运行期派生表**（让 `describe`/`getCommands()` 立刻看得到新挂牌的命令）——**插件一行不改**，所有插件（含外部）当场受益，且**不动**「视图态命令只该在视图在时存在」的既有裁决。**同笔在 [21-插件命令化规范.md](../../../03-插件制造/21-插件命令化规范.md) 补一句**「视图态命令请声明注册时机」（说明性，⛔ 不强制改插件）。⛔ 未选「插件侧把注册提前到 `activate()`」——那要所有插件改（含外部）、且与既有主张冲突。｜判据追加 = 未开视图时 `describe` 已能看到该插件命令清单，`open-tab` 之后**同一份清单**能直接 `exec`（⛔ 不需要 AI 自己「先开再发现」）。

      —— ✅ **2026-09-29 收口（`3b36e2c84`，会话 16）｜拍板的两半**都**落地（⛔ 不是二选一：判据的前后两句各要一半，合起来 = 可发现 ＋ 不竞态）**：
      ① **声明面可发现**——新 [`commandSurface.ts`](../../../../electron/services/aiBridge/commandSurface.ts) 的 `pickPendingCommands()`：从 `plugins:call "list"` 的 manifest 子集取 `contributes.commands`（**声明面**），与现取的 `getCommands()`（**执行面**）求差集 ⇒ `describe.commandsPending`，每条带 `needs` = `先 open-tab <pluginId>` ⇒ **判据前半「未开视图时 `describe` 已能看到该插件命令清单」直接满足**（AI 不必「先撞 error 再猜」）。⚠️ 它是**能规划、不能执行**：`exec` 仍只认注册面；撞到这类 id 时给的是**带指引的** `EUNKNOWN`（正文含插件 id ＋ 那一步），⛔ 不是干巴巴一句「不在命令面」。
      ② **挂载后不留空窗**——`settleCommandSurface()`：`tabs:create` 是 fire 型（池侧挂载 ⇒ 插件注册 ⇒ `commands:register` 回传是**随后**的异步链）⇒ 开完标签**等命令面落定**（连续 `quietMs` 250ms 无变化；`capMs` 上限 **2000ms**，⛔ 撑不破 MCP 侧 5 秒预算）再返回，并把**本次新挂牌的 id** 经 `openTab.added` 一并交回 ⇒ 判据后半「`open-tab` 之后同一份清单能直接 `exec`」不靠运气。到点**如实**回 `commandsSettled:false`——⛔ 不抛错、⛔ 不把「没等到」说成失败（标签确实开了）。
      ③ **零新 IPC 通道、零契约改动、零插件改动**（两个面都是既有读取面）。
      ④ **单测 19 条**（[`commandSurface.test.ts`](../../../../electron/services/aiBridge/commandSurface.test.ts)）：差集正负控（已注册跳过 · 坏条目不崩 · 同 id 去重 · 输出有序）· 上限三条（到点 `settled:false`／**假钟注入 ⇒ 零真实等待**／剩余预算不足时不**多睡一轮**撑破 cap）· 桥级三处接线（`describe.commandsPending` 与执行面分开 · 撞 EUNKNOWN 时 `seen` 里**没有** `commands:execute`（⛔ 不碰执行面）· `openTab.added` 真把晚注册的那条带回来）。
      ⑤ **读者面六处同笔**：手册 [01](../../../07-AI操作手册/01-操作路径总览.md)（`getCommands()` 那条注视图态命令）· [02 §一](../../../07-AI操作手册/02-命令与API索引.md) · [03 例 8](../../../07-AI操作手册/03-按任务操作.md) · [00-README 例 8 行](../../../07-AI操作手册/00-README.md) ＋ **作者面 [21 章](../../../03-插件制造/21-插件命令化规范.md) §二 ＋ §五 检查清单**（「视图态命令照样要写进 `contributes.commands`——声明面是壳侧唯一的可发现性来源」，说明性、⛔ 不强制改插件；同笔 `npm run docs:build` 重生成 plugin-docs 49 文件）。`npm run check` 全绿（**222 文件 / 3054 tests**）。
      ⚠️ **遗留一条：真机读数未做**（上面 ①–⑤ 都是**单测/桥级**面；真壳 ＋ 真插件下「`open-tab serial-monitor` 后 `added` 里出现那三条 ＋ 开之前 `commandsPending` 就有它们」尚未跑）。**独立现象级证据已有**：`AI#46` E8 量到 `open-tab serial-monitor` 前后命令面 **142 → 145**（同一条病）。**配方**（照 [scripts/dev/m4-fullchain/README.md](../../../../scripts/dev/m4-fullchain/README.md) §一 起隔离实例）：开 `ai.cli.enabled` ⇒ `linkdeskctl describe --json` 看 `commandsPending` 非空 ⇒ `linkdeskctl open-tab serial-monitor --json` 看 `added` 含 `toggleSystemLog`/`toggleAutoRepeat`/`toggleAutoClear` ⇒ 紧接着 `exec` 同三条应成功（⛔ 全程 `--user-data-dir` 隔离，别碰用户实例）。

#### AI#55 ⬜ （生长格 · **既存隐患**，非本系列引入）单标签组朝自己 split = 静默 no-op

- [ ] **AI#55** `splitTab` 的源组只有 1 个标签、且 `targetGroupId` 指向**自己**时：源组变空 → 先摘叶 → 再 `replaceLeafWithBranch(目标=刚摘掉的叶)` 找不到目标 ⇒ `return prev`（**`ok=true`、树与 sizes 一字不变、无报错**）；朝**别组**分则是另一种（源叶被摘、标签以兄弟叶并入别组——**层级不增、反而挪窝**）。｜**证据**：`AI#46` E11s 实跑 ＋ [reducers-layout.ts](../../../../src/hooks/useTabManager/reducers-layout.ts) `reduceSplitTabAt`；⚠️ **鼠标拖拽同款载荷**（[useTabDrag.ts `onDropSplit`](../../../../src/pool/zones/main/MainZone/useTabDrag.ts) 传 `targetGroupId=落点组`）⇒ 既存隐患｜**候选修法** = reducer 里「目标 == 源组」时跳过摘叶、原地建 branch（一处 ＋ 单测）｜**判据** = 单标签组自 split 后组数 +1 且标签仍在原组｜量级 = 小
      —— 🔁 **2026-09-29 重估（外部 AI 黑盒实测回收 · 量级 小 → 中）**：**独立复现**——同一个外部 AI 自己搭 4 层分屏树时撞上：被切那格只剩 1 条标签时 `exec core.splitDown` 返回 **`ok=true`** 而树一字未变；同一趟里「第 4 层再切」也是静默失败（我核了上限确在：[`src/core/utils/splitTree.ts`](../../../../src/core/utils/splitTree.ts) `:25` `MAX_TREE_DEPTH = 4`，超限在 `:285` 给出 reason、**但到不了 AI 手上**）。**它把这一类统称「静默失败」——这正是「直白度」的真天花板**：同一个 `ok=true` 同时承担 **执行了 / 没执行 / 被门控 / 超层 / 视图未挂载** 五种含义，AI 只能据此往下推理（它报告里「不得不靠截图与多次试探来确认」的直接来源）。⇒ **建议合并做**：本格与 `AI#54`（视图未挂载）、`AI#60`（超时）**共用一套「回执语义」**（执行了 / 没执行 / 被门控 / 超层 / 视图未挂载 / 还在跑），⛔ 别各修各的。**判据加一条**：静默 no-op 必须**响亮化**（至少回一个可分辨的 code）。「既存隐患」定性不变（鼠标拖拽同款载荷），优先级维持前列。

#### AI#56 ⬜ （生长格）市场源「添加」未命令化

- [ ] **AI#56** 「添加市场源」功能在（`marketplace:src/services/marketSourceAdd.ts`），**命令面零条**（`marketplace.*` 五条 = enable/disable/uninstall/retryInstall/retryUpdate）⇒ 外部 AI 只能改设置数组，[§十 #3](01-设计.md) 的「＋M2」仍未兑现。｜**证据**：`AI#46` E3 ○ 实跑｜**候选修法** = 补 `marketplace.addSource`（薄命令转发服务层）｜**判据** = CLI/MCP 能加源并回读目录含该源｜量级 = 小

#### AI#57 ✅ （生长格 · 2026-09-29 会话 14 真机逼出 ＋ 同日修发；修法 = 垫片注释全 ASCII）`linkdeskctl.cmd` 的中文注释在 cmd 的 OEM 码页下被解析坏

- [x] **AI#57** 随包垫片 `linkdeskctl.cmd` **只能写 ASCII 注释**：原文的中文注释在 cmd 的 OEM 码页（本机 936）下被解析坏——**四探针 ＋ 真机整跑实证**：非 ASCII 注释叠加 LF 行尾 ⇒ `set "ELECTRON_RUN_AS_NODE=1"` **失效** ⇒ 垫片**启动的是整个 App 而不是 CLI**（`linkdeskctl status` 会拉起一个 App 窗口并打主进程日志）。｜**判据** = 把仓内的字节放进**真安装根**（`%~dp0` 真语义）跑 `status`，必须出 CLI 读数而不是拉起 App。｜**归属** = 会话 14 发版批真机逼出（用户当时手上的 `0.2.22` 包里垫片仍是坏的那份）。
      —— ✅ **2026-09-29 销账（同日修发，随补丁版 `v0.2.23`）｜判据落**：修法 = [`build/linkdeskctl.cmd`](../../../../build/linkdeskctl.cmd) **注释全 ASCII**（**634 B / 0 非 ASCII 字节**）＋ `.gitattributes` 注释订正（那行「全仓无 `.cmd`」已过期）；真安装根实测 `status` = **`SERVING`**，安装根垫片与仓内 `build/linkdeskctl.cmd` **逐字节相同**（`sha256` 前 16 位 `dfb06ab511b60281`）、`LinkDesk.exe` = `0.2.23`。**这条教训随即被固化成门禁**：同会话的 `AI#58` 落地 [`scripts/check-cli-shims.mjs`](../../../../scripts/check-cli-shims.mjs)（**ASCII-only** · LF-only · 两份启动配方同参 · 打包声明齐，已接进 `npm run check`）——即本坑自 2026-09-29 起**有机械尺兜着**，⛔ 不必再靠手工自查。｜**量级 = 小**（一份垫片的注释 ＋ 一行 `.gitattributes`）。

#### AI#58 ✅ （生长格 · 2026-09-29 会话 14 实测立案 ＋ 同日修发；修法 = 随包多一份无扩展名 POSIX 垫片）`linkdeskctl` 在 bash 系壳里不认裸名字

- [x] **AI#58** 装好的 CLI 正门在 **bash 系壳里只认 `linkdeskctl.cmd`**——`cmd.exe` / PowerShell 里裸敲 `linkdeskctl` 可以（PATHEXT 解析），但 Git Bash / MSYS2 **不解析 `.cmd` 后缀** ⇒ `bash: linkdeskctl: command not found`；而 AI 驱动器多的是跑 bash 的（本机实测 2026-09-29：`cd /c && linkdeskctl --help` = not found；`linkdeskctl.cmd status` = 正常读到在跑实例 `0.2.23 · pid 76092 · tcp 127.0.0.1:50931`）。｜**判据**：从任意目录、两种壳各跑一次——`cmd /c linkdeskctl status` 与 `bash -lc 'linkdeskctl status'` **都能出同一份读数**；修法 = 随包多出一个**无扩展名 POSIX 壳**（`#!/bin/sh` 转调 `.cmd`；MSYS 按内容判可执行）或 `linkdeskctl` 别名脚本，并在 `--help` 文末补「其它壳怎么调」一行。｜**归属** = 待排（与 `AI#52`–`AI#56` 同池）；**发版批联动**：改的是 `build/` 下的出货件 ⇒ 随下一个软件版出厂。
      —— ✅ **2026-09-29 销账（同日修发，随补丁版 `v0.2.24`）｜判据「两种壳各跑一次出同一份读数」两条都落**：① `cmd` 里裸敲 `linkdeskctl status`（真机、从 `C:\`）出读数；② **Git Bash 里裸敲同一个名字出同一份读数**（`0.2.23 · pid 76092 · 在服务 127.0.0.1:50931`；另 `--json` 机读 ✓ · `mcp config` ✓ · 退出码透传 `exit=1` ✓）。**修法** = `build/linkdeskctl`（**无扩展名 ＋ shebang**；`$0` 真机实测就是解析后的全路径 ⇒ `dirname` 自定位成立）＋ `electron-builder.yml` 的 `extraFiles` 第二条。**为什么不合成一份** = 两种壳的发现机制不相交（cmd 不认 shebang / POSIX 壳不认 `.cmd`）⇒ 只能两份实现 ＋ 一条对齐门禁。**同批新门禁** = [`scripts/check-cli-shims.mjs`](../../../../scripts/check-cli-shims.mjs)（ASCII-only · LF-only · 两份启动配方同参 · `extraFiles`/`extraResources` 声明齐；`--with-artifact` 再判产物逐字节），已接进 `npm run check`。**自测当场抓到自己的漏洞**：初版判据写 `includes("ELECTRON_RUN_AS_NODE")`，而垫片**注释里也写着这个词** ⇒ 把启动行删掉仍绿（负控③ 实测），改成**逐壳启动行正则契约**才红——9 例（1 正控 ＋ 8 负控）全过。｜**修前必答三件事**：① 根因 = POSIX 壳不解析 `PATHEXT`，安装根只有 `.cmd` 一份（`command not found`）；② 改法 = 同体 POSIX 垫片 ＋ 打包声明 ＋ 门禁；③ 可执行性 = 上列两壳真机读数。
#### AI#59 ✅ （生长格 · 2026-09-29 会话 14 真机边界扫描立案 ＋ 同日修发；修法 = `status` 探活不再吞错误、不再跳认人 ＋ `ping` 的 `servedBy` 不许谎报）`status` 把「谁在服务 / 为什么没成」压平

- [x] **AI#59** `linkdeskctl status`（AI 接手后通常敲的**第一条**命令）在两处压平了诊断：① 探活异常被 `catch {}` 吞掉、再 `classify({error:null})` 重造——那个输入的产物**恒为 `CONNECT_FAILED`** ⇒「凭据不对」（`EAUTH`）被报成「没连上 → **稍等重试**」，AI 会照假修法一直等；② 探活走 `op:"ping"`，而 `callBridge` 对 `ping` **有意不认人** ⇒ 记录 pid 与应答 pid 错配时照样报「**在服务**」，M5 教训「存在 ≠ 是它」在第一条命令上失守（**同一条记录**下 `tabs` 报 `STALE_IDENTITY`）。｜**证据（0.2.23 出厂版 · 真机只读）**：同一份情形 `ping` 报 `EAUTH`／`status` 报 `RECORD_OK`＋`CONNECT_FAILED`＋「稍等重试」；记录 pid=76092（活）、端口上真答 80164 ⇒ `status` 报「在服务」；`ping --json` 的 `servedBy` 用记录 pid 兜底 ⇒ 错配时该字段**谎报**（真应答者在 `result.pid`）。｜**判据** = 同一情形下 `status` 与 `ping` 给出的 `state.code` 必须一致（`STALE_IDENTITY` 不许报「在服务」）；「连不上」类仍保 `RECORD_OK`（离线分诊语义不动）。｜量级 = 小（报告面一处）
      —— ✅ **2026-09-29 销账（同日修发，随补丁版 `v0.2.24`）｜判据三条真机复验全中**：① 缺凭据 ⇒ `status` **`EAUTH`**（修前 `CONNECT_FAILED`＋「稍等重试」）；② 凭据对、pid 错配 ⇒ `status` **`STALE_IDENTITY`**（修前「在服务」），`ping --json` **`servedBy=76092`｜`recordPid=4`**（= 真应答者）；③ 端口无人听 ⇒ 仍 `RECORD_OK/REFUSED`（离线分诊语义保住）；**回归**：正常路径 `SERVING` · 人读格式 · 离线 `NO_RECORD` 三处一字未动。**修法** = 报告面拆成 [`cli/linkdeskctl/lib/status-report.mjs`](../../../../cli/linkdeskctl/lib/status-report.mjs)（纯函数）＋ `renderStatus(found, live, probeError)` **带原始异常进来**（只有「连不上」类降级为 `RECORD_OK`，其余如实报自己的码）＋ 探活拿到应答先**认人**（不齐 ⇒ `STALE_IDENTITY`）＋ `resolvedServedBy()` 取真应答者。**测试** = [`status-report.test.mjs`](../../../../cli/linkdeskctl/lib/status-report.test.mjs)（12 例：5 正控 ＋ 7 负控），**变异实测有牙**：撤回「问 probeError」⇒ 负控①②④ 红；撤回认人 ⇒ 负控③ 红（还原后哈希一字不差）；`vitest.config.ts` 为此收 `cli/**/*.test.mjs`——**此前 CLI 一行测试都没有**，这两条就是那样活到出厂版的。**随包**：`extraResources` 加 `filter: "!**/*.test.mjs"`（测试只进仓、不进包）。｜**同批边界扫描范围（⛔ 只读，未扰用户实例 pid 76092）**：两壳裸名（cmd/PowerShell **未被无扩展名文件抢走** · `where linkdeskctl` 同时列出两份）· 绝对/相对/显式 `sh` 调用 · **空格与中文安装根**（硬链农场仿真真安装根：PATH 用 POSIX 形与 Windows 形都出同一读数）· `--json` 与退出码（未知子命令/缺必填参数 = 1，`--json` 失败带 `code`+`hint`）· `mcp config --for json|codex|未知客户端`（未知降级通用 JSON）· MCP `initialize` **走垫片**（stdio 透传验通）· 隔离实例（`LINKDESK_AIBRIDGE=tcp`）全命令面 `status/ping/describe/tabs/notifications/log` 全 0（`servedBy`=隔离 pid）· `LINKDESK_USER_DATA` 环境变量那条提示路径 · 双实例各指各的 · 无实例 `NO_RECORD`／残留记录 `APP_EXITED`／开关关 `SWITCH_OFF`。**⛔ 未测（如实记）**：`install`/`notify-action`/`open-tab` 的**成功**路径（会真改状态；那半在 `AI#45` 的 39/39 一腿里）＋ **真安装器的拷贝动作本身**（只能由 `0.2.24` 那一跳给读数）。

#### AI#60 ⬜ （生长格 · 2026-09-29 会话 14 真机整跳逼出）`exec` 的**壳侧答复预算 8 秒** ⇒ 长命令必然回 `[ESHELLTIMEOUT] 壳无应答`

- [ ] **AI#60** 命令面 `exec` 走的统一通道给**壳侧答复**只留 **8 秒**（[`electron/services/aiBridge/index.ts`](../../../../electron/services/aiBridge/index.ts) `:71` `const SHELL_TIMEOUT_MS = 8_000;`；`shellRequest()` `:242` 到点 `:258` reject `coded('ESHELLTIMEOUT', '壳无应答（${timeoutMs}ms 超时，channel=${channel}）')`），而命令**合法**可以跑几分钟——样板 = `update.openUpdateFlow` 的下载腿（119 MB 安装包）。⇒ 命令**明明执行成功了**（下载推进到 100%、安装包落地、界面接着走更新），AI 那侧却只拿到 `[ESHELLTIMEOUT] 壳无应答`＋`EXIT=1`——**这个读数与「什么都没发生」不可分辨**，AI 会去重试、或向用户报「失败」。｜**证据（真机 `0.2.23 → 0.2.24` 整跳 · 本机安装版）**：`linkdeskctl exec update.openUpdateFlow` ⇒ `{"ok":false,"error":{"code":"ESHELLTIMEOUT","message":"壳无应答（8000ms 超时，channel=commands:execute）"}}`，退出码 **1**；而**同一时刻**更新界面正常推进、随后装完重启为 `0.2.24`（同一次真跑里两种读数并存 ⇒ 不是「命令没跑」，是**答复面预算不够**）。｜**候选修法**（牵动命令回执模型 ⇒ 先走 `design-flow` 技能（`.agents/skills/design-flow/SKILL.md`）定超时策略，⛔ 不是随手把常量调大）：① 命令元数据补「预期时长／可流式」位，长命令改**进度回执**（先回 `accepted` ＋ 句柄，再轮询/推送，答复面不再等结果）；② 或按命令名给**分档预算** ＋ 让超时读数**区别于执行失败**（如 `ETIMEOUT_PENDING` ＋「命令仍在跑，用 `status`/账本核对」，而不是「无应答」）；③ 最小半 = 文档补一句（[07-如何接入.md §八](../../../../docs/07-AI操作手册/07-如何接入.md) 现只写了「等点头以分钟计」，**没写这条 8 秒答复预算**）。｜**判据** = 拿一条真跑分钟级的命令（`update.openUpdateFlow` 的下载腿最方便）从 `exec` 发起：AI 侧必须能区分「**还在跑**」（不报错、可查进度）与「**真没应答**」，且⛔ 不许把**已经成功**的动作报成失败。｜量级 = **中**（动的是全部 142 条命令共用的超时口径 ＋ 回执模型；若只取 ③ 那一句话则 = 小）
      —— 🔁 **2026-09-29 精确化（外部 AI 黑盒实测回收）｜本格不是一个常量，是三个各走各的预算**：① **壳侧答复 8 秒**（[`electron/services/aiBridge/index.ts`](../../../../electron/services/aiBridge/index.ts) `:71` `SHELL_TIMEOUT_MS = 8_000`）——`exec` 的合法长命令撞的就是它；② **MCP 客户端默认 5 秒**（[`cli/linkdeskctl/lib/mcp-server.mjs`](../../../../cli/linkdeskctl/lib/mcp-server.mjs) `:278` `LINKDESK_MCP_TIMEOUT_MS || 5000`）——**不可询价**的操作走它，**比壳侧还紧**；③ **等人类点头 10 分钟**（[`electron/services/aiBridge/sensitive.ts`](../../../../electron/services/aiBridge/sensitive.ts) `:46` `ASK_TIMEOUT_MS = 600_000`；`exec`/`install`/`notifyAction` 在 `mcp-server.mjs:76` 的 `ASKABLE_OPS` 里 ⇒ 客户端的等待预算被撑到 600 秒）。**三者里只有 ③ 写进了手册**（[07-如何接入.md §八](../../../07-AI操作手册/07-如何接入.md) 只说「等点头以分钟计」，**没写 ① 的 8 秒、更没写 ② 的 5 秒**）。⇒ 外部 AI 报告把三条并成「超时不可分辨」一条，根因就在这。**修法目标随之从「调大常量」改为「统一口径 ＋ 让读数可分辨」**：至少让「**还在跑** / **正在等人点头** / **真没应答**」各有自己的 code 与文案（现况 = 一律 `TIMEOUT` ＋ [`bridge-client.mjs`](../../../../cli/linkdeskctl/lib/bridge-client.mjs) `:155` 的「**对面卡住了**」——把「正等着人点头」说成「对面死机」，AI 会当故障去重试）。量级维持 **中**；③ 那半仍是「小」。

#### AI#61 ✅ （生长格 · 2026-09-29 外部 AI 黑盒实测逼出）手册的**入口面陈旧**——把已发货的正门说成「未发货」

- [x] **AI#61** 手册分两层——**导航层**（`00-README.md` 的目录行与任务表）与**入口章**（`01-操作路径总览.md` 的「三道门」表）。`AI#15` 那次回填**只扫了 `07-如何接入.md` 一章**，这两层没跟着扫 ⇒ 同一个事实在三处说法不一。**逐条核过的证据（2026-09-29 我读了原文）**：① [`01-操作路径总览.md`](../../../07-AI操作手册/01-操作路径总览.md) `:12` 门表仍写「**③ CLI / MCP … ⛔ M4（07 章 已写形态，未发货）**」；② [`00-README.md`](../../../07-AI操作手册/00-README.md) `:42` 导航行仍把 07 章标成「**形态先写**（CLI/MCP 功能归 M4；今天走 CDP 绕行）」；③ 同档 `:90` 仍写「**（M4 落地后）** `linkdeskctl --help`…」；④ 同档 `:59` 任务例 10 仍写串口发送「缺的是『发送』的命令化」——而 `AI#23` 早已把 `serial-monitor.send` 命令化（外部 AI 实测可用）。**为什么这条最贵**：`00-README.md` `:35` 把 00 章标为「**先读这一页**」、01 章是「第一次上手」⇒ **AI 的唯一读物在自己的入口页把已经能用的正门说成不存在，还劝它走 CDP 绕行**；外部 AI 报告里「我一开始以为只能走 CDP」正来自这里（它自评：这会把 AI 直接带偏）。｜**候选修法**：① 四处逐条对账改；② **配一把机械尺**——手册里凡出现「未发货 / 形态先写 / 归 M4 / ⛔ ＋M2」这类**发货状态措辞**，要么由门禁按当前版本与命令面自动判（照 `manual:build` 漂移门禁的路子），要么至少要求该措辞带一个可核对的判据指针。⛔ **只做 ① 不做 ② = 下次还会漂**（收口报告 §八 已警告「破洞会随迭代重生」，`AI#46` 那三处订正也证明这是复发型）。｜**判据** = 从 `00-README` → `01` → `07` 顺读一遍，**三处对同一件事的发货状态说法一致**，且与 `--help`/`describe` 实得对得上。｜量级 = 小（改字）／**中**（配机械尺）。
      —— ✅ **2026-09-29 收口（`8f66b4721` 改字 ＋ `c53cab158` 机械尺，会话 16）｜交付两半都在**：**① 四处逐条对账**——[01 门表](../../../07-AI操作手册/01-操作路径总览.md) 改「✅ 今天可用（设置页『AI 接入』一键开）」· [00 导航行](../../../07-AI操作手册/00-README.md) 改「✅ **已发货**（CLI `linkdeskctl` ＋ MCP）」· 00 章 `:90` 去掉「（M4 落地后）」· 例 10 串口改按实（`serial-monitor.send` 等已命令化）；同笔顺带校准手写数字（命令 76 → **84** 条 · 命名空间方法 249 → **252**）。**② 机械尺**（用户的尺子诉求，⛔ 只做①不做② = 下次还会漂）：`scripts/check-manual-surface.mjs` **规则②**——手册与契约禁 `未发货 / 尚未发货 / 形态先写 / 归 M4 / ＋M2 / CDP 绕行`，**唯一逃生口 = 同一行给可核对的指针**（写 `判据`，如「⛔ 未发货（判据：`linkdeskctl --help` 里没有它）」）；⛔ 不设「历史叙述」豁免（追溯靠 git blame）⇒ [`07-如何接入.md`](../../../07-AI操作手册/07-如何接入.md) 那句「最初是**形态先写的**」随之改写为「最初只有**形状示意**（没实测过）」。`--self-test` 加 4 正控（四条真实历史措辞各一）＋ 2 负控（**带 `判据` 指针必须放行**——逃生口能通 · 干净句不报）；自证样本各只带一个触发词（否则「命中几条」在测别的东西）。**判据** = 从 `00` → `01` → `07` 顺读，三处对同一件事的发货状态说法一致；尺子实跑「✅ 读者面干净——已扫 9 个文件」。

#### AI#62 ⬜ （生长格 · 2026-09-29 外部 AI 报告**误诊**回收后重定）命令面偏「动作」、缺「读数」

- [ ] **AI#62** 外部 AI 报告的头号建议是「`exec` 把命令返回值丢了，救活所有 `get*` 命令」。**该诊断不成立（2026-09-29 实测推翻，如实记，以免后人重走）**：在用户实例（`0.2.24` · pid 84864）只读实测 `linkdeskctl exec aiBridge.statusMcp --json` ⇒ `{"result":{"commandId":"aiBridge.statusMcp","result":"Running · 127.0.0.1:64500"}}`，**真值原样回来**；代码链亦通——`runCommand` 返回 `await cmd.handler(...args)`、严格出口遇未注册/抛错是**抛异常**而非吞成 `undefined`（[`CommandRegistry.ts`](../../../../src/core/registry/commands/CommandRegistry.ts)）、壳侧应答方把 `result` 塞进 `bridge:response`、白名单层原样透传。它撞到的两个 `null` 都是**合法空值**：`marketplace.retryInstall` 本就无返回；`workbench.action.getFloatingPanelBounds` **无面板时按设计返回 `null`**（[`FloatingPanelService.ts`](../../../../src/core/services/ui/FloatingPanelService.ts) `getLastGeometry()`，有单测守「无面板不虚报」）。**但它指向的痛是真的**：壳命令面里正经的**取值命令极少**——几何读数只有 `workbench.action.getFloatingPanelBounds` 一条（＋ `aiBridge.status*` 状态族）；**设置类一条命令都没有**（外部 AI 只能走 `settings.json` 文件面，改完无路回读，它为此专门摸出 `linkdesk-userdata://appearance/<enc>` 这种文件面形状）。⇒ **要补的是「读数命令」，不是返回值透传**。｜**候选修法**：按「AI 最常要读什么」补薄命令——至少 ① 配置读（`configuration.get`，只读；`set` 另议）② 布局/尺寸读（分屏比例、侧栏宽、面板尺寸——写侧 `AI#21` 已补、读侧缺）③ 已开视图/容器清单。｜**判据** = 一个零源码 AI **不读 `settings.json` 文件**也能答出「当前主题/外观模式是什么」「某分支比例多少」「侧栏多宽」。｜量级 = 小–中（每条都是薄命令转发）。**排序 ⬇️** = 本次外部实测里它**只影响「验证/回读」，不阻塞操作** ⇒ 排在 `AI#54`/`AI#55`/`AI#61` 之后（与 `AI#52`/`AI#53`/`AI#56` 同池、按需取用）。

#### AI#63 ✅ （生长格 · 2026-09-29 **用户点出**、本棒核实并量化）手册与**已发布契约**里满是**仓内工作序号**——仓外人读不懂

- [x] **AI#63** 给仓外 AI / 插件作者看的两份东西里，夹着**只有仓内才懂的坐标**：`AI#NN`（本系列格号）· `E5.7#63`／`E5.8#50.11`（E5 期编号）· `M1`–`M5`（里程碑）· `A 删拍板`（内部裁决会）。**量化（本棒实测计数）**：手册 8 章合计 **`AI#NN` 31 处 ＋ `E5.x#NN` 15 处**——分章 = `07-如何接入` **14** · `02-命令与API索引` 2＋15 · `03-按任务操作` 2 · `04-手势隐藏规则` 2 · `05-够不着清单与安装版路径` 2 · `00-README` 1（`01`／`06` 干净）；**真正的源头不在手册**——[`contracts/linkdesk.d.ts`](../../../../contracts/linkdesk.d.ts) 有 **`E5.x#NN` 164 处 ＋ `AI#NN` 28 处**（另计：裸 `M1`–`M5` 29 处 · `Phase \d` 10 处），而该文件是 `@linkdesk/contracts` 的 `types` 且 `files: ["linkdesk.d.ts"]` ⇒ **原样随 npm 包发给所有插件作者**（作者在自己编辑器里 hover 就看得见「`E5.8#132：…（A 删拍板）`」）；手册 [02 章](../../../07-AI操作手册/02-命令与API索引.md) 的 API 表「来历」列**正是由它生成**（`<!-- BEGIN/END API-INDEX -->` 区，生成器 [`scripts/build-ai-manual.mjs`](../../../../scripts/build-ai-manual.mjs)）⇒ **改源头一处、两个面一起清**。｜**为什么算缺陷（不是洁癖）**：① 仓外读者**无法解码**这些符号，还得先猜它是不是某种它本该知道的约定；② 其中一部分**夹带过期内情**（样板 = `07` 章「本章是**形态先写的**（任务档案 `AI#15` 的显式口径）」「`AI#38.8` 复制按钮与 `AI#40` `mcp config --for` 同一生成器」）——与 `AI#61` **同族**：**把「我当时怎么干活」写进了「你该怎么用」**；③ 手册是**零源码环境的 AI 唯一读物**（02 章头自己写着这句），噪音直接变成它的推理负担。｜**候选修法**：① 源头 [`contracts/linkdesk.d.ts`](../../../../contracts/linkdesk.d.ts) 的 JSDoc 去掉 `E5.x#NN：` 前缀、留住冒号后的正文；需要溯源的场合改**读者能验的东西**（功能一句话 ＋（要时）版本号／日期）——仓内追溯本来就有 git blame，不必把坐标刻进产出物；② 手册手写面同笔清（`（M3 `AI#16`）` → 删或换成日期）；③ **配机械尺**：新增 `scripts/check-manual-vocab.mjs`（或并进 `manual:build` 的漂移门禁），对 `docs/07-AI操作手册/**` **＋ 已发布的 `contracts/linkdesk.d.ts`** 禁 `AI#\d` / `D0#\d` / `E\d(\.\d+)?#\d+` / 裸 `M[1-5]` / `Phase \d`——⛔ **只扫手册不够**，发出去的两个面都要。｜⚠️ **联动**：动 `linkdesk.d.ts` 的注释＝碰**已发布契约** ⇒ 按作者轴走一次 `@linkdesk/contracts` 升版发版（`check-npm-release.mjs` 的基线跟着动）；`npm run manual:build` 后 02 章的生成区会跟着变（⛔ 别手改那段）。｜**判据** = 两个面各扫一遍零命中（`grep -nE 'AI#[0-9]|E[0-9](\.[0-9]+)?#[0-9]|\bM[1-5]\b' docs/07-AI操作手册/ contracts/linkdesk.d.ts` 无输出）；且手册 8 章从 `00` 顺读到 `07`，**读不出任何需要仓内背景才懂的符号**（日期／版本号不在此列）。｜量级 = **中**（机械面小、判断面大：**238 处**（`AI#NN` 59 ＋ `E5.x#NN` 179；契约内另有裸 `M1`–`M5` ／ `Phase \d` 共 39 处）要逐条决定「改成什么」，且牵动一次契约发版）。
      —— ✅ **2026-09-29 收口（`8f66b4721`，会话 16）｜判据 = 两个面各扫一遍零命中（真跑真 0；契约内仅剩 `COM3` 一处假阳性，已核非编号）**。**修法定为「改源头一处、生成器出口剥」**：① 新增唯一一份剥刀 [`scripts/lib/strip-work-item-ids.mjs`](../../../../scripts/lib/strip-work-item-ids.mjs)（字面量 142 行：`AI#NN` / `E5.x#NN` / 裸 `M1`–`M5` / `Phase \d` ＋ `GUARD` 负向保护——编号后紧跟 `-`/`_`/`/` 一律不剥，防**误伤路径与标识符**）＋ 同目录 `.d.mts`（`moduleResolution: bundler` 下 `src/` 消费 `.mjs` 必须有声明，照 `contract-parse.d.mts` 先例）；② **契约生成器出口**调它（[`generate-contract.mjs`](../../../../scripts/generate-contract.mjs) 发射前 `stripWorkItemIds(rawContent)`）——**⛔ 不手改生成物**；③ **手册生成器**同笔（[`aiManualIndex.test.ts`](../../../../src/core/commands/aiManualIndex.test.ts) 对命令/API 单元格过同一把刀）⇒ 两个面的生成区一起清。**`src/**` 源码注释一字未动**（仓内追溯要留），剥的边界 = **注释行 ＋ 行内尾注释**（含 `} // …` 形，迭代第一版漏了尾注释、三处残留是这么被尺子抓出来的）。**契约重生成**：339 行改动、**全部只在注释**（逐条对账：非注释行改动 = 3 处，且都是尾注释）——**402 处编号清零**。**手册手写面**：8 章逐条清 ＋ **23 处定向修**（数字 76→84 条 / 249→252 方法 · 07 导航行 · 01 门表 · 例 3 状态 · 例 10 串口命令 · 「（软件外）」措辞 · 07 标题与锚点）。**⚠️ 自伤两次并已钉成负控**：剥刀早期把 `E6_插件生态与发布/` 与 `03-任务档案/M4-通道.md` 的路径前缀削掉（会断 `check-doc-links`）⇒ 加 `GUARD` 保护后**这两例进尺子 `--self-test` 作负控**；另有临时代码把 `.mjs` 里的 `\r?\n` 落成真换行（脚本一次性改名时），当场红、已修。**机械尺** = `scripts/check-manual-ids.mjs`（后与 `AI#61` 规则② 合流为 [`check-manual-surface.mjs`](../../../../scripts/check-manual-surface.mjs)），扫 `docs/07-AI操作手册/**` ＋ `contracts/linkdesk.d.ts`，接进 `npm run check` 链。**联动账（本格代价）**：动的是**已发布契约**的注释 ⇒ 作者轴 `@linkdesk/contracts` 必须升一次版发版（`check-npm-release.mjs` 黄灯在案），`plugin-docs` 与 `plugin-sdk` 随同批走——**归发版批，不在代码队列前**。

#### AI#64 ⬜ （新格 · 2026-09-29 **用户拍板**）串口「接收面」＝ 插件侧**拉取式命令**（让门③ 读得到串口回声）

- [ ] **AI#64** 串口「接收面」（2026-09-29 外部 AI 实测提出；我核过白名单后确认）

- **现状（我核过的）**：门③（CLI/MCP）的 **10 个操作全是同步一问一答**（`describe` / `ping` / `tabs` / `openTab` / `exec` / `install` / `notifications` / `notifyAction` / `log` ＋ `status`），**没有任何订阅 / 读数据通道** ⇒ 外部 AI 能 `serial-monitor.openPort` / `send`，却**读不到串口回来的数据**（`onData` / `onStats` / `onSystem` 只挂在门② 软件内契约 API 上）。
- **为什么是裁决而不是生长格**：① 它决定「AI 能不能靠 LinkDesk 完成**调试闭环**」——按 STM32 远景（自己写码 → 烧录 → 发指令 → **读回声算 PID** → 再发 → 实时监控），**断的正是这一环**；② 修法牵动架构形状：给门③ 开**流式订阅**会打破「白名单 = 请求/响应」这个现有骨架（现 10 个操作全是同步问答）；③ **Windows 串口默认独占** ⇒ LinkDesk 占着 COM 口，AI 自己就读不到；若让 AI 自己读，LinkDesk 的监视界面就废——**二者取一的取舍必须用户拍板**。
- **三条可得路线（代价在案）**：① **让插件把接收做成命令**（推荐；符合 [§三 边界③](01-设计.md)「插件没注册就是做不到」，可做成 `serial-monitor.readSince(cursor)` 这类**拉取式**，**不破坏**请求/响应形状）；② 走剪贴板（`selectAll` ＋ `copy`，机制通但脆、丢结构、占用全局剪贴板）；③ AI 自己开串口（与 LinkDesk **抢口**）。
      —— ✅ **2026-09-29 用户拍板（选择题 · 三选一）＝ 走「插件侧拉取式命令」**：给 serial-monitor 加 `readSince(cursor)` 一类**拉取式**命令——**LinkDesk 继续持有 COM 口**，AI 通过软件读；⛔ **不开流式订阅**（不破「白名单 = 请求/响应」形状）、⛔ **不走剪贴板**、⛔ **不让 AI 自己开串口**（不与软件抢口）。⇒ 本项由「待拍板」**转为正式立项（=`AI#64`）**。｜**候选修法（按拍板收窄）** = 插件侧新增接收命令族（**游标式拉取**：入参 `since`/`limit`，回 `{items, cursor}`），**壳侧零改动**；配套 = [21 章](../../../03-插件制造/21-插件命令化规范.md)补「流式数据的拉取式命令怎么写」＋ 手册 [03 · 发数据一条](../../../07-AI操作手册/03-按任务操作.md)补「怎么把回声读回来」＋ 手册 02 章生成区随插件命令面**自动收录**（⛔ 别手改那段）。｜**判据** = 一台**零源码** AI 能走完闭环：「开端口 → 发一条指令 → **读到回声** → 据此算下一组参数 → 再发一条」，且全程 ⛔ 不碰剪贴板、⛔ 不绕过 LinkDesk 开串口。｜**量级 = 中**（插件侧一条命令族 ＋ 规范与手册两处 ＋ 真机闭环验收）；⚠️ **开工前先走 `design-flow` 技能（`.agents/skills/design-flow/SKILL.md`）八维**（属新增能力面）。

#### AI#65 ⬜ （生长格 · 2026-09-29 会话 16 做 `AI#63` 时发现的面）CLI/MCP 的**运行期提示文案**与**插件作者文档产物**里仍有仓内编号

- [ ] **AI#65** `AI#63` 清的是**手册 ＋ 契约**两个面，清的过程中撞见**另外两个面**同样夹着仓外读不懂的坐标：① **运行期 `hint`**——[`cli/linkdeskctl/lib/bridge-client.mjs`](../../../../cli/linkdeskctl/lib/bridge-client.mjs) 的 `hint` 文案里带 `AI#38.3`（`:21`）· `AI#38.9`（`:26`）· `AI#29`（`:32`/`:96`）· `AI#39`（`:136`）、[`mcp-server.mjs`](../../../../cli/linkdeskctl/lib/mcp-server.mjs) `:204` 带 `AI#38.3`，[`linkdeskctl.mjs`](../../../../cli/linkdeskctl/linkdeskctl.mjs) 用法块带 `（AI#29）`——**这些字符串经 CLI/MCP 原样回给外部 AI**；② **作者文档产物**——`packages/plugin-docs`（由 `docs/03-插件制造/**` 生成、已发 0.1.39）同样满是 `AI#NN`/`E5.x#NN`。｜**为什么算缺陷（与 `AI#63` 同族、且 `hint` 更糟）**：`hint` 的**用途就是告诉 AI 下一步照做什么**（「去设置页开『AI 接入』」那类），里面夹一个它无法解码的坐标 ⇒ 要么被忽略、要么被当成该遵守的约定去猜。｜**候选修法**：① 运行期文案去编号（换成人话 ＋ 可核对的一步：`ai.mcp.enabled` / 设置页路径 / 一条命令）——`cli/**` 里的**代码注释保持原样**（仓内追溯要留）；② 作者面产物逐条**裁决**：「生长格名」在作者文档里是**指向仓内账的合法指针**（如 21 章「账 = 生长格 `AI#54`」）还是纯噪音——两种混着用，需要一次分清，再统一落笔；③ 机械尺扩域：给 `check-manual-surface.mjs` 加一条**只扫 `cli/**` 字符串字面量**的腿（⛔ 不扫注释）。｜**判据** = `linkdeskctl --help`、`describe` 的 op 帮助、MCP 工具描述，以及**所有 `hint`／错误文案**里零 `AI#NN`/`E5.x#NN`；作者面产物按裁决清单清零。｜量级 = **小–中**（CLI 侧 7 处字面量是小改；作者面要一次裁决）。

> **⛔ 两条被裁掉、不登记**（2026-09-29 `AI#46` 裁决，防「为凑数立格」）：① **图标栏点击**——源码口径 `icon:selected → 壳开标签`，非鼠标等价 = `open-tab <pluginId>`/`tabs.create`（手册在载）⇒ **非缺口**；② **`serial-monitor.send` 运行期元数据**——首跑曾见 desc/params 为空，**净态复跑推翻**（desc 90 字 ＋ params 4 项齐全）⇒ 不作缺口。

---

## 第 6 轮 · 验收与收口（`AI#45`–`AI#49`）

> 依据 = [01-设计.md §七 验收（用户视角）](01-设计.md) 七条 ＋ §十 用户实例对账 12 例 ＋ §八 三条追问场景。
> **硬前置**：`AI#45` 必须等 `AI#1`–`AI#44` 收口（验收对象就是它们）。

#### AI#45 ⬜ §七 验收 1–7 全量跑（非坐标）

- [x] **AI#45** 逐条真跑：① 分屏一次性做成 ② 铃铛六问零 DOM ③ 安装版 CLI/MCP 装插件→打开→操作、更新重启不丢连接 ④ 新 AI 读手册 10 分钟内列出三问 ⑤ 手势全在且都有非鼠标替代 ⑥ 自然语言日程例逐条对账 ⑦ **验收面自检**。｜判据 = 七条全绿
      —— ✅ **2026-09-29 收口（会话 13）｜判据「七条全绿」= ✅ 6 ＋ ◐ 1**。**读数原件 = [`READINGS-AI45.txt`](../../../../scripts/dev/m4-fullchain/READINGS-AI45.txt)**：CLI **39/39** · MCP **41/41**（各净态一腿，跳过 0）· 敏感门 `gate-accept` **24/24 ×2**（Esc 拒 ⇒ `EUSERDENIED` ／ Enter 准 ／ 账本两读面一致 ／ 名单外不问 ／ 负控全绿）——⚠️ **首跑 `--channel both` = 41/42**（✗ MCP-S6.1「装前」）：根因 = 净态 wipe 时**留了 `plugins/`**，serial-monitor 目录已存在 ⇒「已存在安装目录」拒绝；净态全清复跑两腿全绿（**如实留痕，不改写**）。逐条：① 分屏 ✅（E11 逐层嵌套 branch=2／组 3）② 铃铛六问零 DOM ✅（`notifications`＋`notifyAction` 整链）③ **◐**（两腿「装→打开→操作」整链 ✔；**真 nsis 安装版 ＋ 更新重启那一跳 = 发版批待验清单 1–3 行**）④ ✅（**判据本体 = 手册查得率**：`AI#46` 12 例逐例查得到 ＋ 3 处不一致已订正；「10 分钟」字面计时未做，不阻断）⑤ ✅（`AI#30` 清零表 ＋ 本轮全命令/API 驱动实跑）⑥ ✅（[§三 锚点②](01-设计.md) 逐条对上；假想日程插件用 serial-monitor 代证「挂牌即进工具清单」）⑦ ✅（见 `AI#47`）

#### AI#46 ⬜ 用户实例 12 例 ＋ 三条追问场景真跑

- [x] **AI#46** 跑 §十 的 12 例（含嵌套分屏、空间定位问答、JSON 对比）+ §八 三条追问场景（AI 造主题插件 / 只凭 GitHub 网址装用插件 / **全新电脑从零装软件到多插件组合**）。｜依据 = 「未来验收时逐例真跑——M3 手册里每例都应能查到『怎么做』」（[01-设计.md §十](01-设计.md)）｜判据 = 逐例结论与对账表**一致**（不一致 = 要么设计漏、要么手册漏）
      —— ✅ **2026-09-29 收口（会话 13）｜判据「逐例与对账表一致」= 通（34 条读数：✔ 28 · ✗ 0 · ○ 6）**。**新验收器 [`examples.mjs`](../../../../scripts/dev/m4-fullchain/examples.mjs)（可重跑）＋ 原件 [`READINGS-AI46-examples.txt`](../../../../scripts/dev/m4-fullchain/READINGS-AI46-examples.txt)**（净态实例 · 定稿轮）。逐例：①/② ✅ validate＋pack 零源码出主题包；③ ○ 市场源**仍缺命令**（⇒ 生长格 `AI#56`）④ ✅ 侧栏 `edge left→right→left`；⑤ ✅ 平铺两实参可用（**对象形状静默无效** ⇒ 生长格 `AI#52`——手册 00-README 行 5 已同笔改平铺写法）；⑥ ✅ 五标签页 3→8；⑧ ✅ 两行命令出 diff「README.md ↔ CLAUDE.md」（⚠️ 需先挂载 file-tree 视图 ⇒ 生长格 `AI#54`）；⑨ ✅ toggle 两向；⑩ ✅ 无硬件**响亮失败**（`ESHELLERROR`）＋ 参数读面 desc 90 字/params 4 项；⑪ ✅ 嵌套分屏（① 右分 ② 再嵌 ③ 宿主面只整体回 50/50 ⇒ 比例精确设 ○ `AI#53`）；⑫ ✅ ①②（开着吗/在哪）＋ ○ ③（同 `AI#53`）；§八① ✅ · §八② ✅（URL → 门 → 装成 v1.0.25 → 打开 → 挂牌）· §八③ ○（无净机 ⇒ 发版批）。**🔴 不一致三处已按判据订正文档（要么设计漏、要么手册漏）**：`01-设计.md §十 #8` 命令 id `editor.*` → **`file-tree.*`** ＋ 补「需先挂载视图」；手册 `00-README` 行 8 同订 ＋ 行 5 实参形状（**具名对象 → 平铺两个**）；手册 `03 · 例 8` 补挂载前置（否则 `EUNKNOWN`）。**⛔ 一条收回的读数（如实记）**：首跑曾见「`serial-monitor.send` 运行期 meta 丢 description/params」，净态复跑**推翻**（读面齐全）⇒ 不作缺口、不登记生长格（`examples.mjs` 同笔改成「仅作迹」）。**⛔ 一条裁掉（防凑数立格）**：图标栏点击**非缺口**——源码口径 `icon:selected → 壳开标签`，非鼠标等价 = `open-tab`/`tabs.create`（手册在载）。

#### AI#47 ⬜ 验收面自检：与物理指针无关

- [x] **AI#47** 全量验收**以非坐标方式**跑通（命令 / API / CLI；hover-only 面用 CDP **`CSS.forcePseudoState`** 强制伪状态），**期间用户随便动鼠标不构成干扰**。｜依据 = [01-设计.md §三 验收面第 1 条](01-设计.md) ＋ §七 第 7 条｜⚠️ **口径区分**：`el.click()`（DOM 合成点击）与 `forcePseudoState` **不属于**坐标输入——今天的纪律是「**别用真实指针**」，不是「避免一切输入」
      —— ✅ **2026-09-29 收口（会话 13）｜判据「与物理指针无关」= 通**（读数同 `AI#45`/`AI#46` 两原件，**零坐标输入**）。用的驱动面逐项：CLI/MCP 通道（文本协议）· 池内 `pool.tabAction`/`getLayout`/`events.emit("icon:selected")`（结构化 API）· 命令面 `commands.executeCommand` · 壳侧对话框 CDP **`el.click()`**（DOM 合成点击，⛔ 未派发鼠标事件）· 键盘腿 CDP 真按键（Esc/Enter；窗未聚焦时降级 DOM 合成并**如实标 `dom`**）。⚠️ **口径订正一条（本格实测逼出，同笔改进 [01-设计.md §三 验收面第 1 条](01-设计.md) ＋ §七 第 7 条）**：原文「hover-only 面用 `forcePseudoState`、不移动指针」——`D0#3` 实测（2026-09-28）：**深层既有节点上它只改 `matches()`、不改计算值**（样式若非直连该伪类）⇒ **静默假绿**。订正后：① 首选 `forcePseudoState`（真·无指针，浅层/直连有效）；② 深层节点改用 [`driver.mjs --mode mouse`](../../../../scripts/dev/driver.mjs)（**元素锚定**：解析目标元素→指针送其中心，不推算坐标、不看窗口位置），读数里**如实标注该面用了指针**；③ `--mode force` 保留但打降级警告。⛔ 两条不变：不推算坐标、不截图猜点。

#### AI#48 ⬜ 系列收口报告

- [x] **AI#48** 出收口报告（照 E6 层收口报告定式：成绩表 / 读数前后并排 / 残余与例外 / 给下一棒三句话）。｜**同笔**：① 文档收口——[01-设计.md](01-设计.md) 的 `§九`/`§十` 位置倒置（排在 §四 之前）同笔调到正确次序（见 [02 §四 C](02-目录与切片规划.md)）② 销账——`AI#50+` 生长格结清 ③ CLAUDE.md 头部与 04 README 同笔订正
      —— ✅ **2026-09-29 收口（会话 13）｜产出 = [`06-系列收口报告.md`](06-系列收口报告.md)**（成绩表 62/62 · 读数前后并排 12 面 · `AI#45`–`AI#47` ＋ `AI#49` 逐条结论与证据原件指针 · 生长格登记 · 残余与例外 8 条 · 给下一棒三句话）。**同笔三件**：① ✅ `01-设计.md` `§九`/`§十` 已归位（实测章节次序 = 一二三四五六七八九十）② ✅ 生长格结清——`AI#50`（`eb894ebc0`）· `AI#51`（`f74b0c25d`）；同批**新登记 `AI#52`–`AI#56`**（本轮实跑逼出的 5 条，含既存隐患 `AI#55`）③ ✅ [CLAUDE.md](../../../../CLAUDE.md) 头部进度行 ＋ 关键文件表 ＋ 系列 [00-README.md](00-README.md) 状态行订正（⚠️ `docs/04-软件更新/00-README.md` **在用户手上，⛔ 未动**——`B-1` 仍挂账）。

#### AI#49 ⬜ 持续纪律落地（防破洞重生）

- [x] **AI#49** 把「**每个用户动作至少一条非鼠标路径**」＋「**业务动作注册为命令**」落成**常驻纪律**（进 [CLAUDE.md](../../../../CLAUDE.md) 硬约束或规范 ＋ 作者面）。｜依据 = [01-设计.md §三 操作质量判据](01-设计.md)：「**且『达标』是持续纪律，不是一次性交付**——此后每个新功能 / 新插件都必须遵守，否则破洞会随迭代重新出现（**本系列缘起正是如此**：一个老功能里的隐藏门控卡住了 AI）」
      —— ✅ **2026-09-29 收口（会话 13）｜判据「落成常驻纪律」= 通（两处同笔落地）**：① **壳侧总纲** = [CLAUDE.md 硬约束 26](../../../../CLAUDE.md)（「每个用户动作至少一条非鼠标路径」＋「业务动作注册为命令、注册 meta 必带 `description` ＋ `params`」＋「达标 = 结构化操作」＋「验收同样非坐标」；机械自查 = `npm run audit:plugin-commands`（只报不拦）＋ `npm run manual:build`）；② **作者面** = [docs/03-插件制造/21-插件命令化规范.md](../../../03-插件制造/21-插件命令化规范.md)（新增「注册 meta 必填项 / 命令 id 命名空间 / 验收三件套」一节）。**同笔**：硬约束 24 的授权条款升级为**用户 2026-09-29 二次授权全轴发版**（唯一仍需点头的一步 = `git push`）。

---

## 发版批待验清单（跨格汇总 · **谁发版谁吃**）

> **用法**：下面三件的判据**只有真 nsis 安装版才见效**，而本轮执行期红线是 🔴「软件本体不发版」⇒ 攒到发版时一并验收。**🔴 该红线已于 2026-09-29 由用户解除**（「我同意你对任何的发版：软件的发版，插件的发版，npm 包的发版，我全部授权你了」）⇒ **本批 = 软件 `0.2.22` 发版批：逐件销账**（启动词 = 同夹 `05-启动词.md` 第十五棒；发完在下面每行补结论，✅ / ○ 如实记）。⛔ 别等到「以为早验过了」。

| # | 归谁 | 判据（照抄） | 为什么今天做不了 |
|:--:|:--|:--|:--|
| 1 | 第 2 轮 `AI#16`（M3 手册随包） | 装完 → **帮助菜单 → AI 操作手册** → ① 页内有内容 ② **页头版本 == `app.getVersion()`（= 新版本号）** ③ **断网也能开** | 会话 3 / 4 只走到 `--dir` 产物（`win-unpacked`）；**真机安装这一步没人做过** |
| 2 | 第 3 轮 `AI#17` ＋ `AI#18` ＋ `AI#19` ② | 装 `0.2.x` → 应用内更新到 `0.2.y` → ① **更新后 `--remote-debugging-port` 连得上** ② `app.getVersion()` == 新版本号 ③ 存活的是**新进程**且命令行带走调试参数 | 本机安装版 = 仓内同版本 `0.2.21`，[`build/installer.nsh`](../../../../build/installer.nsh) 的 `customInit` **拒绝静默同版安装**（exit 1602）⇒「装 → 更新」整跳走不了 |
| 3 | 第 4 轮 `AI#44` → 第 3 轮 `AI#19` ① | 同一次安装，用 **CLI / MCP** 走「**装一个插件 → 打开它 → 操作它**」（⛔ 不拿 CDP 冒充） | ~~依赖 M4 通道尚未落地~~ **✅ 通道能力已于会话 9 验毕**（两条腿各一整链，dev 隔离实例）⇒ **只剩「在安装版里再跑一遍」** |

**逐件结论（2026-09-29 会话 14 · 软件 `0.2.22` 发版批 · 真机 = 本机安装版 `D:\01link\LinkDesk`，全程 `--user-data-dir` 隔离）**：

- **① `AI#16` 手册随包 = ✅**。**先关掉手册页、再由命令面 `app.openAiManual` 打开**（证「是被打开」而⛔ 不是布局还原）：池里渲染出「AI 操作手册」页签，页头原文 =「随本版本发货 · 内容是当前版本 **v0.2.22**」。**四方对账一致** = 页头 ／ 主进程载荷 `app:getAiManual.version` = `0.2.22` ／ `app.getVersion()` = `0.2.22` ／ 安装 exe `FileVersion` = `0.2.22`。**「随包」的实据** = 载荷 `dir` 字段 = `D:\01link\LinkDesk\resources\ai-manual`（安装目录内 8 个 `.md` 与载荷 8 章一一对应）⇒ 内容是**主进程读安装目录**，⛔ 不经网络（未做「拔网线」式演练——判据实质 = 取数不依赖网络，以读盘路径为证）。⚠️ **原生菜单不是 DOM ⇒ CDP 点不到**：菜单入口（帮助 → AI 操作手册）以源码为准（`shellMenus.ts` 的 `helpLearn` 锚位指向同一个 `app.openAiManual`），命令面侧已实测。
- **② `AI#17` ＋ `AI#18` ＋ `AI#19` ② 更新那一跳 = ②③ ✅ ／ ① 本次跳变**不适用（非缺陷，根因见下）**。安装版 `0.2.21` 点「检查更新」看见 `0.2.22`（`available`，校验和 `9c89e004…`，119,475,767 B）→ 下载 → `update.openUpdateFlow` → 装完重启：**② `app.getVersion()` = `0.2.22`**（exe `FileVersion` 独立读数同值）；**③ 存活的是新进程**（PIDs 全换：63284/46720/70616/41624/70712 → 17772/71704/53380/49104/76828）。**① 端口确未继承**，根因已核实 = **执行这次更新的进程是 `0.2.21`**：参数携带的写侧（`electron/services/debug-switches.ts` ＋ `update-install.ts`）由 `966e3d5ea`（2026-09-28 14:02）进仓，**晚于 `v0.2.21` 的 tag（2026-09-28 04:28）** ⇒ 旧版没有这套逻辑，掉端口是**旧版的既定行为**、不是 `0.2.22` 的回归。⇒ ① 只能由「**由含修的版本执行的那一跳**」（`0.2.22 → 下一版`）验。
- **③ `AI#44` → `AI#19` ① 安装版 CLI/MCP 整链 = ✅**（用 `D:\01link\LinkDesk` 内置 CLI，⛔ 无 CDP 冒充）：**装** = `linkdeskctl install <官方下载 URL>` → 软件内弹确认框（「AI 请求安装插件：… 允许吗？」）→ **元素锚定**点「确定」→ 回 `{"installed":true,"job":{"success":true,"pluginId":"serial-monitor","version":"1.0.25"}}`；**打开** = `open-tab serial-monitor` → `tabs` 快照出现 `serial-monitor-2`「串口监视器」；**操作** = `exec serial-monitor.togglePause` → 视图工具条 **「暂停接收」⇄「继续接收」双向实翻**（两次读数，可逆）。**MCP 半**（同一条桥的第二入口）：`linkdeskctl mcp`（stdio）`initialize` → `{"name":"linkdesk","version":"0.2.22"}`；`tools/list` = 10 件；`tools/call linkdesk_status` 回真结果「在线 · pid 54904 · 127.0.0.1:57100」。
- 🔴 **同批真机逼出一条缺陷 ⇒ 生长格 `AI#57`（已修入库，已随补丁版 `0.2.23` 出厂（2026-09-29））**：`linkdeskctl.cmd` 垫片**只能写 ASCII 注释**——中文注释在 cmd 的 OEM 码页（本机 936）下被解析坏 ⇒ `set "ELECTRON_RUN_AS_NODE=1"` **失效** ⇒ 垫片**启动的是整个 App 而不是 CLI**（`linkdeskctl status` 会拉起一个 App 窗口并打主进程日志）。**本格详案（证据 / 修法 / 销账 / 量级）＝本档 `#### AI#57`**；⚠️ 已发的 `0.2.22` 包内垫片仍是坏的那份（✅ 补丁版 `0.2.23` 已修好）——临时走法 = 直接 `node resources\linkdeskctl\linkdeskctl.mjs`（或 `LinkDesk.exe` 带 `ELECTRON_RUN_AS_NODE=1`）。

🔁 **2026-09-29 补丁版 `0.2.23` 已发**（只为修 `AI#57` 垫片；壳 ＋ `@linkdesk/ui` 同号锁步，ui 已 publish）——**Release 已公开 · `releases/latest` = `v0.2.23`** ⇒ **件② ① 已补验、件③ 的垫片半已刷新**。同日真机读数（本机安装版 `D:\01link\LinkDesk`，全程 `--user-data-dir` 隔离）：
- **验资（修真的在已发包里）**：安装根 `linkdeskctl.cmd` = **634 B / 0 非 ASCII / sha256 前 16 位 `dfb06ab511b60281`**，与仓内 `build/linkdeskctl.cmd` **逐字节相同**（`identical=true`）；`LinkDesk.exe` 的 `FileVersion` = **0.2.23**。
- **冷启动那条路（另一个目录里的 AI 的处境）**：`cwd=C:\`、无任何项目文档、不设任何环境变量，裸敲 `linkdeskctl status` ⇒ 读到在跑实例「`linkdesk 0.2.23 · pid 76092 · 在服务 tcp 127.0.0.1:50931 · 壳窗 1（操作目标 = main）`」；`linkdeskctl --help` 正常出全文（`AI#57` 之前这里会**弹出整个 App**）。
- **件② ①（更新后调试口不丢）机制级实测**：真机落一份「装前记录」＋**只带 `--updated`** 启动已发 `0.2.23` ⇒ 主进程日志「从待安装记录恢复调试开关（更新重启前带的就是这些）: `--remote-debugging-port=9557` `--remote-allow-origins=*`」＋ `127.0.0.1:9557` 的 CDP `/json/version` 应答，而该进程命令行里**没有**这两个开关。⚠️ **记录为手写**（整跳不可复现：机器上已是最新版，且实测「更新安装会关掉所有在跑实例」——会波及用户那份）⇒ 写侧（`extractDebugSwitches` → 记录）由单测 ＋ 今日真跑留痕覆盖。

🔁 **2026-09-29 补丁版 `0.2.24` 已发 ⇒ 清单第 2 行 ① 由「含修版本执行的那一跳」真机销账（本清单三件至此全 ✅）**（真机 = 本机安装版 `D:\01link\LinkDesk`；`0.2.23` 应用内点更新 → 真装 `0.2.24` → 装完重启）：
- **① 更新后调试口不丢 = ✅（真实整跳，⛔ 不是手写记录）**。**写侧**＝**进程自己落的记录**（非手写）：`{userData}\update\state.json` 实读 `{"type":"updating","update":{"version":"0.2.24","currentVersion":"0.2.23",…},"installerPath":"…\update\linkdesk-update-0.2.24.exe","startedAt":"2026-09-29T01:37:40.660Z","debugSwitches":["--remote-debugging-port=9559","--remote-allow-origins=*"]}`。**携带**＝重启后的进程上 `127.0.0.1:9559` 的 CDP `/json/version` 应答（`Chrome/150.0.7871.250`），而该进程命令行里**没有**这两个开关（NSIS `StartApp` 只送 `--updated`）；`{userData}\DevToolsActivePort` 独立读数 = `9559` 佐证。**排除混淆（比上一遍新增的一条硬证据，把「可能是别处来的端口」这条退路堵死）**＝设置页那条路（`main.ts`：`ai.debug.remoteDebugging=true` ⇒ 补 **9333**）**关着**——`settings.json` 里该键**不存在**、`9333` 也不监听 ⇒ `9559` 只可能来自**记录携带**。**负控**＝事后再正常重启一次（记录已销）⇒ `9559` **不再监听**（开关不粘、随记录一次性）。
- **② `app.getVersion()` = `0.2.24`**（安装版读数 ＋ `LinkDesk.exe` 的 `FileVersion` = `0.2.24`）；**③ 存活的是新进程**（PIDs 全换）。✅ **顺带销掉 `AI#59` 段那条「⛔ 未测」**＝**真安装器的拷贝动作本身**（原话「只能由 `0.2.24` 那一跳给读数」）已由这一跳给出读数。
- **件③ 的垫片半已刷新 ＋ 出货件字节验**：`0.2.24` 包内**两份垫片都在**（装完即恢复；本会话先删掉自己手放的替身再验）——安装根 `linkdeskctl`（无扩展名 POSIX 壳）＋ `linkdeskctl.cmd` 与仓内 `build/` **逐字节相同**；`resources\linkdeskctl\*` 与仓内 `cli/linkdeskctl/*` 逐字节相同、且**零 `*.test.*`**（`extraResources` 的排除规则在出货件里确实生效）；`latest.yml` 的 `sha512` 与已发安装包资产一致（nsis 载荷 `$PLUGINSDIR/app-64.7z` 解出后逐一比对）。
- **`AI#59` 的修在出货 CLI 上是活的**（就地复跑三个症状）：错 token ⇒ **`EAUTH`**；活着的**非宿主** pid ⇒ **`STALE_IDENTITY`**（`servedBy=83684`／`recordPid=80816`，`result.pid` = 真应答者）；真 token ⇒ **`SERVING`**。安装版 `linkdeskctl mcp`（stdio）`initialize` ⇒ `{"name":"linkdesk","version":"0.2.24"}`；`--help` 命令面 = **142 条**、要点头的动作只列表内 1 条（与 `describe.askFirst` 对账差集为空）。
- 🔴 **同批真机又逼出一条新缺陷 ⇒ 生长格 `AI#60`**（`exec` 的**壳侧答复预算 8 秒** ⇒ `update.openUpdateFlow` 这类**合法长命令**必然回 `[ESHELLTIMEOUT] 壳无应答`，读数与「什么都没发生」不可分辨）——**已登记、⛔ 本会话未修**（要按 `design-flow` 技能（`.agents/skills/design-flow/SKILL.md`）先定超时策略，⛔ 不随手调常量；**2026-09-29 已精确化为三个预算**）；见本档 `#### AI#60`。
- 🧹 **取完证把机器还原成常态**：用于取证的 CDP `9559` 已关（CDP `Browser.close` 优雅退出 —— 该进程无托盘、`window-all-closed → app.quit()`）＋ 正常重启一次，随后 `linkdeskctl status` = **`SERVING`**（`0.2.24` · pid 42020 · `127.0.0.1:62167`），本机**无调试口**（`9559`/`9333` 都不监听）。

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

> **只在这里写数字**（别处不复写）。**当前 = 62 / 62 格已回勾**（＋ 系列外 `D0#1`–`D0#3` = **3 / 3 ✅**；**生长格**：`AI#50` ✅（`eb894ebc0`）· `AI#51` ✅（`f74b0c25d`）· **`AI#52` ✅（`26d127d9f`）· `AI#54` ✅（`3b36e2c84`——⚠️ 真机读数未做，配方在该格）· `AI#61` ✅（`8f66b4721` 改字 ＋ `c53cab158` 尺子）· `AI#63` ✅（`8f66b4721`）** · **`AI#53` / `AI#55` / `AI#56` / `AI#60` / `AI#62` / `AI#64` 已登记、⬜ 未做** · **`AI#65` 已登记 ⬜（本棒做 `AI#63` 时发现的面：CLI/MCP 运行期 `hint` 与作者文档产物里的仓内编号）** · **`AI#57` 已登记（2026-09-29 会话 14 真机逼出：垫片 `linkdeskctl.cmd` 的中文注释撞 cmd 的 OEM 码页 ⇒ 启动 App 而非 CLI；**修已入库 `build/linkdeskctl.cmd`，已随补丁版 `0.2.23` 出厂（2026-09-29）**）**——**不计入 62 格预算**，照 §一「格数会生长」口径）。
> ＋ **`AI#58`** 已修、已随补丁版 `v0.2.24` 出厂（2026-09-29 会话 14 同日：随包多一份无扩展名 POSIX 垫片，两种终端同一个名字——见本档 `#### AI#58`）。
> ＋ **`AI#59`** 已修、已随补丁版 `v0.2.24` 出厂（2026-09-29 会话 14 同日：真机边界扫描逼出——`status` 探活不再吞真实错误、不再跳过认人；`ping` 的 `servedBy` 不许谎报——见本档 `#### AI#59`）。
> ＋ **`AI#60`** 已登记 ⬜（2026-09-29 会话 14 真机整跳 `0.2.23 → 0.2.24` 逼出：`exec` 的**壳侧答复预算 8 秒** ⇒ `update.openUpdateFlow` 这类**合法长命令**明明跑成却只回 `[ESHELLTIMEOUT] 壳无应答`，与「没执行」不可分辨——**修法牵动超时策略设计 ⇒ 本会话未修**，见本档 `#### AI#60`）。
> ＋ **`AI#61`** / **`AI#62`** / **`AI#63`** / **`AI#64`** 已登记 ⬜（2026-09-29 **外部 AI 黑盒实测回收**／**用户点出**，见 [交接.md](交接.md) 会话 15 段）：`AI#61` = 手册**入口面陈旧**（`01` 章门表仍写「⛔ M4 未发货」＋ `00-README` `:42`/`:90` ＋ 任务例 10，四处逐条核过原文）；`AI#62` = 命令面**缺读数命令**（报告头号建议「`exec` 丢返回值」经只读实测**推翻**，但「缺读数」的痛为真）。**同批重估**：`AI#54` 量级 小–中 → **中** · `AI#55` 量级 小 → **中**（外部独立复现）· `AI#60` **精确化为三个预算**（壳侧 8s ／ MCP 默认 5s ／ 等点头 600s）。`AI#63` = 手册（`AI#NN` 31 处 ＋ `E5.x#NN` 15 处）与**已发布的 `contracts/linkdesk.d.ts`**（164 ＋ 28 处）里满是**仓内工作序号**，仓外人读不懂——改源头一处（02 章那列由它生成）、两个面一起清。**另**：**四件拍板已于 2026-09-29 落定**（用户 · 选择题形式）——串口接收面 = **插件侧拉取式命令 ⇒ 立项 `AI#64`**；`AI#52` = **壳侧宽进**；`AI#54` = **壳侧兜底**；`AI#63` = **删内部编号、留版本号/日期**（逐格「裁决」行 ＋ [交接.md](交接.md) 会话 15 ⑨）。

| 轮 | 模块 | 格 | 已回勾 | 状态 |
|:--:|:--|:--|:--:|:--|
| — | 系列外 dev 验收前置 | `D0#1`–`D0#3` | **3 / 3** | ✅ 2026-09-28 收口（`f54e59209`；不占系列格） |
| 1 | **M1** 读取面进契约 | `AI#1`–`AI#9` | **9 / 9** | ✅ 2026-09-28 收口（会话 1 六格真机 15/15 读面 ＋ 会话 2 三格元数据）——第 2 轮（M3）硬前置**已解除** |
| 2 | **M3** 文档与手册 | `AI#10`–`AI#16` | **7 / 7** | ✅ **2026-09-28 整轮收口**（会话 3 两交付：第一交付 `AI#10`–`AI#14` 手册七章落仓 `docs/07-AI操作手册/`，02 章生成式 ＋ 漂移门禁；**第二交付 `AI#15` 接入章（形态先写，M4 回填）＋ `AI#16` 手册随包与软件内入口**；`npm run check` 全绿 **213 文件 / 2854 tests**；`electron-builder --dir` 验 `resources/ai-manual/` **8 章落位**） |
| 3 | **M5** 安装版一致性 | `AI#17`–`AI#19` | **3 / 3** | ✅ **2026-09-28 整轮收口**（会话 4：`AI#17` **更新那一跳端口不丢** ＝ 记录携带 ＋ ready 前复位；`AI#18` **二次带参启动** ＝ 并集裁决 ＋ **重启前等请求端口释放**（抓出并修掉一个打包态 5/5 复现的竞态：立刻重启 ⇒ 并集进程绑不上端口 ⇒「App 跑着但没调试口」）；**会话 9：`AI#19` ① 复验通过**（两条通道各走「装→打开→操作」一整链，登记在 `AI#44` 格）⇒ 补上最后一格；**真安装版那半**仍在发版批待验清单第 1–3 行） |
| 4 | **M4** MCP + CLI 双通道 | `AI#31`–`AI#44`（**含 `AI#38.1`–`AI#38.14` 十四子格**） | **27 / 27** | ✅ **2026-09-28 整轮收口**（会话 5–9：spike＋内核＋CLI＋MCP＋**设置页「AI 接入」18 键全落**；**会话 9 · `AI#44` 全链路两腿**：**CLI 39/39 · MCP 41/41**（负控三条、跳过 0）＋ **真 MCP 客户端 Claude Code 挂上真调通** ＋ 离线态三段；`@linkdesk/ui` 两新原语 ＋ `settings` 消费；多窗口目标窗、单实例回归、安全评估在案；**残余四条在报告 §四**（冷启动窗口 ／ `notifyAction` 账目 `arg=null` ／ 只在 dev 轨道 ／ VS Code·Codex 未验）；check 全绿 **215 文件 / 2906 tests**） |
| 5 | **M2** 操作面补齐 | `AI#20`–`AI#30` | **11 / 11** | ✅ **2026-09-29 整轮收口**（2026-09-28 会话 10 首轮 6 格：壳侧半 `AI#20`/`AI#21`/`AI#22` ＋ 规范 `AI#26` ＋ 尺子 `AI#28` ＋ 敏感确认面 `AI#29`；2026-09-28 会话 11 插件侧 4 格：`AI#23` serial-monitor 5 命令族＋17 条 description · `AI#24` file-tree openSearchResult＋21 条 description · `AI#25` settings editKeybinding · `AI#27` 脚手架默认带命令（npm 0.1.16）——**跨仓发版一次走到端**＝四仓 publish → 官方目录收录 → `sync:bundled`，真机 CLI 39/39 · MCP 41/41；**2026-09-29 会话 12 总验收 `AI#30`**：机械尺实跑（marketplace 7 视图按边界③裁决 · 缺 description = 0）＋ 语义对账清零表（A 类浮动面板已消 · B 类 5/6 ✅ · C 类 5/5 ✅）＋ 三条挂账裁决（closeSession ○ · uninstall/发数不进名单＋「谁开通道谁带门」约束在案 · getPendingDialogs 三面各归其位）＋ 手册生成链绿 3/3——**零产品码改动**；⚠️ **生长格 `AI#50` 已销**（2026-09-29 `eb894ebc0` 两处文档登记；不计 62 格预算）） |
| 6 | 验收与收口 | `AI#45`–`AI#49` | **5 / 5** | ✅ **2026-09-29 会话 13 整轮收口**（`AI#45` §七 七条真跑 = ✅6 ＋ ◐1（安装版归发版批）：CLI 39/39 · MCP 41/41 · 门 24/24 ×2；`AI#46` 12 例＋3 场景 = 34 条读数 ✔28/✗0/○6 ＋ **三处文档订正**；`AI#47` 非坐标自检通 ＋ `forcePseudoState` 口径订正；`AI#48` = [06-系列收口报告](06-系列收口报告.md)；`AI#49` = 硬约束 26 ＋ 作者面 21 章；生长格 `AI#50`/`AI#51` 结清 ＋ `AI#52`–`AI#56` 登记） |
| | **合计** | **62 格**（＋3 系列外） | **62 / 62** | ✅ **前置门已过**（2026-09-28 拍板 13 条）· 第 1 轮 M1 整轮 9/9 · **第 2 轮 M3 整轮 7/7（2026-09-28 收口）** · **第 3 轮 M5 整轮 3/3（会话 9 补上 `AI#19` ①）** · **第 4 轮 M4 整轮 27/27（2026-09-28 会话 5–9 收口）** · **第 5 轮 M2 整轮 11/11（会话 10 首轮 6 ＋ 会话 11 插件侧 4 ＋ 会话 12 总验收）** · **系列收口 2026-09-29 完成（会话 13 · 六轮全绿）⇒ 下一棒 = 发版批（软件 `0.2.22` ＋ 三 npm 包 ＋ 真机三件；不在本队列）** |

**量级口径**：[01-设计.md §六](01-设计.md) 粗估 **60–80 格**，本单首版 **49 格**——**差额不是漏登记**，是 M2「唯一鼠标路径」与 M4「白名单」两处 🌱 **生长格**（审计发现一条补一格，`AI#50` 起续号——本轮实跑又逼出 `AI#52`–`AI#56` 五条并已登记）。⚠️ **2026-09-28 用户要求后 49 → 62**：`AI#38`（设置页「AI 接入」分区）按用户原话「HTML 里显示的设置页面的配置项，都要有任务」**展开为 14 个子格**（+13，逐项详案 [03-任务档案/M4-设置页.md](03-任务档案/M4-设置页.md)）——**量级判定不变**：中等偏大 ≈ E6 两到三个轮次，**远小于 E5.7 式推翻重做**；**全加法、零架构赌注**、唯一新机制 = M4（spike 先行）。

**另三件指针**：目录与落点 = [02-目录与切片规划.md](02-目录与切片规划.md) ｜逐格详案 = [03-任务档案/](03-任务档案/) ｜分工与接力 = [04-AI分工与接力方案.md](04-AI分工与接力方案.md) ＋ [交接.md](交接.md)。
