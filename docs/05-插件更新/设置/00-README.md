# 05-插件更新 · 设置插件（首开形态：悬浮面板 / 标签页）

> 2026-09-27 建；**同日发版**——插件 v1.0.20 已发 Release，npm 作者轴三包已发（§七）。⚠️ 仅 **官方目录收录**未做（写另一个仓，等点头）；**真机验收**仍挂 §六·7。
> **一句话**：插件声明「第一次打开我的面板」用哪种形态，**壳决定并执行**；作者可定死（`defaultForm`），也可把选择权交给用户（`formKey` → 设置页出现一个下拉）。首个实例 = 官方设置插件（`settings.openForm`，默认悬浮面板，保持今日行为）。
> ⚠️ 设置插件源码**不在本仓**：`E:\linkdesk-plugins\official\settings`（独立 git 仓）⇒ 本刀为**跨仓双提交**，见 §二。

| 项 | 值 |
|:--|:--|
| 类别 | 插件更新（设置插件专项）＋ 壳侧通用接缝 |
| 插件版本 | **1.0.20**（本刀改动落进 1.0.20；发布实绩见 §七） |
| `minAppVersion` | 0.2.20（**有意不升**——降级安全，理由见 §六·2） |
| 状态 | 🟢 代码/测试/文档全绿；插件 ✅ 已发（Release v1.0.20）、npm ✅ 三包已发；壳仓 ⏳ 未推 |

---

## 一、这是什么（用户原话与边界）

用户需求，原文三连（**范围被本人收窄三次，逐字**）：

> 「我要的是**第一次打开的方式**有个选择权，第一次打开的方式有个选择权，第一次打开的方式有个选择权！其余的至于打开后我想怎么换形式当然继续按原来的就行。」

即：**只管 `core.openSettings` 里「此刻还没有设置标签页」那一支**。打开之后想怎么换形态（标签页右键「在悬浮面板中打开」、面板右上角「在主窗口中打开」）**一律不动**——那些是既有能力，本刀一根手指都没碰。

**用户要的不是设置插件特例，是一条通用接缝**：

> 「归一化，无死编码，无硬编码，高内聚，低耦合…这个打开方式是个通用功能对吧！凡是使用悬浮面板的都可以使用。想让用户使用则在设置中声明出来。」
>
> 「在本次后改壳后，后面的插件，比如插件市场插件，想添加自己的悬浮面板，同时选择打开方式，则**完全不用改壳**。」

**分工（用户自己提出来问、我确认的模型）**：
- 插件——「插件更多的是说一声我想使用（标签页/悬浮面板）打开我的面板」⇒ **只声明，零执行权**。
- 壳——「打开悬浮面板还是打开标签页还是由软件来控制的对吧？」⇒ **壳决定并执行，零插件知识**（壳侧不出现任何插件 id）。

demo 插件（`floating-panel-demo`）**不改**——用户明确：「它只是当时在设置插件进入悬浮面板前的测试面板的插件」。

---

## 二、改动清单（跨仓两笔）

### 壳侧（`e:\linkdesk`，一笔提交）

| 层 | 文件 | 做了什么 |
|:--|:--|:--|
| 契约类型 | `src/core/api/types.ts` | 新增 `FloatingPanelOpenForm = "floatingPanel" \| "tab"`（**值即形态，无映射层**）＋ `ContributesFloatingPanel` 加 `defaultForm?` / `formKey?` |
| 声明读取 | `src/pluginLoader/contributions/viewRegistry.ts` | 新增 `getFloatingPanelDeclaration(pluginId)`——**唯一读取点**（原 `getFloatingPanelViewId` 改为它的派生，行为不变） |
| 判定接缝 | `src/core/services/ui/floatingPanelForm.ts`（新） | `isFloatingPanelOpenForm`（词汇表）＋ `resolveOpenFormFromDeclaration`（**纯函数**判定链）＋ `resolveFloatingPanelOpenForm(pluginId)`（接配置系统） |
| 命令接缝 | `src/core/commands/shell/settingsCommands.ts` | `core.openSettings` 内、聚焦支之后、面板 reveal 之前插入一支：`form === "tab"` 且该插件视图可开标签页 → `openTab` 并 return |
| 作者门禁 | `public/schemas/plugin.schema.json`（＋3 份同源副本） | `floatingPanel` 加 `defaultForm`（enum 闭集）/ `formKey`（string）＋ **`"not": { "required": ["defaultForm","formKey"] }` 互斥红线** |
| API 快照 | `scripts/host-api-surface.json` | `npm run api-surface:regen` 重生成（+5 行） |

