# create-linkdesk-plugin 脚手架

> 🔵 **非新能力（2026-09-05 塌平收编）**：本次改动仅插件目录塌平单根（`plugins/builtin|user` → `plugins/<id>`）参照路径文本同步，零新增 `window.linkdesk.*` / `contributes.*` 面。塌平决策见 [09-插件目录塌平决策.md](../01-插件独立构建/09-插件目录塌平决策.md)。

> 对应任务：E6#21-#23。对标 `yo code`（VS Code Extension Generator）。
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
#     npm run validate   # 校验 plugin.json（$schema / 字段 / i18n 文件）
#     npm run build      # 产出 my-cool-plugin.linkdesk-plugin，可装进 LinkDesk / 发布
#
#   npm run dev（本地热预览）🔵 待第 2.2 轮 dev 宿主落地后可用 → E6#24 承接
```

> 🔵 **dev 命令 2.1 轮刻意不宣传**：模板 `package.json` 已带 `dev` script（文本稳定，E6#24 落地后零模板改动即生效），但 CLI 成功输出只印 `validate`/`build`——`linkdesk-plugin-sdk dev` 当前 0.1.x 尚未实现，先印会诱导作者跑到死路。见 §八.5。

---

## 二、包结构

> 模板真身 = `packages/create-linkdesk-plugin/template/`——§四-§六 与其对齐；改动模板必须同步本档案对应节。

```
packages/create-linkdesk-plugin/
  ├── package.json         # name: "create-linkdesk-plugin", "bin": { "create-linkdesk-plugin": "./index.js" }
  ├── index.js             # CLI 入口（ESM，纯 Node.js 零依赖）
  ├── README.md            # 用法 + 生成物说明
  └── template/            # 模板文件（{{pluginName}} / {{displayName}} / {{author}} 占位符）
      ├── plugin.json            # JSONC 清单——E5.8 schema，逐字段注释分节
      ├── package.json
      ├── tsconfig.json          # jsx: react-jsx + types 引 @linkdesk/plugin-sdk + strict
      ├── .vscode/settings.json  # files.associations: plugin.json → jsonc（注释不标红）
      ├── src/
      │   ├── index.tsx          # E5.8 契约 { isActive?, tabId?, sourceId? } default 组件
      │   └── index.css          # CSS 变量样式示范（var(--text) / var(--text-muted)，禁 hex）
      └── i18n/
          └── en.json
