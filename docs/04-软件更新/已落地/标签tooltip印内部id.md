# 已落地 · 标签 tooltip 把内部 id 当文案（`settings-2` / `serial-monitor-49`）

> **已落地（2026-09-27 用户实机发现 → 分析 → 拍板 C 案 → 当日实现 ＋ 两条回归用例；✅ **已发版 v0.2.21**〔2026-10-04 销账订正：`git tag --contains 62093af64`〕）。
> **用户原话**：「我假如开了一个设置标签页，为什么 native tooltip 显示的是 `settings-2` 这个 -2 是什么意思？类似的还有我开了一个串口监视器新会话，native tooltip 显示 `serial-monitor-49`」。
> **拍板**：**C 案 = 壳推展示字段（`PoolTab.hint`）、池只渲染**；⛔ 不动 `sourceId` 语义（它是插件公开的功能键）。
> **归属**：软件本体（壳 ↔ 池载荷）——不涉任何插件、不涉 SDK、不涉配置。

## 零、先修正两份前判（免得后人照错的方向改）

| 前判 | 实情 |
|:--|:--|
| 「这是**原生** tooltip（HTML `title` 属性）」 | ❌ 池侧收编 HintTip 时已把该值搬进 **`data-hint`**——用户看到的其实是**我们自己的提示条**（`GroupTabBar.tsx:315-321`）。机制换了，**文案来源没换**，所以现象一样 |
| 「池层还有原生 `title` 漏网（标题栏命令按钮）」 | ❌ **错两处**：`Button` 组件内部把 `title` prop 映射成 `data-hint`（`src/components/shared/button/Button.tsx:57`，文件头注释明确写「`title` 是悬停提示，不是 DOM 的 `title=`」）；`SidebarSection.title` 是**标题文字**（tooltip 另有 `titleTooltip` 字段）。**池层已无原生 tooltip** |

## 一、根因：一个**功能键**被拿去当**用户可见文案**

`GroupTabBar.tsx:315`（改前）：`data-hint={tab.sourceId ?? (tab.pinned ? … : \`… — 双击固定\`)}`。

`sourceId` 的设计用途写在它自己注释里（`src/hooks/useTabManager/defaults.ts:47`）：「**跨组移动/事件寻址**用此 ID」；它还是**插件公开契约**——插件 API 就是 `tabs.closeBySourceId / focusBySourceId / updateLabelBySourceId`（串口插件正是用它把会话数据绑到标签页，见 `useSerialControlPanel` 一路）。这样一个键，被打印给了用户。

两个数字来自**两个互不相干的计数器**：

| 现象 | 数字从哪来 |
|:--|:--|
| **`settings-2`** | 壳侧 tab id 自增计数器。`settings/plugin.json` 的 `tabBehavior` 只有 `{"singleton": true}`、**没有 `identityField`** ⇒ `tabIdentity.ts:89` 生成 `${type}-${n}`；`defaults.ts:56` 在无身份字段时把 `sourceId` 回填成这个 id。计数器是模块级内存，**`resetPluginCounter`（`tabIdentity.ts:61`）在生产代码里零调用者**（只有定义 ＋ 测试用），`syncCountersAfterRestore` 还会按已存在 id 把它抬高 ⇒ 进程内只增不减。**`-2` ≠「你开过两次」**——恢复的布局里已有一个 `settings-1` 就够把它抬到 1，下一个新建即 2；singleton 保证你同时只看得见一个 |
| **`serial-monitor-49`** | **不是壳给的**，是插件自己的会话 id：`useSerialSessions.ts:21` 的 `id: id \|\| \`serial-monitor-${++_store.sessionCounter}\``，经 `useSessionCrud.ts:56` 的 `tabs.create("serial-monitor", { label: name, pinned: true, sourceId: session.id })` 当 sourceId 传进来。计数器写 localStorage（`store.ts:56/66-69`），**删会话不递减、只有 `resetAll()` 归零** ⇒ 49 = 历史上建过的第 49 个会话 |

