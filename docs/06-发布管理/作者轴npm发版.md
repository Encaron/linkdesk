# 作者轴 npm 发版——五根包各自的 bump → publish → 记基线

> **用途：** 改了 `packages/*` 或 `contracts/` 下面的**作者面内容**（SDK、契约类型、共享 UI 零件、脚手架模板、离线文档）之后，
> 怎么把新版发到货架上。**照做，不凭记忆。**
>
> **一句话记住它：** `npm run check` 里的**黄灯在叫你发版**——发完 `npm run release:mark`，黄灯才灭。
>
> **🔴 本档写的是「怎么发」；「什么时候该升哪根轴、升哪一位」不在这里**——去 [.claude/skills/version-bump/SKILL.md](../../.claude/skills/version-bump/SKILL.md) §〇（多轴模型表）。
> 本档与那份的分工：那份**决策**，本档**执行**。软件本体的发版另有清单 → [发布清单.md](发布清单.md)。

---

## 〇、五根轴是哪五根

| 包（货架名） | 目录 | 服务谁 | 「表面」= 改了就内容漂移的文件 |
|:--|:--|:--|:--|
| `@linkdesk/contracts` | **`contracts/`** | 插件作者（拿类型） | `linkdesk.d.ts` · `README.md` |
| `@linkdesk/plugin-sdk` | `packages/plugin-sdk/` | 插件作者（构建） | `src/**` · `schemas/**` · `dev-host/**` · `README.md` |
| `create-linkdesk-plugin` | `packages/create-linkdesk-plugin/` | 插件作者（建工程） | `index.js` · `template/**` · `README.md` |
| `@linkdesk/ui` | `packages/linkdesk-ui/` | 插件作者（共享 UI 零件） | `src/**` · `README.md` |
| `@linkdesk/plugin-docs` | `packages/plugin-docs/` | 插件作者（离线文档） | `docs/**` · `README.md` |

**表面清单的唯一真相源 = `scripts/check-npm-release.mjs` 里的 `PACKAGES[].surface`**——表里这份是给人看的摘要，改表面定义要去改脚本。

两条容易记错的：

- 🔴 **五根轴与软件本体互不联动**（memory `version-axes-separated`）：**npm 发版 ≠ 软件 bump**——发这五个包时根 `package.json` 一动不动。拆焊只拆错轴的「版本相等」断言，**检测一条不撤**。
- 🔴 **`@linkdesk/ui` 与软件本体**同号锁步**（E6#124 重锚定案，2026-09-19）**——五根轴里唯一的例外：ui 包版本号从此 = 发它的那个壳版本号（一条线，作者面无需对照表），**壳每次发版必带 ui 同号 bump**（`packages/linkdesk-ui/package.json` + `npm install` 同步 lock），机械断言 = 发布门禁判据⑤（`check-publish-gate.mjs` judgeUiVersionLockstep，不等判红）；撞号规则 = 壳让位 bump（npm 版本不可复用，`npm view @linkdesk/ui versions` 机械核对）。重锚点 = L9 翻通道发版（壳 0.2.12 → 0.2.13，ui 0.3.1 → 0.2.13，0.2.13 未被 ui 历史占用）。语义详见 [UI集中供给/00-整理档案.md §三](../02-Electron架构/E6_插件生态与发布/UI集中供给/00-整理档案.md)。
- 🔴 **`@linkdesk/contracts` 不在 `workspaces` 里**（根 `workspaces = ["packages/*"]`）——它是五根轴里唯一住在 `packages/` 外面的一根，所以**发它的命令形状和另外四根不一样**（见 §二 ③）。

---

## 一、什么时候该发

三个触发信号，出现任一个就该发：

| 信号 | 从哪看 |
|:--|:--|
| **黄灯 A ——「npm 货架没跟上」** | `npm run check:npm-release`：内容指纹变了、版本号没动 |
| **黄灯 B ——「bump 了 ≠ 发布了」** | 同上：版本号变了、基线没记 |
| 你自己知道动了表面（模板 / README / schema / 类型 / 文档） | —— |

🔴 **两条黄灯都不判红**——`npm run check` 永远 EXIT 0，它们是**提醒不是闸**。真正的闸在 `release:mark` 那一下（§三）：它**联网**核对货架 `latest` 是否等于本地版本号，不符就拒收，且**整批原子**（一批里任何一个不过，一个都不写）。

