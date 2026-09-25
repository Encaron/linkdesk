# 01 · 会话一（AI-A）：测试地基收进 SDK ＋ 脚手架与五仓收敛 ＋ 文档同笔 —— `E6#144`–`E6#146`

> **本会话动谁**：`packages/plugin-sdk`（新增 subpath）· 壳根 `vitest.setup.ts`（收一行）· `packages/create-linkdesk-plugin`（模板两文件 ＋ 两处 README）· 壳 `scripts/`（`check-scaffold` ＋ 两个 sync）· 中文维护者面 ＋ 作者面两棵树 · memory。**容器里**：**5 只**官方仓（`vitest.setup.ts` ＋ lock）＋ 18 只官方仓（`AGENTS.md`）。⚠️ 现存第 6 份副本身在第三方仓 `geme-tihu-bicycle`——**⛔ 不代改**（红线），只转达作者（[06 §三](06-待拍板方向题.md)）。
> **发版**：`@linkdesk/plugin-sdk` **0.1.47** · `create-linkdesk-plugin` **0.1.14** · `@linkdesk/plugin-docs` **0.1.31**（三包各自 PATCH）。🔴 **三笔发版都要用户点头**；**壳 0.2.15 不动**（零 `src/`/`electron/` 改动）。
> **上位纪律**：⛔ **不推送**（推送等用户点头）· ⛔ **不改 mock 语义**（只搬位置）· ⛔ 不给共享 mock 加参数/开关（否则 8 处指针不再是「一行」）· ⛔ 模板文件里**不许出现内部任务号**（`check-scaffold` 有这条判据）· ⛔ 容器里的每个仓**各自单独提交**。

本会话是**本层的地基棒**：它不做任何一仓的补测试（那是会话二/三/四），只做「**让后面每一仓补测试时，脚下踩的是同一块地基**」。全层 11 格里有 3 格、也是唯一有**跨包串行**的一棒。

---

## §一 `E6#144` 测试地基收进 SDK——真源 ＋ subpath ＋ 单测 ＋ 壳收一行

### 前因（为什么会被提出来）

- **现状是 8 份同体拷贝**：壳 `vitest.setup.ts`（90 行 / 3,568 B）与「模板 ＋ 6 仓」那 7 份（96 行 / 4,028 B）**体完全相同**（只多 6 行头注）。7 份的头注自己写着：「🔴 本文件是壳仓 `vitest.setup.ts` 的逐字副本（除本头注五条）……改壳仓那份时把这里一起改（**两处同源**）」——**这是一句没有任何机械件在守的承诺**。
- **头注自己指出了收敛方向**（原话）：「由 `@linkdesk/plugin-sdk` 提供共享版本、本文件改成一行 re-export 是可预见的收敛方向」——本格就是把这句做掉。
- **为什么必须排第一**（用户 2026-09-25 点名）：「把 `vitest.setup.ts` 收到 SDK 里——**这件应该排第一**」。理由：不收 ⇒ 会话二/三/四每仓补测试都要再动自己那份 mock，**本层产出立刻变成 8 份新漂移源**。
- **可行性三条（已实测，不是推测）**：① 该文件**零 import**（纯 `globalThis` 赋值 + 字面量对象）⇒ 可以原样成为 SDK 模块；② SDK 的 `tsconfig.build.json` 是 `exclude: ["src/**/*.test.ts"]` ⇒ 新增 `src/vitest-setup.ts` **自动进构建**、`files: ["dist", …]` 已覆盖产物；③ 壳 **没有也不该有** `@linkdesk/plugin-sdk` 依赖（实测根 `package.json` 无此项）。

### 修哪里

| 落点 | 动作 |
|:--|:--|
| `packages/plugin-sdk/src/vitest-setup.ts` | **新建**：从壳根那份搬来**体**（六命名空间最小 mock），去掉 DOM 类型引用（见下） |
| `packages/plugin-sdk/src/vitest-setup.test.ts` | **新建**：对账单测（5 例，见「怎么修」第 4 步） |
| `packages/plugin-sdk/package.json` | `exports` 增 `"./vitest-setup"`（`types` ＋ `default` 双指 `dist/`）；`files` / `scripts` **不动** |
| 壳根 `vitest.setup.ts` | **收成一行**：引 SDK **源码**（同仓相对路径），⛔ 不引包名（壳没有这个依赖）、⛔ 不引 `dist/`（那是 gitignore 的构建产物，干净检出必炸） |
| 壳根 `vitest.config.ts` | **一行不动**（`setupFiles: ["./vitest.setup.ts"]` 保持——收敛靠改文件内容，不靠改配置） |

