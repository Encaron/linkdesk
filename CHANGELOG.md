# Changelog

> 每版一条，对标 VS Code changelog。**历史真相源 = [E6 执行清单](docs/02-Electron架构/E6_插件生态与发布/E6-执行清单.md)**（E6 阶段每轮收束细节 + 实机证据全在清单 Batch 注里，此文件只记类别清单）。版本号唯一真值 = `package.json`（不手写第二份，见 [02-产品身份与版本.md](docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/02-产品身份与版本.md) §2.3）。
> 0.x 阶段（开发期）：一切向后兼容变更走 patch 位；破坏性变更走 minor 位。

## v0.1.37（2026-09-10）

- **feat:E6#73g 通知噪声分级校准（§五 G）+ 来源身份 S5**（第 3.5.7 轮第二批第一档）
  - **来源身份（S5）**：`linkdesk.notifications.show(msg, { source })` 新增**选填**归属键。通知面板按它分组——此前**全部通知都落「其他」组**（谁发的都不知道），现在插件自报家门，组标题显示**人话名**（市场 → 「插件市场」，主软件 → 「主软件」，认不出就照 id 显示）；每组各 5 条常驻配额也以此为键。**壳自身域**用 `app.<域>`（如 `app.update` → 「主软件更新」），并且 **`app.*` 一律不查插件清单**（主软件不是插件，查表会落空显示成内部 id）。**🔴 如实登记的边界：做不到自动注入**——池是单进程共享 realm，所有插件共用同一个 `window.linkdesk`，preload 无从知道「这次 show() 是哪个插件的树发的」⇒ **只能作者显式报**；**老插件不填就仍然全落「其他」组**（新契约，要作者重新发布才生效）
  - **🔴 一处把坏行为拔掉的修复（B2）**：内存墙告警此前**无迟滞、无「已警告过」状态**——只要内存挂着超限，**每 30 秒就弹一次通知面板**，关一次弹一次。现在加了**上升沿闩**：越过阈值只报**一次**，必须真回落到 1024MB × 0.9 以下才解锁下一次。**抽成独立纯函数模块**（`electron/windows/memory-pressure-latch.ts`）——off-by-one 恰好住在「回落解锁」这条状态机边界上，抽出来才能穷举单测（9 例：持续高水位只发一次 / 贴着阈值抖动骗不过去 / 恰好落在回落水位**不**解锁）
  - **分级校准：一处升级、一处降级**（其余条目经 73b/73f 已天然落对档）
    - **升级**：插件加载失败汇总、`minAppVersion` 不满足、依赖环——三条**从「只角标」改成「弹」**（`severity: "error"`）。这些是「插件真的没装上/装不了」，用户必须当场知道，不是背景噪声
    - **降级**：壳侧文件读写失败（`FileService` 6 处）**显式 `wake: false`**——它唯一的消费者是壳内部的后台持久化（存配置、存工作区），失败只会重试或下次覆盖，**弹面板属于打扰**。`wake` 走**选填**（不传 ≠ 传 false）：不传才交给缺省判据 `error ∨ 带动作`，显式 `false` 表示「我知道它有动作按钮，但这件仍然不值得弹」
  - **角标判据定案（§八㉙）**：铃铛未读数**只数有结果的条目**——「进行中」不计入（进度跳动不该让数字乱蹦）。这是 §八㉙ 的专属裁定，**覆盖** §五 G「普通完成只入面板」那句旧话；「普通完成」仍不入面板、仍计角标，两者不矛盾
  - **面板开着时新到即已读**：面板展开期间到达的新条目**即时记入已读水位**（就在眼皮底下，铃铛数字不该往上跳）；已读集合随条目消失自动清理（不无限增长）
  - 新增/扩充 6 个测试文件（来源分组与主软件域不查表陷阱、角标判据、未读集合维护、面板开着即时已读、内存闩 9 例、`reportError` 定级），i18n 新增 2 键。`npm run check` EXIT=0（**145 文件 / 1920 测试**，0 克隆）
  - 插件包随之 bump：**marketplace 1.0.13→1.0.14**（市场通知自报 `source`）+ **lang-defaults 1.0.5→1.0.6**（新增「主软件」/「主软件更新」两键英译——通知面板按来源分组后，主软件自己的组标题此前无英译会直接漏中文），两只随包 zip 已重建（`check-bundled-version-bump` 18/18 绿）。**⚠️ 补 bump 的理由**：`en.json` 是插件包内容，不 bump 版本号的话，已装用户按 E6#15n 永不刷新、旧译文永滞
  - **顺带修一处断掉的构建脚本**：`plugins/settings/package.json` 的 build 路径写成 `../../../packages/...`（7 个兄弟插件全是 `../../`）——设置插件在自己的目录里 `npm run build` 永远找不到 SDK 入口，等于重建不了。已对齐成 `../../`（本次实证：改前报 `npm error`，改后正常产出 313.9 KB / 2 表面）。**纯构建脚本纠错，不涉及插件内容，settings 不 bump**
  - ⚠️ **`@linkdesk/contracts` 有触及面**（`notifications.show` 选项加 **`source?: string`**——**纯新增选填**，旧插件零影响）——**npm 发版是发布仪式，本档未擅自执行**，留待用户拍板

## v0.1.36（2026-09-10）

- **feat:E6#73d 通知面板三段式 + job 主行 + [取消安装]**（第 3.5.7 轮第一批，**第一批 7 档全闭**）
  - **面板固定三段：「进行中 → 等待安装中 → 已有结果」**。段序与段内顺序**永不重排**（按入队先后排——排队位次跳变会让用户刚瞄到的行「跑」到别处，比不排序更糟）；每段最多列 5 条，第 6 条起折成一句「本段另有 N 项未列出」，**不无声消失**
  - **第三段数的是安装的结局，不是面板上的行**：分别计失败 / 缺依赖 / 已完成三档。为什么不用行数——行会被定时收走、会被来源折叠，拿它做摘要会随无关动作乱跳。**「已装上但缺依赖」单独一档**，不并进「已完成」（它装上了但不可用，说成完成是撒谎）；**只在途还没结果时写「0 项」而不是让这一段消失**（「固定三段」的字面意思就是第三段恒在）；**一个插件都没装过时**不显示这一行（那时下面根本没有安装任务，标题会指向一堆无关消息）
  - **一行 = 用户点的一次安装**：将来若出现「装 A 自动带出依赖」的自动安装，依赖不单独占行，藏在那一行里面（今天还没有这条腿，先把判据写进代码）
  - **行内状态话术由「阶段码 + 百分比」拼**（如「下载中 62%」「解压中...」），**不直接显示内部原始消息**——那些串是各段自己吐的、有的没走翻译，直接上屏会绕过「所有界面文字必须走 t()」这条硬规矩，换语言也不变。未登记的阶段码兜底写「安装中...」
  - **可取消**：进行中与排队中都能点 **[取消安装]**（次要按钮样式，不抢失败行 [重试] 的视线）。**取消不是失败**——那一行整条撤掉，不渲染红行，也不进「已有结果」的失败计数
  - **🔥 拖选复制出来的文本顺序修好了**：此前靠 CSS 反向翻转把「进度条/按钮」显示在主行上面，屏幕看着对，但**用鼠标拖选复制出来的文字是倒的**（按钮文字打头）。现在 DOM 顺序与屏幕顺序统一（主行 → 进度 → 详情动作），复制得到的是人读的顺序
  - **相对时间会走了**：面板开着时每 30 秒重算一次「刚刚 / N 分钟前」（此前只有重开面板才刷新）
  - **市场插件不再自己画安装进度条**：进度统一由通知面板的任务行表达（原来同一次安装会同时出现两条进度条，看起来像「装了两遍」）
  - **🔴 一处如实登记的加码**：失败行豁免「按来源最多 5 条」之后，万一某个坏插件循环报错会让通知库无限增长直到内存爆掉。加了一条**内存护栏**（最多留 50 条失败，超出仍从最老的淘汰、并照常记进「已折叠」计数）——它是**内存上限，不是显示配额**，「显示不淹没」与「内存不失控」是两件事
  - 新增/扩充测试 4 个文件（三段序与 DOM 顺序断言、取消回传、失败行豁免与内存护栏、订阅），i18n 新增 13 键。`npm run check` EXIT=0（**142 文件 / 1881 测试**，0 克隆）
  - 语言/插件包随之 bump：**lang-defaults 1.0.4→1.0.5**（13 个新键）、**marketplace 1.0.11→1.0.12**（撤自建进度条），两只随包 zip 已重建
  - ⚠️ **`@linkdesk/contracts` 有触及面**（新增 `packageCancel(jobId)`、`packageDownload`/`packageExtract` 各加一个**选填**尾参、`PluginInstallResult` 加 `cancelled?`——**全部只增不改**，旧插件零影响）——**npm 发版是发布仪式，本批未擅自执行**，留待用户拍板