判定链（`floatingPanelForm.ts`，一行一句）：

```
无 floatingPanel 声明            → null（= 原行为，存量插件/demo 零影响）
formKey 有值且键已注册、值合法    → 该值（用户说了算）
formKey 有值但键没注册 / 值非法   → 降级 defaultForm → 再不行 null（不崩，出声）
只有 defaultForm                 → 合法值用它；非法值 null（schema 已先拦）
```

### 插件侧（`E:\linkdesk-plugins\official\settings`，另一笔提交）

`plugin.json` 加 `contributes.configuration`（`title: "设置插件"` = 用户要的**这一类名**）＋ `floatingPanel.formKey: "settings.openForm"`：

```json
"floatingPanel": { "viewId": "settings", "formKey": "settings.openForm" },
"configuration": {
  "title": "设置插件",
  "properties": {
    "settings.openForm": {
      "type": "string",
      "enum": ["floatingPanel", "tab"],
      "default": "floatingPanel",
      "group": "打开方式",
      "description": "打开设置时的形态——floatingPanel 悬浮面板 / tab 标签页（只管第一次打开；…）"
    }
  }
}
```

`plugin.json` 里的 `version` / `minAppVersion` 在这一笔都**没动**（改的是声明本身）；发布那一笔才把 `version` 提到 1.0.20，`minAppVersion` 维持 0.2.20（**有意**，见 §六·2）。

---

## 三、判据（机械证据，全部现跑过）

| # | 判据 | 证据 |
|:--|:--|:--|
| ① | 判定链三档 × 边界值 | `src/core/services/ui/floatingPanelForm.test.ts`（15 用例）：无声明/两值 defaultForm/非法 defaultForm/键命中/键坏值降级/键优先/空串当没写/词汇表 |
| ② | 命令级两向负控 | `src/core/commands/shell/settingsCommands.test.ts`（7 用例）：未声明→面板事件一条；`defaultForm:"tab"`→`openTab` **且 reveal 事件为 0**；反向 `floatingPanel`→只面板；已有标签页→聚焦优先、两条路都不走；tab 声明但视图不可开标签页→落回面板；键未注册→降级 |
| ③ | **schema 互斥红线**（壳侧无分支可拦，只有 schema 拦得住） | `packages/plugin-sdk/src/validate.test.ts` 新增一组 7 用例，含负控：两者并存 → `invalid`（失败关键字 `not`）；`defaultForm:"panel"` → `invalid`（`enum`）；`formKey: 123` → `invalid`；缺 `viewId` → `invalid`；不声明 → `valid`（零回归） |
| ④ | 官方插件 plugin.json 合法 | ajv draft-2020 对 live schema 实跑：本体 `true`；负控「非法 defaultForm」`false`、「两者并存」`false ["must NOT be valid"]`、「formKey 非字符串」`false` |
| ⑤ | 四份 schema 同源 | `public/schemas/` ↔ `docs/03-插件制造/` ↔ `packages/plugin-sdk/schemas/` ↔ 生成物（`check-plugin-schema-sync` + `generate-plugin-docs --check`） |
| ⑥ | 作者文档 zh↔en 配对 | `docs/03-插件制造/03`（§3.15 新增「首开形态可配」小节）· `06`（路由接缝 ⑤ **已顺手改正**）· `10`（设置插件）＋ `docs/03-plugin-authoring/*` 镜像 ＋ 生成物 47 文件 |

测试踩坑留档（值得写进下个会话的脑子）：`ShellEventBus.on()` 订阅时会**重放缓冲的最后一条载荷**，所以命令测试**不能**用 `shellEvents.on` 数事件（会数到上一个用例的 emit）——改用 `vi.spyOn(shellEvents, "emit")` ＋ 过滤辅助。

---

## 四、入口普查（本刀覆盖到哪、哪没覆盖）

「打开设置」的全部 UI/命令入口最终都汇到 `core.openSettings` 这一个命令——**故本刀一处生效、全入口同款**：