### 怎么修

1. **搬体（唯一一处需要小心的改写）**：SDK 的 `tsconfig.json` 是 `"lib": ["ES2022"]` ＋ `"types": []`——**没有 DOM**。壳那份里有两处 DOM 类型引用必须去掉、且**语义一字不变**：
   - `type TestGlobal = { window?: Window; __ldkConfigStore?: Map<string, unknown> };` ⇒ 换成不依赖 `Window` 的形状（例如把 `window` 声明成 `{ linkdesk?: object }` 这一最小面）；
   - `_g.window = _g.window ?? ({} as Window);` ⇒ 换成同义的非 DOM 写法（先兜底成空对象再挂 `.linkdesk`）。
   - ⚠️ 其余一字不动：`pathMock`（`normalize/join/basename/dirname/extname` 的 posix 风格归一）、`configStore`（`configuration` 与 `config` **共用同一份 Map**）、`workspace` / `filesystem` / `tabs` 的桩、`events.on/emit` 两个 no-op。**本格只搬位置，不改语义**（改语义会让每仓既有测试的期望值跟着变——见总纲 §〇f）。
2. **头注（新真源的第一段话）**：写明三件——① 本模块是**壳 ＋ 全部插件仓共用的测试地基**（`window.linkdesk` 六命名空间最小 mock）；② **插件专属桩不许加进来**（如 `window.linkdesk.serial`——住各仓测试文件里，用 `vi.fn()` 覆盖）；③ 壳侧走相对引源码、插件仓走 `@linkdesk/plugin-sdk/vitest-setup`（**两处形态有意不同**，见 §二）。
3. **`exports` 增一笔**：`"./vitest-setup": { "types": "./dist/vitest-setup.d.ts", "default": "./dist/vitest-setup.js" }`（照 `"./eslint"` 的既有形状）。
4. **单测 5 例**（`src/vitest-setup.test.ts`；🔴 照 `src/eslint/checks/no-global-key-listener.test.ts` 的先例**显式** `import { describe, it, expect } from "vitest"`——SDK 的 `types: []` 没有 vitest globals）：
   - ① 六个命名空间在场（`path` / `configuration` / `config` / `workspace` / `filesystem` / `tabs`）；
   - ② `configuration.set` 之后 `configuration.get` 读得到**同一份 store**（`config` 与 `configuration` 是同一对象）；
   - ③ `filesystem.watch` 返回的 unsubscribe 可调用且不抛；
   - ④ `path.join` / `normalize` 的归一化行为与现状一致（照搬现状的断言，不是「理想行为」的断言）；
   - ⑤ **exports ↔ 文件对账**：`package.json` 每个 subpath 都有对应入口、**且 `./vitest-setup` 在列**（防「加了文件忘加 exports」这类静默断裂）。
5. **壳根收一行**：`import "./packages/plugin-sdk/src/vitest-setup";`（不带后缀；壳 tsconfig 已有 `allowImportingTsExtensions: true`，带 `.ts` 也合法——两种都行，**推荐不带**）。改完**立刻**跑壳仓 `npm run check`——**这就是最大的现场证**：壳的 2,572＋ 用例全部跑在这份 mock 上。
6. **核对唯一性**：`grep -rn "vitest.setup\|vitest-setup" scripts/ packages/` ⇒ 除「模板/仓指针 ＋ 各自 `vitest.config.ts` 的 `setupFiles`」外，**不该有第三个 mock 体**。

### 验收

| 项 | 判据 |
|:--|:--|
| 地基等价 | 壳仓 `npm run check` 全绿（2,572＋ 用例，含 `tsc -p packages/plugin-sdk --noEmit` ⇒ DOM-free 改写到位） |
| 产物齐 | `packages/plugin-sdk` 构建后 `dist/vitest-setup.js` ＋ `.d.ts` 同时在 |
| 单测 | 5 例绿（含 exports 对账） |
| 唯一性 | 第 6 步的 grep 读数**写进交接段**（真源 1 ＋ 指针 8，逐个点名） |
| 零副作用 | `git status` 里**只有**上述四处（SDK 两文件 ＋ `package.json` ＋ 壳根一行）；⛔ 无 `src/` / `electron/` 改动 |