## v0.1.35（2026-09-10）

- **feat:E6#73b 通知面板关法收敛 + 浮层 Esc 分层 + `autoOpen` 唤醒判据单一归属**（第 3.5.7 轮第一批，**第一批 7 档已闭 6**）
  - **① 点面板外面不再关**：`OverlayPortal` 新增 `closeOnOutsideClick?: boolean`（**默认 true，既有消费方行为零变化**），只有通知面板传 `false`。关法收敛到两个——面板内「最小化」与 Esc，且 **Esc 的语义是「最小化」不是「关闭」**（收起、什么都不丢）
  - **④ Esc 只关最上层浮层**：新增 `overlayLayer.ts` 作**层级权威**，五处接线（通知面板 / 右键菜单 / 对话框 / 悬浮面板 / 快速选择）。判据落在 **DOM 的有效 z-index**（自身无 z 就沿祖先取最近的非 auto 值），同 z 按文档序破平——因为浮层宿主 `FloatingLayerHost` 的 DOM 顺序与视觉层级**恰好相反**（右键菜单在前、浮层根在后），只按文档序会判错。**不建模块级栈**：`@linkdesk/ui` 未 external，每个插件包各带一份副本，模块级状态天然不共享，DOM 才是跨包唯一真相
  - **⑤ `autoOpen` 判据单一归属**：此前的 `isImportantNotif` **删除**，改为 `Toast.wake` **声明优先**（`shouldWake(n) = n.wake === true`）；缺省由 toast 层一处定 = **`error` ∨ 带动作按钮**。显式置位只补缺省够不到的两处：安装终态（`wake: reason !== "enable"`——「启用」不是一次 job，照旧不唤醒）与 job 终态通知；插件发起的 `notifications.show` 非进度即唤醒
  - 🔴 **一处主动偏离（作废原设计，设计档已同步改）**：原定表达式含 **「且未最小化」**，**未照做**。它与用户自己的规格直接冲突——迁移表有 `MINIMIZED --收到唤醒--> OPEN`、计数表写着「先按了最小化 → 出结果时唤回 1 次」、设计档原话「「最小化」在行为上没有任何静音权力……所有能唤醒的事件都会把它弹回来」——而且**机械上自我矛盾**：加了它，唤醒条目一到未读就非零、面板却永不弹回 ⇒ **最小化变成永久静音**，正是用户明确否掉的行为。⇒ 裁定：**「最小化」只做两件事——把面板收起来、记已读水位**；面板收起（含最小化）时收到该唤醒的新条目，照常弹回。**「攒着不冒」属于新规格，须用户拍板**，不在本档。相关旧断言三处已逐处标注作废
  - **不做三态过桥**：壳侧镜像只落「展开了没有」一个派生位（`minimized` 与 `idle` 在壳侧**必然同值**，这是定案不是遗漏）——没有消费者就不是状态、是死状态
  - **唤醒白名单严格窄于「重要」**：`progress` 与 `warning` 一律不唤醒（内存墙 / 主题数据坏 / 工作区丢文件夹 / 孤儿依赖**全是 warning 级**，用户明确说过不要被它们弹开）；进度从 10% 跳到 50% 同样不唤醒——**只有新条目诞生才唤醒**，「更新已有条目」永不唤醒
  - 新增/重写测试 3 个文件（层级权威 9 例、唤醒白名单整段重写含**反向断言**、缺省三条），`npm run check` EXIT=0（141 文件 / 1848 测试）
  - ⚠️ **`@linkdesk/contracts` 有触及面**（`NotifLayout` 新增 `clearLabel`/`minimizeLabel`、`notifications.show()` 返回类型由可选收窄为必返回句柄）——**npm 发版是发布仪式，本批未擅自执行**，留待用户拍板

## v0.1.34（2026-09-10）

- **feat:E6#73a 通知面板三态 + 头部两钮分工（「清除已完成」/「最小化」）**（第 3.5.7 轮第一批首档）
  - **面板状态从「一个布尔」改成单值三态机** `idle | open | minimized`——两个布尔会凑出「既非展开也非最小化」的第四种非法组合；状态是一个 union 值 ⇒ 任意「状态 × 事件」组合都落在设计表内。机在 `src/pool/zones/status-bar/notifPanelState.ts`（纯函数，零 React），面板是它的**唯一**渲染消费方
  - **头部两钮分工**（此前只有一枚「全部清除」，混着管内容和面板）：**「清除已完成」管内容**——只清**已出结果且已读**的旧消息，面板不关、正在跑的一条不碰；**「最小化」管面板**——收起的**唯一**动作，什么都不丢。都是纯文字按钮，不带图标（用户前两轮反复说「没有最小化这个东西」，写出来别让人猜图标）
  - **铃铛只进不出**：面板已展开时点铃铛**无迁移**（设计表七条里没有这一条）。原来铃铛是个开合开关——那正是用户抱怨的「所有按钮都在管关掉」
  - **「关面板即认账」提前落地**（原排 73b，此处**必须**先做）：不做的话「最小化」是个死按钮——面板一收起，未读还挂着 → 壳请求自动展开 → 面板立刻弹回来。现在「点铃铛开」与「关面板」两条路径认账，**唤醒开的面板不认账**（用户还没看）
  - **进行中的行不再渲染 ×**：任务不许被随手一点就消失，它只能由创建它的句柄收掉（壳侧同判据已兜底，两条路径都拦得住）
  - 5 态迁移 × 3 事件共 7 条转换**逐行单测** + 「明确不存在的行为」逐条反向断言（含「认账只有两条路径」的集合断言）。新增 3 个测试文件/改动 2 个，`npm run check` EXIT=0
  - 语言包随之 bump：**lang-defaults 1.0.3→1.0.4**（撤「全部清除」、加「清除已完成」/「最小化」）、**lang-test-ja 1.0.0→1.0.1**（同键）——**不 bump 则已装用户永滞旧字典**（boot 不覆盖同版副本），英文界面会露出中文键。两个随包 zip 已重建（`check-bundled-version-bump` → `version-bumped`）

## v0.1.33（2026-09-10）

