# create-linkdesk-plugin 脚手架

> 🔵 **非新能力（2026-09-05 塌平收编）**：本次改动仅插件目录塌平单根（`plugins/builtin|user` → `plugins/<id>`）参照路径文本同步，零新增 `window.linkdesk.*` / `contributes.*` 面。塌平决策见 [09-插件目录塌平决策.md](../01-插件独立构建/09-插件目录塌平决策.md)。
> 🔵 **非新能力（2026-09-11，E6#94 template v2）**：本轮只改**模板形状**（多几个文件、少一行字段、文案换写法），**不新增任何壳 API / 不新增 contribute 贡献点**——文中出现的 `contributes.*` 全是「引用既有贡献点做对照」。判据见 [插件规范化层/05-脚手架换代](../插件规范化层/05-脚手架换代.md)。

> 🔵 **非新能力（2026-09-11，E6#95c/#95e 门禁与发布）**：模板形状**由 `scripts/check-scaffold.mjs` 8 条断言守**（§七·五），
> 本包**进了 npm 发布基线**（§七）——**同样零新增壳 API / 零新增贡献点**。执行期实测发现并修掉两件真事故：**模板 `gitignore` 改名防 npm 丢弃**（§九.5）、**补本包 `.npmrc` 防发布落镜像源**（§七 坑①）。

> 🔵 **非新能力（2026-09-14，E6#103 · L7 7.6 轮）**：本轮只改**脚手架自己的行为**——① CLI 代建 git 仓
> （照 `cargo new` 三语义 ＋ `--no-git` 逃生口，§三）；② 模板把 `pluginId` 从「注释教学」改成**显式声明**
> （该字段 `#98g` 早已进 schema，本轮是**消费既有字段**，不是新造）；③ 生成物契约多了**建仓三语义**一条断言（§七·五）。
> **零新增壳 API / 零新增贡献点**。逐轮详案与判据 → [插件源码外移层/07-脚手架与工作区.md](../插件源码外移层/07-脚手架与工作区.md)。

> 对应任务：E6#21-#23，**template v2 = E6#94（2026-09-11）**。对标 `yo code`（VS Code Extension Generator）。
> ⚠️ 2026-08-30 第 2.1 轮审视：§四 模板 plugin.json 原为 E5.6 schema，已按 E5.8 实测换代（见 §八）。
> 插件作者打一行命令 → 获得完整的插件项目骨架。

---

## 一、用户视角

```bash
npm create linkdesk-plugin my-cool-plugin

# 输出：
# ✔ my-cool-plugin/ 已创建
#   ✔ 已建 git 仓（main 分支 + 一次初始提交）        ← 视情形改写，见 §三
#
#   接下来：
#     cd my-cool-plugin
#     npm install
#     npm run dev        # 浏览器热重载预览（改代码即时生效）
#     npm run validate   # 校验 plugin.json（$schema / 字段 / i18n 文件）
#     npm run build      # 打包出 my-cool-plugin.linkdesk-plugin，可装进 LinkDesk / 发布
#
#   要发布（npm run publish）时还需要一个 GitHub 远端：
#     git remote add origin git@github.com:<你>/<仓库>.git
#     git push -u origin main
#
#   然后：先读 README.md —— 目录该放哪、三条纪律、怎么发布都在里面。
#   plugin.json 的 name / description / author 是你的身份信息，src/index.tsx 是插件本体。
#   完整插件能力（侧栏视图 / 命令 / 设置 / 协议……）见 docs/03-插件制造/。
```

> 🔵 **`dev` 命令 2.1 轮刻意不宣传，v2 轮补印**：E6#24 dev 宿主已落地 ⇒ 首屏补 `npm run dev` 顺理成章（§八.5 的「双向承接锚」在此结算）。
> 🔴 **首屏依旧不提 `publish`**（它要 GitHub token，属「准备好了再做」的事，放生成的 `README.md` 里详说）
> ——**但「接远端」那两行印**（7.6 补）：仓已经替作者建好了，不把最后一步说出来，作者会以为已经能发布了。
> 「建仓那一行」本身也**必须印**：这是作者最容易误以为「漏了」或「多做了」的地方（§三 行为定案）。

---

## 二、包结构

> 模板真身 = `packages/create-linkdesk-plugin/template/`——§四-§六 与其对齐；**改动模板必须同步本档案对应节**。

```
packages/create-linkdesk-plugin/
  ├── package.json         # name: "create-linkdesk-plugin", "bin": { "create-linkdesk-plugin": "./index.js" }
  ├── index.js             # CLI 入口（ESM，纯 Node.js 零依赖）
  ├── README.md            # 用法 + 生成物说明
  ├── .npmrc               # 🔴 **无作用域的包必须直改默认源**（见 §七），不能照抄 scoped 那三份
  └── template/            # 模板文件（{{pluginName}} / {{displayName}} / {{author}} / {{date}} 占位符）
      ├── plugin.json            # JSONC 清单——E5.8 schema，逐字段注释分节（**显式声明 pluginId**，见 §九.1）
      ├── package.json           # scripts: dev / dev:real / build / publish / validate / lint / verify / test
      ├── tsconfig.json          # jsx: react-jsx + types 引 @linkdesk/plugin-sdk + strict
      ├── gitignore              # 🔴 **无点**——CLI 生成时改名成 .gitignore（npm 会丢 .gitignore，见 §九.5）
      ├── README.md              # 说明——市场「详情」页签数据源 + **目录契约表**
      ├── CHANGELOG.md           # 更新日志——市场「更改日志」页签数据源（段标题 `## v<版本>（日期）`）
      ├── .vscode/settings.json  # files.associations: plugin.json → jsonc（**带三行注释说明为什么**）
      ├── .github/workflows/
      │   └── ci.yml             # 🔴 **E6#102 新增**：push/PR 跑 validate → verify → build → test（§九.4）
      ├── scripts/
      │   └── ci-verify.mjs      # 🔴 **E6#102 新增**：仓内严格门禁（lint 全腿 + 跨插件 import + 字典 + 声明自洽）
      ├── vitest.config.ts       # 🔴 **E6#102 新增**：环境对齐壳仓（jsdom/globals/setupFiles + @linkdesk/ui inline）
      ├── vitest.setup.ts        # 🔴 **E6#102 新增**：window.linkdesk 六命名空间 mock——**测试的运行时地基**
      ├── resources/
      │   └── icon.svg           # 身份图**占位图**（中性灰虚线框——作者替换）
      ├── src/
      │   ├── index.tsx          # E5.8 契约 { isActive?, tabId?, sourceId? } default 组件 + **真用 t()**
      │   └── index.css          # CSS 变量示范（var(--text) / var(--font-size-xs)，禁 hex / 禁裸 px 字号）
      └── i18n/
          └── en.json            # **只放 src/ 里真被 t() 读过的 key**（见 §九.2）