### 版本与连带

- **发版 `@linkdesk/plugin-sdk` 0.1.46 → 0.1.47**（PATCH：只加 subpath；🔴 **要用户点头**）。
- 发完跑 **`npm run release:mark`** 重记基线 ⇒ `check:npm-release` 绿（黄灯不许长期亮）。
- 🔴 **本格完成后仍不能铺 5 仓**——见 §二「三个小闸」。

---

## §二 `E6#145` 脚手架与五仓收敛到指针 ＋ 纪律一行

### 前因

- 模板 ＋ 6 仓那 7 份 4,028 B 拷贝的头注承诺了「两处同源」，但**没有任何门禁在守**（`check-scaffold.mjs` 只把 `vitest.setup.ts` 列在 `EXPECTED_FILES` 里——**只查在不在，不比内容**；`sync-plugin-ci.mjs` 只在人工跑时铺）。
- ⚠️ **7 份现存的第 7 份在第三方仓**（`E:\linkdesk-plugins\official\geme-tihu-bicycle\vitest.setup.ts`）——⛔ **不代改**（红线：不写别人的仓）。它那份是**自足的完整 mock**（能跑，只是不跟共享地基升级），保持原样；作者的迁移建议走 [06 §三](06-待拍板方向题.md) 转达。**所以本格铺的是 5 仓，不是 6 仓。**
- 新插件从模板出生时带的是**完整 mock 体**⇒ 每生一只新插件就多一份会漂移的拷贝。
- 「非视图插件怎么办」的答案也要落在同一处：**声明式插件无可测单元**，纪律段必须写明（否则下一只纯 JSON 插件的作者会以为「没测试 = 不合格」）。

### 修哪里

| 落点 | 动作 |
|:--|:--|
| `packages/create-linkdesk-plugin/template/vitest.setup.ts` | **收成一行**：`import "@linkdesk/plugin-sdk/vitest-setup";` ＋ 一句注释（⚠️ **不许出现内部任务号**；写「本文件是共享测试地基的一行指针——真源住 `@linkdesk/plugin-sdk`」即可） |
| `packages/create-linkdesk-plugin/template/AGENTS.md` | 加**测试纪律一段**（措辞与下一行**同笔**：一处定、两处落地） |
| `scripts/sync-plugin-agents.mjs` | 共享骨架里加**同一段**（18 只官方仓的 AGENTS.md 由它生成） |
| `packages/create-linkdesk-plugin/template/README.md` | 目录契约表里 `src/__tests__/` 那行（现「test tooling is preinstalled」）＋ 树里的 `vitest.setup.ts` 说明 ⇒ 改成「一行指针 → 共享地基」 |
| `packages/create-linkdesk-plugin/README.md` | 树行 `vitest.setup.ts  # test runtime ground — mocks window.linkdesk …` ⇒ 「one-line pointer to the shared ground from `@linkdesk/plugin-sdk`」 |
| `scripts/check-scaffold.mjs` | 加**指针形态断言** ＋ 同笔更新它自己的 `--self-test` |
| `scripts/sync-plugin-ci.mjs` | `FOR_TESTED` **列表不变**（文件仍在），只在注释里写清「内容由模板决定，模板里已是一行指针」 |
| 容器 **5 仓**（官方：serial-monitor / file-tree / editor / settings / marketplace） | `vitest.setup.ts` ＋ `package-lock.json`（`npm install` 后） |
| ⛔ 第三方仓 `geme-tihu-bicycle` | **一字不动**（它的那份副本由作者自行决定迁不迁） |
| 容器 18 仓 | `AGENTS.md`（＋ `.vscode/settings.json` 若 `--dry-run` 报有差异） |

### 怎么修