| 入口 | 落点 | 受本刀影响 |
|:--|:--|:--|
| `Ctrl+,` | `shellKeybindings.ts:10` → `core.openSettings` | ✅ |
| 文件菜单 | `shellMenus.ts:21`（group `file`） | ✅ |
| 齿轮菜单（ExtensionGear） | `settingsCommands.ts:105` | ✅ |
| 底部齿轮图标 | `IconBarZone.tsx:221` 左键弹 ExtensionGear 菜单 → 同一条命令 | ✅ |
| 命令面板 | `registerCommand` category「视图」 | ✅ |
| 快捷键设置命令 | `persistence.ts:138` → `CUSTOM_EVENTS.OPEN_SETTINGS` → `icon:selected`（`tabActions.ts:45` 只对 tabOnly 插件开标签页） | ❌ **第二条路**，不经过 `openSettings`——见 §六·3 |

**有意不在本刀范围**（用户明确「其余照旧」）：

| 路径 | 位置 | 说明 |
|:--|:--|:--|
| 标签页右键「在悬浮面板中打开」 | `panelCommands.ts:150` | 打开**之后**的形态转换，原逻辑不动 |
| 插件公开 API `panel.revealFloating(viewId)` | `IpcBridgeHandler/panel.ts:18` | 插件主动直开面板，不是「首开形态」问题 |
| 面板右上角「在主窗口中打开」 | `floatingPanelReveal.ts` 相关 | 同上 |

---

## 五、设计要点（为什么长这样）

1. **值即形态，无映射层**：`"floatingPanel" | "tab"`——配置值、声明值、壳内分支比较用的是**同一个字符串**。刻意不用布尔（`true=面板`）那种写法：布尔必须配一层 `true → "floatingPanel"` 映射，且第三种形态一来就得推翻。同类先例：`editor.autoSave` 的字符串枚举。
2. **两档声明，语义互斥**：`defaultForm` = 作者定死、**用户看不到入口**；`formKey` = 作者把选择权交出去（键指向同插件自己 `contributes.configuration` 里的 `enum` 项，**键的 `default` 就是作者默认**）。两者并存无意义 ⇒ schema 机械拒。
3. **未声明 = 原行为**：链路每一层都用 `null` 表达「没说」并原样落到旧逻辑。存量插件（含 demo、含第三方）**零回归**，这也是为什么 demo 不用改。
4. **降级不崩、出声一次**：`formKey` 写了但键没注册（典型：删了配置项、抄错键名）→ 退回 `defaultForm`，并 `console.warn` 一次（按 `pluginId + key` 签名去重，不刷屏）。
5. **通用接缝的回报**：将来插件市场插件想给自家悬浮面板加「首开形态」选择，只需在**它自己的** `plugin.json` 里写 `floatingPanel.formKey` ＋ 自己的配置项——**零壳改动**。这是用户要求「后面完全不用改壳」的落点。

---

## 六、遗留 / 待办

| # | 事项 | 说明 | 何时办 |
|:--|:--|:--|:--|
| 1 | **种子 zip 刷新 + 声明门禁补一条** | ⏳ **仍未办**（且发版也没解开）：种子箱**跟着官方目录走**，而收录（上架第二步）未做 ⇒ 箱内仍是 `settings@1.0.19`，今天断言不到新字段。收录跑完再 `sync:bundled --latest`，同笔给 `floatingPanelDeclarers.test.ts` 补「声明了 `defaultForm`/`formKey` 且合法」一条 | 收录之后（同批） |
| 2 | ~~`minAppVersion` 升位~~ → **已决：不升** | 1.0.20 **有意**维持 `0.2.20`：旧壳忽略未知字段（老行为=面板），**降级安全**；不像 1.0.19 的 `data-hint` 那条非升不可（旧壳会显示异常）。实测依据与理由已写进插件 `CHANGELOG.md` 的 v1.0.20 段 | ✅ 已决（本批） |
| 3 | 「快捷键设置」是第二条路 | `openKeybindingsSettings` 走 `CUSTOM_EVENTS.OPEN_SETTINGS` → `icon:selected`（`tabActions.ts:45` 仅对 tabOnly 插件开标签页），**不经过 `core.openSettings`** ⇒ 首开形态声明对它不生效。今日设置插件声明 `auxiliarybar`，该分支本就不开标签页。属**既有边界**、非本刀引入；是否收编另立任务 | 待用户决定 |
| 4 | `enumDescriptions` 形状漂移 | schema 里是 **object**，设置插件按 **`string[]`** 消费 ⇒ 今天无法给 enum 项挂本地化标签（`settings.openForm` 的两项只能读 `enum` 原值渲染）。观察到即记账，未修 | 待立任务 |
| 5 | 设置行标签 = 原样配置键 | `SettingRow.tsx:65` 直接印 key 原文（如 `settings.openForm`），未走「键 → 人话标签」映射。本刀沿用现状（用户未见异议） | — |
| 6 | **SDK 声明自洽可加一条** | 插件仓 `npm run verify` 的「④ 声明自洽」今天只验 `floatingPanel → viewId` 是否兑现；`formKey` 是否指向**本插件已声明的配置键**它不管（这个洞由壳侧运行时兜：未注册键降级＋出声一次）。补一条构建期门禁更早出声——但 SDK 是 npm 包，改动要升 SDK 版本＋插件仓锁步，属发版区 | 待立任务（与发版同批） |
| 7 | 本刀真机未验 | 「打包态才见效的项 dev 测不了」不适用（这是纯逻辑分支，dev 可验），但仍需用户实机点一遍：齿轮打开 → 面板；把 `settings.openForm` 改成 `tab` → 重开设置成标签页 | 用户验收 |