- **feat:E6#73f toast 数据层整肃 + 隔离（S1/S3/S4/S6）+ 两项 store 新增能力**（第二批首档，**因是 73b 的机械前置而提前**）
  - **S1 死代码簇删除**：`runToastAction`（面板回传点击动作已改由 `useSubscriptions` 内联执行）、`getUnreadCount` + `subscribeNotifPanelOpen` + `_suppressListeners`（无人订阅的影子通道）、`Toast.icon`（`notifications.show` 契约里根本没有 `icon` 形参 ⇒ 恒假分支，`getNotifIconClass` 那条 if 一并删）。🔴 **`isCloseAffordance` 机制保留**——E6#57.12a 依赖它；但修掉一条真 bug：TTL 到点自灭**不再写持久化屏蔽记录**（只有用户真去关闭才算「别再显示」），并补 `clearDismissedState()` 给调试用
  - **S3 容量隔离——常驻上限从「全局面值 5」改为「按来源分桶各 5 条」**：新增 `sourceKeyOf()`（取 source 首段，无来源归 `__other__`）为**唯一**分桶键（淘汰与面板分组共用一份，不再两处各写 `split(".")[0] || "__other__"`）。**某来源刷屏不再挤掉别的来源**；被淘汰的记进 `_folded` 折叠计数
  - **S3 折叠可见（不再无声消失）**：`NotifGroup.foldedLabel?`（壳侧 `t()` 已解析，池哑渲染——同 timeLabel 的「显示文本铁律」）+ 面板分组尾部一行小字「本组另有 N 条较早的已折叠」。**契约字段选填** ⇒ 旧快照/测试替身不填时形状零变化
  - **S4 生命周期隔离**：`isPending(t)`（`progress === true`）——面板「清除全部」与单条关闭**一律跳过进行中的条目**（此前会把正在跑的进度条从面板上抹掉，而它还在跑）；同理 `dismissToast` 直调仍可用（程序化路径不受限）
  - **S6 句柄隔离**：`show()` **一律返回句柄**（此前只在 `progress:true` 时才返回 id）——persistent 的失败通知带 `[重试]`，用户手动重试成功后那条「安装失败」撤不下来，会跟成功条互相打脸攒成失败墙。池侧 `if (!handleId) return undefined` 删除 ⇒ 契约 `Promise<NotificationHandle>` 从「看情况」变「恒有」
  - **① `Toast.wake?: boolean` 唤醒旗标**（§五 B「本设计唯一要求 toast store 新增的能力之一」）——**本档只放载体，表达式归 73b**（㉓ 明令不得复用 `isImportantNotif`，否则最小化面板会被 30s 内存墙弹开）
  - **② 原子替换 API `replaceToast(id, patch)`**（§五 I.6⑧ 硬前置）——保留 `id`/`createdAt`、**单次 notify**，缺它则 73d 的行会闪、会换位；`updateToast` 改为它的薄封装（percent 缺省=清空，解掉「上一条的百分比留在新文案上」）
  - **K7 撤销失败要出声**：`lifecycle.ts` 两条「撤销」`onClick` 此前只 `console.error`——而点动作时已经**先无条件关掉那条提示**，撤销失败 = 提示没了 + 插件没恢复，用户以为撤销成功。现补 error toast（结论句 + 插件名 + 原因），落回该插件所在的分组
  - **SDK dev 宿主真缺口**：`notifications.show` 在生成的 mock 里解析成 `undefined`，作者照文档写 `(await show(m)).update(...)` 在 dev 宿主必崩 → 走生成器自带的 `OVERRIDE_RET` 机制补上（**未手改生成物**）
  - 新增单测 4 个文件（toast store 分桶/折叠/原子替换/TTL 不落屏蔽、面板 clearAll·dismiss 跳过进行中、撤销失败、池侧句柄），改动 6 个测试文件。`npm run check` EXIT=0（139 文件 / 1818 测试）
  - ⚠️ **一处刻意不动**：marketplace 源码里只改了**一句注释**，**随包 zip 未重建**——纯注释无用户可见变更，bump 版本号是错的；且注释被 Vite 剥掉、产物逐字节不变（`check-bundled-version-bump` 判 `identical`）

## v0.1.32（2026-09-10）

- **fix:E6#73h 通知文案归一 + 消灭「装一次弹两条」**（D2/D3/D4/D5/D6/D7）
  - **D2 双 toast 删除**：一次安装弹两条「已安装」——`loadInstalledPlugin` 成功分支一条（`已安装：X v1.0`）+ lifecycle 消费端一条（`已安装：X（即时生效）`），措辞还不一样，用户以为装了两遍。**保留 lifecycle 消费端为 install 族唯一发声口**（不是删它）：① `install` reason 还有第二条腿（`loader.ts` 外部拷入源码树的 watcher 路径）**不经过** `loadInstalledPlugin`，删消费端会让那条腿彻底静默；② 版本号在消费端也拿得到（事件带 manifest）⇒ 信息量不减
  - **D3 通知链走 i18n**：`lifecycle.ts` / `update.ts` / `runtime.ts` / `ProfileService.ts` / `FileService.ts` / marketplace / editor 七处的用户可见文案此前**硬编码中文**（英文界面下中英混排，且含 `${}` 插值的模板串连 i18n 审计都扫不到）。现全部走 `t()`，22+ 键入 `lang-defaults/en.json`（壳侧）+ 各插件 `i18n/en.json`（插件侧）
  - **D4 黑话换结论句**：通知正文不再甩内部标识符——
    - `Profile` → **配置方案**；`Profile "x" 未找到` → `找不到配置方案「x」`
    - 五维校验失败原样甩 `[维度2] 设置 "app.theme" 期望="dark" 实际="light"`（不读代码的人既看不懂也不知道该干什么）→ 用户看到**结论句**（`配置方案切换失败——已退回原来的设置` / `…但有部分没能还原，请手动检查`），技术明细改走 `console.warn`
    - `需要应用版本 ≥1.2` → `插件「X」需要新版主软件才能用（它要 1.2 或更高，当前 1.0）——已跳过，请先更新 LinkDesk`
    - `依赖环` → `插件「X」声明的插件依赖绕成了死循环（链）——已跳过，请联系插件作者`
    - `FileService` 九处 `listDir 失败` / `readFile 失败` 一类**内部函数名**→ 大白话（`无法读取文件夹：路径`）
    - 编辑器 LSP：`LSP initialize 超时（15s 无响应）` → `启动后 15 秒没有响应——请检查它是否已正确安装`（并去掉与外层结论句的重复叠加）
  - **D5 原始报错不再裸奔**：`notifyError(e.message)` 直接甩桥/引擎原文（`Error invoking remote method 'plugin:enable'` 这类）→ 一律**结论句 + 原文**（`启用「X」失败：<原文>`），详情退居冒号后
  - **D6 失败通知带插件名**：更新失败此前只说「更新失败：服务器暂时不可用」，不说**是哪个插件**（多单并发时在通知面板认不出是谁）→ 复用 73e 装失败同款 `{{name}}：{{reason}}` key
  - **D7 `finishNotification` 继承来源**：换条时必须**继承被替换那条的 source**，否则同一次安装「开始」有来源、「完成」没有，两条被分进通知面板两个分组（来源缺失全落「其他」）。今天 `showNotification` 尚无 `source` 形参（属 E6#73g 的 S5），此处是**先把丢来源的洞焊死**，S5 一落即自动生效
  - **审计豁免撤销**：`scripts/audit-i18n.mjs` 的 `ProfileService.ts` 整文件排除**重新收窄为「仅诊断明细」**并写明理由——该文件的用户可见文案已全部走 `t()`，残留中文只流向 `console.warn`；排除范围若被误用回用户可见文案，须撤销
  - 插件版本：editor 1.0.4→**1.0.5** / marketplace 1.0.10→**1.0.11** / lang-defaults 1.0.2→**1.0.3**（三个 bundled zip 已重建，`check-bundled-version-bump` 全过）。`npm run check` EXIT=0（135 文件 / 1791 测试）

## v0.1.31（2026-09-10）