```

**v2 新增 6 件**（`README.md` / `CHANGELOG.md` / `.gitignore` / `resources/icon.svg` / `package.json` 两个 script / `.vscode` 注释）——缺口对照表见 [插件规范化层/05 §一](../插件规范化层/05-脚手架换代.md)。

**E6#102（L7 第 7.5 轮）新增 4 件**（`.github/workflows/ci.yml` / `scripts/ci-verify.mjs` /
`vitest.config.ts` / `vitest.setup.ts`）——「**新插件一建出来就自带门禁**」从此是默认行为，不是每仓手加。
理由与判据见 [插件源码外移层/06-门禁与CI.md](../插件源码外移层/06-门禁与CI.md)。

**E6#103（L7 第 7.6 轮）不加文件，改两处行为**：① CLI 生成完**按 `cargo new` 语义代建 git 仓**（§三）；
② 模板 `plugin.json` 的 `pluginId` 从「注释掉的覆盖值」改成**显式声明**（§四、§九.1）。

---

## 三、CLI 入口——index.js

ESM 单文件零依赖（`#!/usr/bin/env node` + `import.meta.url` 定位 template 目录）。占位符替换递归扫全部文本文件（模板全是文本文件，无需跳过二进制），四个值：

| 占位符 | 值 | 来源 |
|:--|:--|:--|
| `{{pluginName}}` | kebab 名 | 命令行参数 / 交互式提问 |
| `{{displayName}}` | 名转 Title Case | `my-cool-plugin` → `My Cool Plugin` |
| `{{author}}` | 作者名 | `git config user.name`，拿不到兜底 `you` |
| `{{date}}` | `YYYY-MM-DD` | **本地日期**（`getFullYear/getMonth/getDate`，**不用 `toISOString`**——那是 UTC，跨时区会差一天） |

```javascript
// 行为骨架（真身 = packages/create-linkdesk-plugin/index.js）
import { spawnSync } from "node:child_process";
import { mkdirSync, cpSync } from "node:fs";
import { createInterface } from "node:readline";

const NAME_RE = /^[a-z][a-z0-9-]*$/;      // kebab-case：小写字母开头，之后小写字母/数字/连字符

async function main() {
  let name = (process.argv[2] || "").trim();
  if (!name) name = await ask("插件名（kebab-case，如 my-cool-plugin）: "); // ② 交互式路径
  await createPlugin(name);            // ① 参数路径
}

function createPlugin(name) {
  if (!NAME_RE.test(name)) die(`插件名须为 kebab-case…收到："${name}"`); // exit 1
  const dir = join(process.cwd(), name);
  if (existsSync(dir) && readdirSync(dir).length) die(`${name}/ 已存在且非空…`); // exit 1
  mkdirSync(dir, { recursive: true });
  cpSync(templateDir, dir, { recursive: true });
  walkReplace(dir);   // {{pluginName}} / {{displayName}} / {{author}} / {{date}}
  printNextSteps(name);
}
```

**行为定案：**
- **命名校验**：`/^[a-z][a-z0-9-]*$/`——拒绝大写/空格/前导数字，消息明示 kebab-case 规则（对标插件 ID `SAFE_PLUGIN_ID`）。
- **既有目录**：非空即拒绝（exit 1），不静默覆盖。
- **选项白名单**：只认 `--no-git` / `--help`（`-h`），**别的 `-` 开头一律报错退出**——`--nogit` 这种拼错若被静默忽略，作者会以为仓建好了。
- **作者名**：`git config user.name` → 兜底 `you`。
- **`{{date}}` 只注入 `CHANGELOG.md` 的初始段标题**——格式必须是 `## v<版本>（YYYY-MM-DD）`，那是市场「更改日志」页签切段的解析依据（[插件规范化层/02](../插件规范化层/02-元数据链路归一.md)）。**注入错格式 = 作者第一个插件就显示不了更新记录。**
- **成功输出（v2）**：`cd` / `npm install` / `npm run dev` / `npm run validate` / `npm run build` + **把 `README.md` 指出来**（目录契约靠这一步被看见）+ 指向 `docs/03-插件制造/`；**不提 `publish` 本身**，但建了仓就把「接 GitHub 远端」那两行印出来（§一）。

### 三·一、🔴 建仓（E6#103 · L7 第 7.6 轮）——照抄 `cargo new` 的三语义

**痛点**：作者生成完工程第一件事是「跑起来」，而 `npm run publish` 会报错要求「已推到 GitHub 的 git 仓」
（`packages/plugin-sdk/src/publish.ts` 的 `gitRemoteOrigin`），于是作者被迫**手敲三条命令**——卡在
「先学一套流程、还没见到任何产出」那一步。

**照抄的是这三条**（`cargo new` 的精确语义，**不是「一律 `git init`」**）：

| # | `cargo new` 的行为 | 本 CLI |
|:--:|:--|:--|
| 1 | 目标目录**已在某个 git 仓内** ⇒ **不 init**（不造嵌套仓） | ✅ 同 |
| 2 | 不在任何仓内 ⇒ 自动建仓（默认 `--vcs git`） | ✅ 同 |
| 3 | `--vcs none` 关掉 | ✅ `--no-git` |