1. **模板两处收敛**（`vitest.setup.ts` 一行 ＋ `AGENTS.md` 纪律段）。纪律段的**口径**（照 §一 与总纲 §〇f 写，别自由发挥）：
   - 纯逻辑单元（`src/**/*.ts`，非 barrel、无 React、无 `window.linkdesk`）**应配** `src/__tests__/<同名>.test.ts`；
   - 视图/交互层**按需**（本层不设判据）；
   - 跑 `npm run test`（工具已预装，无需自装）；
   - 共享 mock 来自 `@linkdesk/plugin-sdk/vitest-setup`（**新仓自带一行指针**，⛔ 不要在自己仓里再抄一份）；
   - **声明式插件**（纯 JSON / 主题 / 语言包）**无可测单元**——它们的门禁是 `npm run verify` 的结构与声明判据。
2. **两处 README 的树行**照上表改（英文，作者面语言）。
3. **`check-scaffold.mjs` 加断言**：`template/vitest.setup.ts` 必须是**指针形态**——建议三条一起（任一不满足即红）：① 含 `@linkdesk/plugin-sdk/vitest-setup`；② **不含** mock 标志串（`configurationMock` / `filesystemMock` / `tabsMock` 之类）；③ 行数 ≤ 5。**同笔**在它的 `--self-test` 里加对应例（现有 6 例 ⇒ ＋2：正例过、把 mock 体塞回去必须红）。
4. **铺 5 仓**（官方五仓；⛔ `geme-tihu-bicycle` 不代改）：`node scripts/sync-plugin-ci.mjs --dry-run`（先看差异）⇒ 落盘 ⇒ **逐仓** `npm install --registry=https://registry.npmjs.org`（🔴 `--registry` 必须显式——本机默认 registry 是镜像，不指定会把 lock 里 `resolved` 改写成镜像地址）。
5. **逐仓验证解析**：5 仓**各自**跑 `npm test`（绿）＋ `grep` 证据：lock 里 `@linkdesk/plugin-sdk` 落点 ≥ 0.1.47。⚠️ 5 仓里 4 只是出厂种子仓（settings / marketplace / file-tree / editor）——**本格不动它们的版本**，所以**不需要** `sync:bundled`（种子追新只跟插件版本走）。
6. **铺 18 仓 AGENTS.md**：`node scripts/sync-plugin-agents.mjs --dry-run` ⇒ 落盘 ⇒ `--check` 绿。（18 仓 = 官方全部，**不含** `geme-tihu-bicycle`——脚本对第三方仓按设计跳过、⛔ 不写别人的仓。）
7. **容器提交**：每个仓**各自一笔**（5 仓：`vitest.setup.ts` ＋ lock；18 仓：`AGENTS.md`）——⛔ 不许跨仓揉一笔、⛔ **不推送**（等用户点头）。⚠️ `geme-tihu-bicycle` **不出现在提交清单里**（我们没动它）。
8. **发版 `create-linkdesk-plugin` 0.1.13 → 0.1.14**（模板两文件 ＋ 两处 README 都在黄灯面内 ⇒ 必须真发；🔴 要用户点头）＋ `npm run release:mark`。
9. **冷启动实证**（照 memory `npm-cache-stale-scaffold` 的教训）：在临时目录用**刚发的 0.1.14**（或本地 `npm pack` 的 tarball）生成一只探针工程 ⇒ 确认新仓的 `vitest.setup.ts` 是一行指针、`npm install` 后 `npm test` 可跑、`AGENTS.md` 有纪律段。

### 🔴 三个小闸（本会话的次序，别抢跑）

| 闸 | 内容 | 拿不到怎么办 |
|:--|:--|:--|
| **闸①**（无需发布） | §一全部 ＋ §三的措辞先定稿 ＋ §二的模板/脚本改动（**含 `check-scaffold` 断言**）＋ 壳 `npm run check` 绿 | — |
| **闸②** | **发 SDK 0.1.47**（🔴 用户点头） | 停下来交棒：把「已做 ①、待发 0.1.47」写进 [交接.md](交接.md) |
| **闸③** | §二第 4–6 步（5 仓 / 18 仓铺开 ＋ 逐仓 `npm test`） | — |

⚠️ **闸③ 不许抢跑**：0.1.47 没上架就铺指针 ⇒ 5 仓 CI **直接红**（它们的 lock 装到的 0.1.46 没有这个 subpath）。**离线自测**可以：在 `packages/plugin-sdk` 跑 `npm pack` 拿 tarball、临时装进一只仓验证解析（**验完还原**，别把 tarball 路径留在 lock 里）。