- **feat:E6#73c 第 1 步——「点了等于没点」换成看得见的「等待安装中」（仍是 N=1）**
  - **病根**：E6#73q 把闸换成了队列，但闸**还在市场层**——`startMarketInstall` 命中「另一单在跑」就**静默 `return false`**（不打日志、不弹 toast、不改 UI），两个调用方（探索行 / 详情页）都把返回值丢了。连点 7 个 = **装 1 丢 6**，用户以为没点中，再点一次还是没反应
  - **市场层真排队**（`plugins/marketplace/src/services/marketplaceShared.ts`）：`_installQueue` 严格 FIFO + **单泵**（`pumpInstallQueue`：队首跑完 → 出队 → 交棒 → 下一单接手）+ **同 pluginId 去重**（点两下 = 一次安装，两个调用方等同一结果，不是两条行）。**第 2 单起真排着**，不是被拒也不是并发
  - **可见回执**（`ExploreView` 行内徽标 / `DetailView` 安装钮原位改字）：排队中的插件显示「等待安装中」——复用既有 `ms-catalog-status installing` 样式 + `codicon-clock`，**零新 CSS**；文案与设计 §五 I.4 排队行同词（en：`Waiting to install`）
    - ⚠️ **不做「每排队一单弹一个 toast」**：连点 7 个就是 6 条同时炸 —— 那正是本轮要修的「不该弹的猛弹」（噪声分级属 E6#73g）。回执做在**用户正盯着的那一行/那个钮**上
  - **请求侧身份随行**（`marketplaceShared` → `PluginInstallRequestOpts`）：池侧把 `{ pluginId, displayName, origin: "user" }` 交给壳——job 表去重要 `pluginId`、job 行要显示名，而两者**只有池侧目录 store 知道**（壳拿不到）。显示名缺省退化为 pluginId（诚实兜底，不留空标题）
  - **进度事件带身份**（设计硬前置 ③，`PluginInstallJobRef`）：壳侧 `installPlugin` 调主进程 fs/net 段（`packageDownload`/`packageExtract`）时随行 `{ jobId, pluginId? }`，`emitProgress` 各段回填进 `plugin:installProgress` 广播——**此前下载/解压段的事件不带任何身份，多单并行时百分比会互相灌进同一行**；N=1 时靠「归活跃会话」侥幸正确。`jobId` **只在壳侧生成、主进程只透传**（单一生产者，不持久化）；两个方法都是**选填参数**（旧调用零影响）
  - 🔴 **本档结束仍是 N=1**：`_installSession` / `_progressToast` **未拆**——拆闸属 E6#73c **第 2 步**（开工硬约束「顺序不许反」：先把静默闸换成可见回执，再放开并发）。市场层这条队列是**第一步的过渡载体**，第 2 步整体删除、把等待交给壳侧 job 表
  - 面板侧的「等待安装中」分段属 **E6#73d**（本档不碰面板）
  - 新增单测 `marketplaceInstallQueue.test.ts` 5 例（第 2 单不再被丢 + FIFO 交棒 + 等待快照不含队首 / 同 pluginId 去重且两个调用方同结果 / 请求侧身份三字段含显示名退化 / 单次失败不淤死队列 / 装完回归空闲）。`npm run check` EXIT=0（135 文件 / 1791 测试）

## v0.1.30（2026-09-10）

- **feat:E6#73q 安装队列基建——「连点 7 个装 1 丢 6」的闸换成队列（第一批第一步）**
  - **病根**：今天唯一的闸是 marketplace 的模块级单例 `_installSession`，命中即静默 `return false`——不打日志、不弹 toast、不改 UI。连点 7 个插件 = **装 1 丢 6**，且**详情页那条路完全没闸**（四处「N=1 恒安全」的单例全靠它）
  - **新增壳侧安装队列**（`src/pluginLoader/lifecycle/install-queue.ts`）：job 表（`jobId` 为全链唯一身份）+ **N=3 槽限流 + 严格 FIFO**（还槽时队首**直接接手**——不先减再加，防两个调用方双计）+ **同 pluginId 去重**（连点两次 = 一次安装，第二调用方等同一个结果）+ **10 分钟空闲槽级看门狗**（挂死的 job 不许永久占 1/3 槽；判据「还在动吗」不是「够快吗」，同 73e 下载层）
  - **槽锁下沉到 `installPlugin`**：包安装流与目录安装流**共用同一层**（只挂 `installWithProgress` 别名会漏掉目录源那条腿）
  - **池可达的 job 状态面**：新增公开事件 `plugin:installJobs`（走既有 `window.linkdesk.events` 广播管道，同族先例 `plugin:installProgress`）——插件禁 import 核心，状态只能走公开面；载荷 = 全量快照（不做增量，消费方整表替换）
  - **落盘快照**：未出结果的 job 写 `{userData}/install-jobs.json`——**这是「上次有 N 项安装未完成」那个 N 的唯一生产者**（E6#73l 读它）
  - **账本写串行化**（`src/core/services/PluginInstallService.ts`）：`add`/`markRemoved`/`reconcile*` 都是读-改-写，7 路并发各自读到同一份旧账本、各自写回 = **后者覆盖前者，最多丢 6 条账本**（插件装了但「已安装」判定说没有）。修法 = 一条 Promise 链，读-改-写三步入临界区
  - **下载临时名唯一化**（`electron/services/plugin-download.ts`）：并发后不许两条下载共用同一个临时名——**共用正式名会在 rename→extract 的窗口里把 A 的包换成 B 的（装错插件，静默）**。落盘名 = `<原包名>.dl-<seq>-<ts>` + `stripDownloadUniq` 在 extract / stage-update 两处 `zipBase` 剥回原包名
    - ⚠️ **不许改纯 `${pluginId}`** 的红线守住：包名本身一个字符没动，只在外层挂可剥后缀（`zipBase` 是 `deriveIdFromZip` 的 pluginId 回退来源）
    - ⚠️ **主动偏离设计原话（理由留档）**：设计写 `<name>.<jobId>.part`，实际用**下载层自有序号**——`downloadPackage` 被安装流与更新流共用，更新腿没有 jobId，挂在 jobId 上会让更新那条腿失去唯一化；且本服务在主进程、拿不到壳侧 jobId（跨进程）
  - **契约新增（向后兼容）**：`PluginInstallRequestOpts`（`pluginId`/`displayName`/`origin`）+ `PluginInstallResult.parked`（终态第三类「已安装，等待依赖」——**装上了但不可用，消费方不得渲染成「✓ 已安装」**）
    - ⚠️ **第二处主动偏离**：请求侧**不带 `jobId`**（设计列了 4 个字段，这里传 3 个）——job 表的单一生产者在壳，让池侧也传 jobId = 一个身份两个生产者；池侧从广播里**认领** jobId
  - 🔴 **本档结束时仍是 N=1**：`_installSession` **未拆**——拆闸属 E6#73c 第 2 步（开工硬约束「顺序不许反」：先把静默闸换成可见的「等待安装中」回执，再放开并发）。本档只把闸换成队列，**没有造出任何无上限并发窗口**
  - 未做（随 E6#73o，本档不产出无载体的空壳）：子包占槽 + 反饿死护栏
  - 新增单测 `install-queue.test.ts` 13 例（FIFO 与槽释放 / 槽位直接交接无超发 / 去重与等待方 / identifyInstallJob 回填后可去重 / 已结算不参与去重 / settle 幂等 / 排队态被结算不留僵尸 / 广播载荷无私有字段外泄 / 落盘快照只写未出结果 / 已完成 job 50 条内存上界 / 看门狗判死并归还槽位 / 心跳重置预算 / 排队态无看门狗）+ 下载唯一化 2 例 + 账本并发串行化 3 例。`npm run check` EXIT=0（134 文件 / 1786 测试）