判定用 `git rev-parse --show-toplevel`（在**目标目录里**问，目录此时已建好，向上找仓根正是 cargo 的做法）。

**比 cargo 多一步：建完仓顺手做一次初始提交。** 理由：模板已生成 `.gitignore` ⇒ 作者第一次 `git status`
不该是满屏 untracked；且 `git log` 立刻有一笔可回退的基线。提交消息 `chore: 初始骨架（create-linkdesk-plugin 生成）`，
带 `--no-verify`（新仓的初始提交不该被使用者全局 `core.hooksPath` 上的钩子审）。

**🔴 CLI 必须把结果说全**（这是「别让作者以为漏了」的落点）——五种情形各有自己那一行：

| 情形 | 输出 | 说明 |
|:--|:--|:--|
| 建了 | `✔ 已建 git 仓（main 分支 + 一次初始提交）` | 正常路径 |
| `--no-git` | `· --no-git：未建 git 仓（发布前需要自己 git init）` | 显式跳过 |
| 已在某仓内 | `· 已在 git 仓内（<仓根>）——按 cargo new 语义不建嵌套仓` | **连仓根一起印**，作者才知道为什么 |
| 没装 git | `⚠️ 找不到 git（不在 PATH）——未建仓；…` | 骨架照常给，不拿环境卡人 |
| 提交失败 | `⚠️ 仓已建，但初始提交没成（git commit）：…` | 多半是没配 git 身份，给出那两条 `git config` |

⇒ **任何一步失败都不终止脚手架**：骨架已经生成好了，建仓是加分项、不是前置条件。

**`git init -b main`**（显式指定默认分支名）——避免作者第一次 `push` 撞上 `master` 提示，也与 GitHub 默认一致；
git < 2.28 不认 `-b`，退回 `git init` ＋ `symbolic-ref HEAD refs/heads/main`。

---

## 四、模板文件——plugin.json

> **E5.8 schema 真身**（JSONC：可注释、可尾逗号——LinkDesk 与 SDK 都按 jsonc 解析，对标 VS Code package.json；`.vscode/settings.json` 把 `plugin.json` 关联为 jsonc 让 VS Code 不标红）。字段取舍依据见 §八；**v2 两处改动（删 `pluginId` / 补 `icon`）见 §九；`pluginId` 已于 7.6 改回显式声明——§九.1 已改判**。

```jsonc
{
  "$schema": "./node_modules/@linkdesk/plugin-sdk/schemas/plugin.schema.json",

  // ── 插件身份 ──
  // 🔴 插件 ID：显式声明。它是安装目录名 / 卸载墓碑 / 更新对账的唯一键，发布后永不可变。
  // 它与插件所在的目录名无关（目录可以随便改）——别拿目录名当它的替身。
  "pluginId": "{{pluginName}}",
  "name": "{{displayName}}",             // 显示名——标签页 / 插件详情等 UI
  "version": "0.1.0",                    // 语义化版本 x.y.z——+1 时务必同笔补 CHANGELOG.md 的新段
  "description": "{{displayName}}——我的第一个 LinkDesk 插件",
  "author": "{{author}}",
  "icon": "resources/icon.svg",          // 图标——图标栏 / 标签页 / 市场里显示的就是它

  "entry": "src/index.tsx",              // 视图插件 = 此文件 default 导出一个 React 组件

  "appearsIn": { "tabBar": true },       // 出现位置：可作为主区标签页打开
  "tabBehavior": { "singleton": true },  // 全局只开一个实例

  "contributes": {
    "i18n": { "en": "i18n/en.json" },    // 自带翻译；无需 zh.json——中文 key 原文自带兜底
    // 需要「侧栏/底部面板/辅助侧栏」分区视图时取消注释，容器 key 与 view id 用 pluginId 做前缀防撞：
    // "viewsContainers": { "{{pluginName}}-sidebar": { "title": "{{displayName}}", "location": "sidebar" } },
    // "views": {
    //   "{{pluginName}}-sidebar": [
    //     { "id": "main", "title": "{{displayName}}", "render": "src/views/MainView.tsx", "order": 0 }
    //   ]
    // }
  },
}
```

**逐字段取舍（注释分节示范，对标 VS Code package.json）：**
- **为什么是「主区标签页 + appearsIn.tabBar + singleton」起步，而非 viewsContainers 侧栏视图**：标签页形态任何壳版本都能渲染；纯 contributes 视图依赖打包版分区视图渲染管线的完整度（面板-demo 曾有 E6#62e 缺口风险）。侧栏/面板能力以「注释掉的扩展块」示范，作者需要时取消注释即可，防撞前缀已示。
- **`pluginId` 显式写**（7.6 改判，理由见 §九.1）——不写等于教作者依赖「目录名兜底」，而那个兜底只为兼容存量第三方插件；硬约束 11 要求身份**显式声明**。
- **`icon` 必须写**（v2 改动）——不写 ⇒ 生成物在图标栏 / 标签页 / 市场里全是**默认「插头」块**，作者第一眼看到的是「我做的插件坏了」。
- **无 `views` 根级视图仍能跑**：壳对带 `entry` 的插件走入口渲染路径。

---

## 五、模板文件——src/index.tsx + index.css

> **v2 改动**：文案改走 `t()`（原先三行中文全硬编码、`i18n/en.json` 里躺着一个没人读的 `hello` key）——理由见 §九.2。

```tsx
import { useTranslation } from "react-i18next";
import "./index.css";

export default function HelloPlugin(_props: { isActive?: boolean; tabId?: string; sourceId?: string }) {
  const { t } = useTranslation();

  return (
    <div className="{{pluginName}}-starter">
      <h2 className="{{pluginName}}-starter__title">{t("插件跑起来了 ✨")}</h2>
      <p className="{{pluginName}}-starter__text">{t("这是你的第一个 LinkDesk 插件。")}</p>
      <p className="{{pluginName}}-starter__hint">
        <code>src/index.tsx</code> {t("是插件本体——改它，浏览器预览即时刷新。")}
      </p>
      <p className="{{pluginName}}-starter__hint">
        <code>npm run build</code> {t("打包出分发文件，可装进 LinkDesk 或发布到市场。")}
      </p>
      <p className="{{pluginName}}-starter__hint">{t("目录该放哪、发布怎么做，都写在 README.md 里。")}</p>
    </div>
  );
}
```