```

---

## 三、CLI 入口——index.js

ESM 单文件零依赖（`#!/usr/bin/env node` + `import.meta.url` 定位 template 目录）。占位符替换递归扫全部文本文件：`{{pluginName}}` → kebab 名、`{{displayName}}` → 名转 Title Case、`{{author}}` → `git config user.name` 自动推导（拿不到兜底 `you`）。

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
  walkReplace(dir);                        // {{pluginName}} / {{displayName}} / {{author}}
  printNextSteps(name);                    // ③ 成功输出：cd / npm install / validate / build
}
```

**行为定案（#22a）：**
- **命名校验**：`/^[a-z][a-z0-9-]*$/`——拒绝大写/空格/前导数字，消息明示 kebab-case 规则（对标插件 ID `SAFE_PLUGIN_ID`）。
- **既有目录**：非空即拒绝（exit 1），不静默覆盖。
- **成功输出**：只印 `cd … / npm install / npm run validate / npm run build`——**刻意不印 `dev`**（E6#24 落地前 `sdk dev` 未实现，防作者跑到死路，见 §八.5）。
- **作者名**：`git config user.name` → 兜底 `you`。

---

## 四、模板文件——plugin.json

> **E5.8 schema 重写后真身**（`packages/create-linkdesk-plugin/template/plugin.json`，JSONC：可注释、可尾逗号——LinkDesk 与 SDK 都按 jsonc 解析，对标 VS Code package.json；`.vscode/settings.json` 把 `plugin.json` 关联为 jsonc 让 VS Code 不标红）。字段取舍依据见 §八。

```jsonc
{
  "$schema": "./node_modules/@linkdesk/plugin-sdk/schemas/plugin.schema.json",

  "pluginId": "{{pluginName}}",          // 全局唯一 ID（kebab-case）——安装目录 / 寻址 / 命令前缀
  "name": "{{displayName}}",             // 显示名——标签页 / 插件详情等 UI
  "version": "0.1.0",                    // 语义化版本 x.y.z——改了要 +1
  "description": "{{displayName}}——我的第一个 LinkDesk 插件",
  "author": "{{author}}",

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
- **`pluginId` 显式声明**（`derivePluginId` 兜底 = 目录名，但清单写死更稳，dev 命令 #24a 也直接读它）。
- **无 `views` 根级视图仍能跑**：壳对带 `entry` 的插件走入口渲染路径。

---

## 五、模板文件——src/index.tsx + index.css

```tsx
/**
 * {{displayName}}——LinkDesk 插件主视图（由 create-linkdesk-plugin 生成）。
 *
 * 视图插件契约（E5.8）：壳以 { isActive, tabId?, sourceId? } 渲染本文件 default 导出的组件：
 *   - isActive  本标签当前是否聚焦。keep-alive 下非聚焦标签仍在渲染，isActive 只用于
 *               gate「聚焦才跑」的副作用（如自动保存），切勿用它整块 blank 掉内容。
 *   - tabId     本标签页 id。
 *   - sourceId  上下文数据（文件路径 / 数据源等），编辑器类插件用它定位内容。
 *
 * 样式：主题色一律走 CSS 变量 var(--xxx)（见 index.css 示例），禁硬编码 hex。
 * 壳已 external react/react-dom/react-i18next/i18next——构建不会打进包，插件工程无需 npm i 它们。
 */

import "./index.css";

export default function HelloPlugin(_props: { isActive?: boolean; tabId?: string; sourceId?: string }) {
  return (
    <div className="starter">
      <h2 className="starter__title">{{displayName}} 跑起来了 ✨</h2>
      <p className="starter__text">这是你的第一个 LinkDesk 插件。</p>
      <p className="starter__hint">
        编辑 <code>src/index.tsx</code> 即可看到变化；<code>npm run build</code> 打包出{" "}
        <code>.linkdesk-plugin</code> 分发文件。
      </p>
    </div>
  );
}
```

**对照 E5.6 旧稿的修正（§八.2 实锤落地）：**
- 契约 `{ isActive }: { isActive: boolean }` → **`{ isActive?, tabId?, sourceId? }` 全可选**——keep-alive 下非聚焦仍在渲染，isActive 只 gate 副作用；`if (!isActive) return null` 整块 blank 掉内容是反模式。
- 内联 `style={{ padding: "20px" }}` → **拆进 index.css + 主题变量**（禁硬编码 hex/内联 padding）。

```css
/* {{displayName}} 样式示例——LinkDesk 主题色一律走 var(--xxx)，禁硬编码 hex。
   布局/字号这类结构值用普通 px（不违反）；颜色/语义类才必须走主题变量。 */

.starter { padding: 24px; font-family: inherit; }
.starter__title { margin: 0 0 8px; color: var(--text); }
.starter__text { margin: 0 0 4px; color: var(--text-muted); }
.starter__hint { margin: 0; color: var(--text-muted); font-size: 12px; }
```

---

## 六、模板文件——package.json + tsconfig.json

```jsonc
{
  "name": "{{pluginName}}",
  "version": "0.1.0",
  "private": true,               // 插件工程不发布到 npm——分发物是 .linkdesk-plugin
  "description": "{{displayName}}——LinkDesk 插件（由 create-linkdesk-plugin 生成）",
  "type": "module",
  "scripts": {
    "dev": "linkdesk-plugin-sdk dev",      // 🔵 E6#24 落地前 sdk 无 dev 命令——CLI 不宣传它，文本先稳定
    "build": "linkdesk-plugin-sdk build",   // 产出 <pluginId>.linkdesk-plugin
    "validate": "linkdesk-plugin-sdk validate"
  },
  "devDependencies": {
    "@linkdesk/plugin-sdk": "^0.1.0",   // 构建工具，非运行时依赖 → devDependencies（镜像 plugin-sdk-example）
    "@types/react": "^18.3.12",         // tsx import React 需类型（§八.2）
    "typescript": "^5.6.3"
  }
}
```

**tsconfig.json**（模板带，要点：`jsx: "react-jsx"` + `strict` + `types: ["@linkdesk/plugin-sdk"]` + `noEmit`——类型检查专用，产物由 vite lib 出）：

```jsonc
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["@linkdesk/plugin-sdk"],
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**.vscode/settings.json**（模板带，作者在 VS Code 编辑带注释的 plugin.json 不标红 + `$schema` 校验照常）：

```json
{
  "files.associations": {
    "plugin.json": "jsonc"
  }
}
```

**i18n/en.json**（模板带，先翻译演示用 key，作者随后自行扩充）：

```json
{
  "hello": "Hello from LinkDesk!"
}
```

---

## 七、发布到 npm

> 🔵 #23a 是**外部动作（用户 gate）**——2.1 轮实现齐了但**未发布**（npmjs 发布=对外发表，且发布前需 fengyili `npm login`）。建议等 E6#24（2.2 轮 dev 宿主）落地后让生成工程四命令全可用再发；作者知情先发（validate/build 已可用）也成立。见 §八.5。

```bash
cd packages/create-linkdesk-plugin
# 发布前：确认登录态（npmmirror 不能发布，必须显式官方 registry）
npm whoami --registry=https://registry.npmjs.org   # 401 → 先 npm login（用户 fengyili）
npm publish --registry=https://registry.npmjs.org --access public
```

npm 自动识别 `create-*` 前缀包名为 `npm create` 的别名：
- `npm create linkdesk-plugin` → 自动下载 `create-linkdesk-plugin` → 执行 `index.js`

无需额外配置。

---

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

**结论：** 模板 plugin.json 按 E5.8 schema 重写——`$schema` 指向 plugin.schema.json + `pluginId` + `appearsIn` + `entry` + `contributes.i18n`，参照 `plugins/panel-demo` 最小视图插件。**实装落定（2026-09-07）修正一处**：起步形态取「主区标签页 + `appearsIn.tabBar` + `tabBehavior.singleton`」，`viewsContainers`/`views` 以**注释掉的扩展块**示范（任何壳版本都能渲染标签页；纯 contributes 分区视图依赖打包版渲染管线完整度，见 §四「逐字段取舍」）；`factoryRole` 仅 settings/marketplace 槽位插件需要，普通插件可缺省——故最终模板不带。

### 8.2 模板组件契约过时 + devDependencies 缺 react 类型

- **契约：** 设计稿 `{ isActive }: { isActive: boolean }`；E5.8 真实契约 `{ isActive?: boolean; tabId?: string; sourceId?: string }`（`plugins/editor/src/index.tsx:8` 实锤）。模板组件签名对齐。
- **样式：** 设计稿模板用内联 `style={{ padding: "20px" }}` 硬编码——改为示范共享 CSS 变量（var(--xxx)）。
- **类型：** 模板 `src/index.tsx` `import React` → tsc 需 react 类型；设计稿模板 devDependencies 只有 `typescript`。补 `@types/react`。模板结构含 `tsconfig.json` 但设计稿无内容——补要点：`jsx: "react-jsx"` + `types` 引 `@linkdesk/plugin-sdk`。

### 8.3 #23a 发布登录态前置同步

#23a 有 `--registry` 参数（对齐 #2.5b），缺 #2.5b 的 npm 登录态前置——2026-08-30 实测 `npm whoami --registry=https://registry.npmjs.org` 返回 **401**，发布前必须 `npm login`（用户 fengyili）。同步 E6#6b 的 whoami 确认写法到 #23a。

### 8.4 设计稿对应任务号更新

设计稿头部「对应任务：E6#9-#11」是 E5.6 时代编号——脚手架现在是 **E6#21-#23**。已同步更新头部。

### 8.5 #22 验证 ↔ #23a 发布的 2.1/2.2 轮次序（2026-09-07 实装决策）

脚手架实装时定案的三条次序处理——模板已落地为「文本稳定 + 不宣传」形态：

- **模板 package.json 仍带 `dev` script**：`linkdesk-plugin-sdk dev` 当前 0.1.x 无实现，E6#24（第 2.2 轮 dev 宿主）落地后**零模板改动**该命令即生效——文本先写死，避免到时候再改模板再测。
- **CLI 成功输出不印 `dev`**：只印 `validate`/`build`——dev 未实现前先印会诱导作者跑死路。E6#24 落地后若要宣传，改 CLI 成功文案即可（非模板改动）。
- **#23a npm publish 建议等 2.2 轮 dev 落地后再发**：让生成工程四个命令全可用时再宣传脚手架；若作者知情先发（validate/build 已可用）也成立——发布是独立动作，不 block 2.1 验收。

**双向承接锚**：2.1 验证行「`npm run dev` 全链」🔵 → E6#24；#23a 建议时机 🔵 → E6#24 落地后复核 CLI 成功文案。

---

> **← 上一层：** `../01-插件独立构建/`
> **→ 下一文档：** `02-本地预览环境.md`