## v0.1.29（2026-09-10）

- **fix:E6#73e 安装失败归因与超时——「一次慢网络 = 一次假失败」拆掉**
  - **下载有超时了**（`electron/services/plugin-download.ts`）：此前 `fetch` **零超时/零重试**——服务器半死不活（连上了、头也发了、就是不给字节）就**永远挂着**，用户既看不到失败也没有 [重试]。现加**空闲超时** 30s（判据是「还在动吗」，不是「够快吗」——总时长阈值会把慢网上的**健康下载**判死，那是把 10s 桥超时的老病换个门槛复活）+ **重试预算 2 次**（5xx / 408 / 429 / 网络中断 / 空闲超时可重试；**4xx 是确定性拒绝**——地址没了，重试只会同样失败，不消耗预算；用户取消恒不重试）+ `opts.signal` 外部取消（job 级 AbortController 的接入口，供 E6#73q 槽级看门狗与「取消安装」动作接）
  - **10s 桥超时不再打死安装**（`electron/ipc/ipc-bridge.ts`）：`plugins:call` 是单通道多方法，装/更新族一次调用要跑下载→解压→加载，**耗时时长由网络与包大小决定**，10 秒墙钟与它毫无关系——此前「装插件超 10 秒必判失败，而它其实还在装」。现立长任务方法名单（`install`/`installWithProgress`/`reinstall`/`update`）**不设请求超时**，兜底落回既有两处 `dispose()`；非安装方法仍 10s 兜底（豁免只在安装族，不整条通道开口子）
    - ⚠️ **主动偏离设计原话（理由留档）**：设计写「桥超时后取消安装」，改为「豁免 + 超时职责下沉到下载层」。保留一个有限阈值再在它上面挂取消只是把同一类误判换个门槛复活（E6#74 已立此论）；且真正的取消必须能命中**具体哪一个 job**，而这条计时器只知道 channel、不知道 job ⇒ **超时归下载层，取消归 job（E6#73q）**
  - **失败归因不再说谎**（`plugins/marketplace/src/services/marketplaceShared.ts`）：裸 `HTTP` 从网络正则里摘掉、**4xx / 5xx 单列两类**——此前一条 `HTTP` 子串吃掉所有 404/403/500，**下载链接失效被报成「网络连接不可用」**，用户于是反复查网络反复重试（真相 = 那个地址已经没了，而重试的其实是另一个插件）；`failText(t, labelKeyFn, reason, raw)` **参数化抽出共用组合规则**（可认 → 该域归因短语经 t / 认不出 → 引擎原文直显 / 原文为空 → 该域兜底），`updateFailText` 退成薄包装，**不得再落第二份同构拷贝**；失败通知**带插件名 + 引擎原文**；字典 default 撤「未知错误」谎
  - 新增单测 +16：下载空闲超时（挂死报超时 + 自清 `.part`）/ 5xx 自动重试至成功 / 4xx 只打一次不消耗预算 / 5xx 耗尽预算才认输 / 用户取消不重试；桥侧安装族半小时不超时 + 非安装方法仍 10s 超时；归因 http4xx/http5xx 单列 + 三位状态码判据 + 裸 `HTTP` 不再谎称网络 + 两域短语不串味 + `failText` 三支 + 薄包装等价。`npm run check` EXIT=0（133 文件 / 1768 测试）
  - **缺的一角（同批补，见 E6#73q/73d）**：**槽级看门狗**与**进行中行的「取消安装」动作**需要 job 句柄——随安装队列 job 表落地（§五 I.6① / §八⑤）

## v0.1.28（2026-09-10）

- **fix:E6#74 确认门 10s 桥超时——用户阻塞通道不再被超时打死**
  - **缺陷**：确认卡停留 **> 10s** 再点「确认安装」= **静默不装**（卡还在、点下去毫无反应、零提示零报错）；10s 以内点同一按钮正常。E6#71k 实机 CDP 验证时抓到并对照复现
  - **根因**：`electron/ipc/ipc-bridge.ts` 的统一 **10s 请求超时**打在 `dialog:confirmContent` 上——而该通道壳侧 handler 的语义就是「**等用户回答**」，天然无期。超时后池侧 Promise 已 reject，用户事后点按钮结算的是一个**死请求**（池侧 `Uncaught (in promise)`，用户侧全静默）
  - **修法**：`IpcBridge` 立「用户阻塞通道」名单（`dialog.confirm` / `dialog.alert` / `dialog.confirmContent`）→ **名单内不设请求超时**；未决请求兜底落回既有两处 `dispose()`（应用退出 / 壳崩重建），行为不变。**不选「把数字调大」**——任何有限阈值都会把同一类 bug 换个门槛复活
  - 新增单测 `ipc-bridge.test.ts`（5 例：confirmContent 60s 不结算 / 三成员半小时不结算且迟到回答照常结算 / 普通通道 10s 仍超时 / `dispose()` 仍拒绝 / 迟到回答不发二次结算）；**反证测试力**：临时关掉豁免 → 3 例立刻红
  - 实机 CDP 复验：富卡停 12s 再点确认 → **真装**（2.0.0）；纯文字 confirm 停 12s 再点确定 → **真卸载**；壳日志零 `请求超时`
  - ⚠️ **与 E6#71k「每次都问」无关**：该缺陷自 E6#71c 引入富内容确认（`dialog.confirmContent`）即存在，与 71k 的信任机制存废互不相关

## v0.1.27（2026-09-10）

- **feat:E6#72 通知面归一——删右下窄小卡，铃铛宽面板成唯一通知面并补齐三件事**
  - **72a 右下窄卡端到端删除**：池 `ToastHost.tsx/css/test` + `poolToast.ts` 类型整删、FloatingLayerHost 去 `#toast-root`；壳 `bridges.ts` #16 推流桥 + `toast.ts` 序列化面删；主进程链路删（channels 三通道 / plugin-view-handlers 两 handler / runtime-dto-registry / preload-pool `toast-dialog.ts`→`dialog-floating-panel.ts` 更名 / preload-shell poolApi / window-manager `pushToast`）；`linkdesk-api` 的 `toast` 宿主桥命名空间与 PoolExposed 面同步删。**通知数据一字未动**——两浮层本就同读一个 store，删的是窄卡那条渲染喂食链路
  - **72b 宽面板可复制 + 整句换行**：消息/来源去单行 ellipsis 截断改整句换行（`white-space:normal` + `overflow-wrap:anywhere` + `word-break:break-word` + `min-width:0` 四件套）；整条通知 `user-select:text` 可拖选复制（按钮排除），消息/来源给 `cursor:text` 视觉暗示
  - **72c 宽面板真进度条**：`NotifItem` DTO 加 `progress?/percent?` 透传 → 面板画 3px 进度行（确定态条宽 = 钳 0-100 的 percent，不定态强调色块扫动，复刻 E3e 原版 `ec88c40ec` 语义）；进度类通知图标换 `codicon-sync` + 转圈；`prefers-reduced-motion` 下停动画保静态呈现
  - **72d 重要通知自动展开**：壳 `buildNotif` 产 `autoOpen`（存在「重要（失败/警告/带按钮/长驻/进度）且未读」的通知，且面板当前关着）→ 池 `StatusBarZone` **false→true 边沿触发**开面板（持续 true 不反复、手动关掉不会被同一条弹回）；`setToastsSuppressed` 语义改「面板开合镜像」并更名 `setNotifPanelOpen`（原「隐藏窄卡」语义随小卡删除失效）；成功/普通 info 照旧安静自消
  - 新增单测 `notif.test.ts`（16 例：进度透传/percent:0 边界/图标替换/autoOpen 五类重要 + 已读 + 面板已开 + 回落）
  - 实机：CDP 验收（无小卡 / 无重叠 / 重要自动展开 / 可复制 / 进度真动）；`npm run check` EXIT=0