### 验收

| 项 | 判据 |
|:--|:--|
| 指针真的解析得到 | 5 仓**逐仓** `npm test` 绿（不是只跑一仓） |
| lock 落点 | 5 仓 lock 里 `@linkdesk/plugin-sdk` ≥ 0.1.47（读数抄进交接段） |
| 第三方未动 | `git -C official/geme-tihu-bicycle status --porcelain` 输出为空 |
| 脚手架门禁 | `check-scaffold` 主流程 ＋ `--self-test` 全绿（含新加的两例） |
| 18 仓一致 | `node scripts/sync-plugin-agents.mjs --check` 绿 |
| 形态断言真会咬人 | 自测反例：把 mock 体塞回 `template/vitest.setup.ts` ⇒ 断言红 |
| 冷启动 | §二第 9 步的探针工程读数（三件：指针形态 / `npm test` 可跑 / 纪律段在） |

### 版本与连带

- **发版 `create-linkdesk-plugin` 0.1.14**（🔴 用户点头）＋ `release:mark` 重基线。
- 连带面跑 **§四** 全部六条（尤其第 2 条：AGENTS.md 的版本句与 `--check`）。
- 🔴 **老插件仓不强制迁移**（它们的完整 mock 还能跑）：迁移 = 换一行 ＋ 一次 `npm install`，写进 §三的作者面文档。**只做官方这 6 只**。

---

## §三 `E6#146` 维护者面文档 ＋ 作者面「测试怎么写」＋ memory 落盘

### 前因

- **中文维护者面有一处会变成假话**：`docs/02-Electron架构/E6_插件生态与发布/02-插件开发工具链/01-create-linkdesk-plugin脚手架.md` 里，两处把 `vitest.setup.ts` 描述成「🔴 **E6#102 新增**：`window.linkdesk` 六命名空间 mock——**测试的运行时地基**」，还有一段 2026-09-14 的改判记录解释了「为什么脚手架预置 vitest」。收敛成指针后，**这两处必须同笔改**（否则维护者读到的是已经搬走的地基）。
- **作者面英文树今天没有「测试怎么写」这一页**（`docs/03-plugin-authoring/` 21 篇里，只有 01 号/10 号顺带提过 vitest）——本层把地基收进 SDK 之后，作者面需要一个**权威落点**回答：工具在哪、mock 从哪来、纯逻辑该不该测、**非视图插件怎么办**、老仓要不要迁。
- **用户 2026-09-25 明确要求**：「任务档案在**记忆和 skill** 中有」⇒ 本层结论必须落 memory（skill 部分 = 本层另建 `plugin-test-coverage`，见 [05 §二](05-任务-判据尺与收口.md) 的收尾项）。

### 修哪里

| 落点 | 动作 |
|:--|:--|
| `…/02-插件开发工具链/01-create-linkdesk-plugin脚手架.md` | 74/75 行两文件描述 ⇒ 改成「一行指针 → SDK 共享地基」；540 行那段改判记录**后追加一段** 2026-09-25 收敛记（8 份拷贝 → 1 ＋ 8 指针；旧仓迁移非强制） |
| `docs/03-plugin-authoring/13-development-guide.md`（作者面英文树） | 加一节 **「Tests in a plugin repo」**（六条，见「怎么修」第 2 步） |
| `docs/03-插件制造/13-插件开发指南.md`（中文维护者面） | **同笔**（双语门禁 23:23——中英两篇必须一起改） |
| memory `plugin-repo-gate-model` | 订正那句「插件仓只查结构与声明」⇒「＋ 测试地基已随 SDK 共享（`./vitest-setup`）；覆盖判据尺只报不拦（L11）」 |
| memory **新建** `plugin-test-coverage-layer.md` | 本层结论：真源位置 / 8 处指针 / 判据口径与「先裁决后补」/ 不 bump 插件版本的理由 / 指针 → 本层档案 |
| `MEMORY.md` | 🔌 段加一行（or 并入既有一行）；**索引必须 ≤50 行、断链 = 0** |

### 怎么修

