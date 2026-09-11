# create-linkdesk-plugin 脚手架

> 🔵 **非新能力（2026-09-05 塌平收编）**：本次改动仅插件目录塌平单根（`plugins/builtin|user` → `plugins/<id>`）参照路径文本同步，零新增 `window.linkdesk.*` / `contributes.*` 面。塌平决策见 [09-插件目录塌平决策.md](../01-插件独立构建/09-插件目录塌平决策.md)。
> 🔵 **非新能力（2026-09-11，E6#94 template v2）**：本轮只改**模板形状**（多几个文件、少一行字段、文案换写法），**不新增任何壳 API / 不新增 contribute 贡献点**——文中出现的 `contributes.*` 全是「引用既有贡献点做对照」。判据见 [插件规范化层/05-脚手架换代](../插件规范化层/05-脚手架换代.md)。

> 对应任务：E6#21-#23，**template v2 = E6#94（2026-09-11）**。对标 `yo code`（VS Code Extension Generator）。
> ⚠️ 2026-08-30 第 2.1 轮审视：§四 模板 plugin.json 原为 E5.6 schema，已按 E5.8 实测换代（见 §八）。
> 插件作者打一行命令 → 获得完整的插件项目骨架。

---

## 一、用户视角

```bash
npm create linkdesk-plugin my-cool-plugin

# 输出：
# ✔ my-cool-plugin/ 已创建
#
#   接下来：
#     cd my-cool-plugin
#     npm install
#     npm run dev        # 浏览器热重载预览（改代码即时生效）
#     npm run validate   # 校验 plugin.json（$schema / 字段 / i18n 文件）
#     npm run build      # 打包出 my-cool-plugin.linkdesk-plugin，可装进 LinkDesk / 发布
#
#   然后：先读 README.md —— 目录该放哪、三条纪律、怎么发布都在里面。
#   plugin.json 的 name / description / author 是你的身份信息，src/index.tsx 是插件本体。
#   完整插件能力（侧栏视图 / 命令 / 设置 / 协议……）见 docs/03-插件制造/。
```

> 🔵 **`dev` 命令 2.1 轮刻意不宣传，v2 轮补印**：E6#24 dev 宿主已落地 ⇒ 首屏补 `npm run dev` 顺理成章（§八.5 的「双向承接锚」在此结算）。
> 🔴 **首屏依旧不提 `publish`**：它要 GitHub token，属「准备好了再做」的事——放在生成的 `README.md` 里详说，**CLI 首屏不吓人**。

---

## 二、包结构

> 模板真身 = `packages/create-linkdesk-plugin/template/`——§四-§六 与其对齐；**改动模板必须同步本档案对应节**。

```
packages/create-linkdesk-plugin/
  ├── package.json         # name: "create-linkdesk-plugin", "bin": { "create-linkdesk-plugin": "./index.js" }
  ├── index.js             # CLI 入口（ESM，纯 Node.js 零依赖）
  ├── README.md            # 用法 + 生成物说明
  └── template/            # 模板文件（{{pluginName}} / {{displayName}} / {{author}} / {{date}} 占位符）
      ├── plugin.json            # JSONC 清单——E5.8 schema，逐字段注释分节（**不写 pluginId**，见 §九.1）
      ├── package.json           # scripts: dev / dev:real / build / publish / validate / lint
      ├── tsconfig.json          # jsx: react-jsx + types 引 @linkdesk/plugin-sdk + strict
      ├── .gitignore             # node_modules / dist / *.linkdesk-plugin
      ├── README.md              # 说明——市场「详情」页签数据源 + **目录契约表**
      ├── CHANGELOG.md           # 更新日志——市场「更改日志」页签数据源（段标题 `## v<版本>（日期）`）
      ├── .vscode/settings.json  # files.associations: plugin.json → jsonc（**带三行注释说明为什么**）
      ├── resources/
      │   └── icon.svg           # 身份图**占位图**（中性灰虚线框——作者替换）
      ├── src/
      │   ├── index.tsx          # E5.8 契约 { isActive?, tabId?, sourceId? } default 组件 + **真用 t()**
      │   └── index.css          # CSS 变量示范（var(--text) / var(--font-size-xs)，禁 hex / 禁裸 px 字号）
      └── i18n/
          └── en.json            # **只放 src/ 里真被 t() 读过的 key**（见 §九.2）
```

**v2 新增 6 件**（`README.md` / `CHANGELOG.md` / `.gitignore` / `resources/icon.svg` / `package.json` 两个 script / `.vscode` 注释）——缺口对照表见 [插件规范化层/05 §一](../插件规范化层/05-脚手架换代.md)。

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
- **成功输出（v2）**：`cd` / `npm install` / `npm run dev` / `npm run validate` / `npm run build` + **把 `README.md` 指出来**（目录契约靠这一步被看见）+ 指向 `docs/03-插件制造/`；**不提 `publish`**。
- **作者名**：`git config user.name` → 兜底 `you`。
- **`{{date}}` 只注入 `CHANGELOG.md` 的初始段标题**——格式必须是 `## v<版本>（YYYY-MM-DD）`，那是市场「更改日志」页签切段的解析依据（[插件规范化层/02](../插件规范化层/02-元数据链路归一.md)）。**注入错格式 = 作者第一个插件就显示不了更新记录。**

---

## 四、模板文件——plugin.json

