# 11-作者侧工具包（marketplace-kit）与作者文档

> **为什么存在**：`marketplace.json` 会越来越复杂（首页板块、合集、榜单、作者块），
> 而作者形态差异极大——大多数作者只有**一个仓库一个插件**，不会为一个插件去建独立市场仓。
> 本档把「作者侧模板、工具、文档」一次定清，避免出现「Schema 一份、解析器一份、文档再一份」的三方漂移。
>
> **上游**：[00-README](00-README.md) 工程规范／涉及面清单、[06 §六](06-数据设计.md)（内容热更新）、[09](09-API设计.md)（目录 v2 schema）；
> **下游**：新 npm 包、`docs/03-插件制造` 中英章节、市场插件源解析回落链。

## 一、定位：第五个作者侧包

| 包 | 面向 | 运行在哪 | 用途 |
|---|---|---|---|
| `@linkdesk/contracts` | 插件 ↔ 壳 | 用户机器 | 运行时 API 类型 |
| `@linkdesk/plugin-sdk` | 插件作者 | 用户机器（打包进插件） | 写插件代码 |
| `@linkdesk/ui` | 插件作者 | 用户机器 | 共享界面组件 |
| `@linkdesk/plugin-docs` | 插件作者 | 文档站 | 作者文档 |
| **`@linkdesk/marketplace-kit`（新）** | **市场数据作者** | **作者机器 / CI（devDependency）** | **写、校验、初始化 `marketplace.json` / `authors/<id>.json`** |

⛔ 不并入 `contracts`（那是运行时面，会装进用户机器）；
⛔ 只放文档附件（无法被编辑器与 CI 消费）。

## 二、包内容（v1）

| 项 | 说明 |
|---|---|
| `schema/marketplace.schema.json` | 顶层结构、`plugins[]`、`collections[]`、`categoryRail`、`homepage.sections[]`（hero/collection/grid/rank 及 `more`/`hint`/`glow`/`scope`） |
| `schema/authors.schema.json` | 作者块：`authorId`/`name`/`repos[]`/`storeTitle`/`homepage` |
| TS 类型 | `MarketplaceFile` / `AuthorFile` / `SectionDecl` 等，与 Schema 同源 |
| `validate(file, kind)` | 纯函数，返回 `{errors[], warnings[]}`，路径精确到字段（如 `homepage.sections[2].collection`） |
| CLI | `npx linkdesk-market validate ./marketplace.json`；`npx linkdesk-market init [--author]` |
| 示例 | `examples/min.json`（多插件最小）、`examples/full.json`（全量）、`examples/authors.json`（多仓） |

**来源回落链（市场插件侧实现，不在本包）**：

```
源 URL → 根目录 marketplace.json？（L1/L2）
       → 否则 plugin.json？（L0 单插件，合成一条目录）
       → 否则报错：「未找到 marketplace.json / plugin.json」＋模板链接
```

## 三、三种作者形态

| 形态 | 仓库内容 | 作者要做什么 | 用户怎么用 |
|---|---|---|---|
| **L0 单插件** | `plugin.json` | 什么都不用加 | 粘贴仓库地址即得 1 个插件 |
| **L1 多插件** | `plugin.json`×N ＋ 根 `marketplace.json` | 用 `init` 生成 → 填 `plugins[]`（可选 `collections`/`homepage`） | 一个源，多个插件 |
| **L2 独立市场仓** | `marketplace.json` ＋ `authors/<authorId>.json` | 同上 ＋ 作者块（多仓聚合、作者主页） | 作者卡 / 作者主页 |

- **authorId 缺省**：L1/L2 未声明作者块时，按 **GitHub 仓库 owner** 推导（fork 可被声明覆盖），多仓自动聚合。
- **多插件同栏目**：L1 即可满足（`collections[]` 声明），不必上升到 L2。

## 四、模板的形态（四件，缺一不可）

1. `marketplace.example.json`（最小可用）＋ `marketplace.full.example.json`（全量注释版——注释在 README，JSON 里不放假字段）
2. `authors.example.json`
3. **Schema**（`"$schema"` 一行接入，编辑器实时补全与报错）
4. **「首页菜谱」文档**：每个板块一段可复制 JSON（hero/collection/grid/rank ＋ `more`/`hint`/`glow`/`scope`）

⚠️ ⛔ 发明 `_comment` / `//` 假字段：白名单会丢弃，作者以为生效了其实没有。

## 五、单源对账（防三方漂移）

```
一份定义（Schema/类型）
   ├─ parse 白名单（市场插件）   ← 对账测试互锁
   ├─ validate（本包）           ← 错误码同一套
   └─ 作者文档（03 中英）        ← 字段表由 Schema 生成或复核
```

- 对账测试扩为**三方**：类型 ↔ 白名单 ↔ Schema。任一方多/少字段即红。
- `validate` 的 error/warning 文案与市场侧 warnings **同一套**（重复大屏、未知板块、合集不存在、键名疑似拼错）。
- 兼容纪律：**只加字段、不改语义**；旧文件永远可读。

## 六、文档落点（作者真正会看的地方）

`docs/03-插件制造/`（中）＋ `docs/03-plugin-authoring/`（英）**同笔新增一章**：