## v0.1.26（2026-09-10）

- **feat:E6#71g-j 安装失败反馈收尾——toast 主动作真触发 + 恒全显 + 真进度条 + 失败通知长驻**
  - **71g [重试]不再失效**：marketplace 命令组（enable/disable/uninstall/retryInstall + gear 菜单）注册自 index.tsx 模块顶迁 **marketplaceShared 模块底 `ensureMarketplaceCommands()`**（幂等 guard）——本模块被全部市场池面 import（侧栏已装/禁用/内置、探索、详情、落地页）+ 壳 glob loader 执行 marketplace entry 时也 import → 注册随**任一市场视图激活**即生效，安装失败 toast [重试] 落点自给自足，不再依赖落地页标签打开（此前详情页触发失败时壳 CommandRegistry 占位缺失 → console.warn no-op → 点 [重试] 无反应——实机 bug 根因）
  - **71h toast 恒全显 + 可复制**：删除折叠两态（chevron/expanded）——详情行（来源 + 动作钮）有内容即渲染；消息/来源 `user-select: text` 可拖选复制；长诊断整句换行全可见（`.toast-message` white-space:normal + overflow-wrap:break-word，单行截断拆除——长错误原文不再吞字）
  - **71i 安装进度条成真**：进度 toast 更新携 0-100 **真百分比**驱动确定进度条（下载段 Content-Length 真值）——percent 链 `pool preload update(msg, percent)` → `updateNotification` 第三参 → `toast.percent` → 池 fill 宽（钳 0-100）；不传 percent = 回不定态扫动动画（校验/解压段），数字仍在消息文案；update/cancel/finish 三方法 handle 契约
  - **71j 安装失败通知长驻**：toast `persistent` 旗标 → ttl:0 不自动消失（等用户决定/手动 ×），仅市场安装失败 error 落 persistent；常驻上限 `TOAST_PERSISTENT_CAP=5` 顶掉最老常驻（不碰自动消失 toast）；成功/info 自动消失不变
  - 实机：CDP 32/32 DOM 断言全绿（确定条 62% style+实际宽、去 percent 回扫动画名、越界钳 100、详情行动作钮恒显无 chevron、长文换行无溢出可选中、error 8s 自消 vs persistent 长驻、info 6s 自消、6 推只留 5 顶 #0 保 #5 含淘汰旧长驻）+ 5 张截图存档；`npm run check` EXIT=0（132 文件/1737 测试）

## v0.1.25（2026-09-09）

- **feat:E6#71c 安装确认弹窗归位壳 Dialog + 富内容槽 + 三确认归一**（0.1.24 实机 bug：市场自绘安装确认卡左上角贴墙、无全屏遮罩）
  - 🔥 壳 DialogHost 加可选 `content:{pluginId, renderPath, payload}` 富内容槽（[poolDialog.ts](src/core/types/pool/poolDialog.ts)）——present 时替代 title/message/默认按钮渲染，弹窗机制（居中/遮罩/Esc/Tab 焦点锁/点遮罩取消）不变；内容 = 插件视图经 `PluginComponent` 挂载（仿 FloatingPanel 声明寻址范式，壳零新增基建、核心无知）；payload 不透明序列化载荷随打开参数过壳→回池结构克隆，无跨 bundle 会话 store
  - 新 API（向后兼容可选）：`linkdesk.dialog.confirmContent({title, message, pluginId, viewId, payload})`（[DialogService.ts](src/core/services/ui/DialogService.ts) 内部走既有 renderer 结算回路，渲染器未注册兜底 window.confirm）`+ dialogHost.current()` 取数口；一条 IPC 通道 `dialog:confirmContent`（channels + PROXY + preload 双侧 + IpcBridgeHandler）
  - 市场迁移（plugin 1.0.3→1.0.4）：DetailView 自画 OverlayPortal mpd-confirm 整删 → `confirmContent` 富确认；ConfirmInstall.tsx 新视图迁入 content 槽（卡片排版/按钮仍市场自画，对标 VS Code「对话框壳、内容插件定」）；卸载/降级维持纯文字壳 confirm——装/卸/降级三确认共用同一 DialogHost 容器
  - 实机：CDP 富确认卡居中（`.dialog-host-panel` rect 居中）+ 全屏遮罩 + Tab 循环 + Esc/点遮罩关不误装 + 确认安装真装闭环；`npm run check` EXIT=0（132 文件/1730 测试）

## v0.1.24（2026-09-09）

- **fix:E6#70d 说明区页内 `<video>` 全屏修复**（0.1.23 回归——点全屏首点无效需二次点、全屏态困死退不出）
  - 🔥 根因两层：① MarkdownView 把 components override（video/img/source）字面量写组件体内 → 窗口一变尺寸重渲染即换函数引用 → react-markdown 元素 type 变 → `<video>` 被 React **重挂** → Chromium 即时终结元素全屏 → 首点全屏被踢出（「整窗先全屏、视频没变」）；② 池 WebContentsView 是全屏桥盲区——Electron 默认把宿主窗拉进原生全屏但池 bounds 不随动（视频只盖旧视口）+ 帧窗自绘标题栏只懂最大化、□ 对全屏态是 maximize() no-op → 用户被困
  - 修复：MarkdownView components 提模块层 `makeComponents(assetBase)` + `useMemo` + 整组件 `memo`（窗口 resize 不再重挂视频，首点即稳定提交全屏——[MarkdownView.tsx](src/components/shared/markdown-view/MarkdownView.tsx)）；window-manager 全屏桥四条监听（enter/leave-full-screen × enter/leave-html-full-screen）——进全屏即时重铺池 bounds + 450ms settle 兜底过渡竞态，元素退出强制还原宿主窗（防被困——[window-manager.ts](electron/windows/window-manager.ts)）；main.ts 逃生口——全屏态点 □ = `setFullScreen(false)` 还原窗口（[main.ts](electron/main.ts)）
  - 实机：CDP 首点 round-trip fs:true 池铺 1920×1080、退出还原 1400×900；用户手测「一次点铺满 + 退出一次还原 + 有声音」确认无误；`npm run check` EXIT=0（128 文件/1692 测试）

## v0.1.23（2026-09-09）

- **feat:E6#70c + E6#70d 详情页说明区媒体画布·封面外链视频 + 页内真播视频**（README 外链转系统浏览器、`<video>`/mp4 页内可播）
  - #70c 外链 window-open 路由：新建 `setupExternalLinkRouting`（electron/windows/external-links.ts）全局 `web-contents-created` 挂 `setWindowOpenHandler`——https?/mailto → `shell.openExternal` 交系统默认浏览器并 deny、其余协议一律 deny（消灭 Electron 默认「裸 BrowserWindow 载外部页」）；30.6a 既有 `<a target=_blank>`（GitLens 式封面外链）天然吃到此路由，零额外消费点
  - #70d MarkdownView 页内媒体：消毒 schema 扩 `video/figure/figcaption` + `source`（defaultSchema 加白名单，script/事件属性/javascript: 剥除不受影响）+ video/source override——src/poster 相对路径经 `assetBase` 落「被查看插件包内」、`controls` 强制给、`preload` 顶格 metadata、**`autoplay` 消毒层剥 + 组件双保险**（打开说明绝不自动播）
  - #70d 协议层 🔥 Range/206 根因修复（electron/plugins/protocol.ts）：Chromium 媒体加载器以 `Range: bytes=0-` 探测，原 handler 忽略 Range 回 200 全长且无 Content-Length/Accept-Ranges → `MEDIA_ERR_SRC_NOT_SUPPORTED` → 补单段 Range 解析 + `206` + Content-Range/Content-Length/Accept-Ranges；非媒体不带 Range 走 200 全长补齐头部（图/脚本零回归）；mime 补 `.mp4/.webm/.m4v`
  - 实机 CDP：serial-monitor 详情说明区 `<video controls>`（用户临时 mp4 素材）readyState=4、play() 后 currentTime 走 = 页内真播；window.open file:/data:/about:blank 全 deny、无裸 Electron 新窗；验完临时素材撤净