**契约要点（doc 注释里也写着）：** `{ isActive?, tabId?, sourceId? }` 全可选——keep-alive 下非聚焦仍在渲染，isActive 只 gate 副作用；`if (!isActive) return null` 整块 blank 掉内容是反模式。**代码标识符（`src/index.tsx` / `npm run build`）留在 `<code>` 里、不进 `t()`**——它们不是 UI 文案。

```css
/* {{displayName}} 样式示例（`npm run lint` 会照着下面四条查）。
   四条纪律：
   · 颜色一律 var(--xxx)，禁硬编码 hex——用户换主题时你的插件要跟着变；
   · 字号一律 var(--font-size-*)——用户调全局字号时它才跟着缩放，裸 px 不会；
   · padding / margin / gap 走 4px 节奏（4 的倍数）；
   · 类名一律以 {{pluginName}}- 开头——插件视图里宿主、共享组件与**所有已加载插件**的
     CSS 在同一张样式表里，裸类名（如 .starter）是全局标识符，会和别人的同名规则
     互相覆盖（不报错、只是长得不对）。 */

.{{pluginName}}-starter { padding: 24px; font-family: inherit; }
.{{pluginName}}-starter__title { margin: 0 0 8px; color: var(--text); }
.{{pluginName}}-starter__text { margin: 0 0 4px; color: var(--text-muted); }
.{{pluginName}}-starter__hint { margin: 0; color: var(--text-muted); font-size: var(--font-size-xs); }
.{{pluginName}}-starter__hint code { font-family: var(--font-mono, monospace); }
```

> 🔴 **件 2 改动（2026-09-15，`create-linkdesk-plugin` 0.1.10）**：示例类名从裸 `.starter*` 改成
> `.{{pluginName}}-starter*`——**新插件一出生就合规**。理由：插件视图里宿主、共享组件与**所有已加载
> 插件**的 CSS 装在**同一张样式表**里（实机读数 8 张），裸类名是**全局标识符**（`.badge` 案同形：
> 不报错、只是长得不对）。守它的门禁 = `check-scaffold.mjs` 的**断言 11**（生成物零裸类名/关键帧，
> 判据**与 SDK 的 `check-css-namespace` 腿同源**，不另写一份）＋ 生成物自己的 `npm run lint`。
> ⚠️ 只改类名标识符、**视觉一字不动**；`.gitignore`-style 的「零新机制」——`{{pluginName}}` 占位符本来就有。

> 🔴 **v2 顺手修的一处自打脸**：v1 的 `.starter__hint` 写 `font-size: 12px`，而 v2 把 `npm run lint` 接进了模板 ⇒ **生成物第一次跑 lint 就报 `check-font-scale` 偏离**。改成 `var(--font-size-xs)`（= 同一个 12px，但跟着全局字号缩放），并订正注释里那句「布局/字号这类结构值用普通 px（不违反）」——**门禁存在之后它就不成立了**。

---

## 六、模板文件——package.json + 其余

```jsonc
{
  "name": "{{pluginName}}",
  "version": "0.1.0",
  "private": true,               // 插件工程不发布到 npm——分发物是 .linkdesk-plugin
  "description": "{{displayName}}——LinkDesk 插件（由 create-linkdesk-plugin 生成）",
  "type": "module",
  "scripts": {                   // v2：SDK 五个命令全接线（v1 只接了三个）
    "dev": "linkdesk-plugin-sdk dev",
    "dev:real": "linkdesk-plugin-sdk dev --real",   // 真机环：直写 {userData}/plugins/<id> + CDP reload
    "build": "linkdesk-plugin-sdk build",           // 产出 <pluginId>.linkdesk-plugin
    "publish": "linkdesk-plugin-sdk publish",       // 建 Release + 上传 + 更新 catalog
    "validate": "linkdesk-plugin-sdk validate",
    "lint": "linkdesk-plugin-sdk lint"              // 门禁自检（硬编码色 / 字号 / 间距网格 / eslint 规则）
  },
  "devDependencies": {
    "@linkdesk/plugin-sdk": "^0.1.0",   // 构建工具，非运行时依赖 → devDependencies（镜像 plugin-sdk-example）
    "@types/react": "^18.3.12",         // tsx import React 需类型（§八.2）
    "typescript": "^5.6.3"
  }
}
```

> 🔴 **`dev:real` 与 `publish` 不接线 = 白送没人用**：`dev:real` 是真 IPC / 串口 / LSP 类插件**唯一的秒级真机调试方式**，不接线作者永远不会发现；`publish` 是插件生态的入口动作，不给等于让作者手搭。

**tsconfig.json**（要点：`jsx: "react-jsx"` + `strict` + `types: ["@linkdesk/plugin-sdk"]` + `noEmit`——类型检查专用，产物由 vite lib 出）：

```jsonc
{
  "compilerOptions": {
    "target": "ES2020", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "jsx": "react-jsx",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["@linkdesk/plugin-sdk"], "skipLibCheck": true
  },
  "include": ["src"]
}
```

**gitignore → 生成物 `.gitignore`**（v2 新增——官方插件 0/20 有这文件，因为它们是 monorepo 构建、走仓根 `.gitignore`；**第三方作者是独立仓，必须自带**）：

```gitignore
node_modules/
dist/
*.linkdesk-plugin
```

> 🔴 **模板里这份文件必须叫 `gitignore`（不带点）**——npm 打包会**恒定丢弃**名为 `.gitignore` 的文件，
> 作者从货架装脚手架就会拿到一个**没有 `.gitignore` 的工程**。详见 **§九.5**（含实测取证）。

**.vscode/settings.json**（v2：**保留配置 + 补三行注释说明为什么**——v1 一句话都没写，作者看不懂会顺手删掉，然后被红波浪线折磨一天）：