`@linkdesk/plugin-docs` 多一条：它的表面是**生成物**。真源是两棵文档树（`docs/03-plugin-authoring/**` 英文主显 + `docs/03-插件制造/**` 中文原文），改了真源**不重生成** ⇒ `docs:check` 先红（挂在 `npm run check` 里）。顺序是：

```bash
npm run docs:build     # 真源 → packages/plugin-docs/docs/**（英文在包根、中文收 zh/）
npm run docs:check     # 与真源逐字节比对
```

---

## 二、发版五步

```bash
# ① 改内容——真源永远在壳仓（contracts/ 或 packages/*/），别去 node_modules 里改

# ② bump——改**该包自己**的 package.json 的 version
#     0.x 阶段向后兼容变更一律走 patch 位（0.1.5 → 0.1.6）；破坏性走 minor 位（0.1.5 → 0.2.0）
#     ⚠️ 包轴版本号唯一真相源 = 该包自己的 package.json——不是根那份

# ③ 发布（🔴 --registry 必须显式带，理由见 §三 ①）
cd packages/<包> && npm publish --registry=https://registry.npmjs.org   # packages/ 下的四根
cd contracts     && npm publish --registry=https://registry.npmjs.org   # contracts 进目录发，见 §三 ②

# ④ 记基线（壳仓根）——联网核对货架 latest == 本地 version，不符就拒收
npm run release:mark

# ⑤ 提交：该包 package.json 的 version ＋ scripts/npm-release-state.json **同笔**
```

**跨仓/跨步的因果**：② 不动 ③ 发的是旧版本（npm 拒绝重复版本号）；③ 不做 ④ 必拒（货架读到的还是旧版）；④ 不做黄灯 B 常亮。

**一次改了多根轴**（例如顺手把 SDK 与 UI 的 README 一起补了）⇒ **批着发**：逐个跑 ②③，最后跑**一次** ④。`release:mark` 本身就是批处理，且整批原子。

---

## 三、三个实测到的坑（别再踩）

> 出处：L7 第 7.8 增补轮（五轴全量重新分发）现场实测。

**① `--registry=https://registry.npmjs.org` 是必须的。**
本机**用户级默认源是 `registry.npmmirror.com`（只读镜像）**——不带这个旗标，要么直接失败，要么发到镜像上去（镜像不会把你的包传回官方货架）。**每一次 publish 都带**，别靠本地 `.npmrc`；workspace 里的包连自己的 `.npmrc` 都不读。

**② `contracts` 要**进目录**发——🔴 别写 `npm publish contracts`（本轮实测踩到）。**
`--workspace=<name>` **只对 `packages/*` 有效**（`contracts/` 不在 workspaces 里），`--prefix` 也不行（npm 会去读**根** `package.json`，而根是 `private: true` ⇒ `EPRIVATE`）。
但 `npm publish contracts` **也不对**：`npm publish` 的位置参数既可以是路径也可以是**包规格**，裸写名字会被当成**包名**去货架解析——本轮它真的去解析了货架上**别人**的 `contracts@0.4.0`，只是被 npm 的重复版本护栏拦下才没出事（日志里 `filename: contracts-0.4.0.tgz`、12 个文件，**根本不是我们的包**）。侥幸没发出去纯属运气，别再这么写。

```bash
cd contracts && npm publish --registry=https://registry.npmjs.org   # ✅ 进目录，无歧义
```

**③ 货架读取有复制延迟，约 3 分钟。**
`contracts` 是秒级可见，而 `plugin-sdk` / `plugin-docs` 要**约 3 分钟**才在 `registry.npmjs.org` 的 dist-tags 里出现（PUT 当时已返回 200/202）。🔴 **别看到 404 就重发**——重发会撞「版本已存在」。轮询端点：`https://registry.npmjs.org/<pkg>` 的 `dist-tags`（`check-npm-release` 读的就是它）。
⇒ 因此 **publish 完立刻 `release:mark` 可能吃到黄灯**——等一会儿再跑，或先跑 `npm run check:npm-release` 看货架读到没有。

