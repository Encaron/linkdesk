# 04 · 契约 API 与文档连锁

> 回指：用户原话第 **3.2**（「缺少 api，cli 等的话就即时造，记得相应的 @linkdesk/docs 和 ai 手册等要更新」）＋ **8.4**（「必然涉及 api，插件作者文档等内容改动，这些也要有任务」）＋ **14**（顺带发现的表层/深层问题也要建档）。
> 本格是 [01](./01-住错层纠正-选择器转正与壳级打开面.md) 的**配套腿**：01 搬组件与调用面，本格把由此产生的**对外面**（类型/常量/文档）补齐——⛔ 缺了本格，「新命令」对第三方作者等于不存在。

---

## 一、先认清三类**读者面产物**（⛔ 各有硬纪律，写错会被门禁拦）

| 产物 | 读者 | 真身 | 硬纪律 |
|:--|:--|:--|:--|
| `@linkdesk/contracts` 的 `linkdesk.d.ts` | 外部插件作者 / 外部 AI | **生成产物**（`prepack` 跑 `scripts/generate-contract.mjs`） | ⛔ **零工单编号**（`AI#63`）、⛔ 不许手改（会被 `prepack` 覆盖，`npm run check` 有 `check-contracts` 双产物强制） |
| `docs/07-AI操作手册/**` | 随安装包发货的外部 AI | 手写散文 ＋ **两个生成区** | ⛔ 零工单编号；⛔ 陈旧发货措辞必须带「可核对指针」（`check-manual-surface.mjs` 三条规则，见其文件头） |
| `cli/**/*.mjs` 的字符串字面量 | 外部 AI 运行期读到的 `hint` / `--help` / MCP 工具描述 | — | ⛔ 字面量里零编号（注释里可以留） |

**为什么这条排第一**：本格要改的正是这三类产物。一个不熟悉门禁的实施者把 `AI#xx` 写进 `02-命令与API索引.md`，`npm run check` 当场红，他会以为是别的东西坏了 ⇒ 先在这里说清。

---

## 二、任务卡 C4.1：类型落点——`OpenWithRequest` / `OpenWithHandler`

- **为什么住 contracts**：类型必须**双方可达**——壳要用（命令 handler 组装），插件要用（调命令/喂 props）。壳的依赖里有 `@linkdesk/contracts:^0.1.0`（`package.json:128`），插件经 `@linkdesk/plugin-sdk` 的 `types.ts` 全量转发拿到同一份（`packages/plugin-sdk/src/index.ts` 头注：「类型面经 types.js 全量转发 @linkdesk/contracts」）⇒ **contracts 是唯一一处能让双方读同一份类型的地方**。⛔ 别在 SDK 里另写一份（就是两套契约的开始）。
- **先探一步（⛔ 别急着写）**：读 `scripts/generate-contract.mjs` §2「类型图收集」（`:213` 起）——**类型源在哪**（`electron/ipc/**` 或 `src/core/types/**`）。把新类型加进**源类型**，再跑 `node scripts/generate-contract.mjs` 让它生成；⛔ **不许手改 `contracts/linkdesk.d.ts`**。
- **写什么**（照 `MenuItemDescriptor` 这样带完整文档串，因为作者面读者就是靠它）：

```ts
/** 「打开方式」请求——壳命令 `SHELL_COMMANDS.openWith` 的唯一入参形状（见《AI操作手册》命令索引）。
 *  uri 与 ext 至少给一个：右键/编辑器入口给 uri（壳侧算 ext）；设置页按类型入口只给 ext。 */
export interface OpenWithRequest {
  uri?: string;      // 文件路径
  name?: string;     // 显示名
  ext?: string;      // 归一化扩展名（无点、小写）
  anchor?: { x: number; y: number };  // 可选：右键入口给（就近弹出）；缺省 ⇒ 居中
}
/** 处理器条目（面板行的数据形状；由壳侧组装，⛔ 插件不自行构造） */
export interface OpenWithHandler {
  pluginId: string; title: string; isDefault: boolean; isAuto: boolean;
}
```

- **顺带（同笔，低成本）**：既有的 `MenuItemDescriptor.commandArgs` 文档串补一句「共享件会固定送它自己的 `context`，见 [02](./02-归一化-齿轮锚点与假菜单项.md) §二 载荷律」——⛔ 文档串里**不许出现工单编号**（`check-manual-surface` 规则①扫的就是这份产物）。
- **怎么验**：`node scripts/generate-contract.mjs` 后 `git diff contracts/linkdesk.d.ts` 出现新类型且**不含编号**；`npm run check` 的 `check-contracts` 绿。

---

## 三、任务卡 C4.2：常量与 helper——⛔ 消灭「三处硬编码同一个 id」

**现状**：`file-tree.openWith` 这个字符串出现在 ① file-tree 声明 ② settings 常量 ③ editor 常量 ④ 壳历史改名表。
**目标**：新 id `workbench.action.openWith` 全仓**只允许两处字面量**（＋一处对账）：