1. **中文维护者面两处**（上表第 1 行）——照事实改，别抄本档正文。
2. **作者面 13 号新增一节**（Δ 控制在半屏内，六条）：
   - ① 工具已预装（`vitest` / `jsdom` / `@testing-library/react`），跑 `npm run test`；
   - ② **共享测试地基**：`window.linkdesk` 的最小 mock 由 `@linkdesk/plugin-sdk/vitest-setup` 提供——**新仓自带一行指针**（`vitest.setup.ts`）；⛔ 不要在自己仓里再抄一份；
   - ③ **纯逻辑单元应补测**（`src/__tests__/<同名>.test.ts`）；视图/交互按需；
   - ④ **插件专属桩住本仓**（例如 `window.linkdesk.serial` —— 在自己的测试里用 `vi.fn()` 补上，别指望共享 mock）；
   - ⑤ **声明式插件**（纯 JSON / 主题 / 语言包）：**无可测单元**——门禁是 `npm run verify` 的结构与声明判据，**不是「没测试 = 不合格」**；
   - ⑥ **老仓迁移非强制**：一行换掉 ＋ 一次 `npm install` 即可（好处：mock 升级跟着 SDK 走）。
3. **memory 两份**：措辞照 memory 库的既有习惯（frontmatter `name` / `description`（写**触发条件**）/ `type`）；`description` 要写「什么时候该读它」（例如「改插件仓测试 / 写新插件 / 动 `vitest.setup` / 问『插件要不要补测试、升不升版本』时」）。
4. **门禁**：`npm run docs:build` ＋ `npm run docs:check`（产物逐字节 ＋ 双语 23:23 ＋ 仓内链接 496 条——数字以现场为准）。
5. **发版 `@linkdesk/plugin-docs` 0.1.30 → 0.1.31**（作者面英文树动了 ⇒ 产物重生成 ＋ 真发；🔴 用户点头）＋ `release:mark`。

### 验收

| 项 | 判据 |
|:--|:--|
| 双树一致 | `docs:check` 绿（双语篇数对齐 ＋ 仓内链接零断） |
| 产物新鲜 | `docs:build` 后无未提交差异残留（或差异就是本次改动） |
| 维护者面不再说假话 | 抓「逐字副本 / 两处同源」两个关键词：全仓除历史记录外**零命中**（历史段允许保留原话，但要加收敛指针） |
| memory | 新条目 ＋ `MEMORY.md` 一行；索引 ≤50 行、断链 0（`ls` 验在） |
| 发版 | `check:npm-release` 绿（黄灯已重记） |

### 版本与连带

- **发版 `@linkdesk/plugin-docs` 0.1.31**（🔴 用户点头）＋ `release:mark`。
- 本格**不动** `docs/05-插件更新/00-README.md`（那是 `#154` 的销账动作，⚠️ 别抢）。
- 作者面若**决定不写**这一节（认为 13 号已够）⇒ **也是允许的**，但要在交接段写明理由（则本格**不发 docs**，只做维护者面 ＋ memory）——**默认按「写」执行**（用户明确问过「作者面文档是不是要改」）。

---

## §四 本会话收尾清单（逐条打勾，缺一条不算收口）

1. **壳仓 `npm run check` 全绿**（2,572＋ 用例；本会话动了全仓测试的地基 ⇒ 这条是硬证）。
2. **`node scripts/sync-plugin-agents.mjs --check` 绿**（18 仓）。
3. **三笔发版都过用户点头** ＋ `npm run release:mark` ＋ `check:npm-release` 绿。
4. **容器落盘与提交**：5 仓（`vitest.setup.ts` ＋ lock）＋ 18 仓（`AGENTS.md`），**每仓单独一笔**，⛔ 不推送；`geme-tihu-bicycle` 零改动。
5. **读数回写**：本会话三格的 ✅ 读数写进 `E6-执行清单.md` 对应行；[交接.md](交接.md) 顶部加「会话一收口段」（含唯一性 grep 读数 / 5 仓 `npm test` 与 lock 落点 / 探针工程三件读数 / 三个小闸走到哪一闸）；总纲 §〇b 若有数字变动则同笔订正。
6. **三笔提交（壳仓）**：① SDK（`feat:`）② 脚手架 ＋ `scripts/`（`feat:`/`chore:` 视改动）③ 文档 ＋ memory（`docs:`）——各自单独一笔，⛔ 不揉。