**④ 🔴 发布前先把文件"定格"——最后一次改动会在 publish 之后才被发现。**
README / 模板这类**文本表面**，改完到 publish 之间**任何一次再改都会造成货架漂移**（黄灯 A 立刻回来）。E6#108 实测**两条**都踩了：① `contracts` 发完才改 README ⇒ 重发一位；② `create-linkdesk-plugin` 与 `plugin-sdk` 发完后，**pre-commit 的 `blank-at-eof` 钩子**报「new blank line at EOF」⇒ trim 尾空行 ⇒ 又漂 ⇒ 各自再重发一位。**两次多发的版本号全都源于"发表面之前没定格"**（该轮五包共发 7 次）。

⇒ **固化动作：`git add` 之后、`npm publish` 之前，先真跑一次 pre-commit**（`git commit` 一次空提交，或 `npx lefthook run pre-commit`）。**钩子先绿，再发。**

---

## 四、发布后自检（三步，缺一不可）

```bash
npm run check:npm-release                        # ① 黄灯灭（离线；两条警告都不该再出现）
npm view <包> version --registry=https://registry.npmjs.org   # ② 货架读数 == 你刚发的版本
npm run check                                    # ③ 全绿（含 check-scaffold / docs:check / contracts:check）
```

**脚手架这根轴（`create-linkdesk-plugin`）加一步**：它的产物是**生成出来的工程**，所以发完要真跑一次生成、核产物与模板一致——`npm run check:scaffold` 管生成物契约（文件集、script 条数、占位符残留）。

---

## 五、🔴 发完 `create-linkdesk-plugin` 必看：作者侧的 npx 缓存

**发布件本身不会出问题；出问题的是作者机器上的 npx 缓存。**

`npm create linkdesk-plugin` 用的是**裸规格**（不带版本号），npx 会按规格算一个缓存键、在 `_npx` 里找已解出来的那份——**找到了就不再问货架**。于是作者本机可能停在几个月前的旧模板上，而且**一声不响**：CLI 不打印自己的版本号，生成出来的文件少几个也看不出来（缺 `.git` / `AGENTS.md` / CI，只有 7 个文件 vs 正常的 16 个）。

**给作者的写法（文档一律用这个）：**

```bash
npm create linkdesk-plugin@latest my-cool-plugin   # 带版本锚 ⇒ 强制问货架
```

**已经踩了的作者怎么救**（二选一）：

```bash
npm cache clean --force          # 全清（粗暴但有效）
# 或只删那个缓存目录：<npm 缓存>/_npx/<那一项>   （npm config get cache 看缓存根在哪）
```

实测对照（2026-09-14，本机）：裸命令 → 7 文件；`@latest` → 16 文件；删掉那条旧缓存后裸命令 → **16 文件**。所以病根在缓存，不在发布件。

> 这条最初是 L7 全层验收的挂账项 F5，本轮（E6#108）落成文档修正 + 五轴 README 补维护段。

---

## 六、相关门禁与文件

| 东西 | 在哪 | 干什么 |
|:--|:--|:--|
| `scripts/check-npm-release.mjs` | 挂 `npm run check` | 两条黄灯（离线、永不判红）；`--mark` 时联网核对货架 |
| `scripts/npm-release-state.json` | 仓根 | 基线账（`release:mark` 写，**勿手改**） |
| `scripts/check-scaffold.mjs` | 挂 `npm run check` | 脚手架生成物契约（需 git 在 PATH） |
| `scripts/generate-plugin-docs.mjs` | `docs:build` / `docs:check` | 文档包产物生成与逐字节比对 |
| `scripts/check-lockfile-sync.mjs` | 挂 `npm run check` | lockfile 与各 manifest 同源——🔴 **升 `packages/*` 版本号后必须重跑 `npm install` 并同笔提交 lock** |

---

## 七、和软件发版的关系（一句话）

**互不触发。** 插件与作者轴的发版**不必与壳同批**；只有「这一版软件要带上某个插件的**新版出厂**」时才有顺序依赖——那件事的配方在
[01-插件独立构建/05-内置插件迁移指南.md §2.1](../02-Electron架构/E6_插件生态与发布/01-插件独立构建/05-内置插件迁移指南.md)，软件本体的发版照 [发布清单.md](发布清单.md)。