**为什么会写成这样**：E5#53 的原意只有一句「**文件标签的 tooltip 显示完整路径**」。当年 editor 标签的 `sourceId` 恰好等于文件路径，于是被实现成「**有 `sourceId` 就打 `sourceId`**」——**一个巧合写成了规则**。`filePath` 不随池载荷下推后，插件标签的 `sourceId` 就漏到了用户眼前。

⚠️ **这不是 HintTip 引入的 bug**：收编只是把同一个字符串从原生 `title` 搬进 `data-hint`。但收编时「机械照搬属性值」确实没拦住这个值——**判据建议补一条**：新增 hint 站点时问一句「这段文案是人话吗」。

## 二、改法（C 案 · 已落地）

| # | 改了什么 | 位置 |
|:--:|:--|:--|
| 1 | `PoolTab` 加 `hint?: string`——**只给人看**，带 🔴 反例注释（别拿 `sourceId` 当文案） | `src/core/types/pool/poolLayout.ts` |
| 2 | 序列化推 `hint: resolvePoolTabHint(tab.filePath)`——真文件标签给完整路径（E5#53 原意），其余 `undefined`（空串也不算） | `src/hooks/usePoolSync/windowLayout.ts` |
| 3 | 池侧 `data-hint={tab.hint ?? (tab.pinned ? tab.title : \`${tab.title} — ${t("双击固定")}\`)}`，⛔ 不再读 `sourceId` | `src/pool/shared/group-tab-bar/GroupTabBar.tsx:321` |
| 4 | **同案收口**：`disambiguateLabels`（同名标签加父目录后缀）也从 `hint` 取来源——单段内部 id 虽取不到父段不显形，但插件 id 含 `/` 时会把垃圾父段印进**可见标签名** | 同文件 `disambiguateLabels`（`:69`） |
| 5 | 两条回归用例：filePath → 路径（＋空串边界）／`sourceId` **绝不**进文案（`settings-2`、`serial-monitor-49` 两个真身） | `src/hooks/usePoolSync/windowLayout.test.ts` |

**为什么另两条不投**：

- **池侧嗅探路径**（`looksLikePath(sourceId)`）：把「什么是路径」的知识塞进哑渲染器，且插件 sourceId 里真出现 `:\` 就误判。
- **壳侧不回填 `sourceId`**：**危险**。`sourceId` 是插件公开契约（三个 `*BySourceId` API）＋跨组移动/事件寻址的键，回填正是让这些 API 对「无身份标签」也能工作；且串口那种 sourceId 是插件**显式**给的，置空直接断链。**这正是本次不走 B 的判据：动语义 vs 加字段，只能选后者。**

口径一句话：**文案归壳算**（与同函数里 `title`/`icon` 同一条「壳想池画」），**`sourceId` 只当功能键**。

## 三、验收（dev 手测）

1. 开设置标签页 → tooltip 是「设置 — 双击固定」，**不再出现 `settings-2`**。
2. 串口监视器新建会话 → tooltip 是会话名，不再是 `serial-monitor-N`。
3. 打开文件标签 → tooltip 仍是**完整路径**（E5#53 行为不许丢）；同名文件标签仍带「 • 父目录/」去歧义。
4. 双击固定某标签 → 「双击固定」后缀消失（pinned 分支未动）。

## 四、边界与遗留

- 「双击固定」后缀留在池侧（它依赖池侧交互知识），本次未动；**singleton 标签（设置）是否还该显示这个后缀未拍板**——嫌啰嗦可另立小件。
- 同一类口子（**内部 id 当文案**）还有一处未处理：菜单/槽位按钮在命令**未自报 `title`** 时回退成 command id（`usePoolSync/titlebar.ts:74` 与 `TitleBarSlotButton.title` 的类型注释都写着这个回退）——属「菜单补全」那件的面，本次不碰。
- 本件是**同一根因的两处实例**（tooltip ＋ 可见标签去歧义），都已收口；池层其余 `sourceId` 用法均是把值传给插件（`PluginComponent` / `TabContentLayer`），属功能用途，保留。