```jsonc
{
  // 让 VS Code 按 JSONC 解析 plugin.json —— 它允许 // 注释与尾逗号（对标 VS Code 自己的 package.json）。
  // 没有这一行，VS Code 会按严格 JSON 解析，本模板 plugin.json 里的注释会被标成满屏红波浪线。
  // 这只是编辑器提示，不影响运行：LinkDesk 与 SDK 本来就按 jsonc 解析。
  "files.associations": { "plugin.json": "jsonc" }
}
```

**i18n/en.json**（v2：key = 中文原文，**且只放 `src/` 里真被 `t()` 读过的 key**）：

```json
{
  "插件跑起来了 ✨": "Your plugin is running ✨",
  "这是你的第一个 LinkDesk 插件。": "This is your first LinkDesk plugin.",
  "是插件本体——改它，浏览器预览即时刷新。": "is the plugin itself — edit it and the browser preview refreshes live.",
  "打包出分发文件，可装进 LinkDesk 或发布到市场。": "produces the distributable bundle — install it into LinkDesk or publish it to the marketplace.",
  "目录该放哪、发布怎么做，都写在 README.md 里。": "Where things go and how to publish are all in README.md."
}
```

**README.md**（v2 新增，**本轮最重要的一件**）——一举解决三件事：① 官方插件必备的说明文件；②「不预建空文件夹」的替代品即**目录契约表**；③ 市场详情页数据源。结构：`# {{displayName}}` → 一句话 → （可选场景封面）→「怎么用」→「目录说明——东西该放哪」（整张契约表）→「写这个插件的三条纪律」→「发布」。

**CHANGELOG.md**（v2 新增）——`## v0.1.0（{{date}}）` + `- 初始版本`，顶部带写法约定注释。

**resources/icon.svg**（v2 新增）——中性灰品牌块 + 白色虚线框加号 = **「把你的图放这儿」**。刻意不设计成有含义的图形：它的意思是「这里还没有图」。🔴 **界面里以 `<img>` 显示 ⇒ 独立文档 ⇒ 不能用 `var(--xxx)`（解析不到），颜色必须自含实色**——官方插件同款写法。

---

## 七、发布到 npm

> 🔴 **登录态（2026-09-11 实测更正）**：**不需要用户交互式 `npm login`**。`npm whoami` 不带 `--registry` 查的是**淘宝镜像**、必然报 `ENEEDAUTH`——**那是查错地方，不是没登录**。granular token 早已装在 `.npmrc`，**AI 可直接发布**。
> **唯一需要用户本人的动作 = 撤版**（bypass token 被禁撤版，实测 `E403`）⇒ 发错只能靠新版本号覆盖。见 memory `e5-8-contracts-npm-publish-ready`。

```bash
cd packages/create-linkdesk-plugin
npm whoami --registry=https://registry.npmjs.org   # = fengyili（不带 --registry 会假报未登录）
npm config get registry --workspaces=false         # 🔴 必须 = https://registry.npmjs.org/（见下方坑 ①）
npm publish --registry=https://registry.npmjs.org  # 🔴 **--registry 必传**，别只靠本目录 .npmrc（坑 ①）
```

npm 自动识别 `create-*` 前缀包名为 `npm create` 的别名：
- `npm create linkdesk-plugin` → 自动下载 `create-linkdesk-plugin` → 执行 `index.js`

无需额外配置。

> ⚠️ **子包发布的三个坑（本仓已踩）**：
> ① 🔴 **`npm publish` 必须显式带 `--registry=https://registry.npmjs.org`**——这是本仓既有纪律
>    （E6#2.5b / #23a：「npmmirror 不能发布」），**2026-09-14 实测又发现它还有第二种失效方式**：
>    **npm 11 在 workspace 里会忽略「工作区成员自己的 `.npmrc`」**——本包在根 `package.json` 的
>    `workspaces: ["packages/*"]` 里，于是**那份 `.npmrc` 被静默忽略**，`npm publish`（不带 `--registry`）
>    的解析目标是 **`https://registry.npmmirror.com`**（dry-run 实测打印原文）。镜像只读 ⇒ 发布必失败，
>    而且报错形态是 `ENEEDAUTH`（**看着像「没登录」，其实又是查错地方**——就是下面那条 2026-09-11 教训的翻版）。
>    本机实测：`npm config get registry` 会连带报 `ENOWORKSPACES`；加 `--workspaces=false` 才看得到本目录那份的值。
>    ⇒ **判据改成两条**：(a) `npm config get registry --workspaces=false` 是官方源；
>    (b) **发布命令本身带 `--registry`**。`.npmrc` 保留（非 workspace 上下文 / 别的工具仍读它），**但不能只靠它**。
>    ⚠️ **同一条适用于 `packages/` 下另外三个包**（`@linkdesk/contracts` / `plugin-sdk` / `ui`）——它们同样是工作区成员。
> ② 🔴 **npm 会规范化 `bin`**：本地写 `"./index.js"`，**发布出去的 manifest 里是 `"index.js"`**（去掉前导 `./`），
>    并伴随一条**措辞吓人的警告**「`script name index.js was invalid and removed`」——**实际没删**，
>    `bin` 在货架上好好的（实测 `npm view create-linkdesk-plugin@0.1.3 bin` = `{ 'create-linkdesk-plugin': 'index.js' }`；
>    0.1.1 / 0.1.2 同）。本地已改成不带 `./` 的规范形式，让「本地 = 发出去那份」。
>    ⇒ **以后看到那条警告，先核货架再动手**，别去「修」一个不存在的问题。
> ③ 发布**已改异步**——CLI 打印 `+ pkg@version` 时包可能还没上架（**实测 plugin-sdk `0.1.10` 约 3.5 分钟后**才查到），中途重发吃 `E409 …previously staged version`。**判据落在 `npm view`，不落在发布命令的输出上。**（本包 0.1.3 实测约 15 秒上架）
> ④ **npm 恒定丢弃名为 `.gitignore` 的模板文件**（见 §九.5）——模板里那份必须叫 `gitignore`。