> **E5.8 schema 真身**（JSONC：可注释、可尾逗号——LinkDesk 与 SDK 都按 jsonc 解析，对标 VS Code package.json；`.vscode/settings.json` 把 `plugin.json` 关联为 jsonc 让 VS Code 不标红）。字段取舍依据见 §八；**v2 两处改动（删 `pluginId` / 补 `icon`）依据见 §九**。

```jsonc
{
  "$schema": "./node_modules/@linkdesk/plugin-sdk/schemas/plugin.schema.json",

  // ── 插件身份 ──
  // 插件 ID 默认就是插件目录名（{{pluginName}}），所以这里不写。仅当「目录名要改、但安装身份
  // 不能变」时才取消下面这行的注释——它是覆盖值，不是必填项。
  // "pluginId": "{{pluginName}}",
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
- **`pluginId` 不写**（v2 改动）——理由见 §九.1。
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
    <div className="starter">
      <h2 className="starter__title">{t("插件跑起来了 ✨")}</h2>
      <p className="starter__text">{t("这是你的第一个 LinkDesk 插件。")}</p>
      <p className="starter__hint">
        <code>src/index.tsx</code> {t("是插件本体——改它，浏览器预览即时刷新。")}
      </p>
      <p className="starter__hint">
        <code>npm run build</code> {t("打包出分发文件，可装进 LinkDesk 或发布到市场。")}
      </p>
      <p className="starter__hint">{t("目录该放哪、发布怎么做，都写在 README.md 里。")}</p>
    </div>
  );
}
```

**契约要点（doc 注释里也写着）：** `{ isActive?, tabId?, sourceId? }` 全可选——keep-alive 下非聚焦仍在渲染，isActive 只 gate 副作用；`if (!isActive) return null` 整块 blank 掉内容是反模式。**代码标识符（`src/index.tsx` / `npm run build`）留在 `<code>` 里、不进 `t()`**——它们不是 UI 文案。

```css
/* {{displayName}} 样式示例（`npm run lint` 会照着下面三条查）。
   三条纪律：
   · 颜色一律 var(--xxx)，禁硬编码 hex——用户换主题时你的插件要跟着变；
   · 字号一律 var(--font-size-*)——用户调全局字号时它才跟着缩放，裸 px 不会；
   · padding / margin / gap 走 4px 节奏（4 的倍数）。 */

.starter { padding: 24px; font-family: inherit; }
.starter__title { margin: 0 0 8px; color: var(--text); }
.starter__text { margin: 0 0 4px; color: var(--text-muted); }
.starter__hint { margin: 0; color: var(--text-muted); font-size: var(--font-size-xs); }
.starter__hint code { font-family: var(--font-mono, monospace); }
```

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

**.gitignore**（v2 新增——官方插件 0/20 有这文件，因为它们是 monorepo 构建、走仓根 `.gitignore`；**第三方作者是独立仓，必须自带**）：

```gitignore
node_modules/
dist/
*.linkdesk-plugin
```

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
npm publish                                        # 走 .npmrc 的 per-scope 路由，无需再传 --registry
```

npm 自动识别 `create-*` 前缀包名为 `npm create` 的别名：
- `npm create linkdesk-plugin` → 自动下载 `create-linkdesk-plugin` → 执行 `index.js`

无需额外配置。

> ⚠️ **子包发布的两个坑（本仓已踩）**：① npm **只读当前目录的 `.npmrc`、不向上递归** ⇒ 每个可发布子包都要自带一份 per-scope 路由（`plugin-sdk/` 有、`create-linkdesk-plugin/` 无 scoped 依赖故无碍）；② 发布**已改异步**——CLI 打印 `+ pkg@version` 时包可能还没上架，中途重发吃 `E409 …previously staged version`。

> 🔴 **发了才动版本号**（层铁律「不发就别动版本号」）：`0.1.0 → 0.1.1` 的 bump 与发布**同批**完成，`npm run release:mark` 记基线——**前提是它已进 [门禁基线](06-门禁扩域与验收.md)**。

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

### 9.1 为什么删 `pluginId` 那一行

三条**独立**理由，任一成立即可：

| # | 事实 | 出处 |
|:--|:--|:--|
| ① | **20/20 官方插件一只都没写 `pluginId`** | `grep -ln '"pluginId"' plugins/*/plugin.json` → 空 |
| ② | **它是冗余的**——`{{pluginName}}` 就是**目录名**，而 `pluginId` 的兜底值**正是目录名** | `packages/plugin-sdk/src/validate.ts`：`pluginId = manifest.pluginId ?? sourceDirName` |
| ③ | **schema 里没有 `pluginId` 这个属性**，顶层 `additionalProperties: true` ⇒ **写了不报错、不校验、静默接受** | `plugin.schema.json` |

⇒ **v1 教的是一个「写了等于没写、官方一只没用、schema 也不认」的字段。** v2 改成**注释教学**：能力保留（目录名要改时取消注释），冗余写法去掉。**别再加回来。**

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
| **预建 vitest / 测试环境** | 官方插件的 `__tests__` 是**按需长出来的**，不是起步就有；给脚手架塞测试框架 = 给一个还没写业务的人配测试，加重起步负担。契约表里有 `src/__tests__/` 一行，作者要测时自己 `npm i -D vitest`。**若用户日后点名要，再单独立项**——不由本轮顺手加。 |

---

> **← 上一层：** `../01-插件独立构建/`
> **→ 下一文档：** `02-本地预览环境.md`