## v0.1.22（2026-09-09）

- **feat:E6#70a 详情页说明区媒体画布·静态图链路打通（README 相对图显形）**
  - MarkdownView 加 `assetBase?` prop：说明渲染注入「当前被查看插件」→ README 里裸/相对路径图解析成 `linkdesk://{插件}/…` 包内资产并真加载（纯数据注入零插件名；仅 https:/linkdesk: 放行、无 assetBase 保旧行为零回归）
  - DetailView 仅已装读包 README 注入 assetBase；远端 readmeUrl 不带（诚实不显）
  - SDK 打包器自动扫 README 引用的包内资产随包（`![]()`/`<img>/<video>`，copyFileInto isWithinRoot 守卫）
  - 6 只已嵌封面插件 bump + 随包 zip 重建（editor 1.0.4 / file-tree 1.0.3 / python 1.0.3 / settings 1.0.3 / serial-monitor 1.0.6 / marketplace 1.0.2）
  - 实机 CDP：设置 + 串口监视器 详情说明区封面真显（linkdesk://…/cover.svg naturalWidth=640）

## v0.1.21（2026-09-09）

- **feat:E6#69 图标身份分工·改向批——三图模型（Type-2 身份图 / Type-1 界面剪影 / 文件类型图）落地**
  - #69a/#69c 插件身份 Type-2 彩色图：editor/python/lang-defaults/theme-aurora-glass/theme-terminal 单 `icon`（回退自动）、serial-monitor/settings/file-tree/marketplace 双字段（Type-1 剪影 icon-bar.svg / Type-2 icon.svg）——市场侧栏行/详情头与标签栏视图标签同图；#68 封面 marketIcon 语义废止（cover 移 README，零市场消费）
  - #69d Type-1 剪影：图标栏插件 icon 字段 = 单色线稿（壳只读 icon 不变）
  - #69f/#69g 共享身份/文件类型裁决：`pickIdentityArt`（marketIcon ?? icon ?? 默认彩色块）+ 共享 `FileIconResolver` 上移 @linkdesk/ui 单源码——文件标签与文件树同源文件类型图、随 `app.iconTheme` 即时重算（config listener → layoutVersion）
  - 市场行≈32 / 详情 128px 双位同图；schema 三副本 icon/marketIcon 描述改向 + 图标文档 06-图标.md 重写（三图模型 + 第三方最小契约）
  - 9 只插件随包 zip 重建（SDK 6 + pack 3）+ 插件版本 bump；文件/标签/市场双位同图实机 CDP 验证


- **feat:E6#66 + E6#67 市场图标系统收尾——默认展示图规定 + 双图标字段**——市场展示位显「展示图/封面」大框、无配图插件落统一默认封面
  - #67 双图标字段：`PluginManifest` 顶层加可选 `marketIcon`/`marketIconSource`（形状照 icon/iconSource；值 = 包内 svg 资产相对路径、source 省略 → linkdesk:// 路径推断）——`icon` = 界面小图标（壳只读它，**零壳改动**）；`marketIcon` = 市场展示图 cover art（可复杂 640×640）。schema 三源副本 + contracts:gen additive 零漂移 + PluginListSubset/list() 投影带两字段
  - #66 默认展示图：市场无配图插件由 📄 emoji / codicon-symbol-misc 兜底 → 统一默认封面（A 家族「dock 装入」640×640 自含 SVG，data-URI 内置于市场插件，零构建耦合）——市场层唯一裁决 `display.ts`（展示位 = marketIcon ?? icon ?? 默认封面；行内位 = icon ?? marketIcon ?? 默认封面，28px 不硬压 640 封面；恒返有效 descriptor → 消费点零分支，ExtensionItem/ExploreView/DetailView/DisabledListView 全接）
  - 详情展示位 52 → 96px 方框（2026-09-09 用户拍板）；`.mpd-icon-codicon` 占位与 DetailView codicon-symbol-misc 分支删除
  - SDK 打包器随包拷 marketIcon 资产；serial-monitor 验证样本声明 marketIcon=resources/cover.svg + 1.0.2→1.0.3 + 单只 zip 重建（含 cover 落 bundled-plugins）
  - 实机 CDP 9222：串口监视器 图标栏/行 = icon.png 小图标、市场详情头 96px = cover.svg「串口的窗」——双图标各就各位；Python（无配图）详情头 96px + 列表行显默认封面（非 📄/几何）；theme-aurora-glass 行显 icon.svg；壳回归干净
  - 版本 0.1.19→0.1.20（0.x 向后兼容新增走 patch 位；#68 铺剩余封面仍暂停待用户点名）

## v0.1.19（2026-09-09）

- **fix:E6#65 市场图标系统批次一·数据通道修复（14 档案 A/B）**——市场拿到各插件现有图标（serial-monitor/settings 彩 PNG、marketplace/aurora/zones SVG、file-tree lucide 立显）
  - 根因：`list()` IPC 序列化子集（PluginListSubset）当初收窄为 8 字段时把 `icon`/`iconSource` 删了（types.ts 注释自认「与 list 7 字段对齐」）→ 行组件想传也没得传 → 市场恒 📄 emoji；详情页 `iconManifest` 又只读市场目录 `entry`，无目录条目即 `codicon-symbol-misc` 几何兜底
  - 修三处：① 数据通道——`PluginListSubset` + `IpcBridgeHandler/pluginManager.ts` list() 投影补 `icon?`/`iconSource?`（contracts 重生成）；② 行组件——ExtensionItem 把 `manifest` 传入 `PluginIcon`（此前恒无 manifest）；③ 详情回退链——DetailView `iconManifest` 补「已装 manifest.icon → 兜底」第二环
  - 实机 CDP 9222：list() 22 插件 icon/iconSource 随行实证（serial/settings/marketplace/aurora/zones/file-tree）；已装行 串口监视器→IMG、悬浮面板→codicon、极光玻璃/分区纹理→IMG（修复前全 📄）；详情头串口监视器走 manifest 回退显 IMG 而非几何符号
  - 版本 0.1.18→0.1.19（0.x 向后兼容修复走 patch 位）

## v0.1.18（2026-09-09）

- **fix:E6#30f 目录空态语义修复（官方仓库实装后实机发现的空态误报 bug）**——官方目录源从「404 无缓存」变「200 空目录」后，探索页把「市场连上了但还没插件」误显示成「无法加载市场，请检查网络后重试」
  - 根因：`loadCatalog` 判空态只看合并条数 `entries.length===0` → 连上空目录也整体降级 offline（与自身「ok = 至少一源交付目录」契约相悖）；探索页空态只有损坏/无法加载两分支，空-ok 状态无出口（「暂无插件」文案成死代码）
  - 修：空态判据改为交付源数 `sources.length===0` 才降级 corrupt/offline——官方仓库建好未上架（`{"plugins":[]}`）= 合法 ok 空态；探索页空态三分支——ok 空「市场暂无插件」（非故障，无重试）/ corrupt「目录损坏」+重试 / offline「无法加载」+重试
  - 官方仓库 `Encaron/linkdesk-marketplace` 公开直链（main + HEAD）均 HTTP 200 返回合法空清单
  - 实机 CDP 9222：池冷启动后市场→探索插件，真网络拉官方空目录 → 显「市场暂无插件」（修复前同况显「无法加载市场」）；单测 +2 钉空态语义
  - 版本 0.1.17→0.1.18（0.x 向后兼容修复走 patch 位）