> 🔴 **发了才动版本号**（层铁律「不发就别动版本号」）：`0.1.0 → 0.1.1` 的 bump 与发布**同批**完成，`npm run release:mark` 记基线——**前提是它已进 [门禁基线](../插件规范化层/06-门禁扩域与验收.md)**。
> ✅ **2026-09-11（E6#95e + #94g）已照此执行**：先把它纳入基线（G4，否则 `release:mark` 也记不到它），再 bump `0.1.1` + 真发 + `release:mark`，`npm view create-linkdesk-plugin version` = `0.1.1` 实测一致。
>
> ✅ **2026-09-14（E6#103 · L7 7.6）：`0.1.2 → 0.1.3` 已 bump ＋ 已真发 ＋ 已 `release:mark`**（用户点头后执行）。
> 这一笔一起发出去的：7.5 的模板四件（`.github/workflows/ci.yml` / `scripts/ci-verify.mjs` /
> `vitest.config.ts` / `vitest.setup.ts` ＋ `package.json` 的 `verify`/`test` 与 4 个 devDeps）
> ＋ 7.6 的建仓与 `pluginId` 显式声明。**实测读数**：货架 `latest = 0.1.3`（发完约 15 秒可见；
> `versions` = `0.1.0/0.1.1/0.1.2/0.1.3`）· `dist.shasum` 与本地构建物一致（`d8c7906b…`）·
> tarball **19 文件 / template 15 件齐含 `.github/`** · **从真货架下载 0.1.3 再真跑生成** ⇒
> `.git` 在 · `main` · 1 笔初始提交 · `git status` 空 · `pluginId` 已是真名 · 生成物过**真 SDK validate** ·
> 基线已记 `create-linkdesk-plugin@0.1.3（17 文件）`，`check-npm-release` **黄灯已灭**。
> ⚠️ 发之前先修了两处：`bin` 改成不带 `./` 的规范形式（坑 ②）；发布命令补 `--registry`（坑 ①，**不改就会发向 npmmirror**）。

---

## 七·五、生成物形状**由门禁守着**（E6#95c）

`scripts/check-scaffold.mjs` 已接进 `npm run check`，**每次提交前自动把模板真跑一遍**（生成到仓外一次性目录，不跑 `npm install`），
再验 **9 条断言**：文件清单契约 / **显式声明 `pluginId`** + `icon` 在位 / `plugin.json` 是合法 JSONC 且 `entry` 存在 /
`CHANGELOG.md` 段标题能被 SDK 切段且版本号与 `plugin.json` 一致 / `scripts` ⊇ 7 条命令 / `i18n` 零死 key /
占位符集合与 CLI `values` 相等且生成物无 `{{…}}` 残留 / **`npm pack` 的 tarball 不丢模板文件** /
**建仓三语义（仓外建·仓内不建·`--no-git` 不建）**。

> 🔴 **E6#102（L7 7.5）同笔改了两处契约**：① `scripts` 契约 5 条 → **7 条**（+ `verify` / `test`）；
> ② 占位符残留扫描**对 `.github/**` 开了口子**——GitHub Actions 的表达式就是 `${{ … }}` 形状，与
> 脚手架的 `{{pluginName}}` 同形，不加这条豁免的话，模板里一句合法的 workflow 注释就会被判成
> 「未替换的占位符」红。豁免范围**只有 `.github/`** 这一条路径，别的文件里出现 `{{…}}` 照旧判红。

> 🔴 **E6#103（L7 7.6）加的是**断言 9 ＋ 一处**改判**：① **断言 2 反转**——过去「含 `pluginId` ⇒ 红」，
> 现在「**缺 `pluginId` ⇒ 红**」（依据 = 硬约束 11 ＋ `#98g` 之后 18 只官方插件全部显式声明；旧断言的
> 理由「E6#94 已删该字段」在 `#98g` 之后就过期了）；② **断言 9 = 建仓三语义**，两条**相反路径**都验
> （只验一边 = 半边门禁），负控走 `node scripts/check-scaffold.mjs --self-test`（拿两个桩 CLI 复跑同一段
> 判据：**不建仓 ⇒ 情形① 必红** / **无脑建仓 ⇒ 情形② 必红**）。⇒ 本门禁**需要 git 在 PATH 上**。

**八条逐条验过红灯**（表见 [06 §三](../插件规范化层/06-门禁扩域与验收.md)）——**改模板后不用手动比对，跑 `npm run check` 即可**。

---

## 八、审视实锤（2026-08-30 第 2.1 轮审视——#21-#23 模板 E5.6→E5.8 换代依据 + 2026-09-07 实装落定）

> 2026-08-30 第 2.1 轮整轮审视（E6#21-#23 脚手架）落笔的修正实锤。清单只留修正结论 + 本锚点。
> **2026-09-07 #21a 实装落定**：下 8.1/8.2 的结论已按最终模板内容改写进 §二/§三/§四/§五/§六（真身 = `packages/create-linkdesk-plugin/template/`，改动模板须同步）。本节保留为「当时为什么重写」的溯源。

### 8.1 模板 plugin.json 是 E5.6 schema——照原样生成的插件 E5.8 加载不了

| 设计稿模板（E5.6 时代） | E5.8 实测真相 | 依据 |
|:--|:--|:--|
| `contributes.views: { "main": { "title": "…" } }`（对象、无 render） | `views: { "<containerId>": [ { id, title, render, order } ] }`——**数组，render 指向视图文件** | `plugins/panel-demo/plugin.json` 实锤 |
| `viewsContainers.sidePanel: { title, icon }` | `viewsContainers: { "<id>": { title, location } }`，location 枚举 `sidebar/panel/auxiliarybar` | `public/schemas/plugin.schema.json:523-527` |
| `pluginRole: "view"` | 真实插件用 `factoryRole`（settings 用 `"factoryRole": "settings"`） | `plugins/settings/plugin.json` |
| 缺 `$schema` / `distribution` / `entry` 对齐 | 第三方默认 `distribution: "user"`（schema:41-46） | schema 实锤 |

