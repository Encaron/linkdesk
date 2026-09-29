# 01 · 会话一（AI-A）：SDK 修补与 dev 宿主保真 —— `E6#132`–`#135`

> **本会话动谁**：只动 `packages/plugin-sdk`（＋壳仓 `scripts/` 的连带断言若红）。**⛔ 不碰** `docs/03-plugin-authoring/**`（会话二在并行改它）、**不碰** 任何插件仓、**不碰** 壳 `src/`/`electron/`。
> **发版**：四格做完 **SDK 0.1.42 → 0.1.43 一批发**（🔴 发版要用户点头，老规矩）。会话三（AI-B）等这批发完才开工。
> **上位纪律**：`CLAUDE.md` 提交前自检 ＋ `npm run check` 全绿 ＋ 版本号同步 CHANGELOG ＋ memory `ai-workflow-canon` §0 审议门（审计→报告→探讨→放行→执行）。

---

## §一 `E6#132` css-hardcode 提示语对齐 token 库

### 前因（为什么会被提出来）

第三方作者写游戏 UI 用了 `box-shadow: rgb(0 0 0 / 20%)`，被 `check-css-hardcode` 腿判偏离；报错提示语说「应走 CSS 变量 `var(--text-*/--bg-*/--accent-*/--surface-*)`」（[css-hardcode.ts:63](../../../../packages/plugin-sdk/src/eslint/checks/css-hardcode.ts)）。他照提示语找 shadow token 没找到（他当时的 grep 带 `head` 截断，也确实没看到），最后**把三处阴影全删了**——视觉层次受损，只为了过门禁。而 `--shadow-float` / `--shadow-hairline` / `--shadow-pop` / `--shadow-tiny` 在 [@linkdesk/ui dist css](../../../../packages/linkdesk-ui/dist/index.css) **全都存在**。

**病根不是缺 token，是「报错文案与 token 库脱节」**——报错即文档，文案列错/列少 = 误导每一个照它改的作者。

### 修哪里

- `packages/plugin-sdk/src/eslint/checks/css-hardcode.ts:63`（提示语模板字符串那一行）。
- 同文件（或邻近）加一条防再脱节单测；测试文件照既有 `*.test.ts` 惯例放同目录。

### 怎么修

1. 提示语补全 token 族清单：`var(--text-*/--bg-*/--accent-*/--surface-*/--shadow-*/--border-*)`（以 ui dist css 实际存在的族为准——动手前先 grep 一遍全量族名，**按事实列**，不按记忆列）。
2. **防再脱节（本格的核心，不只是改一句话）**：加单测——断言提示语中列出的每一个 token 族前缀，在 `@linkdesk/ui` 的 dist css（或其真源）里**真实存在**；ui 包将来删了某族，这条单测红，提示语必须跟着改。这样提示语从「手抄字符串」变成「有对账的字符串」。
3. ⛔ 不做：把提示语改成「去读 ui css 文件」这种动态拼接（lint 运行时读文件 = 引入 IO 依赖与顺序问题，不值）；⛔ 不新增 token（token 体系归壳/ui 轴管，本格只对账）。

### 验收

- `npm run lint`（SDK 仓）自测：造一处 `box-shadow` 硬编码，报错文案列出 `--shadow-*`。
- 新单测 ＋ 既有 `css-hardcode` 相关测试全绿；`npm run check`（壳仓）全绿。

### 版本与连带

- SDK `0.1.42 → 0.1.43`（与会话一其余三格一批发）；CHANGELOG 同笔补段。
- ⛔ 禁区：不动判据本身（什么算硬编码的规则一行不改）——本格只修**报错文案**。

---

## §二 `E6#133` publish 收尾「远端已更新」提示

### 前因

`npm run publish` 的收尾一步用 GitHub Contents API **更新作者自己仓库根的 marketplace.json**（[publish.ts](../../../../packages/plugin-sdk/src/publish.ts) 头注第 d 条：读 sha → 合并条目 → PUT）。这个提交发生在**远端**，本地仓库不知道——本地 HEAD 从此落后远端一个提交。下次 publish 时 [assertPublishReady](../../../../packages/plugin-sdk/src/publish.ts) 的前置断言「本地 HEAD 必须 === 远端 HEAD」**当场拒绝发布**，报错让作者「先推上去」——但作者根本没有可推的东西，他需要的是 `git pull`。第三方作者实测撞上，原话：「publish 会向远端写 marketplace.json，但本地不知道……不 git pull 的话下次 publish 会撞前置断言」。