1. 三种作者形态（L0/L1/L2）与选择指引
2. `marketplace.json` 字段全表（含首页板块与限制：hero 至多一个置顶、`more` target 封闭集合、`glow`、`scope`）
3. 首页布置菜谱（可复制片段）
4. 本地自检：安装 `marketplace-kit` → `validate` → 常见错误对照
5. 别人怎么用（源 URL / 作者卡 / 统一池）
6. 模板版本与兼容

## 七、任务清单

| # | 任务 | 落点 |
|---|---|---|
| K1 | 新包骨架 `packages/marketplace-kit/`（schema/types/validate/cli/examples） | 壳仓 packages |
| K2 | Schema 与 parse 白名单三方对账测试 | 市场插件仓 |
| K3 | `validate` 错误码与市场 warnings 统一 | 市场插件仓 |
| K4 | `init` 生成 L1/L2 骨架 | 新包 |
| K5 | 市场侧源解析回落链（marketplace.json → plugin.json → 报错带链接） | 市场插件仓 |
| K6 | 03 中英章节＋菜谱 | 作者文档 |
| K7 | 发布纪律：新包独立版本；动 Schema 必发；`check-npm-release` 纳入 | 发版链 |
| K8 | **publish v2**：读 `marketplace.config.json`，除 v1 条目外写 `authors/<id>.json`／`collections/`／首页板块；同版本重跑拦截、新版本追加历史 | SDK 包 |
| K9 | **官方 `sources[]` 收录机制**：目录根字段＋PR 模板＋CI 校验（URL 可达／schema／id 不撞） | 官方目录仓＋CI |
| K10 | **认证申请指南**（作者文档 03 中英）：资格、三方式选择（domain/github-org/manual）、逐步操作、PR 模板、域名文件内容、审核预期、变更/撤销 | 作者文档 |
| K12 | **kit `sign-license` 命令**：`--plugin/--machine/--exp` → Ed25519 密钥；付费作者零密码学知识签发；配套公钥生成（`keygen`） | 新包 |
| K10b | **付费作者指南**（03 中英）：pricing 声明/公钥放置/签发流程/退款换钥/买家找钥 | 作者文档 |
| K11 | **AI 认证审查规程**（官方目录仓 AGENTS.md）：待审清单查询（`gh pr list --label vendor-application`）＋审查四要素报告（是谁/想干什么/做什么类型/安不安全——声明面核查）＋**代批边界（⛔ AI 不得自行合并，必须用户明示「通过」后才执行 `gh pr merge`）** | 官方目录仓 AI 面 |

## 九、发布流程 v2（2026-11-19 拍板：扩展 CLI；官方目录收「源」不收「条目」）

### 9.1 作者侧命令链

1. `npx @linkdesk/marketplace-kit init` → 生成 `marketplace.config.json`（作者身份／店名／合集／首页板块）＋ `$schema` 补全。
2. `npm run build` → 产 `<id>.linkdesk-plugin`。
3. `npm run publish`（SDK 现有链路扩展）：
   - `validate` 本地校验（config＋plugin.json＋包完整性）；
   - GitHub Release（tag=`v<version>`）＋上传分发包；
   - 更新**作者自己仓库**的目录（v1 扁平条目照写＋v2 文件夹）；
   - 预览确认／`--yes`／`--dry-run` 照旧。
4. 幂等：同版本重跑 → 拦；新版本 → 追加 `versions[]` 历史。

### 9.2 v2 写入对照（谁写什么）

| 文件 | 谁写 | 内容 |
|---|---|---|
| `marketplace.json` | publish | 插件条目：`versions[]`、`readmeUrl`、`versions[0].changelog`、绝对图标 URL（v1 字段全保留） |
| `authors/<authorId>.json` | publish 首次生成，之后以作者 config 为准 | 身份（GitHub 名／头像／简介）、`repos[]`、`homepage.sections[]` |
| `collections/<id>.json` | publish 从 config 合并 | 合集项、`hint`／`glow`／`more` |

### 9.3 官方目录收录＝收「源」

🔴 **拍板：PR 收的是源，不是条目副本**——否则作者发新版时官方那份拷贝必然过期（没有服务器同步，见 B3）。

- 官方目录新增 `sources[]`：`{ url, authorId, addedAt }`（已审核源清单）。
- **PR 模板**：作者只加自己一行；CI 校验：URL 可达、目录格式合法（schema）、pluginId 不重复。
- 商店合并顺序：官方源 → 官方收录源 → 用户自己添加的源；同 id 按 semver 高者胜（与现逻辑一致）。
- 收录只做**信任背书**，不复制条目 ⇒ 作者发新版零维护、永不过期。
- ⛔ 作者不得在 PR 里改官方 curation（首页／合集／榜单）——那些是官方维护内容。

### 9.4 边界

- 未收录源仍可由用户手动添加（自由市场）；审核只决定「是否随官方分发」。
- 收录可撤（删 `sources` 行）：已装插件保留，后续不再自动出现。
- 作者改名／换仓 → 旧 URL 失效，需重新提交；商店把该源标「失效」而不是静默消失。

## 八、验收

- [ ] 只放 `plugin.json` 的仓库可直接添加，得到 1 个插件。
- [ ] 用 `init --author` 生成的骨架无需改动即可被市场读取（空集合法）。
- [ ] `validate` 能抓出：`collection` 键写成 `id`、hero 重复、合集不存在、未知字段（warning 而非静默丢）。
- [ ] Schema 在 VS Code 中对 `$schema` 文件提供补全与红波浪线。
- [ ] 三方对账测试绿；旧版目录文件零改动可读。