**结论：** 模板 plugin.json 按 E5.8 schema 重写——`$schema` + `name` + `appearsIn` + `entry` + `contributes.i18n`，参照 `plugins/panel-demo` 最小视图插件。**实装落定（2026-09-07）修正一处**：起步形态取「主区标签页 + `appearsIn.tabBar` + `tabBehavior.singleton`」，`viewsContainers`/`views` 以**注释掉的扩展块**示范（任何壳版本都能渲染标签页；纯 contributes 分区视图依赖打包版渲染管线完整度，见 §四「逐字段取舍」）；`factoryRole` 仅 settings/marketplace 槽位插件需要，普通插件可缺省——故最终模板不带。

### 8.2 模板组件契约过时 + devDependencies 缺 react 类型

- **契约：** 设计稿 `{ isActive }: { isActive: boolean }`；E5.8 真实契约 `{ isActive?: boolean; tabId?: string; sourceId?: string }`（`plugins/editor/src/index.tsx:8` 实锤）。模板组件签名对齐。
- **样式：** 设计稿模板用内联 `style={{ padding: "20px" }}` 硬编码——改为示范共享 CSS 变量（var(--xxx)）。
- **类型：** 模板 `src/index.tsx` `import React` → tsc 需 react 类型；设计稿模板 devDependencies 只有 `typescript`。补 `@types/react`。模板结构含 `tsconfig.json` 但设计稿无内容——补要点：`jsx: "react-jsx"` + `types` 引 `@linkdesk/plugin-sdk`。

### 8.3 #23a 发布登录态前置同步

#23a 有 `--registry` 参数（对齐 #2.5b），缺 #2.5b 的 npm 登录态前置——2026-08-30 实测 `npm whoami --registry=https://registry.npmjs.org` 返回 **401**，发布前必须 `npm login`（用户 fengyili）。同步 E6#6b 的 whoami 确认写法到 #23a。
> 🔴 **2026-09-11 更正**：该 401 是**镜像 registry 造成的假象**（不带 `--registry` 时 whoami 查淘宝镜像）——**token 一直在、AI 可直接发**，从不需要交互式 login。见 §七。

### 8.4 设计稿对应任务号更新

设计稿头部「对应任务：E6#9-#11」是 E5.6 时代编号——脚手架现在是 **E6#21-#23**。已同步更新头部。

### 8.5 #22 验证 ↔ #23a 发布的 2.1/2.2 轮次序（2026-09-07 实装决策）

脚手架实装时定案的三条次序处理——模板已落地为「文本稳定 + 不宣传」形态：

- **模板 package.json 仍带 `dev` script**：`linkdesk-plugin-sdk dev` 当前 0.1.x 无实现，E6#24（第 2.2 轮 dev 宿主）落地后**零模板改动**该命令即生效——文本先写死，避免到时候再改模板再测。
- **CLI 成功输出不印 `dev`**：只印 `validate`/`build`——dev 未实现前先印会诱导作者跑死路。E6#24 落地后若要宣传，改 CLI 成功文案即可（非模板改动）。
- **#23a npm publish 建议等 2.2 轮 dev 落地后再发**：让生成工程四个命令全可用时再宣传脚手架；若作者知情先发（validate/build 可用）也成立——发布是独立动作，不 block 2.1 验收。

**双向承接锚**：2.1 验证行「`npm run dev` 全链」🔵 → E6#24；#23a 建议时机 🔵 → E6#24 落地后复核 CLI 成功文案。
> ✅ **2026-09-11 结算**：E6#24 早已落地 ⇒ v2 轮首屏补印 `npm run dev`，本条闭环。

---

## 九、v2 换代依据（2026-09-11，E6#94）——**为什么这几处是这个形状**

> **教具层的判据写在这里，不写下来下一个人就会加回去。**

### 9.1 `pluginId` 那一行：v2 **删掉** → 7.6 **改判为「必须显式声明」**

**v2（2026-09-11）当时的理由**（留档，别当它没发生过）：三条**独立**理由，任一成立即可——

| # | 当时的事实 | 出处 |
|:--|:--|:--|
| ① | 官方插件一只都没写 `pluginId` | `grep -ln '"pluginId"' plugins/*/plugin.json` → 空 |
| ② | **它是冗余的**——`{{pluginName}}` 就是目录名，而 `pluginId` 的兜底值**正是目录名** | `packages/plugin-sdk/src/validate.ts`：`pluginId = manifest.pluginId ?? sourceDirName` |
| ③ | **schema 里没有 `pluginId` 这个属性**，顶层 `additionalProperties: true` ⇒ 写了不报错、不校验 | `plugin.schema.json` |

⇒ v2 的结论是「改成**注释教学**：能力保留（目录名要改时取消注释），冗余写法去掉」，并写了一句 **「别再加回来」**。

🔴 **2026-09-14（`#98g` ＋ L7 第 7.6 轮）：三条全部失效，本条改判。**

| # | v2 的理由 | 今天 |
|:--|:--|:--|
| ① | 官方 0 只写 | **实测 18/18 全部显式声明**（容器 `E:\linkdesk-plugins\official\*` 逐只 `grep '"pluginId"'` 都有）；硬约束 11 的正文说官方 **20 只**全声明 |
| ② | 冗余 | 冗余**的事实**没变，**口径变了**——`pluginId` 是身份唯一键、**发布后不可变**（硬约束 11）；目录名兜底只为**兼容存量第三方插件**，新插件不该靠它 |
| ③ | schema 不认 | **`#98g` 已把 `pluginId` 加进 schema**（`plugin.schema.json` 第 14 行）⇒ 它现在是正经字段，不再是「写了等于没写」 |

⇒ **模板改为显式声明**：`"pluginId": "{{pluginName}}"`。⚠️ **只作废「别再加回来」这一句**，
v2 那套推理本身当时是对的（**前提变了**）——`#98g` 之前，写它确实等于没写。

