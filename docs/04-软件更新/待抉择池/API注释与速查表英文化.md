# API 注释与速查表英文化（待抉择池）

> **待抉择**——`src/core/api/**` 与 `src/core/types/**` 的 JSDoc 仍是中文：作者在编辑器里悬停 `window.linkdesk.commands.executeCommand` 读到的是中文说明，`@linkdesk/plugin-sdk` npm 页面上 API 速查表的 **Notes 列**也是中文。
> **属软件本体更新**（动的是壳源码的注释面），**交付落点却是作者轴的 npm**（`@linkdesk/contracts` + `@linkdesk/plugin-sdk`）。
> 2026-09-14 由 E6 第 7 层 7.8 增补（105n）登记在案——原「账④」，见 [E6 作者面文档收口 §11.8.5](../../02-Electron架构/插件生态与发布/插件源码外移层/11-作者面文档收口.md)。

---

## 定位

| | |
|---|---|
| 类型 | **作者面文档英文化（注释面）**——**零行为改动**，但动 `src/**` |
| 前提 | 无（随时可做）；🟢 **2026-10-07 用户拍板实施——搭软件本体 0.2.53 攒批这笔车**（npm 两笔照发，软件本体 dev 继续测不发版） |
| 涉及架构改动 | **无**——只改注释，不改类型、签名、任何运行时行为 |

---

## 为什么值得做

作者面其余部分已于 2026-09-14 全部英文化（英文文档树 `docs/03-plugin-authoring/`、四条 JSON Schema 的 description、脚手架 `AGENTS.md`、三个 npm README）——**只剩这一处仍与"英文主显"不一致**，而它恰是作者写得最多的一类文本：

- **IDE 悬停说明**：作者敲 `window.linkdesk.*` 时看到的每个方法说明，来自 `contracts/linkdesk.d.ts`；
- **npm 页面速查表**：`packages/plugin-sdk/README.md` 的 Notes 列由 `scripts/lib/contract-parse.mjs` 从契约抽取——契约是中文，它就必然是中文。

---

## 范围（🔴 2026-10-07 实施前重勘——本文 2026-09-14 的旧读数已全面过期）

| 契约的来源目录 | 文件（含中文的） | 中文行 |
|:--|:--:|:--:|
| `src/core/api`（含 `linkdesk-api/` 17 个域文件） | 20 | 923 |
| `src/core/types`（不止 ipc/ 与 pool/——`theme.ts`、`windows.ts`、`fileEntry.ts` 也经类型图进契约） | 20 | 853 |
| **合计** | **40** | **≈1776** |

生成物：`contracts/linkdesk.d.ts`——**1297 行含中文**（就是作者在 IDE 里读的那份）。

与旧读数（34 文件 / ≈651 行 / d.ts 982 行）相比**范围已扩大约三倍**——主因是 2026-09-14 之后契约面继续长（设置控件词表、打开方式命令面、图标主题双形态等各案都往契约里加了带中文注释的类型）。

> 🔴 **重勘另确认两件事**：
> ① **这 1776 行中文 100% 在注释里，零运行时字符串**——不存在「翻译会改行为」的风险面；
> ② 契约生成器（`scripts/generate-contract.mjs`）从 `src/core/api/linkdesk-api.ts` 的**类型图**传递收集，不止字面 import 的 `types/ipc/*` 与 `types/pool/*`——所以判「翻没翻全」的真源是**生成后的 d.ts 零中文**，不是源码目录清单。

> 便宜的切片：速查表的 **Notes 列**只吃 46 个命名空间面各一句（约 46 行）。但**固定成本两者相同**（见下），所以只做切片省的是翻译量、不是发布成本。

---

## 固定成本（做多做少都要付）

1. **软件侧变更** ⇒ 版本判定 + 带类别前缀的提交（注释改动 = 无用户可见变化，建议与小版本 PATCH 合车，不单独占号）；
2. **重生成契约** ⇒ `contracts:check` 哈希变化（机械，自动）；
3. **两笔 npm 重发** ⇒ `@linkdesk/contracts` + `@linkdesk/plugin-sdk`（速查表长在 SDK README 里）+ `release:mark` 过货架核对。

> 🔴 **结论：搭下一次软件版本更新的车最省**——这三笔固定成本摊进一次**本来就要发生**的发布里。这也是本项进「待抉择池」而不是立刻立项的实际理由。

---

## 做之前先看的已知耦合

- 读 `src/core/api` 的两个门禁（`check-api-contracts` / `check-namespace-matrix`）**解析结构，且用 `scripts/lib/strip-comments.mjs` 把注释剥掉再判**；它们文件里的中文是**报错文案与矩阵表头**，不是锚在注释散文上 ⇒ 不会误伤。
- ⚠️ 但**动措辞前先 grep 一遍有没有门禁锚在某句注释上**：2026-09-14 英文化期间，`check-lsp-args-base` 就因为锚词是中文、而 schema description 被译成英文而**当场判红**（已改成双语锚词变体）。这类"教具被别的机械判据锚住"的耦合是这一项的主要风险面。
- `docs/03-插件制造/01-插件API契约.md` §3.2「运行时语义约定」是**中文散文**（维护者面），它描述的对象变成英文后**归属不变**——中文树不随动，别顺手翻。

---

## 实施记录（2026-10-07，已实现 · 待 dev 实机验收）

- **40 个契约源文件 JSDoc 全部英文化**（重勘后口径，见上表）；连带：
  - 契约类型图从壳内 5 个文件借注释进 d.ts——`splitTree.ts` / `KeybindingRegistry/types.ts` / `MenuRegistry.ts` / `WorkspaceService.ts` / `tabDragTypes.ts` 的**流入行**同步英文化，壳内其余注释不动（不扩大改面）；
  - 两个生成器的**产物模板**英文化（`scripts/generate-contract.mjs` 的 d.ts banner/ambient/`// ── Contract types ──`、mock 树 banner；`scripts/generate-api-cheatsheet.mjs` 的 README 头段与 deprecated-alias 格）；
  - `packages/plugin-sdk/README.md` 尾段手写区的仓内文档指针改描述性英文；
  - AI 操作手册 02 章 API 索引生成区随 `npm run manual:build` 刷新（它从契约现读，契约注释变了必漂）。
- **七处有意保留/改写的边界**：真实中文磁盘路径与中文数字章节锚（`theme.ts`/`product.ts`/`aiManual.ts` 等 5 处）改成**不含中文的描述性指代**（「dossier 07 in the Chinese docs tree, §4.1」式）——保住「产物零中文」，代价是丢了逐字 grep，可接受（仓内追溯靠锚点编号＋git blame）；`copyrightHolder` 示例值与人名同改描述性；`serial:system` 的中文状态横幅是**真 wire 值**（`serialHandlers.test.ts` 逐字断言），注释样例改描述性英文、真值不动。
- 验收判据逐条：
  - [x] `contracts/linkdesk.d.ts` **零中文**（grep 实测 0）；`npm run check` 全绿（含 `contracts:check`、速查表 `--check`、两条 API 门禁、`check-manual-surface`）
  - [x] `packages/plugin-sdk/README.md` **全英文**（受控区由生成器刷新；`dev-host/linkdesk-mock.generated.ts` 亦 0）
  - [x] 两笔已重发＋`release:mark` 过货架核对：`@linkdesk/contracts` **0.1.43**、`@linkdesk/plugin-sdk` **0.1.88**（基线已记，黄灯灭）
  - [x] CHANGELOG v0.2.53 新增 **### 作者轴** 小节，如实写「注释面英文化、零行为变化」（合车 0.2.53 攒批；软件本体不发版，dev 继续测）