### 修哪里

- `packages/plugin-sdk/src/publish.ts` 的成功收尾输出段（发布完成打印总结的地方）。
- 顺带看 `assertPublishReady`（同文件 ~L295–345）的拒绝文案——若「本地 ≠ 远端」分支的文案只说「推送」不说「拉取」，补半句。

### 怎么修

1. publish 成功收尾追加一行提示（照该文件既有中文可执行报错的风格）：
   > `📌 已在你仓库远端更新 marketplace.json（独立提交）——本地建议先 git pull，否则下次 publish 会撞「本地 ≠ 远端」前置断言。`
2. `assertPublishReady` 的 `localHead !== remoteHead` 拒绝分支（~L320–330）文案补一句：「若上一次 publish 后你还没 pull 过——先 `git pull` 再重试」。
3. ⛔ 不做：把「Contents API 直写远端」改成「本地提交后 push」（会改发布语义与推送红线——`git push` 必须用户点头是本工程红线，SDK 不该替作者 push）；⛔ 不做 dry-run 机制（另行立项）。

### 验收

- 单测：mock Contents API 成功路径，断言收尾输出包含上述提示行；`assertPublishReady` 的文案断言照该文件既有测试（`publish.test.ts`）惯例补。
- `npm run check` 全绿。

### 版本与连带

- SDK 0.1.43 同批。⛔ 禁区：不动发布流程语义（sha 读取/合并/PUT 逻辑一行不改）。

---

## §三 `E6#134` dev 宿主保真两件：`#ld-root` 定高 ＋ `:root` 兜底 token 对齐

### 前因

第三方作者实测两个「预览 ≠ 真机」：

1. **容器无高度**：真壳的标签页容器有确定高度，插件的 `height: 100%` 正常工作；dev 宿主挂载点 `#ld-root` 高度是 auto ⇒ 画布塌成 ~320px、下面一片黑。作者被迫写了一套「ResizeObserver ＋ 择机重测 ＋ 几何启发式」的**自愈代码**——这套代码在真壳里是**死代码**。
2. **兜底 token 集不全**：dev 宿主 `:root` 有兜底主题变量（意图写在 [02-本地预览环境.md:61](../02-插件开发工具链/02-本地预览环境.md)：「插件 `var(--xxx)` 不至全黑」），但集合太小——`--bg-card`/`--text-*` 不在 ⇒ `var(--bg-card)` 解析为空、面板全透明。作者被迫发明 `--gtb-*` 中间兜底层（真机上同样是死代码）。

**这类「预览长得不像真机」的问题每一件都逼作者写真机死代码**——违反本工程「无死代码」理念，且是纯作者侧损耗。

### 修哪里

- dev 宿主页面本体：SDK 包内 dev-host 的 `index.html`（`dev-server.ts` 的 `DEV_HOST_DIR` 指向的那份；动手前先 `grep -rn "DEV_HOST_DIR\|dev-host" packages/plugin-sdk/src/` 定位目录）。
- 对账单测：`packages/plugin-sdk/src/`（照 `dev-real.test.ts` 惯例）。

### 怎么修

1. **`#ld-root` 定高**：照壳主区容器形态给 `height: 100vh`（或 flex 链拉伸）——目标是「插件可以放心假设容器有确定高度」。同时把这句约定补进维护者面 [05-插件UI写法规约](../../../03-插件制造/05-插件UI写法规约.md) 或 dev 宿主文档（⚠️ 这两份若动，跑 `sync:plugin-agents --check` 自证；**作者面英文树别动**——那是会话二的文件域，约定句并进 #139 的 README 也行，在交接段声明即可）。
2. **兜底 token 集对齐**：把 `:root` 兜底集从「少数几个」扩到 **`@linkdesk/ui` dist css 的 token 全集**（照抄值；ui 主题域 token 是「皮全开放」拍板过的公共面）。
3. **生成式对账（本格核心，防手抄漂移）**：加单测/脚本断言——dev 宿主 `:root` 里定义的 token 名集合 ⊆（或 ===）ui dist css 定义的 token 名集合。ui 包将来加减 token，这条测试红 ⇒ 兜底集跟着改。⛔ 不引入构建期依赖（不让 dev-server 运行时去读 ui 包——只做**测试期对账**）。
4. ⛔ 不做：Shadow DOM / 独立 iframe（rejected 档在案）；⛔ 不动 `dev-server.ts` 的 alias/fs.allow 逻辑。