| 处 | 谁用 | 写法 |
|:--|:--|:--|
| 壳常量模块 | 壳自己注册/派发 | `export const SHELL_COMMANDS = { openWith: "workbench.action.openWith", … } as const;`（落点照 `src/core/commands/` 既有常量家族） |
| `@linkdesk/plugin-sdk` | 所有插件 | 同名字面量 ＋ `export function openWith(req: OpenWithRequest)`（内部 `commands.executeCommand(SHELL_COMMANDS.openWith, req)`） |
| **对账腿**（新门禁） | 机器 | 断言两处字面量相等——壳不依赖 plugin-sdk（`package.json` 依赖里没有它），所以**只能靠门禁**把两个字面量钉在一起（腿的落点见 [05](./05-防复发-机械准入原则.md) §三 R5） |

- **写什么**：SDK 的公开面**保持最小**（`index.ts` 头注的既定纪律：「公共 API 面保持最小」）——所以只加**一个常量对象 ＋ 一个 helper**，别顺手把 `OpenWithHandler` 也搬进 SDK（类型走 contracts 已够）。
- **为什么给 helper 而不是只给常量**：插件作者写 `openWith({uri, ext})` 比写 `executeCommand(SHELL_COMMANDS.openWith, …)` 少一次犯错的机会；**归一化、AI 友好化**两条要求都指向 helper。
- **怎么验**：`grep -rn '"workbench.action.openWith"' src/ packages/ /e/linkdesk-plugins/official/*/src` 命中数 = 2（壳常量 ＋ SDK 常量）；插件源码 0 命中（它们 import 常量/helper）。

---

## 四、任务卡 C4.3：文档链（用户点名：`@linkdesk/docs` ＋ AI 手册）

### 4.1 作者手册（`packages/plugin-docs/docs/**` ＋ `zh/**`，**中英同笔**）

| 文件（en ＝ zh 同号） | 改什么 |
|:--|:--|
| `22-menu-contribution-points.md` / `zh/22-菜单贡献点.md` | 新增「载荷律」一节（正文见 [02](./02-归一化-齿轮锚点与假菜单项.md) §二） |
| `21-command-ification-spec.md` / `zh/21-插件命令化规范.md` | 新增「调用**宿主命令**」一节：`SHELL_COMMANDS` ＋ `openWith()` helper；说明「⛔ 别硬编码宿主命令 id」 |
| `06-plugin-json-spec.md` / `zh/06-plugin.json规范.md` | `contributes.fileAssociations` 的**类型归一**规则（`normalizeExt`：去点/小写/拒绝空白与分隔符）＋ 声明不足的后果（碰不上竞争） |
| `19-component-cheatsheet.md` / `zh/19-组件速查.md` | 新增两条：`Button`（含 `variant`/`size` 语义档）、`OpenWithPicker`（props 契约 ＋ 使用场景：宿主调命令即可，⛔ 别自己实现面板） |
| `05-ui-conventions.md` / `zh/05-插件UI写法规约.md` | 共享组件消费侧写法（含「共享件固定送自己的 context」这条坑） |
| `00-readme.md` / `zh/00-README.md` | 索引行若有「命令/菜单/组件」条目，补新节指向 |

> 🔴 **中英同笔**是硬要求——`zh/` 与 `docs/` 是**逐号镜像**（清单已核：00–22 全备）；只改一边 = 翻译腿留空（`04-任务清单.md` 附一的翻译腿纪律）。

### 4.2 AI 操作手册（`docs/07-AI操作手册/`）

| 文件 | 改什么 |
|:--|:--|
| `02-命令与API索引.md` | 新增壳命令 `workbench.action.openWith`（入参 `OpenWithRequest`、结果「面板升起」）；若该文件有生成区，改**生成源**（⛔ 手改生成区会被覆盖） |
| `03-按任务操作.md` | 若有「打开某文件/按类型打开」的路径，补一条 |
| `00-README.md` | 与上两处一致（`check-manual-surface` 规则②：**导航层 / 入口章 / 专章三层说法必须一致**——历史上就漂过一次） |

- **纪律复述**：这批文件是**读者面**，⛔ 零工单编号、⛔ 零陈旧发货措辞（要说「已发货」必须同句给可核对指针，如「判据：`linkdeskctl --help` 里有这条子命令」）。

### 4.3 仓内文档（不进读者面，可带编号）

- 主案 `01-方案与落点契约.md`：补一节「打开方式调用面（壳命令）」；
- 主案 `03-组件规格-按插件浏览-插件卡.md`：补齿轮 context 契约（[02](./02-归一化-齿轮锚点与假菜单项.md) §二）；
- 主案 `04-任务清单.md` 附二「文档 API 落脚总表」：把本轮新增的类型/常量/helper 各占一行；
- 主案 `08-设计图元素与任务对照台账.md`：M6 等帧标注 superseded → 本纠正案图号。

---

## 五、发版矩阵（⛔ 照主案纪律：插件版与 npm 包版做完即发；壳与安装版 dev 测）