---

## 七、发布实绩（2026-09-27）

用户拍板原话：「**关于插件的发版，npm 等发版，我同意，软件的发版由于时间过长，先用 dev 测，多攒一点更新点再发**」⇒ **插件轴 + npm 轴发，软件轴缓期**。

| 轴 | 结果 |
|:--|:--|
| 插件 settings | ✅ **v1.0.20 已发**：[Release v1.0.20](https://github.com/Encaron/linkdesk-plugin-settings/releases/tag/v1.0.20) ＋ asset `settings.linkdesk-plugin`（41.5 KB）＋ 该仓 `marketplace.json` 已更新（远端独立提交，本地已 pull 追平）。`publish` 前置断言「本地 HEAD 已推送」⇒ 插件仓**已推**（带代理） |
| npm `@linkdesk/plugin-sdk` | ✅ **0.1.50**——顺手修掉一条**真缺陷**：0.1.49 的 tarball 里躺着 32 个 `*.test.js`（根因 = `tsc` 从不清 `outDir`，陈旧 `dist` 被打包）⇒ `build` 改成先清 `dist`、`prepack` 走 `build` |
| npm `@linkdesk/contracts` | ✅ 0.1.22 |
| npm `@linkdesk/plugin-docs` | ✅ 0.1.34（新增 `.npmrc` 指向 npmjs 源） |
| npm `@linkdesk/ui` | ⏸ **缓发**——**锁步壳版本**（E6#124），软件轴 0.2.20 未动 ⇒ 不能单独升 |
| 软件本体 | ⏸ **缓期**（用户决定：dev 先测、攒更新点） |
| release 基线 | ✅ `npm run release:mark -- --allow-drift` 已记（**显式绕过项** = `@linkdesk/ui` 8 文件漂移：`combobox/*`、`hint-tip/*` 早前几刀改的；绕过原因见上行） |

**发版次序是被迫的、有实测证据**：插件仓升 SDK `^0.1.49 → ^0.1.50` 后，`npm run validate` 先判**红**——`contributes.floatingPanel: 不符合 schema 约束 additionalProperties`（本地装的 0.1.49 schema 不认 `formKey`）。⇒ 必须 **npm 先发 SDK，插件仓再 `npm install`、再发**。发完 0.1.50，同一条命令转 ✅。

### 还剩一步：官方目录收录（**要用户本人点头**）

- 现状：插件仓 v1.0.20 已在网上，但**官方目录仍是 1.0.19** ⇒ 种子箱**跟目录走**（用户能装到的就是目录那版），故箱内仍 1.0.19，`check-bundled-freshness` 也**因此仍绿**（它的对账方是目录，不是插件仓）。
- 收录 = 上架第二步：`npm run catalog:official`（🔴 **只生成、不推**，产物落 `scratch/`）。真正写官方目录仓 `Encaron/linkdesk-marketplace` 是**写另一个仓**，按项目红线**等用户点头**再动。
- 推送边界：**插件仓已推**（`publish` 前置断言要求）；**壳仓未推**——本刀壳侧提交只落本地（memory `push-wait-for-user`）。