**这一条值钱的教训（两句话）**：
1. **教具的形态必须跟着 schema 走**——schema 加了字段、模板还教「不用写」，模板就成了**反面教材**，
   而且这种「相反」**能活很久且没人报错**。
2. **教具也要有门禁，门禁也要跟着 schema 走**：这次相反状态是 7.5 轮读工具链时**「撞见」并登记**的，
   **不是任何门禁报出来的**——恰恰相反，`check-scaffold.mjs` 的**断言 2 当时正在反向钉死旧形态**
   （「含 `pluginId` ⇒ 红」）。7.6 把断言 2 反转成「**缺 `pluginId` ⇒ 红**」，这类漂移才第一次有了机械兜底。

### 9.2 为什么 i18n 必须真调用

v1 的 `i18n/en.json` = `{"hello": "Hello from LinkDesk!"}`，而 `src/index.tsx` **一处 `t()` 都没有**（三行中文全硬编码）⇒ **生成物自带一个没有任何调用方的 key**。

**这正是本层判据 M2（声明必须有消费者）要消灭的东西，而它躺在教具里教人**——作者会以为「i18n 就是这样用的」。v2 改成 `t("中文原文")` 读、`en.json` 提供英文，并把两条纪律写进模板注释：

- **key = 中文原文**，**不建 `zh.json`**（中文自带兜底，再写一份是冗余）；
- **只加你真的用 `t()` 读过的 key**——`en.json` 里出现没有调用方的 key 就是死 key。

### 9.3 为什么 `.vscode/settings.json` 是保留而不是删掉

**它解决的问题是真的**：模板 `plugin.json` 是 JSONC（注释 + 尾逗号），VS Code **默认按严格 JSON 解析** ⇒ 作者一打开就是满屏红波浪线。`files.associations` 是 VS Code 官方机制，`yo code` 同款做法。

🔴 **真正的缺陷不是这个文件，是它一句话都没写** —— 作者看到一行看不懂的配置，会以为是垃圾顺手删掉，然后被红波浪线折磨一整天。**v2：保留 + 加注释说明为什么。**

### 9.4 明确**不做**的两件（先记下，免得下次又拿出来讨论）

| 项 | 不做的理由 |
|:--|:--|
| **预建 `src/` 子文件夹** | **空文件夹在 git 里根本不存在**（git 不记录目录），除非塞 `.gitkeep` = 为了留一个空夹放一个假文件，成本真、收益假；只做侧栏面板的小插件被塞 6 个空夹，比不预建更劝退。**「该放哪」是知识不是目录** ⇒ 用生成的 `README.md` 里**目录契约表**教。 |
| **预建 vitest / 测试环境** | ~~官方插件的 `__tests__` 是**按需长出来的**，不是起步就有；给脚手架塞测试框架 = 给一个还没写业务的人配测试，加重起步负担。契约表里有 `src/__tests__/` 一行，作者要测时自己 `npm i -D vitest`。**若用户日后点名要，再单独立项**——不由本轮顺手加。~~ 🔴 **2026-09-14 已改判（E6#102，L7 第 7.5 轮）**：**改判为「预建」**。理由不是「想法变了」，是**前提变了**——本行原来的假设是「插件与壳同仓、壳的方案顺手提供测试环境」；插件源码现在住在**自己的仓**里，壳仓的 vitest / jsdom / `vitest.setup.ts`（那份 `window.linkdesk` mock 是**运行时地基**，不是配置）够不着它，于是「不给脚手架配测试」的实际后果变成「**新插件永远不会有测试**」，而且 CI 模板也没了 `test` 这一步。⇒ 模板随附 `vitest.config.ts` + `vitest.setup.ts` + `"test": "vitest run"`（含 `passWithNoTests`：没写测试不判红，是「没写」不是「写错了」）。不想要测试的作者 `npm uninstall vitest jsdom @testing-library/react` 即可，CI 那一步是 `npm test --if-present`，**跳过是显式的**。 |

### 9.5 🔴 为什么模板里叫 `gitignore` 而不是 `.gitignore`（**E6#95c 执行期实测发现**）

**npm 恒定丢弃名为 `.gitignore` 的文件。** 所以模板里直接放 `.gitignore` 时：

- **仓内** `node packages/create-linkdesk-plugin/index.js my-plugin` → 生成正常（读的是模板目录）；
- **货架上** `npm create linkdesk-plugin my-plugin` → 生成的工程**没有 `.gitignore`** ⇒ 作者第一次 `git add .`
  就把 `node_modules/` 和 `dist/` 全提交了。**3.7.5 好不容易补上的那件东西，到作者手里是空的。**

**实测取证**（同一目录、三文件对照，`npm pack --dry-run --json`）：

| 模板内文件名 | 进 tarball？ |
|:--|:--|
| `template/.gitignore` | ❌ **被丢** |
| `template/.gitignoreprobe` | ✅ |
| `template/probe.txt` | ✅ |

⇒ 排除**按文件名精确匹配**，不是「点开头一律排除」——同目录的 `.vscode/settings.json` 照样进包。

**修法**：模板存 `gitignore`（无点），生成时由 CLI `renameSync` 成 `.gitignore`。**`yo code` 一脉的标准做法**
（那边叫 `_gitignore`），不是自创；生成物契约里作者拿到的仍然是正常的 `.gitignore`。

🔴 **这一条现在由门禁守着**：`scripts/check-scaffold.mjs` **断言 8**——`npm pack --dry-run` 的 tarball 里
`template/` 下文件集合必须与仓内模板目录**完全一致**。**回归测试已验红**（把文件换回 `.gitignore` → 门禁必红）。

> **教训（M4 级）**：脚手架是**第三方作者抄的第一份样本**——「仓内验过」**不等于**「作者拿得到」。
> **生成物契约要对着 tarball 验，不是对着源码树验**（memory `snapshot-shadows-truth-bug-class` ①「快照遮蔽真值」）。

---

> **← 上一层：** `../01-插件独立构建/`
> **→ 下一文档：** `02-本地预览环境.md`