| 包 / 插件 | 版本（**2026-10-05 记**，实施时以实况为准） | 本格动作 | 验收 |
|:--|:--|:--|:--|
| `@linkdesk/contracts` | 0.1.38 | ＋新类型 → **0.1.39**（记基线） | 安装官方目录 / 作者拉得到 |
| `@linkdesk/plugin-sdk` | 0.1.79 | ＋常量＋helper → **0.1.80** | 同上 |
| `@linkdesk/ui` | 0.2.44 | ＋`OpenWithPicker` → **0.2.45** | 同上 |
| `@linkdesk/plugin-docs` | 0.1.64 | ＋四节 → **0.1.65** | npm 页面能读到 |
| file-tree | 见 `plugin.json` | 切消费＋删私有件 → **＋1** | 官方目录点升级 |
| settings | 见 `plugin.json` | 常量归一＋菜单项 → **＋1** | 同上 |
| editor | 见 `plugin.json` | ＋`@linkdesk/ui` 依赖＋换按钮 → **＋1** | 同上 |
| 壳 / 安装版 | 0.2.48 | **不发版**（dev 验收） | dev 实机清单（[01](./01-住错层纠正-选择器转正与壳级打开面.md) §七） |

> 🔴 **三条历史教训（都踩过，别重演）**：① 版本号真相源 = `plugin.json`（只改 `package.json` ⇒ 发版报「Release 已存在」）；② SDK 发布**不自动构建**（dist 旧 ⇒ 资产内版本 ≠ Release 版本）；③ 官方目录收录必须**外科式**——以远端 live 为底只换目标行，⛔ 别整份 PUT 工具产物（会削掉历史 `versions[].changelog`）。

---

## 六、顺带发现栏（用户第 14 条：AI 主动建档，⛔ 只记不动手）

> 纪律：本栏是**给后续 AI 的线索**，不是需求。每条必须带「怎么复现/怎么核」——⛔ 不许写成「感觉有问题」。

| 候选 | 现状证据 | 怎么核 |
|:--|:--|:--|
| ~~`copyPluginId` 点了没效果~~ | 已单独立格（[02](./02-归一化-齿轮锚点与假菜单项.md) §五），本栏不重复 | — |
| 「首参可以是裸路径字符串」这一宽松契约仍在文档里 | `file-tree/plugin.json:225-228` 描述原样 | 01 的 C1.5 兼容期保留描述，待别名删除时同笔改掉 ⛔ 别忘 |
| 竞争行齿轮的「在文件树中打开选择器」文案本身就不对（不是「在文件树」，而是「打开选择器」） | `FileAssociationsManagerView.tsx:167-169` label | 随 [02](./02-归一化-齿轮锚点与假菜单项.md) §四 方案 A/B 一并定文案 |
| `Editor` 的 `OPEN_WITH_WIRED` 是一枚**没有到期日**的开关 | `BinaryNotice.tsx:33` ＋ 头注「宿主侧动作尚未实现，故先不显示」 | [01](./01-住错层纠正-选择器转正与壳级打开面.md) C1.6 作废它 ⇒ 本条随即消账 |
| 壳历史改名表里 `explorer.openWith → file-tree.openWith` 在本次改名后**指向过时** | `src/core/services/configuration/renameMigrations.ts:74` | 若将来真把 id 改成 `workbench.action.openWith`，该映射要不要追加一跳？**先探**该表语义（它是插件改名轮次表，壳级 id 不属于任何 plugin）⇒ 结论写回本栏 |
| `settings` 的三条齿轮命令 `params` 在 `plugin.json` 里声明了，但运行时 `registerCommand` 不带 meta | `fileAssociationsGearCommands.ts:27-29` 头注 | 核 `plugin.json:139/152/165` 的 params 描述是否与 `readContestedRowGearTarget` 容忍的两形状一致（不一致 ⇒ 作者照文档写会踩空） |
| 主案 `04-任务清单.md` 的 **「4B-补」格正文写着「✅ 2026-10-05 五项全落」而方框仍是 `- [ ]`**（同格 4C 已是 `[x]`）——账实不符，两种可能：漏打勾 or 五项里有的没落 | `04-任务清单.md` 的 4B-补行 vs 4C 行 | **照 [§附四](../04-任务清单.md) 纪律**：动方框前先真跑一遍五项读数（组计数徽标／三处空态／跨插件命令隐藏／尺寸／写面进账）——**能复现 ⇒ 打勾并记读数；不能 ⇒ 把正文的「✅」改回实际状态**（⛔ 别直接勾了了事） |

---

## 七、完成判据

- [ ] `contracts/linkdesk.d.ts` 含 `OpenWithRequest`，且**生成来的**（`git diff` 由生成器产出），文件内零工单编号
- [ ] `workbench.action.openWith` 字面量全仓 = 2 处（壳 ＋ SDK）＋ 对账腿 1 处断言
- [ ] 插件源码里宿主命令 id 命中数 = 0
- [ ] 作者手册 6 组文件中英同笔改完，`00-readme` 索引可达新节
- [ ] AI 操作手册三层（`00-README` / `01或03` / `02-命令与API索引`）说法一致，零编号
- [ ] 发版矩阵 6 个包/插件按表发完（壳不发）
- [ ] 顺带发现栏 **7 条**全部带「怎么核」或已消账