### 验收

- 起一个真实插件 dev 预览（如 `file-tree` 源仓或脚手架模板）：`#ld-root` 高度确定、`var(--bg-card)`/`var(--text-*)` 有值（浏览器 devtools 读 computed）。
- 对账单测进 `npm run check`；全绿。

### 版本与连带

- SDK 0.1.43 同批。dev-host index.html 的改动**不 bump 壳**（它是 SDK 工具 UI，非壳渲染树——[02-本地预览环境.md:61](../02-插件开发工具链/02-本地预览环境.md) 已声明它不违反壳硬约束 16，照旧）。

---

## §四 `E6#135` marketplace.schema.json 随包

### 前因

作者发布时仓库根要维护一份 `marketplace.json`（publish 的 Contents API 合并逻辑也读写它），但这份文件的格式**没有公开 schema**——`packages/plugin-sdk/schemas/` 现有五件（`host-css-names` / `icon-theme` / `plugin` / `reserved-class-names` / `theme`），独缺 marketplace。第三方作者收录官方目录时手改 marketplace.json 无补全、无校验，只能照抄别人仓。

### 修哪里

- 新建 `packages/plugin-sdk/schemas/marketplace.schema.json`。
- `packages/plugin-sdk/src/types.ts`（`CatalogPluginEntry` / `MarketplaceCatalog` 类型处加对照注释/锚点）。
- 新单测（validate 或独立 `*.test.ts`）。

### 怎么修

1. **schema 的字段与类型以 `types.ts` 的 TS 类型为真源落**（[publish.ts L55](../../../../packages/plugin-sdk/src/publish.ts) 起 `CatalogPluginEntry`——「对齐规范 §三/§3.2 字段（作者条目=纯增量，缺字段不崩）」）——照 memory `test-double-must-match-contract-not-impl` 的同族纪律：**schema 与代码契约同源**，不许凭记忆另写一份。
2. 字段描述写清：顶层 `plugins[]` ＋ 条目字段（`id`/`name`/`versions[]` 历史最新在前/`icon`/`marketIcon`/`readmeUrl`/`category`…以 types.ts 实际字段为准逐个列）。
3. 接入方式：与 `plugin.schema.json` 同款——随包 schemas/ 目录即可被作者 `$schema` 引用；**不在本格改 publish/validate 的行为**（publish 已有的合并逻辑照旧）。
4. 单测：一份完整合法样例过；缺 `id` / `versions` 倒序破坏等负例红。
5. ⛔ 不做：把 schema 做成**强校验门禁**（publish 前判红）——那是行为变更，超出本格「随包」射程；将来要做走 #143 一起设计。

### 验收

- 样例 marketplace.json 在编辑器里挂 `$schema` 出补全（人工抽查一条即可）；单测全绿；`npm run check` 全绿。

### 版本与连带

- SDK 0.1.43 同批。`check-packaging-files.mjs` 若枚举 schemas/ 目录清单（随包白名单），跑 check 看是否要同笔加文件名——**script 改动不发版**。

---

## §五 本会话收尾清单（四格共用）

1. `npm run check` 全绿（含新单测已接线）。
2. CHANGELOG 补段 ＋ `package.json` bump 0.1.43 ＋ lock 同步（`check:lockfile-sync`）。
3. `npm publish`（🔴 要用户点头）；发后照 memory `sdk-published-not-equal-enforced` 取现场证：读消费者 node_modules 的 SDK 版本 ＋ 塞一处违规看它红。
4. 勾格：E6 清单 `#132`–`#135` 四条逐格回写读数；本层 `交接.md` 顶部追加接力段，并把「SDK 0.1.43 已发」标进队列（会话三的开工闸门）。
5. 官方目录收录：本会话**无插件仓发版，不涉及**。