## v0.1.17（2026-09-09）

- **fix:E6#64 L3.5.2 事件反馈归一（档案 13 §一 A1-A3，2026-09-09 定案 1-5）**——市场安装/启停/更新的「出事方式」统一成右下角小通知（toast=操作回执），去阻塞弹窗 + 行内长红字推 UI
  - A1 探索/搜索视图 4 处阻塞式 `dialog.alert` → 事件型 error toast（缺下载地址 / 无安装通道 / 本地目录安装失败 / 抛错）——`notifyError()` 统一入口（11-API §三 事件通道）
  - A2 详情页事件型失败（装门/升级/启用/禁用/卸载抛错）全走 error toast；离线/已装冲突类静默（按钮置灰 + title「联网后重试」/「已装」已表达）；`setError` 行内红字字段 + `.mpd-action-error` 独占行 CSS/JSX 整删
  - A3 装失败收敛成一处重试口（mockup 02 帧 3）——toast [重试]（settle 既有）+ 详情页安装钮原位变红「↻ 重试安装」（danger + refresh，走 retryMarketInstall 同单活跃会话）；页中「失败+重试+✕」行删；`dismissMarketInstallError` 死导出连删
  - 定案 2 缺失件补上：主动点装即弹**角落常驻进度条**「正在安装 xxx…」（跨标签页仍挂角落；随进度更新百分比；成功终局 = lifecycle「已安装」toast 补句、进度条 cancel 收不双 toast；失败 = settle error toast 接续）——全走既有 #13.5 通知中心零新壳 API
  - i18n：en.json 补「正在安装 {{name}}…({{percent}}%)」两条进度键
  - 实机 CDP：详情页已装态零回归（禁用/卸载 render、无残留错误行）；壳 toast 宿主 progress 开/文案推进/cancel 收 + error 展示实证；残余 = 真装下载流程未实机（官方目录源 404 无缓存，既有 #30.5 残余）

## v0.1.16（2026-09-09）

- **fix:E6#63 L3.5.1 详情页版式对账（档案 13 B1-B5）**——插件详情页纯 CSS + DetailView 结构一次成型
  - B1 动作（安装/卸载/更新 + 自动更新勾）从 header 下方整行移入 header 右上动作列 `.mpd-acts`（mockup 01 竞标 A `.pdva` 三段一行）
  - B2 icon 位 96→52（内图 codicon/emoji 40、徽标 20）+ header 面板下加 `--separator` 分隔线
  - B3 右侧信息栏改 VS Code 式分组（顶部小段 + 市场/类别/资源/依赖·环境，空组隐藏）+ label 左｜value 右横排 + 项间细分隔 + 分类 chips 并排 + 作者行补齐（manifest 缺省回退目录 author，禁用态 header 副题/侧栏不塌）
  - B4 去 880 限宽全宽铺满 + 右侧信息栏定宽 220（`flex:none`）
  - B5 壳保底 PluginDetailView 同构对齐（头部钉顶 + body 独占滚动 + icon 52/40/20，CSS-only）；`.mpd-detail` 根 overflow hidden
  - 门禁同步：check-font-scale-audit 白名单随 icon 收敛值更新；en.json 补 市场/类别/资源/依赖·环境 4 组题键
  - 实机 CDP：1075 全宽 / icon 52 / acts 距右 20 / 侧栏 220 flex-none / 空组隐藏 / body 滚 2159 头钉 top65

## v0.1.15（2026-09-09）

- **feat:E6#62e 纯贡献插件激活机制裁决三件落地**（承接 #579 ③ / #9g——用户三裁决：整体退役 + 建池侧 on-command + boot 自动清）
  - 壳侧 deferred 激活轨**整体退役删除**——`activationEvents` schema 属性删（×3，`additionalProperties:true` 兜底旧 manifest）+ activation.ts/preActivateHook/defer 接线全撤（零插件声明过，潜伏态无消费方）
  - 纯命令/纯贡献插件按需激活 = **池侧 on-command**——命令 miss → 池 `resolvePluginViewLoader` 按 URL import 属主入口（underscore 内部面，作者面零新 API；author 契约 = 命令注册在入口顶层）
  - `plugin.json` 生命周期/contributes 规范文档同步（activationEvents 退役记 + 池按需激活模型）
- **fix:E6#11e-342 旧 `.disabled/` 坟场引导 = boot 自动清**——跨重启孤儿逐条真删 + 幽灵 uninstalled 缓存清（loader 启动 Step-8；取代「从市场重装」提示引导）
- 连带死代码清理：write-only bundle 标记集整删（`isBundlePlugin`/`markBundlePlugin`/`syncBundlePluginIds`）

## v0.1.14（2026-09-09）

- **feat:E6#62d statusBar 池侧 glob 最后退役 + dist export 约定**
  - `appearsIn.statusBar` bool → 相对路径字符串（存在 + 文件二合一声明，对标 view render；schema 三副本同步 + contracts 重生成）——serial-monitor 状态栏组件随包自声明，不再编入壳/池 bundle（硬约束 11）
  - loader 注册时归一 `statusBarRenderPath`（dev `/@fs` 源码 / prod `linkdesk://` dist）→ 池 `PoolStatusBarComponent` 整删构建期 `import.meta.glob` → 按 URL 直动态 import + bundleCss 引用计数
  - SDK 收 statusBar 面——zip 根 `statusBar.bundle.js` + dist manifest 字段改写；serial-monitor 1.0.2 随批重建进 bundled-plugins

## v0.1.13（2026-09-08）

- **feat:E6#62a/#62b/#62f dev 源码 glob 快轨退役 + 协议收单根**（#62 家族同批拆）
  - E6#62a state.ts 拆双 glob——`pluginModules` 入口 glob + `usesSourceGlobTrack` 整删；`pluginManifestRaw` 收单职（浏览器预览种子，Electron 零消费）；源码树成员判据 → IPC 直查（readManifest/resolvePath）
  - E6#62b glob 内 dev 快轨退役——runtime.ts Step1/3/4 glob 分支 + contributions `loadPluginComponent` + PluginComponent mis-root 恒空双 glob 表整删；全插件收单 URL 轨（dev /@fs 源码 | prod linkdesk:// dist）
  - E6#62f `linkdesk://` 协议收单一 userData 根——prod（app.isPackaged）单根；dev 保 [app, userData] 双根

## v0.1.12（2026-09-08）

- **feat:E6#33 更新与版本**（第 3.3.2 轮整轮收束，实机 CDP 全链验收）
  - E6#33a 插件更新发现编排——市场池首载调度，每版本一次幂等铃铛通知 + 常驻可更新候选
  - E6#33b 升级入口 UI——详情页更新块/更新按钮 + 侧栏「可更新」行徽标 + 双版 changelog 并排
  - E6#33c 版本下拉 + 手动降级——selectableVersions 版本选择 + F2 降级确认 + `pinnedVersion` 记账（engine `allowOlder` 显式放行）
  - E6#33d 自动更新勾选——插件级 Opt-IN 默认关，静默自动编排，选旧版记 pin 暂停 auto
  - E6#33e 原子切换更新执行（引擎已收于 E6#13c）——失败旧版保留
  - 收 #30.9a M6 版本下拉/autoUpdate 置灰；#30.8e 更新权限重审批随 E6#49
