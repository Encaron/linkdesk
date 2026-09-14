# API 注释与速查表英文化（待抉择池）

> **待抉择**——`src/core/api/**` 与 `src/core/types/**` 的 JSDoc 仍是中文：作者在编辑器里悬停 `window.linkdesk.commands.executeCommand` 读到的是中文说明，`@linkdesk/plugin-sdk` npm 页面上 API 速查表的 **Notes 列**也是中文。
> **属软件本体更新**（动的是壳源码的注释面），**交付落点却是作者轴的 npm**（`@linkdesk/contracts` + `@linkdesk/plugin-sdk`）。
> 2026-09-14 由 E6 第 7 层 7.8 增补（105n）登记在案——原「账④」，见 [E6 作者面文档收口 §11.8.5](../../02-Electron架构/E6_插件生态与发布/插件源码外移层/11-作者面文档收口.md)。

---

## 定位

| | |
|---|---|
| 类型 | **作者面文档英文化（注释面）**——**零行为改动**，但动 `src/**` |
| 前提 | 无（随时可做）；**建议搭下一次软件版本更新的车** |
| 涉及架构改动 | **无**——只改注释，不改类型、签名、任何运行时行为 |

---

## 为什么值得做

作者面其余部分已于 2026-09-14 全部英文化（英文文档树 `docs/03-plugin-authoring/`、四条 JSON Schema 的 description、脚手架 `AGENTS.md`、三个 npm README）——**只剩这一处仍与"英文主显"不一致**，而它恰是作者写得最多的一类文本：

- **IDE 悬停说明**：作者敲 `window.linkdesk.*` 时看到的每个方法说明，来自 `contracts/linkdesk.d.ts`；
- **npm 页面速查表**：`packages/plugin-sdk/README.md` 的 Notes 列由 `scripts/lib/contract-parse.mjs` 从契约抽取——契约是中文，它就必然是中文。

---

## 范围（2026-09-14 实测）

| 契约的来源目录 | 文件 | JSDoc 中文行 |
|:--|:--:|:--:|
| `src/core/api`（含 `linkdesk-api/` 17 个域文件） | 19 | 333 |
| `src/core/types/ipc` | 11 | 161 |
| `src/core/types/pool` | 4 | 157 |
| **合计** | **34** | **≈651** |

生成物：`contracts/linkdesk.d.ts`——**982 行含中文**（就是作者在 IDE 里读的那份）。

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

## 验收判据（做完怎么算成）

- [ ] `contracts/linkdesk.d.ts` **零中文**；`npm run check` 全绿（含 `contracts:check`、速查表 `--check`、两条 API 门禁）
- [ ] `packages/plugin-sdk/README.md` 的 Notes 列**全英文**（受控区由生成器刷新，非手改）
- [ ] `@linkdesk/contracts` 与 `@linkdesk/plugin-sdk` 已重发 + `release:mark` 过货架核对（`check-npm-release` 黄灯灭）
- [ ] 若与小版本合车：`CHANGELOG.md` 段落里有一条**如实**的作者面条目（明说"注释面英文化、无行为变化"——别写成用户可见更新）
